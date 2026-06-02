// Weather card and location settings.

const WEATHER_REFRESH_STALE_MS = 20 * 60 * 1000;
const WEATHER_REFRESH_ERROR_STALE_MS = 30 * 60 * 1000;
const WEATHER_FETCH_TIMEOUT_MS = 12000;
const WEATHER_REQUEST_MIN_GAP_MS = 10 * 1000;
const WEATHER_FORECAST_BURST_WINDOW_MS = 10 * 60 * 1000;
const WEATHER_FORECAST_BURST_LIMIT = 60;
const WEATHER_FORECAST_BURST_COOLDOWN_MS = 5 * 60 * 1000;
const WEATHER_RATE_LIMIT_COOLDOWN_MS = 65 * 60 * 1000;
const WEATHER_LOCATION_SEARCH_MIN_GAP_MS = 2 * 1000;
const WEATHER_FORECAST_URL = 'https://api.open-meteo.com/v1/forecast';
const WEATHER_GEOCODING_URL = 'https://geocoding-api.open-meteo.com/v1/search';
const WEATHER_CANADA_ALERTS_URL = 'https://api.weather.gc.ca/collections/weather-alerts/items';
const WEATHER_CANADA_CITY_PAGE_URL = 'https://api.weather.gc.ca/collections/citypageweather-realtime/items';
const WEATHER_CANADA_AQHI_URL = 'https://api.weather.gc.ca/collections/aqhi-forecasts-realtime/items';
const WEATHER_ICON_ASSET_BASE = 'assets/weather-icons/google-weather-set-4/light/';

function weatherSettings() {
  return getHomeCardsSettings().weather;
}

function buildWeatherCard() {
  const cfg = weatherSettings();
  const liveData = cfg.lastResult;
  const data = weatherPreviewResult(cfg, liveData) || liveData;
  const brain = data?.current ? buildWeatherBrain(data) : null;
  const card = el('article', `home-card weather-card ${weatherCardStateClass(cfg, brain)}`);
  card.setAttribute('aria-label', 'Weather');

  if (!cfg.location && !weatherPreviewEnabled(cfg)) {
    card.appendChild(buildWeatherSetupState());
    return card;
  }

  if (!data?.current) {
    card.appendChild(buildWeatherLoadingState(cfg));
    return card;
  }

  const condition = weatherDisplayCondition(data);
  const header = el('div', 'weather-card-header');
  const title = el('div', 'weather-card-title');
  title.appendChild(elText('span', 'home-card-kicker', 'Weather'));
  title.appendChild(elText('strong', '', data.locationLabel || weatherLocationLabel(cfg.location)));
  header.appendChild(title);
  header.appendChild(buildWeatherHeaderActions());
  card.appendChild(header);

  const main = el('div', 'weather-current');
  const temp = el('div', 'weather-temp-block');
  temp.appendChild(elText('div', 'weather-temp', `${Math.round(data.current.temperature)}°`));
  temp.appendChild(elText('div', 'weather-condition', condition.label));
  temp.appendChild(elText('div', 'weather-feels', `Feels ${Math.round(data.current.apparentTemperature)}°C`));
  main.appendChild(temp);
  main.appendChild(buildWeatherIcon(condition.icon, data.current.isDay, 'weather-hero-icon'));
  card.appendChild(main);
  if (brain?.advisory) card.appendChild(buildWeatherAdvisory(brain));

  const facts = el('div', 'weather-facts');
  const airQuality = data.airQuality;
  if (airQuality) {
    facts.appendChild(buildWeatherFact(weatherFactLabel(brain, 'air', 'Air'), formatWeatherAirQuality(airQuality), 'air', weatherFactClass(brain, 'air', weatherAirQualityClass(airQuality))));
  } else {
    facts.appendChild(buildWeatherFact('Humidity', `${Math.round(data.current.humidity)}%`, 'humidity', weatherFactClass(brain, 'humidity')));
  }
  facts.appendChild(buildWeatherFact(weatherFactLabel(brain, 'wind', 'Wind'), formatWeatherWind(data.current.windSpeed, data.current.windDirection), 'wind', weatherFactClass(brain, 'wind')));
  facts.appendChild(buildWeatherFact(weatherFactLabel(brain, 'uv', 'UV index'), formatWeatherUvIndex(data.current.uvIndex), 'uv', weatherFactClass(brain, 'uv')));
  facts.appendChild(buildWeatherFact(weatherFactLabel(brain, 'sun', 'Sun'), formatWeatherSunTimes(data.daily, data.timezone), 'sun', weatherFactClass(brain, 'sun', 'weather-fact-sun')));
  card.appendChild(facts);

  card.appendChild(buildWeatherHourlyStrip(data));
  card.appendChild(buildWeatherStatusLine(cfg, data));
  return card;
}

