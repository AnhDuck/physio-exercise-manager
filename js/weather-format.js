// Weather display formatting, labels, condition mapping, and icons.

const WEATHER_ICON_ASSET_BASE = 'assets/weather-icons/google-weather-set-4/light/';



function weatherSettings() {
  return getHomeCardsSettings().weather;
}

function buildWeatherBrain(data) {
  const current = data?.current || {};
  const hourly = Array.isArray(data?.hourly) ? data.hourly : [];
  const nowMs = weatherTimestamp(current.time) || Date.now();
  const temp = Number(current.temperature) || 0;
  const feels = Number(current.apparentTemperature) || temp;
  const wind = Number(current.windSpeed) || 0;
  const gust = Number(current.windGusts) || 0;
  const uvNow = Number(current.uvIndex) || 0;
  const uvPeakInfo = weatherUvPeakInfo(hourly, nowMs, uvNow);
  const uvPeak = uvPeakInfo.value;
  const uvHighSoon = weatherNextUvHigh(hourly, nowMs);
  const sunsetMinutes = weatherMinutesUntil(data?.daily?.sunset, nowMs);
  const rainSoon = weatherNextPrecipitation(hourly, nowMs);
  const alert = weatherPrimaryAlert(data);
  const airQuality = weatherAirQualityCandidate(data?.airQuality);
  const candidates = [];

  if (airQuality) candidates.push(airQuality);

  if (alert) {
    candidates.push({
      key: 'alert',
      highlight: 'alert',
      label: 'Alert',
      score: 1000,
      advisory: alert,
    });
  }

  if (current.isDay && sunsetMinutes !== null && sunsetMinutes >= 0 && sunsetMinutes <= 120) {
    candidates.push({
      key: 'sunset',
      highlight: 'sun',
      tileLabel: sunsetMinutes <= 45 ? 'Sunset soon' : 'Walk window',
      label: 'Sunset',
      score: 100 + (120 - sunsetMinutes),
      advisory: `Sunset in ${weatherDurationPhrase(sunsetMinutes)}. Good walk window now.`,
    });
  }

  if (uvNow >= 6 || uvHighSoon || uvPeak >= 6) {
    const highSoon = uvHighSoon && uvHighSoon.minutes <= 180;
    const highLater = uvHighSoon && uvHighSoon.minutes > 180;
    const label = uvPeak >= 8 ? 'UV very high' : 'UV high';
    candidates.push({
      key: 'uv',
      highlight: 'uv',
      tileLabel: label,
      label: 'UV',
      score: uvNow >= 8 ? 98 : uvNow >= 6 ? 90 : highSoon ? 86 : 38,
      advisory: uvNow >= 6
        ? `UV is ${uvNow >= 8 ? 'very high' : 'high'} now. Shade helps.`
        : highSoon
          ? `UV gets ${uvPeak >= 8 ? 'very high' : 'high'} by ${homeCardFormatTime(uvHighSoon.time, data.timezone).replace(/\s/g, '')}.`
          : highLater
            ? `UV peaks around ${homeCardFormatTime(uvPeakInfo.time, data.timezone).replace(/\s/g, '')}.`
            : `UV peaks around ${homeCardFormatTime(uvPeakInfo.time, data.timezone).replace(/\s/g, '')}.`,
    });
  }

  if (wind >= 25 || gust >= 45) {
    candidates.push({
      key: 'wind',
      highlight: 'wind',
      tileLabel: wind >= 35 || gust >= 45 ? 'Strong wind' : 'Windy',
      label: 'Wind',
      score: Math.max(wind >= 35 ? 92 : 78, gust >= 45 ? 94 : 0),
      advisory: gust >= 45
        ? `Gusts may hit ${Math.round(gust)} km/h. Expect it to feel rough.`
        : `Wind is ${Math.round(wind)} km/h. Expect it to feel colder.`,
    });
  }

  if (rainSoon) {
    candidates.push({
      key: rainSoon.kind,
      highlight: rainSoon.kind,
      label: rainSoon.kind === 'snow' ? 'Snow' : 'Rain',
      score: rainSoon.minutes <= 120 ? 82 : 68,
      advisory: `${rainSoon.kind === 'snow' ? 'Snow' : 'Rain'} likely ${weatherStartsPhrase(rainSoon.minutes)}. Walk earlier if you can.`,
    });
  }

  const clothing = weatherClothingCue({ temp, feels, wind, current, rainSoon });
  if (clothing) {
    candidates.push({
      key: 'clothing',
      highlight: 'clothing',
      label: 'Layer',
      score: clothing.score,
      advisory: clothing.advisory,
    });
  }

  candidates.push({
    key: 'normal',
    highlight: 'normal',
    label: 'Today',
    score: 1,
    advisory: weatherNormalAdvisory(current, temp, wind),
  });

  const ranked = candidates.sort((a, b) => b.score - a.score);
  const primary = ranked[0];
  const secondary = ranked.find(item => item.key !== primary.key && ['air', 'sun', 'uv', 'wind'].includes(item.highlight) && item.score >= 84);
  return {
    ...primary,
    secondary: secondary?.highlight || '',
    secondaryLabel: secondary?.tileLabel || '',
    mood: weatherMood(data, primary, { wind, uvPeak, sunsetMinutes, rainSoon }),
  };
}

