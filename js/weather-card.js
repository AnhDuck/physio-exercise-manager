// Open-Meteo weather card and location settings.

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

function weatherSettings() {
  return getHomeCardsSettings().weather;
}

function buildWeatherCard() {
  const cfg = weatherSettings();
  const data = cfg.lastResult;
  const brain = data?.current ? buildWeatherBrain(data) : null;
  const card = el('article', `home-card weather-card ${weatherCardStateClass(cfg, brain)}`);
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
  if (brain?.advisory) card.appendChild(buildWeatherAdvisory(brain));

  const facts = el('div', 'weather-facts');
  facts.appendChild(buildWeatherFact('Humidity', `${Math.round(data.current.humidity)}%`, 'humidity', weatherFactClass(brain, 'humidity')));
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

  const promise = fetchWeatherForLocation(cfg.location)
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

async function fetchWeatherForLocation(location) {
  const params = new URLSearchParams({
    latitude: String(location.latitude),
    longitude: String(location.longitude),
    current_weather: 'true',
    hourly: 'temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,is_day,uv_index,wind_speed_10m,wind_direction_10m,wind_gusts_10m,precipitation_probability',
    daily: 'sunrise,sunset',
    temperature_unit: 'celsius',
    wind_speed_unit: 'kmh',
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
      windSpeed: Number(raw.current_weather?.windspeed) || nearest?.windSpeed || 0,
      windDirection: Number(raw.current_weather?.winddirection) || nearest?.windDirection || 0,
      windGusts: nearest?.windGusts || 0,
      uvIndex: nearest?.uvIndex || 0,
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
    windSpeed: Number(hourly.wind_speed_10m?.[index]) || 0,
    windDirection: Number(hourly.wind_direction_10m?.[index]) || 0,
    windGusts: Number(hourly.wind_gusts_10m?.[index]) || 0,
    precipitationProbability: Number(hourly.precipitation_probability?.[index]) || 0,
    uvIndex: Number(hourly.uv_index?.[index]) || 0,
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

function buildWeatherBrain(data) {
  const current = data?.current || {};
  const hourly = Array.isArray(data?.hourly) ? data.hourly : [];
  const nowMs = weatherTimestamp(current.time) || Date.now();
  const temp = Number(current.temperature) || 0;
  const feels = Number(current.apparentTemperature) || temp;
  const wind = Number(current.windSpeed) || 0;
  const gust = Number(current.windGusts) || 0;
  const uvNow = Number(current.uvIndex) || 0;
  const uvPeak = Math.max(uvNow, ...hourly.slice(0, 8).map(hour => Number(hour.uvIndex) || 0));
  const sunsetMinutes = weatherMinutesUntil(data?.daily?.sunset, nowMs);
  const rainSoon = weatherNextPrecipitation(hourly, nowMs);
  const alert = weatherPrimaryAlert(data);
  const candidates = [];

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

  if (uvPeak >= 6) {
    candidates.push({
      key: 'uv',
      highlight: 'uv',
      tileLabel: uvPeak >= 8 ? 'UV very high' : 'UV high',
      label: 'UV',
      score: uvPeak >= 8 ? 96 : 84,
      advisory: uvPeak >= 8
        ? `UV peaks very high today. Avoid the middle of the day.`
        : `UV gets high today. Shade is your friend midday.`,
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
  const secondary = ranked.find(item => item.key !== primary.key && ['sun', 'uv', 'wind'].includes(item.highlight) && item.score >= 84);
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
      if (weatherIsSnowCode(code)) return { kind: 'snow', minutes: item.minutes };
      if (weatherIsRainCode(code) || probability >= 45) return { kind: 'rain', minutes: item.minutes };
      return null;
    })
    .find(Boolean) || null;
}

function weatherPrimaryAlert(data) {
  const alerts = Array.isArray(data?.alerts) ? data.alerts : [];
  const first = alerts.find(alert => alert && typeof alert === 'object');
  if (!first) return '';
  const title = typeof first.title === 'string' ? first.title.trim() : '';
  const summary = typeof first.summary === 'string' ? first.summary.trim() : '';
  return title || summary || '';
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
  };
  return `<svg viewBox="0 0 24 24" focusable="false">${icons[iconName] || icons.sun}</svg>`;
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
  const sun = '<circle class="wi-sun" cx="32" cy="32" r="10"></circle><g class="wi-rays"><path d="M32 8v8"></path><path d="M32 48v8"></path><path d="M8 32h8"></path><path d="M48 32h8"></path><path d="M15 15l6 6"></path><path d="M49 15l-6 6"></path><path d="M15 49l6-6"></path><path d="M49 49l-6-6"></path></g>';
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
