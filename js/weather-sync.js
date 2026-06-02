// Weather refresh orchestration and rate limits.
const WEATHER_REFRESH_STALE_MS = 20 * 60 * 1000;
const WEATHER_REFRESH_ERROR_STALE_MS = 30 * 60 * 1000;
const WEATHER_REQUEST_MIN_GAP_MS = 10 * 1000;
const WEATHER_FORECAST_BURST_WINDOW_MS = 10 * 60 * 1000;
const WEATHER_FORECAST_BURST_LIMIT = 60;
const WEATHER_FORECAST_BURST_COOLDOWN_MS = 5 * 60 * 1000;
const WEATHER_RATE_LIMIT_COOLDOWN_MS = 65 * 60 * 1000;

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
function isWeatherStale(isoString) {
  const then = isoString ? new Date(isoString).getTime() : 0;
  return !then || Date.now() - then > WEATHER_REFRESH_STALE_MS;
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
