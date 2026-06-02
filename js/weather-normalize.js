// Weather response normalization.

function normalizeWeatherHourly(hourly = {}) {
  const now = Date.now();
  const times = Array.isArray(hourly.time) ? hourly.time : [];
  return times.map((time, index) => ({
    time,
    temperature: Number(hourly.temperature_2m?.[index]) || 0,
    apparentTemperature: Number(hourly.apparent_temperature?.[index]) || Number(hourly.temperature_2m?.[index]) || 0,
    humidity: Number(hourly.relative_humidity_2m?.[index]) || 0,
    windSpeed: Number(hourly.wind_speed_10m?.[index]) || 0,
    windDirection: Number(hourly.wind_direction_10m?.[index]) || 0,
    windGusts: Number(hourly.wind_gusts_10m?.[index]) || 0,
    precipitationProbability: Number(hourly.precipitation_probability?.[index]) || 0,
    uvIndex: Number(hourly.uv_index?.[index]) || 0,
    uvSource: 'Open-Meteo',
    weatherCode: Number(hourly.weather_code?.[index]) || 0,
    cloudCover: Number(hourly.cloud_cover?.[index]) || 0,
    isDay: Number(hourly.is_day?.[index]) === 1,
  })).filter(item => new Date(item.time).getTime() >= now - 60 * 60 * 1000).slice(0, 8);
}

function normalizeWeatherCanadaCityPage(raw = {}, location = null) {
  const features = Array.isArray(raw.features) ? raw.features : [];
  const feature = features
    .map(item => ({ item, distance: weatherFeatureDistance(item, location) }))
    .sort((a, b) => a.distance - b.distance)[0]?.item;
  const props = feature?.properties && typeof feature.properties === 'object' ? feature.properties : {};
  const current = normalizeWeatherCanadaCurrentCondition(props.currentConditions);
  if (!current) return null;
  return {
    current,
    hourly: normalizeWeatherCanadaHourly(props.hourlyForecastGroup),
    daily: {
      sunrise: weatherCanadaValue(props.riseSet?.sunrise),
      sunset: weatherCanadaValue(props.riseSet?.sunset),
    },
  };
}

function normalizeWeatherCanadaCurrentCondition(current) {
  if (!current || typeof current !== 'object') return null;
  const label = weatherCanadaValue(current.condition);
  if (!label) return null;
  return {
    fetchedAt: new Date().toISOString(),
    time: weatherCanadaValue(current.timestamp),
    label,
    iconCode: weatherCanadaValue(current.iconCode),
    source: 'Environment Canada',
    temperature: weatherCanadaNumber(current.temperature?.value, 0),
    humidity: weatherCanadaNumber(current.relativeHumidity?.value, 0),
    windSpeed: weatherCanadaWindSpeed(current.wind?.speed?.value),
    windDirection: weatherCanadaNumber(current.wind?.bearing?.value, 0),
    windGusts: weatherCanadaNumber(current.wind?.gust?.value, 0),
    station: weatherCanadaValue(current.station?.value),
    stationCode: weatherCanadaValue(current.station?.code),
  };
}

function normalizeWeatherCanadaHourly(hourlyGroup = {}) {
  const rows = Array.isArray(hourlyGroup.hourlyForecasts) ? hourlyGroup.hourlyForecasts : [];
  const now = Date.now();
  return rows.map(row => {
    const label = weatherCanadaValue(row.condition);
    const isDay = !weatherCanadaIsNightIcon(row.iconCode);
    const uv = weatherCanadaUvValue(row);
    return {
      time: weatherCanadaValue(row.timestamp),
      temperature: weatherCanadaNumber(row.temperature?.value, 0),
      apparentTemperature: weatherCanadaNumber(row.temperature?.value, 0),
      humidity: 0,
      windSpeed: weatherCanadaWindSpeed(row.wind?.speed?.value),
      windDirection: weatherCanadaDirection(row.wind?.direction),
      windGusts: 0,
      precipitationProbability: weatherCanadaNumber(row.lop?.value, 0),
      uvIndex: uv.value,
      uvSource: uv.hasValue ? 'Environment Canada' : '',
      weatherCode: weatherConditionCodeFromOfficial({ label }, isDay) ?? 0,
      isDay,
      officialCondition: label,
    };
  }).filter(item => weatherTimestamp(item.time) >= now - 60 * 60 * 1000).slice(0, 8);
}

function mergeWeatherCanadaHourlyWithOpenMeteo(canadaHourly, openMeteoHourly) {
  return canadaHourly.map(hour => {
    const nearest = nearestWeatherHour(openMeteoHourly, hour.time);
    return {
      ...hour,
      humidity: hour.humidity || nearest?.humidity || 0,
      uvIndex: hour.uvIndex || nearest?.uvIndex || 0,
      uvSource: hour.uvSource || (nearest ? 'Open-Meteo' : ''),
    };
  });
}

function weatherCanadaUvValue(row = {}) {
  const raw = row.uv?.index ?? row.uv?.value ?? row.uv;
  if (raw === null || raw === undefined || raw === '') return { value: 0, hasValue: false };
  return { value: weatherCanadaNumber(raw, 0), hasValue: true };
}

