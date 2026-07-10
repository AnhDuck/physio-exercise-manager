// Weather preview and demo scenarios.

function weatherPreviewEnabled(cfg) {
  return weatherPreviewMode(cfg) !== 'live';
}

function weatherPreviewMode(cfg) {
  const value = typeof cfg?.previewMode === 'string' ? cfg.previewMode : 'live';
  if (value.startsWith('random:')) return value;
  return weatherPreviewScenarioKeys().includes(value) ? value : 'live';
}

function weatherPreviewScenarioKeys() {
  return [
    'live',
    'wmo-clear',
    'wmo-mostly-clear',
    'wmo-partly-cloudy',
    'wmo-cloudy',
    'wmo-fog',
    'wmo-rime-fog',
    'wmo-drizzle',
    'wmo-freezing-drizzle',
    'wmo-light-rain',
    'wmo-rain',
    'wmo-heavy-rain',
    'wmo-freezing-rain',
    'wmo-light-snow',
    'wmo-snow',
    'wmo-heavy-snow',
    'wmo-snow-grains',
    'wmo-showers',
    'wmo-snow-showers',
    'wmo-thunderstorm',
    'wmo-thunder-hail',
  ];
}

function weatherPreviewResult(cfg, liveData = null) {
  const mode = weatherPreviewMode(cfg);
  if (mode === 'live') return null;
  const scenario = mode.startsWith('random:')
    ? randomWeatherPreviewScenario(mode)
    : weatherPreviewScenario(mode);
  if (!scenario) return null;
  const locationLabel = liveData?.locationLabel || (cfg.location ? weatherLocationLabel(cfg.location) : 'Preview weather');
  return buildWeatherPreviewData(scenario, locationLabel);
}

function weatherPreviewScenario(mode) {
  const scenarios = {
    'wmo-clear': { label: 'Preview: Clear', temp: 18, feels: 18, humidity: 48, wind: 7, direction: 160, gust: 12, uv: 4, code: 0, isDay: true, moodHour: 11 },
    'wmo-mostly-clear': { label: 'Preview: Mostly clear', temp: 18, feels: 17, humidity: 54, wind: 8, direction: 170, gust: 14, uv: 3, code: 1, isDay: true, moodHour: 11 },
    'wmo-partly-cloudy': { label: 'Preview: Partly cloudy', temp: 17, feels: 16, humidity: 61, wind: 10, direction: 210, gust: 16, uv: 2, code: 2, isDay: true, moodHour: 11 },
    'wmo-cloudy': { label: 'Preview: Cloudy', temp: 12, feels: 10, humidity: 78, wind: 14, direction: 240, gust: 22, uv: 1, code: 3, isDay: true, moodHour: 11 },
    'wmo-fog': { label: 'Preview: Fog', temp: 8, feels: 7, humidity: 96, wind: 4, direction: 120, gust: 8, uv: 0, code: 45, isDay: true, moodHour: 8 },
    'wmo-rime-fog': { label: 'Preview: Rime fog', temp: -2, feels: -5, humidity: 96, wind: 9, direction: 35, gust: 16, uv: 0, code: 48, isDay: true, moodHour: 8 },
    'wmo-drizzle': { label: 'Preview: Drizzle', temp: 9, feels: 7, humidity: 88, wind: 12, direction: 190, gust: 18, uv: 0, code: 53, isDay: true, moodHour: 10 },
    'wmo-freezing-drizzle': { label: 'Preview: Freezing drizzle', temp: -1, feels: -5, humidity: 90, wind: 15, direction: 20, gust: 24, uv: 0, code: 57, isDay: true, moodHour: 10 },
    'wmo-light-rain': { label: 'Preview: Light rain', temp: 11, feels: 9, humidity: 86, wind: 14, direction: 180, gust: 22, uv: 1, code: 61, isDay: true, rainIn: 60, rainProbability: 70, moodHour: 13 },
    'wmo-rain': { label: 'Preview: Rain', temp: 10, feels: 8, humidity: 90, wind: 18, direction: 185, gust: 28, uv: 0, code: 63, isDay: true, rainIn: 30, rainProbability: 82, moodHour: 13 },
    'wmo-heavy-rain': { label: 'Preview: Heavy rain', temp: 9, feels: 6, humidity: 94, wind: 24, direction: 190, gust: 38, uv: 0, code: 65, isDay: true, rainIn: 30, rainProbability: 92, moodHour: 13 },
    'wmo-freezing-rain': { label: 'Preview: Freezing rain', temp: -1, feels: -6, humidity: 92, wind: 18, direction: 30, gust: 31, uv: 0, code: 67, isDay: true, rainIn: 30, rainProbability: 85, moodHour: 12 },
    'wmo-light-snow': { label: 'Preview: Light snow', temp: 0, feels: -4, humidity: 84, wind: 15, direction: 20, gust: 24, uv: 0, code: 71, isDay: true, snowIn: 60, moodHour: 9 },
    'wmo-snow': { label: 'Preview: Snow', temp: -2, feels: -6, humidity: 88, wind: 17, direction: 25, gust: 28, uv: 0, code: 73, isDay: true, snowIn: 30, moodHour: 9 },
    'wmo-heavy-snow': { label: 'Preview: Heavy snow', temp: -4, feels: -9, humidity: 90, wind: 22, direction: 30, gust: 35, uv: 0, code: 75, isDay: true, snowIn: 30, moodHour: 9 },
    'wmo-snow-grains': { label: 'Preview: Snow grains', temp: -3, feels: -7, humidity: 82, wind: 13, direction: 40, gust: 22, uv: 0, code: 77, isDay: true, snowIn: 60, moodHour: 9 },
    'wmo-showers': { label: 'Preview: Showers', temp: 13, feels: 11, humidity: 82, wind: 20, direction: 210, gust: 32, uv: 1, code: 81, isDay: true, rainIn: 30, rainProbability: 78, moodHour: 14 },
    'wmo-snow-showers': { label: 'Preview: Snow showers', temp: -1, feels: -5, humidity: 86, wind: 18, direction: 25, gust: 30, uv: 0, code: 85, isDay: true, snowIn: 30, moodHour: 10 },
    'wmo-thunderstorm': { label: 'Preview: Thunderstorm', temp: 17, feels: 16, humidity: 88, wind: 31, direction: 160, gust: 48, uv: 1, code: 95, isDay: true, rainIn: 30, rainProbability: 90, moodHour: 15 },
    'wmo-thunder-hail': { label: 'Preview: Thunderstorm with hail', temp: 12, feels: 8, humidity: 86, wind: 36, direction: 150, gust: 58, uv: 1, code: 96, isDay: true, rainIn: 30, rainProbability: 92, alert: 'Thunderstorm with hail. Check conditions before heading out.', moodHour: 15 },
  };
  return scenarios[mode] || null;
}