function weatherTimestamp(value) {
  const time = value ? new Date(value).getTime() : 0;
  return Number.isFinite(time) ? time : 0;
}

function weatherMinutesUntil(value, nowMs) {
  const target = weatherTimestamp(value);
  if (!target) return null;
  return Math.round((target - nowMs) / 60000);
}

function weatherNextPrecipitation(hourly, nowMs) {
  return hourly
    .map(hour => ({
      hour,
      minutes: Math.round((weatherTimestamp(hour.time) - nowMs) / 60000),
    }))
    .filter(item => item.minutes >= 0 && item.minutes <= 360)
    .map(item => {
      const code = Number(item.hour.weatherCode) || 0;
      const probability = Number(item.hour.precipitationProbability) || 0;
      if (weatherIsSnowCode(code)) return { kind: 'snow', minutes: item.minutes, time: item.hour.time };
      if (weatherIsRainCode(code) || probability >= 45) return { kind: 'rain', minutes: item.minutes, time: item.hour.time };
      return null;
    })
    .find(Boolean) || null;
}

function weatherUvPeakInfo(hourly, nowMs, currentUv) {
  const future = hourly
    .filter(hour => weatherTimestamp(hour.time) >= nowMs)
    .slice(0, 10);
  const peak = future.reduce((best, hour) => {
    const value = Number(hour.uvIndex) || 0;
    return value > best.value ? { value, time: hour.time } : best;
  }, { value: Number(currentUv) || 0, time: future[0]?.time || '' });
  return peak;
}

function weatherNextUvHigh(hourly, nowMs) {
  return hourly
    .map(hour => ({
      time: hour.time,
      value: Number(hour.uvIndex) || 0,
      minutes: Math.round((weatherTimestamp(hour.time) - nowMs) / 60000),
    }))
    .find(item => item.minutes >= 0 && item.value >= 6) || null;
}

function weatherPrimaryAlert(data) {
  const alerts = Array.isArray(data?.alerts) ? data.alerts : [];
  const first = alerts.find(alert => alert && typeof alert === 'object');
  if (!first) return '';
  const title = typeof first.title === 'string' ? first.title.trim() : '';
  const summary = typeof first.summary === 'string' ? first.summary.trim() : '';
  return title || summary || '';
}

function weatherAirQualityCandidate(airQuality) {
  const current = weatherAirQualityValue(airQuality);
  if (!current) return null;
  const peak = weatherAirQualityPeakValue(airQuality) || current;
  const worst = Math.max(current, peak);
  const label = weatherAirQualityLabel(worst);
  const timing = weatherAirQualityTiming(airQuality, peak > current ? airQuality.peakTime : airQuality.time);
  if (worst >= 7) {
    return {
      key: 'air',
      highlight: 'air',
      tileLabel: 'Bad air',
      label: 'Air',
      score: 1200,
      advisory: `AQHI ${formatWeatherAirQualityNumber(worst)} ${label}${timing}. Indoor physio is smarter.`,
    };
  }
  if (worst >= 4) {
    return {
      key: 'air',
      highlight: 'air',
      tileLabel: 'Air risk',
      label: 'Air',
      score: 980,
      advisory: `AQHI ${formatWeatherAirQualityNumber(worst)} ${label}${timing}. Keep outdoor work light.`,
    };
  }
  return null;
}