function buildWeatherSetupState() {
  const wrap = el('div', 'home-card-empty');
  wrap.appendChild(buildWeatherIcon('partly-cloudy', true, 'weather-empty-icon'));
  wrap.appendChild(elText('strong', '', 'Set weather location'));
  wrap.appendChild(elText('span', '', 'Open Settings, search for your city, and pick the forecast location.'));
  const btn = elText('button', 'home-card-action', 'Weather settings');
  btn.type = 'button';
  btn.dataset.homeCardAction = 'open-weather-settings';
  wrap.appendChild(btn);
  const actions = el('div', 'home-card-actions');
  actions.appendChild(buildWeatherPreviewButton('preview-weather-alert', 'Alert preview', 'warning'));
  actions.appendChild(buildWeatherPreviewButton('randomize-weather-preview', 'Random preview', 'shuffle'));
  wrap.appendChild(actions);
  return wrap;
}

function buildWeatherLoadingState(cfg) {
  const wrap = el('div', 'home-card-empty');
  const pauseMessage = weatherRefreshPauseMessage(cfg);
  wrap.appendChild(buildWeatherIcon('cloudy', true, 'weather-empty-icon'));
  wrap.appendChild(elText('strong', '', weatherLocationLabel(cfg.location)));
  wrap.appendChild(elText('span', '', pauseMessage || cfg.lastError || (weatherRefreshPromise ? 'Refreshing weather...' : 'Waiting for the first weather refresh.')));
  wrap.appendChild(buildWeatherRefreshButton());
  return wrap;
}

function buildWeatherHeaderActions() {
  const actions = el('div', 'home-card-actions');
  if (weatherPreviewEnabled(weatherSettings())) {
    actions.appendChild(buildWeatherPreviewButton('reset-weather-preview', 'Return to live weather', 'restore'));
  }
  actions.appendChild(buildWeatherPreviewButton('preview-weather-alert', 'Preview Environment Canada alert', 'warning'));
  actions.appendChild(buildWeatherPreviewButton('randomize-weather-preview', 'Randomize weather preview', 'shuffle'));
  actions.appendChild(buildWeatherRefreshButton());
  return actions;
}

function buildWeatherPreviewButton(action, title, iconName) {
  const btn = el('button', 'home-card-icon-btn');
  btn.type = 'button';
  btn.dataset.homeCardAction = action;
  btn.title = title;
  btn.setAttribute('aria-label', title);
  btn.appendChild(buildAppIconSvg(iconName));
  return btn;
}

function buildWeatherRefreshButton() {
  const btn = el('button', 'home-card-icon-btn');
  const pauseMessage = weatherRefreshPauseMessage(weatherSettings());
  btn.type = 'button';
  btn.dataset.homeCardAction = 'refresh-weather';
  btn.title = pauseMessage || (weatherRefreshPromise ? 'Refreshing weather' : 'Refresh weather');
  btn.setAttribute('aria-label', btn.title);
  btn.disabled = Boolean(weatherRefreshPromise || pauseMessage);
  btn.appendChild(buildAppIconSvg('reconnect'));
  return btn;
}