function randomWeatherPreviewScenario(mode) {
  const seed = Number.parseInt(String(mode).split(':')[1], 10) || Date.now();
  const random = seededWeatherPreviewRandom(seed);
  const codes = [0, 1, 2, 3, 45, 48, 51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 71, 73, 75, 77, 80, 81, 82, 85, 86, 95, 96, 99];
  const code = codes[Math.floor(random() * codes.length)] || 0;
  const isNight = random() > .78;
  const rainCode = weatherIsRainCode(code) || weatherIsStormCode(code);
  const snowCode = weatherIsSnowCode(code);
  const freezingCode = [56, 57, 66, 67].includes(code);
  const stormCode = weatherIsStormCode(code);
  const dampCode = rainCode || snowCode || [45, 48].includes(code);
  const wind = Math.round((stormCode ? 14 : 4) + random() * (stormCode ? 42 : 36));
  let temp = Math.round(-3 + random() * 32);
  if (snowCode || freezingCode) temp = Math.round(-6 + random() * 6);
  if (stormCode) temp = Math.round(7 + random() * 18);
  return {
    label: 'Preview: Random mix',
    temp,
    feels: Math.round(temp - (wind >= 20 ? 3 + random() * 3 : random() * 2)),
    humidity: Math.round((dampCode ? 66 : 38) + random() * (dampCode ? 30 : 46)),
    wind,
    direction: Math.round(random() * 359),
    gust: Math.round(wind + random() * 22),
    uv: isNight ? 0 : Math.round(random() * 7),
    aqhi: random() > .8 ? Math.round(7 + random() * 4) : Math.round(1 + random() * 5),
    uvPeak: isNight ? 0 : Math.round(3 + random() * 8),
    uvPeakHour: 10 + Math.floor(random() * 6),
    code,
    isDay: !isNight,
    rainIn: rainCode || random() > .7 ? Math.round(30 + random() * 240) : null,
    rainProbability: rainCode ? Math.round(70 + random() * 25) : Math.round(45 + random() * 45),
    snowIn: snowCode ? Math.round(30 + random() * 180) : null,
    sunsetIn: !isNight && random() > .72 ? Math.round(30 + random() * 105) : null,
    alert: stormCode || random() > .84 ? 'Special weather statement. Check conditions before heading out.' : '',
    moodHour: isNight ? 22 : 6 + Math.floor(random() * 14),
  };
}