function weatherAirQualityTiming(airQuality, time) {
  const currentTime = weatherTimestamp(airQuality?.time);
  const targetTime = weatherTimestamp(time);
  if (!targetTime || !currentTime || targetTime <= currentTime + 45 * 60 * 1000) return ' now';
  return ` around ${homeCardFormatTime(time).replace(/\s/g, '')}`;
}

function weatherClothingCue({ temp, feels, wind, current, rainSoon }) {
  const isSunny = current.weatherCode === 0 || current.weatherCode === 1;
  const isBreezy = wind >= 15;
  if (rainSoon) {
    return { score: 62, advisory: `Bring a rain layer. Weather may turn while you are out.` };
  }
  if (feels <= 8) {
    return { score: 70, advisory: `${Math.round(feels)}\u00b0 feel. Wear the warm jacket.` };
  }
  if (temp <= 15 || feels <= 13) {
    return { score: 66, advisory: `${Math.round(temp)}\u00b0${isBreezy ? ' and breezy' : ''}. Wear the real jacket.` };
  }
  if (temp <= 18 && isBreezy) {
    return { score: 58, advisory: `${Math.round(temp)}\u00b0 with wind. Jacket beats zip-up.` };
  }
  if (temp >= 22 && isSunny && wind < 15) {
    return { score: 54, advisory: `Sunny and warm. Sweater or lighter should be enough.` };
  }
  return null;
}

function weatherNormalAdvisory(current, temp, wind) {
  if (!current.isDay) return `Night weather is calm. Check tomorrow's walk window.`;
  if (temp >= 18 && wind < 20) return `Looks comfortable for a walk. Keep it simple.`;
  if (wind >= 15) return `A bit of breeze today. Dress one step warmer.`;
  return `No major weather issue right now.`;
}

function weatherMood(data, primary, context) {
  const code = Number(data?.current?.weatherCode) || 0;
  const temp = Number(data?.current?.temperature) || 0;
  if (primary.key === 'air') return 'air';
  if (primary.key === 'alert') return 'alert';
  if (!data?.current?.isDay) return 'night';
  if (weatherIsStormCode(code)) return 'storm';
  if (weatherIsSnowCode(code) || temp <= 1) return 'snow';
  if (weatherIsRainCode(code) || context.rainSoon) return 'rain';
  if (primary.key === 'sunset') return 'sunset';
  if (context.uvPeak >= 8 || temp >= 27) return 'hot';
  if (context.wind >= 25) return 'wind';
  if (code === 0 || code === 1) return 'clear';
  if (code === 2 || code === 3) return 'cloudy';
  if ([45, 48].includes(code)) return 'fog';
  return 'default';
}

function weatherDurationPhrase(minutes) {
  const rounded = Math.max(0, Math.round(Number(minutes) || 0));
  if (rounded < 60) return `${rounded} min`;
  const hours = Math.floor(rounded / 60);
  const rest = rounded % 60;
  return rest ? `${hours}h ${rest}m` : `${hours}h`;
}

function weatherStartsPhrase(minutes) {
  const rounded = Math.max(0, Math.round(Number(minutes) || 0));
  if (rounded <= 30) return 'soon';
  return `in ${weatherDurationPhrase(rounded)}`;
}

function weatherPrecipitationCountdown(data) {
  const current = data?.current || {};
  const nowMs = weatherTimestamp(current.time) || Date.now();
  const rainSoon = weatherNextPrecipitation(Array.isArray(data?.hourly) ? data.hourly : [], nowMs);
  if (!rainSoon || rainSoon.minutes > 360) return null;
  return {
    label: `${rainSoon.kind === 'snow' ? 'Snow' : 'Rain'} ${weatherStartsPhrase(rainSoon.minutes)}`,
    timeMs: weatherTimestamp(rainSoon.time),
  };
}

function weatherIsRainCode(code) {
  return [51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82].includes(Number(code));
}

function weatherIsSnowCode(code) {
  return [71, 73, 75, 77, 85, 86].includes(Number(code));
}