function buildWeatherAdvisory(brain) {
  const advisory = el('div', `weather-advisory weather-advisory-${brain.highlight || 'normal'}`);
  advisory.appendChild(elText('span', 'weather-advisory-label', brain.label || 'Today'));
  advisory.appendChild(elText('strong', '', brain.advisory));
  return advisory;
}

function buildWeatherFact(label, value, iconName = '', className = '') {
  const item = el('div', `weather-fact ${className}`.trim());
  const labelRow = el('span', 'weather-fact-label');
  if (iconName) labelRow.appendChild(buildWeatherMetricIcon(iconName));
  labelRow.appendChild(elText('span', '', label));
  item.appendChild(labelRow);
  item.appendChild(elText('strong', '', value || '--'));
  return item;
}

function weatherFactClass(brain, fact, baseClass = '') {
  const classes = [baseClass].filter(Boolean);
  if (brain?.highlight === fact) classes.push('is-smart-highlight');
  if (brain?.secondary === fact) classes.push('is-smart-secondary');
  return classes.join(' ');
}

function weatherFactLabel(brain, fact, fallback) {
  if (brain?.highlight === fact && brain.tileLabel) return brain.tileLabel;
  if (brain?.secondary === fact && brain.secondaryLabel) return brain.secondaryLabel;
  return fallback;
}

function buildWeatherMetricIcon(iconName) {
  const icon = el('span', `weather-fact-icon weather-fact-icon-${iconName}`);
  icon.setAttribute('aria-hidden', 'true');
  icon.innerHTML = weatherMetricIconSvg(iconName);
  return icon;
}

function buildWeatherHourlyStrip(data) {
  const strip = el('div', 'weather-hourly-strip');
  const countdown = weatherPrecipitationCountdown(data);
  (data.hourly || []).slice(0, 6).forEach(hour => {
    const condition = weatherCondition(hour.weatherCode, hour.isDay);
    const item = el('div', 'weather-hourly-item');
    const isCountdownHour = countdown && weatherTimestamp(hour.time) === countdown.timeMs;
    if (isCountdownHour) item.classList.add('is-countdown');
    item.appendChild(elText('span', '', isCountdownHour ? countdown.label : homeCardFormatTime(hour.time, data.timezone).replace(/\s/g, '')));
    item.appendChild(buildWeatherIcon(condition.icon, hour.isDay, 'weather-hourly-icon'));
    item.appendChild(elText('strong', '', `${Math.round(hour.temperature)}°`));
    strip.appendChild(item);
  });
  return strip;
}

function buildWeatherStatusLine(cfg, data) {
  const line = el('div', 'home-card-status-line');
  const stale = isWeatherStale(data?.fetchedAt);
  const text = stale
    ? `Stale - updated ${homeCardRelativeTime(data.fetchedAt)}`
    : `Updated ${homeCardRelativeTime(data.fetchedAt)}`;
  line.appendChild(elText('span', stale ? 'is-stale' : '', text));
  const pauseMessage = weatherRefreshPauseMessage(cfg);
  if (pauseMessage) line.appendChild(elText('span', 'is-warning', pauseMessage));
  if (cfg.lastError) line.appendChild(elText('span', 'is-warning', `Last refresh failed: ${cfg.lastError}`));
  const sourceTooltip = weatherSourceTooltip(data);
  if (sourceTooltip.length) {
    const chip = el('span', 'weather-source-chip');
    chip.tabIndex = 0;
    chip.setAttribute('role', 'button');
    chip.setAttribute('aria-label', weatherSourceTooltipText(sourceTooltip));
    chip.appendChild(elText('span', 'weather-source-chip-text', 'Sources'));
    chip.appendChild(buildWeatherSourceTooltip(sourceTooltip));
    chip.addEventListener('mouseenter', () => chip.classList.add('is-open'));
    chip.addEventListener('mouseleave', () => chip.classList.remove('is-open'));
    chip.addEventListener('focus', () => chip.classList.add('is-open'));
    chip.addEventListener('blur', () => chip.classList.remove('is-open'));
    chip.addEventListener('click', () => chip.classList.toggle('is-open'));
    chip.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') chip.classList.remove('is-open');
    });
    line.appendChild(chip);
  }
  if (Array.isArray(data?.alerts) && data.alerts.length) line.appendChild(elText('span', 'is-warning', 'Environment Canada alert'));
  return line;
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

