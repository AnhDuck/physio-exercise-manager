// Weather Settings controls.

const WEATHER_LOCATION_SEARCH_DEBOUNCE_MS = 450;

const WEATHER_LOCATION_SEARCH_MIN_GAP_MS = 500;



function scheduleWeatherLocationLiveSearch() {
  const input = document.getElementById('setting-weather-location-search');
  const query = input?.value.trim() || '';
  weatherLocationSearchRequestId++;
  if (weatherLocationSearchTimer) window.clearTimeout(weatherLocationSearchTimer);
  if (query.length < 3) {
    weatherLocationSearchResults = [];
    clearWeatherLocationResults();
    renderWeatherLocationSearchStatus(query ? 'Type at least 3 characters.' : 'Search for a city or postal code.', Boolean(query));
    return;
  }
  renderWeatherLocationSearchStatus('Searching after you pause...', false);
  weatherLocationSearchTimer = window.setTimeout(() => {
    weatherLocationSearchTimer = null;
    searchWeatherLocationsFromSettings({ live: true });
  }, WEATHER_LOCATION_SEARCH_DEBOUNCE_MS);
}

function searchWeatherLocationsFromSettings(options = {}) {
  const input = document.getElementById('setting-weather-location-search');
  const query = input?.value.trim() || '';
  if (weatherLocationSearchTimer) {
    window.clearTimeout(weatherLocationSearchTimer);
    weatherLocationSearchTimer = null;
  }
  if (query.length < 3) {
    weatherLocationSearchResults = [];
    clearWeatherLocationResults();
    renderWeatherLocationSearchStatus('Type at least 3 characters.', true);
    return;
  }
  const now = Date.now();
  if (now - weatherLocationSearchLastAt < WEATHER_LOCATION_SEARCH_MIN_GAP_MS) {
    if (options.live) {
      weatherLocationSearchTimer = window.setTimeout(() => {
        weatherLocationSearchTimer = null;
        searchWeatherLocationsFromSettings({ live: true });
      }, WEATHER_LOCATION_SEARCH_MIN_GAP_MS - (now - weatherLocationSearchLastAt));
      renderWeatherLocationSearchStatus('Searching after you pause...', false);
    } else {
      renderWeatherLocationSearchStatus('Wait a moment before searching again.', true);
    }
    return;
  }
  weatherLocationSearchLastAt = now;
  const requestId = ++weatherLocationSearchRequestId;
  const promise = searchWeatherLocations(query)
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
      if (weatherLocationSearchPromise === promise) weatherLocationSearchPromise = null;
    });
  weatherLocationSearchPromise = promise;
  renderWeatherLocationSearchStatus('Searching...', false);
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

function clearWeatherLocationResults() {
  const list = document.getElementById('setting-weather-location-results');
  if (!list) return;
  list.innerHTML = '';
  list.hidden = true;
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
  if (weatherLocationSearchTimer) {
    window.clearTimeout(weatherLocationSearchTimer);
    weatherLocationSearchTimer = null;
  }
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