function weatherIsStormCode(code) {
  return [95, 96, 99].includes(Number(code));
}

function formatWeatherSunTimes(daily, timezone) {
  const sunrise = homeCardFormatTime(daily?.sunrise, timezone);
  const sunset = homeCardFormatTime(daily?.sunset, timezone);
  if (!sunrise && !sunset) return '';
  if (!sunrise) return sunset;
  if (!sunset) return sunrise;
  return `${sunrise} / ${sunset}`;
}

function formatWeatherWind(speed, direction) {
  const speedValue = Number(speed);
  if (!Number.isFinite(speedValue)) return '';
  const roundedSpeed = Math.round(speedValue);
  const compass = weatherCompassDirection(direction);
  return `${roundedSpeed} km/h${compass ? ` ${compass}` : ''}`;
}

function weatherCompassDirection(degrees) {
  const value = Number(degrees);
  if (!Number.isFinite(value)) return '';
  const directions = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  return directions[Math.round((((value % 360) + 360) % 360) / 45) % directions.length];
}

function formatWeatherUvIndex(value) {
  const uvValue = Number(value);
  if (!Number.isFinite(uvValue)) return '';
  const index = Math.max(0, Math.round(uvValue));
  return `${index} ${weatherUvRiskLabel(index)}`;
}

function formatWeatherAirQuality(airQuality) {
  const value = weatherAirQualityValue(airQuality);
  if (!value) return '--';
  return `${formatWeatherAirQualityNumber(value)} ${weatherAirQualityLabel(value)}`;
}

function weatherAirQualityLabel(value) {
  const aqhi = Number(value) || 0;
  if (aqhi > 10) return 'Very high';
  if (aqhi >= 7) return 'High';
  if (aqhi >= 4) return 'Moderate';
  return 'Low';
}

function weatherAirQualityClass(airQuality) {
  const aqhi = weatherAirQualityValue(airQuality);
  if (aqhi >= 10) return 'weather-fact-air weather-air-bad';
  if (aqhi >= 7) return 'weather-fact-air weather-air-poor';
  if (aqhi >= 4) return 'weather-fact-air weather-air-moderate';
  return 'weather-fact-air weather-air-good';
}

function weatherAirQualityValue(airQuality) {
  return Number(airQuality?.aqhi ?? airQuality?.usAqi) || 0;
}

function weatherAirQualityPeakValue(airQuality) {
  return Number(airQuality?.peakAqhi ?? airQuality?.peakUsAqi) || 0;
}

function formatWeatherAirQualityNumber(value) {
  const rounded = Math.round((Number(value) || 0) * 10) / 10;
  return rounded > 10 ? '10+' : String(Math.round(rounded));
}

function weatherUvRiskLabel(index) {
  if (index >= 11) return 'Extreme';
  if (index >= 8) return 'Very high';
  if (index >= 6) return 'High';
  if (index >= 3) return 'Moderate';
  return 'Low';
}

function weatherMetricIconSvg(iconName) {
  const icons = {
    humidity: '<path d="M12 3.5C8.6 7.4 6.8 10.2 6.8 13a5.2 5.2 0 0 0 10.4 0c0-2.8-1.8-5.6-5.2-9.5z"></path>',
    wind: '<path d="M4 8h10.2a2.3 2.3 0 1 0-2.1-3.2"></path><path d="M4 12h14.2a2.8 2.8 0 1 1-2.5 4"></path><path d="M4 16h7"></path>',
    uv: '<circle cx="12" cy="12" r="3.2"></circle><path d="M12 3.5v2"></path><path d="M12 18.5v2"></path><path d="M3.5 12h2"></path><path d="M18.5 12h2"></path><path d="M6 6l1.4 1.4"></path><path d="M16.6 16.6L18 18"></path><path d="M18 6l-1.4 1.4"></path><path d="M7.4 16.6L6 18"></path>',
    sun: '<path d="M5 15.5h14"></path><path d="M7.5 15.5a4.5 4.5 0 0 1 9 0"></path><path d="M12 4v2"></path><path d="M4.8 8.3l1.5 1.1"></path><path d="M19.2 8.3l-1.5 1.1"></path>',
    air: '<path d="M4 8.5h8.7a2.2 2.2 0 1 0-2.2-2.2"></path><path d="M4 12.5h13.8a2.4 2.4 0 1 1-2.4 2.4"></path><path d="M4 16.5h6"></path><path d="M18 6.5h.1"></path><path d="M20 10.5h.1"></path>',
  };
  return `<svg viewBox="0 0 24 24" focusable="false">${icons[iconName] || icons.sun}</svg>`;
}