function buildWeatherSourceTooltip(rows) {
  const tooltip = el('span', 'weather-source-tooltip');
  rows.forEach(row => {
    if (row.label) {
      const item = el('span', 'weather-source-tooltip-row');
      item.appendChild(elText('span', 'weather-source-tooltip-label', row.label));
      item.appendChild(elText('span', 'weather-source-tooltip-value', row.value));
      tooltip.appendChild(item);
    }
    if (row.note) tooltip.appendChild(elText('span', 'weather-source-tooltip-note', row.note));
  });
  return tooltip;
}

function weatherSourceTooltipText(rows) {
  return rows.map(row => {
    if (row.label && row.note) return `${row.label}: ${row.value}. ${row.note}`;
    if (row.label) return `${row.label}: ${row.value}`;
    return row.note || '';
  }).filter(Boolean).join('. ');
}

function weatherCardStateClass(cfg, brain = null) {
  const classes = [];
  if (!cfg.location) classes.push('is-setup-needed');
  if (weatherRefreshPromise) classes.push('is-refreshing');
  if (cfg.lastResult?.fetchedAt && isWeatherStale(cfg.lastResult.fetchedAt)) classes.push('is-stale');
  if (cfg.lastError && !cfg.lastResult) classes.push('is-error');
  if (brain?.mood) classes.push(`weather-mood-${brain.mood}`);
  if (brain?.highlight) classes.push(`weather-highlight-${brain.highlight}`);
  return classes.join(' ');
}

function refreshWeatherIfNeeded(trigger = 'auto', options = {}) {
  const cfg = weatherSettings();
  if (!cfg.enabled || !cfg.location) return Promise.resolve(null);
  if (weatherRefreshPromise) return weatherRefreshPromise;
  const now = Date.now();
  const force = Boolean(options.force);
  const last = cfg.lastResult?.fetchedAt ? new Date(cfg.lastResult.fetchedAt).getTime() : 0;
  const intervalMs = Math.max(5, Number(cfg.refreshMinutes) || 10) * 60 * 1000;
  if (!force && last && now - last < intervalMs) return Promise.resolve(cfg.lastResult);
  if (isWeatherRateLimitPaused(cfg, now)) return Promise.resolve(cfg.lastResult);

  const lastError = cfg.lastErrorAt ? new Date(cfg.lastErrorAt).getTime() : 0;
  if (!force && lastError && now - lastError < WEATHER_REFRESH_ERROR_STALE_MS) return Promise.resolve(cfg.lastResult);
  if (!canStartWeatherRequest(cfg, now, trigger)) return Promise.resolve(cfg.lastResult);
  if (!reserveWeatherForecastAttempt(cfg, now)) return Promise.resolve(cfg.lastResult);

  weatherRefreshStartedAt = now;
  const requestedLocationKey = weatherLocationKey(cfg.location);
  const requestId = ++weatherForecastRequestId;
  cfg.lastRequestAt = new Date(now).toISOString();
  saveSettings(settings);

  const promise = fetchWeatherForLocation(cfg.location, cfg)
    .then(result => {
      const latestCfg = weatherSettings();
      if (requestId !== weatherForecastRequestId || weatherLocationKey(latestCfg.location) !== requestedLocationKey) return latestCfg.lastResult;
      latestCfg.lastResult = result;
      latestCfg.lastError = '';
      latestCfg.lastErrorAt = '';
      latestCfg.rateLimitUntil = '';
      saveSettings(settings);
      renderHomeCards();
      return result;
    })
    .catch(err => {
      const latestCfg = weatherSettings();
      if (requestId !== weatherForecastRequestId || weatherLocationKey(latestCfg.location) !== requestedLocationKey) return latestCfg.lastResult;
      if (isWeatherRateLimitError(err)) {
        pauseWeatherRefresh(latestCfg, 'Open-Meteo hourly limit reached', now + WEATHER_RATE_LIMIT_COOLDOWN_MS);
      } else {
        latestCfg.lastError = weatherErrorMessage(err);
        latestCfg.lastErrorAt = new Date().toISOString();
        saveSettings(settings);
      }
      renderHomeCards();
      return latestCfg.lastResult;
    })
    .finally(() => {
      if (weatherRefreshPromise === promise) {
        weatherRefreshPromise = null;
        weatherRefreshStartedAt = 0;
      }
      renderHomeCards();
    });
  weatherRefreshPromise = promise;
  renderHomeCards();
  return weatherRefreshPromise;
}

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
    aqi: random() > .8 ? Math.round(95 + random() * 160) : Math.round(12 + random() * 58),
    pm25: Math.round(3 + random() * 70),
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
    airQuality: scenario.aqi ? {
      fetchedAt: new Date().toISOString(),
      time: weatherLocalIso(base),
      usAqi: Number(scenario.aqi) || 0,
      pm25: Number(scenario.pm25) || 0,
      peakUsAqi: Number(scenario.aqi) || 0,
      peakTime: weatherLocalIso(base),
      label: weatherAirQualityLabel(Number(scenario.aqi) || 0),
      source: 'Preview',
    } : null,
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

