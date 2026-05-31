// Open-Meteo weather card and location settings.

const WEATHER_REFRESH_STALE_MS = 20 * 60 * 1000;
const WEATHER_REFRESH_ERROR_STALE_MS = 30 * 60 * 1000;
const WEATHER_FETCH_TIMEOUT_MS = 12000;
const WEATHER_REQUEST_MIN_GAP_MS = 60 * 1000;
const WEATHER_FORECAST_BURST_WINDOW_MS = 10 * 60 * 1000;
const WEATHER_FORECAST_BURST_LIMIT = 3;
const WEATHER_FORECAST_BURST_COOLDOWN_MS = 10 * 60 * 1000;
const WEATHER_RATE_LIMIT_COOLDOWN_MS = 65 * 60 * 1000;
const WEATHER_LOCATION_SEARCH_MIN_GAP_MS = 2 * 1000;
const WEATHER_FORECAST_URL = 'https://api.open-meteo.com/v1/forecast';
const WEATHER_GEOCODING_URL = 'https://geocoding-api.open-meteo.com/v1/search';

function weatherSettings() {
  return getHomeCardsSettings().weather;
}

function buildWeatherCard() {
  const cfg = weatherSettings();
  const data = cfg.lastResult;
  const card = el('article', `home-card weather-card ${weatherCardStateClass(cfg)}`);
  card.setAttribute('aria-label', 'Weather');

  if (!cfg.location) {
    card.appendChild(buildWeatherSetupState());
    return card;
  }

  if (!data?.current) {
    card.appendChild(buildWeatherLoadingState(cfg));
    return card;
  }

  const condition = weatherCondition(data.current.weatherCode, data.current.isDay);
  const header = el('div', 'weather-card-header');
  const title = el('div', 'weather-card-title');
  title.appendChild(elText('span', 'home-card-kicker', 'Weather'));
  title.appendChild(elText('strong', '', data.locationLabel || weatherLocationLabel(cfg.location)));
  header.appendChild(title);
  header.appendChild(buildWeatherRefreshButton());
  card.appendChild(header);

  const main = el('div', 'weather-current');
  const temp = el('div', 'weather-temp-block');
  temp.appendChild(elText('div', 'weather-temp', `${Math.round(data.current.temperature)}°`));
  temp.appendChild(elText('div', 'weather-condition', condition.label));
  temp.appendChild(elText('div', 'weather-feels', `Feels ${Math.round(data.current.apparentTemperature)}°C`));
  main.appendChild(temp);
  main.appendChild(buildWeatherIcon(condition.icon, data.current.isDay, 'weather-hero-icon'));
  card.appendChild(main);

  const facts = el('div', 'weather-facts');
  facts.appendChild(buildWeatherFact('Humidity', `${Math.round(data.current.humidity)}%`));
  facts.appendChild(buildWeatherFact('Sunrise', homeCardFormatTime(data.daily?.sunrise, data.timezone)));
  facts.appendChild(buildWeatherFact('Sunset', homeCardFormatTime(data.daily?.sunset, data.timezone)));
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

function buildWeatherFact(label, value) {
  const item = el('div', 'weather-fact');
  item.appendChild(elText('span', '', label));
  item.appendChild(elText('strong', '', value || '--'));
  return item;
}

function buildWeatherHourlyStrip(data) {
  const strip = el('div', 'weather-hourly-strip');
  (data.hourly || []).slice(0, 6).forEach(hour => {
    const condition = weatherCondition(hour.weatherCode, hour.isDay);
    const item = el('div', 'weather-hourly-item');
    item.appendChild(elText('span', '', homeCardFormatTime(hour.time, data.timezone).replace(/\s/g, '')));
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
  return line;
}

function weatherCardStateClass(cfg) {
  if (!cfg.location) return 'is-setup-needed';
  if (weatherRefreshPromise) return 'is-refreshing';
  if (cfg.lastResult?.fetchedAt && isWeatherStale(cfg.lastResult.fetchedAt)) return 'is-stale';
  if (cfg.lastError && !cfg.lastResult) return 'is-error';
  return '';
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

  const promise = fetchWeatherForLocation(cfg.location)
    .then(result => {
      if (requestId !== weatherForecastRequestId || weatherLocationKey(cfg.location) !== requestedLocationKey) return cfg.lastResult;
      cfg.lastResult = result;
      cfg.lastError = '';
      cfg.lastErrorAt = '';
      saveSettings(settings);
      renderHomeCards();
      return result;
    })
    .catch(err => {
      if (requestId !== weatherForecastRequestId || weatherLocationKey(cfg.location) !== requestedLocationKey) return cfg.lastResult;
      if (isWeatherRateLimitError(err)) {
        pauseWeatherRefresh(cfg, 'Open-Meteo hourly limit reached', now + WEATHER_RATE_LIMIT_COOLDOWN_MS);
      } else {
        cfg.lastError = weatherErrorMessage(err);
        cfg.lastErrorAt = new Date().toISOString();
        saveSettings(settings);
      }
      renderHomeCards();
      return cfg.lastResult;
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

async function fetchWeatherForLocation(location) {
  const params = new URLSearchParams({
    latitude: String(location.latitude),
    longitude: String(location.longitude),
    current_weather: 'true',
    hourly: 'temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,is_day',
    daily: 'sunrise,sunset',
    temperature_unit: 'celsius',
    timezone: 'auto',
    forecast_days: '2',
  });
  const raw = await weatherFetchJson(`${WEATHER_FORECAST_URL}?${params.toString()}`, 'Weather');
  const hourly = normalizeWeatherHourly(raw.hourly);
  const nearest = nearestWeatherHour(hourly, raw.current_weather?.time);
  return {
    fetchedAt: new Date().toISOString(),
    locationLabel: weatherLocationLabel(location),
    timezone: raw.timezone || location.timezone || '',
    current: {
      time: raw.current_weather?.time || nearest?.time || '',
      temperature: Number(raw.current_weather?.temperature) || nearest?.temperature || 0,
      apparentTemperature: nearest?.apparentTemperature || Number(raw.current_weather?.temperature) || 0,
      humidity: nearest?.humidity || 0,
      weatherCode: Number(raw.current_weather?.weathercode) || nearest?.weatherCode || 0,
      isDay: Number(raw.current_weather?.is_day) === 1 || Boolean(nearest?.isDay),
    },
    daily: {
      sunrise: raw.daily?.sunrise?.[0] || '',
      sunset: raw.daily?.sunset?.[0] || '',
    },
    hourly,
  };
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
    weatherCode: Number(hourly.weather_code?.[index]) || 0,
    isDay: Number(hourly.is_day?.[index]) === 1,
  })).filter(item => new Date(item.time).getTime() >= now - 60 * 60 * 1000).slice(0, 8);
}

function nearestWeatherHour(hourly, currentTime) {
  if (!Array.isArray(hourly) || !hourly.length) return null;
  const target = currentTime ? new Date(currentTime).getTime() : Date.now();
  return hourly
    .slice()
    .sort((a, b) => Math.abs(new Date(a.time).getTime() - target) - Math.abs(new Date(b.time).getTime() - target))[0] || null;
}

function weatherCondition(code, isDay = true) {
  if (code === 0) return { label: isDay ? 'Clear' : 'Clear night', icon: isDay ? 'sunny' : 'clear-night' };
  if ([1, 2].includes(code)) return { label: code === 1 ? 'Mostly clear' : 'Partly cloudy', icon: isDay ? 'partly-cloudy' : 'partly-cloudy-night' };
  if (code === 3) return { label: 'Cloudy', icon: 'cloudy' };
  if ([45, 48].includes(code)) return { label: 'Fog', icon: 'fog' };
  if ([51, 53, 55, 56, 57].includes(code)) return { label: 'Drizzle', icon: 'rain' };
  if ([61, 63, 65, 66, 67, 80, 81, 82].includes(code)) return { label: 'Rain', icon: 'rain' };
  if ([71, 73, 75, 77, 85, 86].includes(code)) return { label: 'Snow', icon: 'snow' };
  if ([95, 96, 99].includes(code)) return { label: 'Thunderstorm', icon: 'storm' };
  return { label: 'Weather', icon: isDay ? 'partly-cloudy' : 'partly-cloudy-night' };
}

function buildWeatherIcon(type, isDay = true, className = 'weather-icon') {
  const icon = el('span', `${className} weather-icon weather-icon-${type}`);
  icon.setAttribute('aria-hidden', 'true');
  icon.innerHTML = weatherIconSvg(type, isDay);
  return icon;
}

function weatherIconSvg(type) {
  const sun = '<circle class="wi-sun" cx="32" cy="28" r="13"></circle><g class="wi-rays"><path d="M32 7v7"></path><path d="M32 42v7"></path><path d="M11 28h7"></path><path d="M46 28h7"></path><path d="M17 13l5 5"></path><path d="M47 13l-5 5"></path></g>';
  const moon = '<path class="wi-moon" d="M43 39A18 18 0 0 1 25 13a17 17 0 1 0 18 26z"></path>';
  const cloud = '<path class="wi-cloud" d="M20 45h27a11 11 0 0 0 1-22 15 15 0 0 0-28-5 13 13 0 0 0 0 27z"></path>';
  const rain = '<path class="wi-drop" d="M24 51l-3 7"></path><path class="wi-drop" d="M36 51l-3 7"></path><path class="wi-drop" d="M48 51l-3 7"></path>';
  const snow = '<path class="wi-drop" d="M24 52l-4 4m0-4l4 4"></path><path class="wi-drop" d="M38 52l-4 4m0-4l4 4"></path><path class="wi-drop" d="M52 52l-4 4m0-4l4 4"></path>';
  const fog = '<path class="wi-fog" d="M13 48h38"></path><path class="wi-fog" d="M18 55h28"></path>';
  const storm = '<path class="wi-bolt" d="M35 44l-8 14 10-3-4 12 10-17-10 3z"></path>';
  let body = sun;
  if (type === 'clear-night') body = moon;
  if (type === 'partly-cloudy') body = `${sun}${cloud}`;
  if (type === 'partly-cloudy-night') body = `${moon}${cloud}`;
  if (type === 'cloudy') body = cloud;
  if (type === 'rain') body = `${cloud}${rain}`;
  if (type === 'snow') body = `${cloud}${snow}`;
  if (type === 'fog') body = `${cloud}${fog}`;
  if (type === 'storm') body = `${cloud}${storm}`;
  return `<svg viewBox="0 0 64 64" focusable="false">${body}</svg>`;
}

function isWeatherStale(isoString) {
  const then = isoString ? new Date(isoString).getTime() : 0;
  return !then || Date.now() - then > WEATHER_REFRESH_STALE_MS;
}

function weatherLocationLabel(location) {
  if (!location) return 'No location';
  const pieces = [location.name, location.admin1 || location.country].filter(Boolean);
  return pieces.join(', ');
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
  const select = document.getElementById('setting-weather-location-results');
  if (!select) return;
  select.innerHTML = '';
  if (!results.length) {
    select.appendChild(new Option('No matching locations', ''));
    renderWeatherLocationSearchStatus('No locations found.', true);
    return;
  }
  select.appendChild(new Option('Choose a location...', ''));
  results.forEach((location, index) => {
    select.appendChild(new Option(weatherLocationResultLabel(location), String(index)));
  });
  select.disabled = false;
  renderWeatherLocationSearchStatus(`${formatNumber(results.length)} locations found.`, false);
}

function renderWeatherLocationSearchStatus(text, issue = false) {
  const status = document.getElementById('setting-weather-location-status');
  if (!status) return;
  status.textContent = text;
  status.classList.toggle('is-issue', Boolean(issue));
}

function weatherLocationResultLabel(location) {
  return [location.name, location.admin1, location.country].filter(Boolean).join(', ');
}

function applySelectedWeatherLocation() {
  const select = document.getElementById('setting-weather-location-results');
  const index = Number.parseInt(select?.value, 10);
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
  const select = document.getElementById('setting-weather-location-results');
  if (select) {
    select.innerHTML = '';
    select.appendChild(new Option('Search for a location', ''));
  }
  syncWeatherSettingsControls();
  renderHomeCards();
  if (typeof showToast === 'function') showToast('Weather location cleared.');
}

function syncWeatherSettingsControls() {
  const cfg = weatherSettings();
  const search = document.getElementById('setting-weather-location-search');
  const current = document.getElementById('setting-weather-current-location');
  const refresh = document.getElementById('setting-weather-refresh-minutes');
  const clear = document.getElementById('setting-weather-location-clear-btn');
  if (search) search.value = cfg.searchText || (cfg.location ? weatherLocationLabel(cfg.location) : '');
  if (current) current.textContent = cfg.location ? weatherLocationLabel(cfg.location) : 'No location selected';
  if (refresh) refresh.value = String(cfg.refreshMinutes);
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