function weatherCondition(code, isDay = true) {
  if (code === 0) return { label: isDay ? 'Clear' : 'Clear night', icon: isDay ? 'sunny' : 'clear-night' };
  if (code === 1) return { label: isDay ? 'Mostly clear' : 'Mostly clear night', icon: isDay ? 'mostly-clear' : 'mostly-clear-night' };
  if (code === 2) return { label: 'Partly cloudy', icon: isDay ? 'partly-cloudy' : 'partly-cloudy-night' };
  if (code === 3) return { label: 'Cloudy', icon: 'cloudy' };
  if (code === 45) return { label: 'Fog', icon: 'fog' };
  if (code === 48) return { label: 'Rime fog', icon: 'rime-fog' };
  if ([51, 53, 55].includes(code)) return { label: code === 51 ? 'Light drizzle' : code === 55 ? 'Heavy drizzle' : 'Drizzle', icon: 'drizzle' };
  if ([56, 57].includes(code)) return { label: code === 56 ? 'Light freezing drizzle' : 'Freezing drizzle', icon: 'freezing-rain' };
  if ([61, 63, 65].includes(code)) return { label: code === 61 ? 'Light rain' : code === 65 ? 'Heavy rain' : 'Rain', icon: code === 65 ? 'heavy-rain' : 'rain' };
  if ([66, 67].includes(code)) return { label: code === 66 ? 'Light freezing rain' : 'Freezing rain', icon: 'freezing-rain' };
  if ([71, 73, 75].includes(code)) return { label: code === 71 ? 'Light snow' : code === 75 ? 'Heavy snow' : 'Snow', icon: code === 75 ? 'heavy-snow' : 'snow' };
  if (code === 77) return { label: 'Snow grains', icon: 'snow-grains' };
  if ([80, 81, 82].includes(code)) return { label: code === 80 ? 'Light showers' : code === 82 ? 'Heavy showers' : 'Showers', icon: code === 82 ? 'heavy-rain' : 'showers' };
  if ([85, 86].includes(code)) return { label: code === 85 ? 'Snow showers' : 'Heavy snow showers', icon: 'snow-showers' };
  if (code === 95) return { label: 'Thunderstorm', icon: 'storm' };
  if ([96, 99].includes(code)) return { label: code === 96 ? 'Thunderstorm with hail' : 'Severe thunderstorm with hail', icon: 'storm-hail' };
  return { label: 'Weather', icon: isDay ? 'partly-cloudy' : 'partly-cloudy-night' };
}

function weatherDisplayCondition(data) {
  const official = data?.officialCondition;
  const officialCode = official ? weatherConditionCodeFromOfficial(official, data?.current?.isDay) : null;
  if (official?.label && officialCode !== null) {
    return {
      ...weatherCondition(officialCode, data?.current?.isDay),
      label: official.label,
    };
  }
  return weatherCondition(data?.current?.weatherCode, data?.current?.isDay);
}

function weatherConditionCodeFromOfficial(official, isDay = true) {
  const label = String(official?.label || '').toLowerCase();
  if (!label) return null;
  if (/thunder|storm/.test(label)) return 95;
  if (/snow|flurr/.test(label)) return 71;
  if (/freezing rain|ice pellets|sleet/.test(label)) return 67;
  if (/drizzle/.test(label)) return 53;
  if (/rain|showers/.test(label)) return 61;
  if (/fog|mist|haze|smoke/.test(label)) return 45;
  if (/cloudy|overcast/.test(label)) return /partly|mainly|mix|sunny breaks|clear breaks|few/.test(label) ? 2 : 3;
  if (/partly|mainly|mix|sunny breaks|clear breaks/.test(label)) return 2;
  if (/few clouds|mostly clear|mainly clear/.test(label)) return 1;
  if (/clear|sunny/.test(label)) return isDay ? 0 : 1;
  return null;
}