function seededWeatherPreviewRandom(seed) {
  let value = seed % 2147483647;
  if (value <= 0) value += 2147483646;
  return () => {
    value = value * 16807 % 2147483647;
    return (value - 1) / 2147483646;
  };
}

function buildWeatherPreviewData(scenario, locationLabel) {
  const now = new Date();
  const base = new Date(now.getFullYear(), now.getMonth(), now.getDate(), scenario.moodHour ?? now.getHours(), 0, 0, 0);
  const sunset = scenario.sunsetIn !== null && scenario.sunsetIn !== undefined
    ? new Date(base.getTime() + scenario.sunsetIn * 60000)
    : new Date(now.getFullYear(), now.getMonth(), now.getDate(), 21, 4, 0, 0);
  const sunrise = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 5, 9, 0, 0);
  const hourly = Array.from({ length: 8 }, (_, index) => {
    const hourTime = new Date(base.getTime() + index * 60 * 60000);
    const precipitationStarts = scenario.rainIn !== null && scenario.rainIn !== undefined && index * 60 >= scenario.rainIn;
    const snowStarts = scenario.snowIn !== null && scenario.snowIn !== undefined && index * 60 >= scenario.snowIn;
    const uvPeakHour = Number(scenario.uvPeakHour) || 13;
    const uvDistance = Math.abs(hourTime.getHours() - uvPeakHour);
    const uvIndex = Math.max(Number(scenario.uv) || 0, Math.round((Number(scenario.uvPeak) || scenario.uv || 0) - uvDistance * 1.4));
    return {
      time: weatherLocalIso(hourTime),
      temperature: Math.round((Number(scenario.temp) || 0) + index * .8),
      apparentTemperature: Math.round((Number(scenario.feels) || scenario.temp || 0) + index * .7),
      humidity: Number(scenario.humidity) || 0,
      windSpeed: Number(scenario.wind) || 0,
      windDirection: Number(scenario.direction) || 0,
      windGusts: Number(scenario.gust) || 0,
      precipitationProbability: precipitationStarts || snowStarts ? Number(scenario.rainProbability) || 70 : 8,
      uvIndex,
      weatherCode: snowStarts
        ? (weatherIsSnowCode(scenario.code) ? Number(scenario.code) : 71)
        : precipitationStarts
          ? (weatherIsRainCode(scenario.code) || weatherIsStormCode(scenario.code) ? Number(scenario.code) : 61)
          : Number(scenario.code) || 0,
      isDay: Boolean(scenario.isDay),
    };
  });
  return {
    fetchedAt: new Date().toISOString(),
    locationLabel: scenario.label || locationLabel,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || '',
    current: {
      time: weatherLocalIso(base),
      temperature: Number(scenario.temp) || 0,
      apparentTemperature: Number(scenario.feels) || Number(scenario.temp) || 0,
      humidity: Number(scenario.humidity) || 0,
      windSpeed: Number(scenario.wind) || 0,
      windDirection: Number(scenario.direction) || 0,
      windGusts: Number(scenario.gust) || 0,
      uvIndex: Number(scenario.uv) || 0,
      weatherCode: Number(scenario.code) || 0,
      isDay: Boolean(scenario.isDay),
    },
    daily: {
      sunrise: weatherLocalIso(sunrise),
      sunset: weatherLocalIso(sunset),
    },
    airQuality: scenario.aqhi ? {
      fetchedAt: new Date().toISOString(),
      time: weatherLocalIso(base),
      aqhi: Number(scenario.aqhi) || 0,
      peakAqhi: Number(scenario.aqhi) || 0,
      peakTime: weatherLocalIso(base),
      label: weatherAirQualityLabel(Number(scenario.aqhi) || 0),
      source: 'Preview',
    } : null,
    sources: {
      weather: 'Preview',
      uv: 'Preview',
      airQuality: scenario.aqhi ? 'Preview' : '',
    },
    hourly,
    alerts: scenario.alert ? [{ title: scenario.alert }] : [],
  };
}

function weatherLocalIso(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  const h = String(date.getHours()).padStart(2, '0');
  const min = String(date.getMinutes()).padStart(2, '0');
  return `${y}-${m}-${d}T${h}:${min}`;
}

function normalizeWeatherPreviewSetting(value) {
  if (value === 'random') return `random:${weatherRandomPreviewSeed()}`;
  return weatherPreviewScenarioKeys().includes(value) ? value : 'live';
}

function weatherRandomPreviewSeed() {
  if (window.crypto?.getRandomValues) {
    const values = new Uint32Array(1);
    window.crypto.getRandomValues(values);
    return values[0] || Date.now();
  }
  return Math.floor(Math.random() * 2147483646) + 1;
}