function weatherErrorMessage(err) {
  if (!err) return 'Unknown error';
  if (err.name === 'AbortError') return 'Request timed out';
  if (err?.rateLimited || err?.status === 429) return 'Open-Meteo hourly limit reached';
  return err.message || String(err);
}

function weatherLocationKey(location) {
  if (!location) return '';
  return `${Number(location.latitude).toFixed(5)},${Number(location.longitude).toFixed(5)}`;
}

function isWeatherRateLimitError(err) {
  const text = `${err?.reason || ''} ${err?.message || ''}`;
  return Boolean(err?.rateLimited || err?.status === 429 || /hourly api request limit|rate limit|too many requests/i.test(text));
}

function isWeatherRateLimitPaused(cfg, now = Date.now()) {
  const until = cfg.rateLimitUntil ? new Date(cfg.rateLimitUntil).getTime() : 0;
  return Boolean(until && until > now);
}

function weatherRefreshPauseMessage(cfg) {
  const until = cfg?.rateLimitUntil ? new Date(cfg.rateLimitUntil).getTime() : 0;
  if (!until || until <= Date.now()) return '';
  return `Open-Meteo paused until ${homeCardFormatTime(new Date(until).toISOString())}`;
}

function canStartWeatherRequest(cfg, now, trigger) {
  const lastRequest = cfg.lastRequestAt ? new Date(cfg.lastRequestAt).getTime() : 0;
  if (!lastRequest || now - lastRequest >= WEATHER_REQUEST_MIN_GAP_MS) return true;
  if (trigger === 'manual' && typeof showToast === 'function') {
    showToast(`Weather is paused for ${formatWeatherDelay(WEATHER_REQUEST_MIN_GAP_MS - (now - lastRequest))}.`);
  }
  return false;
}

function reserveWeatherForecastAttempt(cfg, now = Date.now()) {
  weatherForecastRequestTimes = weatherForecastRequestTimes.filter(ts => now - ts < WEATHER_FORECAST_BURST_WINDOW_MS);
  if (weatherForecastRequestTimes.length >= WEATHER_FORECAST_BURST_LIMIT) {
    pauseWeatherRefresh(cfg, 'Too many weather requests. Weather paused', now + WEATHER_FORECAST_BURST_COOLDOWN_MS);
    renderHomeCards();
    return false;
  }
  weatherForecastRequestTimes.push(now);
  return true;
}

function pauseWeatherRefresh(cfg, message, untilMs) {
  cfg.rateLimitUntil = new Date(untilMs).toISOString();
  cfg.lastError = `${message} for ${formatWeatherDelay(untilMs - Date.now())}.`;
  cfg.lastErrorAt = new Date().toISOString();
  saveSettings(settings);
}