function buildWeatherIcon(type, isDay = true, className = 'weather-icon') {
  const icon = el('span', `${className} weather-icon weather-icon-${type}`);
  icon.setAttribute('aria-hidden', 'true');
  const img = document.createElement('img');
  img.src = weatherIconAssetPath(type, isDay);
  img.alt = '';
  img.decoding = 'async';
  img.loading = 'lazy';
  img.addEventListener('error', () => {
    if (img.dataset.weatherIconFallback) return;
    img.dataset.weatherIconFallback = 'true';
    img.src = weatherIconAssetPath('cloudy', true);
  });
  icon.appendChild(img);
  return icon;
}

function weatherIconAssetPath(type, isDay = true) {
  return `${WEATHER_ICON_ASSET_BASE}${weatherIconFile(type, isDay)}`;
}

function weatherIconFile(type, isDay = true) {
  const dayNight = {
    sunny: ['clear_day.svg', 'clear_night.svg'],
    'clear-night': ['clear_day.svg', 'clear_night.svg'],
    'mostly-clear': ['mostly_clear_day.svg', 'mostly_clear_night.svg'],
    'mostly-clear-night': ['mostly_clear_day.svg', 'mostly_clear_night.svg'],
    'partly-cloudy': ['partly_cloudy_day.svg', 'partly_cloudy_night.svg'],
    'partly-cloudy-night': ['partly_cloudy_day.svg', 'partly_cloudy_night.svg'],
    showers: ['scattered_showers_day.svg', 'scattered_showers_night.svg'],
    'snow-showers': ['scattered_snow_showers_day.svg', 'scattered_snow_showers_night.svg'],
  };
  const dayNightMatch = dayNight[type];
  if (dayNightMatch) return dayNightMatch[isDay ? 0 : 1];
  const files = {
    cloudy: 'cloudy.svg',
    drizzle: 'drizzle.svg',
    rain: 'showers_rain.svg',
    'heavy-rain': 'heavy_rain.svg',
    snow: 'showers_snow.svg',
    'heavy-snow': 'heavy_snow.svg',
    'snow-grains': 'flurries.svg',
    'freezing-rain': 'mixed_rain_hail_sleet.svg',
    fog: 'haze_fog_dust_smoke.svg',
    'rime-fog': 'haze_fog_dust_smoke.svg',
    storm: 'thunderstorms.svg',
    'storm-hail': 'strong_thunderstorms.svg',
  };
  return files[type] || 'partly_cloudy_day.svg';
}

function isWeatherStale(isoString) {
  const then = isoString ? new Date(isoString).getTime() : 0;
  return !then || Date.now() - then > WEATHER_REFRESH_STALE_MS;
}

function weatherLocationLabel(location) {
  if (!location) return 'No location';
  const pieces = [weatherLocationName(location), location.admin1 || location.country].filter(Boolean);
  return pieces.join(', ');
}

function weatherLocationName(location) {
  const name = String(location?.name || '').trim();
  const admin1 = String(location?.admin1 || '').trim();
  if (!name || !admin1) return name;
  const suffix = ` ${admin1}`.toLowerCase();
  return name.toLowerCase().endsWith(suffix) ? name.slice(0, -suffix.length).trim() : name;
}

function weatherSourceTooltip(data) {
  const sources = data?.sources || {};
  const rows = [];
  if (sources.weather) rows.push({ label: 'Weather', value: sources.weather });
  if (sources.uv) {
    rows.push({
      label: 'UV',
      value: sources.uv,
      note: sources.weather === 'Environment Canada' && sources.uv === 'Open-Meteo'
        ? 'Environment Canada UV was not available for this refresh.'
        : '',
    });
  }
  if (sources.airQuality) {
    rows.push({
      label: 'Air quality',
      value: `${sources.airQuality} AQHI`,
      note: data?.airQuality?.location ? `Nearest region: ${data.airQuality.location}` : '',
    });
    rows.push({ note: 'AQHI match: nearest Environment Canada region in the local search area.' });
  } else {
    rows.push({ label: 'Air quality', value: 'Not available' });
  }
  return rows;
}
