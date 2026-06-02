// Weather API and fetch helpers.

const WEATHER_FETCH_TIMEOUT_MS = 12000;

const WEATHER_FORECAST_URL = 'https://api.open-meteo.com/v1/forecast';

const WEATHER_GEOCODING_URL = 'https://geocoding-api.open-meteo.com/v1/search';

const WEATHER_CANADA_ALERTS_URL = 'https://api.weather.gc.ca/collections/weather-alerts/items';

const WEATHER_CANADA_CITY_PAGE_URL = 'https://api.weather.gc.ca/collections/citypageweather-realtime/items';

const WEATHER_CANADA_AQHI_URL = 'https://api.weather.gc.ca/collections/aqhi-forecasts-realtime/items';



async function fetchWeatherForLocation(location, cfg = weatherSettings()) {
  const params = new URLSearchParams({
    latitude: String(location.latitude),
    longitude: String(location.longitude),
    current_weather: 'true',
    current: 'temperature_2m,relative_humidity_2m,apparent_temperature,is_day,weather_code,wind_speed_10m,wind_direction_10m',
    hourly: 'temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,is_day,cloud_cover,uv_index,wind_speed_10m,wind_direction_10m,wind_gusts_10m,precipitation_probability',
    daily: 'sunrise,sunset',
    temperature_unit: 'celsius',
    wind_speed_unit: 'kmh',
    timezone: 'auto',
    forecast_days: '2',
  });
  const [raw, airQuality, alerts, canadaWeather] = await Promise.all([
    weatherFetchJson(`${WEATHER_FORECAST_URL}?${params.toString()}`, 'Weather'),
    cfg.airQualityEnabled === false ? Promise.resolve(null) : fetchWeatherCanadaAirQuality(location).catch(() => null),
    cfg.alertsEnabled === false ? Promise.resolve([]) : fetchWeatherCanadaAlerts(location).catch(() => []),
    fetchWeatherCanadaCityPage(location).catch(() => null),
  ]);
  const hourly = normalizeWeatherHourly(raw.hourly);
  const current = raw.current && typeof raw.current === 'object' ? raw.current : {};
  const currentWeather = raw.current_weather && typeof raw.current_weather === 'object' ? raw.current_weather : {};
  const currentTime = current.time || currentWeather.time || '';
  const nearest = nearestWeatherHour(hourly, currentTime);
  const weatherCode = weatherNumber(current.weather_code, weatherNumber(currentWeather.weathercode, nearest?.weatherCode ?? 0));
  const isDay = weatherNumber(current.is_day, weatherNumber(currentWeather.is_day, nearest?.isDay ? 1 : 0)) === 1;
  const canadaCurrent = canadaWeather?.current || null;
  const canadaHourly = Array.isArray(canadaWeather?.hourly) ? mergeWeatherCanadaHourlyWithOpenMeteo(canadaWeather.hourly, hourly) : null;
  const useCanadaWeather = Boolean(canadaCurrent);
  const displayHourly = canadaHourly?.length ? canadaHourly : hourly;
  const displayNearest = nearestWeatherHour(displayHourly, currentTime);
  const uvSource = displayNearest?.uvSource || (useCanadaWeather ? 'Environment Canada' : 'Open-Meteo');
  const officialCode = canadaCurrent ? weatherConditionCodeFromOfficial(canadaCurrent, isDay) : null;
  return {
    fetchedAt: new Date().toISOString(),
    locationLabel: weatherLocationLabel(location),
    timezone: raw.timezone || location.timezone || '',
    current: {
      time: useCanadaWeather ? canadaCurrent.time || currentTime || nearest?.time || '' : currentTime || nearest?.time || '',
      temperature: useCanadaWeather ? canadaCurrent.temperature : weatherNumber(current.temperature_2m, weatherNumber(currentWeather.temperature, nearest?.temperature ?? 0)),
      apparentTemperature: useCanadaWeather ? canadaCurrent.temperature : weatherNumber(current.apparent_temperature, nearest?.apparentTemperature ?? weatherNumber(currentWeather.temperature, 0)),
      humidity: useCanadaWeather ? canadaCurrent.humidity : weatherNumber(current.relative_humidity_2m, nearest?.humidity ?? 0),
      windSpeed: useCanadaWeather ? canadaCurrent.windSpeed : weatherNumber(current.wind_speed_10m, weatherNumber(currentWeather.windspeed, nearest?.windSpeed ?? 0)),
      windDirection: useCanadaWeather ? canadaCurrent.windDirection : weatherNumber(current.wind_direction_10m, weatherNumber(currentWeather.winddirection, nearest?.windDirection ?? 0)),
      windGusts: useCanadaWeather ? canadaCurrent.windGusts : nearest?.windGusts || 0,
      uvIndex: displayNearest?.uvIndex || nearest?.uvIndex || 0,
      weatherCode: officialCode ?? weatherCode,
      isDay,
    },
    daily: {
      sunrise: canadaWeather?.daily?.sunrise || raw.daily?.sunrise?.[0] || '',
      sunset: canadaWeather?.daily?.sunset || raw.daily?.sunset?.[0] || '',
    },
    airQuality,
    alerts,
    officialCondition: canadaCurrent,
    sources: weatherDataSources({ useCanadaWeather, airQuality, uvSource }),
    hourly: displayHourly,
  };
}