function formatWeatherDelay(ms) {
  const minutes = Math.max(1, Math.ceil((Number(ms) || 0) / 60000));
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'}`;
  const hours = Math.ceil(minutes / 60);
  return `${hours} hour${hours === 1 ? '' : 's'}`;
}

function searchWeatherLocationsFromSettings() {
  const input = document.getElementById('setting-weather-location-search');
  const query = input?.value.trim() || '';
  if (query.length < 3) {
    renderWeatherLocationSearchStatus('Type at least 3 characters.', true);
    return;
  }
  if (weatherLocationSearchPromise) {
    renderWeatherLocationSearchStatus('Search already running.', false);
    return;
  }
  const now = Date.now();
  if (now - weatherLocationSearchLastAt < WEATHER_LOCATION_SEARCH_MIN_GAP_MS) {
    renderWeatherLocationSearchStatus('Wait a moment before searching again.', true);
    return;
  }
  weatherLocationSearchLastAt = now;
  const requestId = ++weatherLocationSearchRequestId;
  weatherLocationSearchPromise = searchWeatherLocations(query)
    .then(results => {
      if (requestId !== weatherLocationSearchRequestId) return;
      weatherLocationSearchResults = results;
      renderWeatherLocationResults(results);
    })
    .catch(err => {
      if (requestId !== weatherLocationSearchRequestId) return;
      renderWeatherLocationSearchStatus(`Search failed: ${weatherErrorMessage(err)}`, true);
    })
    .finally(() => {
      if (requestId === weatherLocationSearchRequestId) weatherLocationSearchPromise = null;
    });
  renderWeatherLocationSearchStatus('Searching...', false);
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

function renderWeatherLocationResults(results) {
  const list = document.getElementById('setting-weather-location-results');
  if (!list) return;
  list.innerHTML = '';
  list.hidden = !results.length;
  if (!results.length) {
    renderWeatherLocationSearchStatus('No locations found.', true);
    return;
  }
  results.forEach((location, index) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'dashboard-location-result';
    button.dataset.weatherLocationIndex = String(index);
    button.setAttribute('role', 'option');
    button.appendChild(elText('strong', '', weatherLocationName(location)));
    button.appendChild(elText('span', '', [location.admin1, location.country].filter(Boolean).join(', ')));
    list.appendChild(button);
  });
  renderWeatherLocationSearchStatus(`${formatNumber(results.length)} locations found.`, false);
}

function renderWeatherLocationSearchStatus(text, issue = false) {
  const status = document.getElementById('setting-weather-location-status');
  if (!status) return;
  status.textContent = text;
  status.classList.toggle('is-issue', Boolean(issue));
}

function weatherLocationResultLabel(location) {
  return [weatherLocationName(location), location.admin1, location.country].filter(Boolean).join(', ');
}

function applySelectedWeatherLocation(indexValue) {
  const index = Number.parseInt(indexValue, 10);
  const location = weatherLocationSearchResults[index];
  const normalized = normalizeWeatherLocation(location);
  if (!normalized) return;
  const cfg = weatherSettings();
  cfg.location = normalized;
  cfg.searchText = weatherLocationResultLabel(normalized);
  cfg.lastResult = null;
  cfg.lastError = '';
  cfg.lastErrorAt = '';
  saveSettings(settings);
  renderWeatherLocationResults([]);
  syncWeatherSettingsControls();
  renderHomeCards();
  refreshWeatherIfNeeded('location-change', { force: true });
}

function clearWeatherLocationFromSettings() {
  const cfg = weatherSettings();
  if (!cfg.location && !cfg.searchText && !cfg.lastResult) return;
  if (!confirm('Clear the saved weather location and cached weather data?')) return;
  weatherForecastRequestId++;
  weatherLocationSearchRequestId++;
  weatherLocationSearchResults = [];
  cfg.location = null;
  cfg.searchText = '';
  cfg.lastResult = null;
  cfg.lastError = '';
  cfg.lastErrorAt = '';
  saveSettings(settings);
  renderWeatherLocationResults([]);
  syncWeatherSettingsControls();
  renderHomeCards();
  if (typeof showToast === 'function') showToast('Weather location cleared.');
}