function weatherFeatureDistance(feature, location) {
  const coords = Array.isArray(feature?.geometry?.coordinates) ? feature.geometry.coordinates : [];
  const lon = Number(coords[0]);
  const lat = Number(coords[1]);
  const targetLat = Number(location?.latitude);
  const targetLon = Number(location?.longitude);
  if (![lat, lon, targetLat, targetLon].every(Number.isFinite)) return Number.POSITIVE_INFINITY;
  return Math.abs(lat - targetLat) + Math.abs(lon - targetLon);
}

function weatherCanadaValue(value) {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    if (value.en !== undefined) return weatherCanadaValue(value.en);
    if (value.value !== undefined) return weatherCanadaValue(value.value);
  }
  if (value === null || value === undefined) return '';
  return String(value).trim();
}

function weatherNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function weatherCanadaNumber(value, fallback = 0) {
  return weatherNumber(weatherCanadaValue(value), fallback);
}

function weatherCanadaWindSpeed(value) {
  const text = weatherCanadaValue(value).toLowerCase();
  if (text === 'calm') return 0;
  return weatherNumber(text, 0);
}

function weatherCanadaDirection(value) {
  const text = weatherCanadaValue(value).toUpperCase();
  const directions = { N: 0, NE: 45, E: 90, SE: 135, S: 180, SW: 225, W: 270, NW: 315, VR: 0 };
  return directions[text] ?? 0;
}

function weatherCanadaIsNightIcon(iconCode) {
  const code = Number(weatherCanadaValue(iconCode));
  return Number.isFinite(code) && code >= 30;
}

function weatherDataSources({ useCanadaWeather = false, airQuality = null, uvSource = '' } = {}) {
  return {
    weather: useCanadaWeather ? 'Environment Canada' : 'Open-Meteo',
    uv: uvSource || (useCanadaWeather ? 'Environment Canada' : 'Open-Meteo'),
    airQuality: airQuality?.source || '',
  };
}

function normalizeWeatherCanadaAirQuality(raw = {}, location = null) {
  const features = Array.isArray(raw.features) ? raw.features : [];
  const now = Date.now();
  const future = features
    .map(feature => {
      const props = feature?.properties && typeof feature.properties === 'object' ? feature.properties : {};
      const aqhi = weatherNumber(props.aqhi, 0);
      return {
        aqhi,
        time: weatherCanadaValue(props.forecast_datetime),
        location: weatherCanadaValue(props.location_name_en),
        publicationTime: weatherCanadaValue(props.publication_datetime),
        distance: weatherFeatureDistance(feature, location),
      };
    })
    .filter(item => item.aqhi > 0 && weatherTimestamp(item.time) >= now - 60 * 60 * 1000)
    .sort((a, b) => a.distance - b.distance || weatherTimestamp(a.time) - weatherTimestamp(b.time))
    .slice(0, 8);
  const first = future[0];
  if (!first) return null;
  const samePlace = future.filter(item => item.location === first.location || Math.abs(item.distance - first.distance) < .001);
  const peak = samePlace.reduce((best, item) => item.aqhi > best.aqhi ? item : best, first);
  return {
    fetchedAt: new Date().toISOString(),
    time: first.time || '',
    aqhi: first.aqhi,
    peakAqhi: peak.aqhi || first.aqhi,
    peakTime: peak.time || '',
    label: weatherAirQualityLabel(first.aqhi),
    location: first.location || '',
    source: 'Environment Canada',
  };
}

function normalizeWeatherCanadaAlerts(raw = {}) {
  const features = Array.isArray(raw.features) ? raw.features : [];
  const now = Date.now();
  return features
    .map(feature => {
      const props = feature?.properties && typeof feature.properties === 'object' ? feature.properties : {};
      const title = String(props.alert_name_en || props.alert_short_name_en || props.alert_type || '').trim();
      const text = String(props.alert_text_en || props.impact_en || '').replace(/\s+/g, ' ').trim();
      const expires = String(props.expiration_datetime || props.event_end_datetime || '').trim();
      const expiryMs = weatherTimestamp(expires);
      return {
        title,
        summary: text,
        type: String(props.alert_type || '').trim(),
        colour: String(props.risk_colour_en || '').trim(),
        status: String(props.status_en || '').trim(),
        expires,
        source: 'Environment Canada',
        score: weatherAlertScore(props),
        expired: Boolean(expiryMs && expiryMs < now),
      };
    })
    .filter(alert => alert.title && !alert.expired)
    .sort((a, b) => b.score - a.score)
    .slice(0, 4);
}

function nearestWeatherHour(hourly, currentTime) {
  if (!Array.isArray(hourly) || !hourly.length) return null;
  const target = currentTime ? new Date(currentTime).getTime() : Date.now();
  return hourly
    .slice()
    .sort((a, b) => Math.abs(new Date(a.time).getTime() - target) - Math.abs(new Date(b.time).getTime() - target))[0] || null;
}

function weatherLocationInCanada(location) {
  const countryCode = String(location?.countryCode || '').toUpperCase();
  const country = String(location?.country || '').toLowerCase();
  return countryCode === 'CA' || country === 'canada';
}

function weatherAlertScore(props = {}) {
  const text = `${props.alert_type || ''} ${props.alert_name_en || ''} ${props.risk_colour_en || ''}`.toLowerCase();
  if (/warning|red/.test(text)) return 100;
  if (/watch|orange/.test(text)) return 88;
  if (/advisory|yellow/.test(text)) return 76;
  return 64;
}