async function fetchWeatherCanadaCityPage(location) {
  if (!weatherLocationInCanada(location)) return null;
  const lat = Number(location.latitude);
  const lon = Number(location.longitude);
  const size = .22;
  const params = new URLSearchParams({
    f: 'json',
    limit: '3',
    bbox: `${lon - size},${lat - size},${lon + size},${lat + size}`,
  });
  const raw = await weatherFetchJson(`${WEATHER_CANADA_CITY_PAGE_URL}?${params.toString()}`, 'Environment Canada weather');
  return normalizeWeatherCanadaCityPage(raw, location);
}

async function fetchWeatherCanadaAirQuality(location) {
  if (!weatherLocationInCanada(location)) return null;
  const lat = Number(location.latitude);
  const lon = Number(location.longitude);
  const size = .35;
  const params = new URLSearchParams({
    f: 'json',
    limit: '500',
    bbox: `${lon - size},${lat - size},${lon + size},${lat + size}`,
  });
  const raw = await weatherFetchJson(`${WEATHER_CANADA_AQHI_URL}?${params.toString()}`, 'Environment Canada air quality');
  return normalizeWeatherCanadaAirQuality(raw, location);
}

async function fetchWeatherCanadaAlerts(location) {
  if (!weatherLocationInCanada(location)) return [];
  const lat = Number(location.latitude);
  const lon = Number(location.longitude);
  const size = .08;
  const params = new URLSearchParams({
    f: 'json',
    limit: '8',
    bbox: `${lon - size},${lat - size},${lon + size},${lat + size}`,
  });
  const raw = await weatherFetchJson(`${WEATHER_CANADA_ALERTS_URL}?${params.toString()}`, 'Environment Canada alerts');
  return normalizeWeatherCanadaAlerts(raw);
}

async function weatherFetchJson(url, label = 'Weather') {
  if (!window.fetch) return weatherFetchJsonWithXhr(url, label);
  const controller = window.AbortController ? new AbortController() : null;
  const timeout = controller
    ? window.setTimeout(() => controller.abort(), WEATHER_FETCH_TIMEOUT_MS)
    : null;
  try {
    const response = await fetch(url, {
      cache: 'no-store',
      signal: controller?.signal,
    });
    const text = await response.text();
    const payload = parseWeatherJson(text);
    if (!response.ok) throw createWeatherHttpError(label, response.status, payload, text);
    return payload || {};
  } catch (err) {
    if (err.name === 'AbortError') throw new Error('Weather request timed out');
    throw err;
  } finally {
    if (timeout) window.clearTimeout(timeout);
  }
}

function weatherFetchJsonWithXhr(url, label = 'Weather') {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open('GET', url, true);
    request.responseType = 'json';
    request.timeout = WEATHER_FETCH_TIMEOUT_MS;
    request.onload = () => {
      const payload = request.response || null;
      if (request.status < 200 || request.status >= 300) {
        reject(createWeatherHttpError(label, request.status, payload, ''));
        return;
      }
      resolve(payload || {});
    };
    request.onerror = () => reject(new Error('Weather request failed'));
    request.ontimeout = () => reject(new Error('Weather request timed out'));
    request.send();
  });
}

function parseWeatherJson(text) {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch (_) {
    return null;
  }
}

function createWeatherHttpError(label, status, payload, text) {
  const reason = typeof payload?.reason === 'string' ? payload.reason : String(text || '').trim();
  const err = new Error(`${label} HTTP ${status}${reason ? `: ${reason}` : ''}`);
  err.status = status;
  err.reason = reason;
  err.rateLimited = status === 429 || /limit exceeded|rate limit|too many requests/i.test(reason);
  return err;
}

async function searchWeatherLocations(query) {
  const params = new URLSearchParams({ name: query, count: '8', language: 'en', format: 'json' });
  const raw = await weatherFetchJson(`${WEATHER_GEOCODING_URL}?${params.toString()}`, 'Location');
  return (raw.results || []).map(item => ({
    name: item.name || '',
    admin1: item.admin1 || '',
    country: item.country || '',
    countryCode: item.country_code || '',
    timezone: item.timezone || '',
    latitude: Number(item.latitude),
    longitude: Number(item.longitude),
  })).filter(normalizeWeatherLocation);
}

function weatherErrorMessage(err) {
  if (!err) return 'Unknown error';
  if (err.name === 'AbortError') return 'Request timed out';
  if (err?.rateLimited || err?.status === 429) return 'Open-Meteo hourly limit reached';
  return err.message || String(err);
}