function syncWeatherSettingsControls() {
  const cfg = weatherSettings();
  const search = document.getElementById('setting-weather-location-search');
  const current = document.getElementById('setting-weather-current-location');
  const refresh = document.getElementById('setting-weather-refresh-minutes');
  const airQuality = document.getElementById('setting-weather-air-quality-enabled');
  const alerts = document.getElementById('setting-weather-alerts-enabled');
  const preview = document.getElementById('setting-weather-preview-mode');
  const clear = document.getElementById('setting-weather-location-clear-btn');
  if (search) search.value = cfg.searchText || (cfg.location ? weatherLocationLabel(cfg.location) : '');
  if (current) current.textContent = cfg.location ? weatherLocationLabel(cfg.location) : 'No location selected';
  if (refresh) refresh.value = String(cfg.refreshMinutes);
  if (airQuality) airQuality.checked = cfg.airQualityEnabled !== false;
  if (alerts) alerts.checked = cfg.alertsEnabled !== false;
  if (preview) preview.value = weatherPreviewMode(cfg).startsWith('random:') ? 'random' : weatherPreviewMode(cfg);
  if (clear) clear.disabled = !cfg.location && !cfg.searchText && !cfg.lastResult;
  renderWeatherLocationSearchStatus(weatherRefreshPauseMessage(cfg) || (cfg.location ? `Using ${weatherLocationLabel(cfg.location)}.` : 'Search for a city or postal code.'), false);
}

function autosaveWeatherRefreshMinutes() {
  const input = document.getElementById('setting-weather-refresh-minutes');
  const cfg = weatherSettings();
  cfg.refreshMinutes = clampRefreshMinutes(input?.value, 10, 5, 60);
  if (input) input.value = String(cfg.refreshMinutes);
  saveSettings(settings);
}

function autosaveWeatherFeatureSettings() {
  const cfg = weatherSettings();
  const airQuality = document.getElementById('setting-weather-air-quality-enabled');
  const alerts = document.getElementById('setting-weather-alerts-enabled');
  cfg.airQualityEnabled = airQuality ? airQuality.checked : cfg.airQualityEnabled !== false;
  cfg.alertsEnabled = alerts ? alerts.checked : cfg.alertsEnabled !== false;
  if (cfg.lastResult) {
    if (!cfg.airQualityEnabled) cfg.lastResult.airQuality = null;
    if (!cfg.alertsEnabled) cfg.lastResult.alerts = [];
  }
  saveSettings(settings);
  syncWeatherSettingsControls();
  renderHomeCards();
  refreshWeatherIfNeeded('settings-change', { force: true });
}

function autosaveWeatherPreviewMode() {
  const input = document.getElementById('setting-weather-preview-mode');
  const cfg = weatherSettings();
  cfg.previewMode = normalizeWeatherPreviewSetting(input?.value);
  if (input) input.value = cfg.previewMode.startsWith('random:') ? 'random' : cfg.previewMode;
  saveSettings(settings);
  syncWeatherSettingsControls();
  renderHomeCards();
}

function randomizeWeatherPreviewMode() {
  const cfg = weatherSettings();
  cfg.previewMode = `random:${weatherRandomPreviewSeed()}`;
  saveSettings(settings);
  syncWeatherSettingsControls();
  renderHomeCards();
}

function previewWeatherAlertMode() {
  const cfg = weatherSettings();
  cfg.previewMode = 'wmo-thunder-hail';
  saveSettings(settings);
  syncWeatherSettingsControls();
  renderHomeCards();
}

function resetWeatherPreviewMode() {
  const cfg = weatherSettings();
  cfg.previewMode = 'live';
  saveSettings(settings);
  syncWeatherSettingsControls();
  renderHomeCards();
  refreshWeatherIfNeeded('preview-reset');
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
