// Weather card rendering.

function buildWeatherCard(options = {}) {
  const compact = Boolean(options.compact);
  const cfg = weatherSettings();
  const liveData = cfg.lastResult;
  const data = weatherPreviewResult(cfg, liveData) || liveData;
  const brain = data?.current ? buildWeatherBrain(data) : null;
  if (compact) return buildWeatherCompactCard(cfg, data, brain);

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

function buildWeatherCompactCard(cfg, data, brain) {
  const card = el('article', `home-card home-card-compact weather-compact-card ${weatherCardStateClass(cfg, brain)}`);
  card.setAttribute('aria-label', 'Weather summary');

  if (!cfg.location && !weatherPreviewEnabled(cfg)) {
    const empty = el('div', 'weather-compact-empty');
    empty.appendChild(elText('span', 'home-card-kicker', 'Weather'));
    const btn = elText('button', 'home-card-action', 'Set location');
    btn.type = 'button';
    btn.dataset.homeCardAction = 'open-weather-settings';
    empty.appendChild(btn);
    card.appendChild(empty);
    return card;
  }

  if (!data?.current) {
    card.appendChild(buildWeatherIcon('cloudy', true, 'weather-compact-icon'));
    const copy = el('div', 'weather-compact-copy');
    copy.appendChild(elText('span', 'home-card-kicker', 'Weather'));
    copy.appendChild(elText('strong', '', weatherRefreshPauseMessage(cfg) || cfg.lastError || 'Waiting for weather'));
    card.appendChild(copy);
    card.appendChild(buildWeatherRefreshButton());
    return card;
  }

  const condition = weatherDisplayCondition(data);
  card.appendChild(buildWeatherIcon(condition.icon, data.current.isDay, 'weather-compact-icon'));

  const copy = el('div', 'weather-compact-copy');
  copy.appendChild(elText('span', 'home-card-kicker', 'Weather'));
  const main = el('div', 'weather-compact-main');
  main.appendChild(elText('strong', 'weather-compact-temp', `${Math.round(data.current.temperature)}\u00B0`));
  main.appendChild(elText('span', 'weather-compact-condition', condition.label));
  copy.appendChild(main);
  card.appendChild(copy);

  card.appendChild(buildWeatherRefreshButton());
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
  const sourceTooltip = weatherSourceTooltip(data);
  if (sourceTooltip.length) {
    line.appendChild(buildWeatherSourceDisclosure(sourceTooltip));
  }
  if (Array.isArray(data?.alerts) && data.alerts.length) line.appendChild(elText('span', 'is-warning', 'Environment Canada alert'));
  return line;
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
  });
  return tooltip;
}

function buildWeatherSourceDisclosure(rows) {
  const disclosure = el('details', 'weather-source-disclosure');
  const summary = elText('summary', 'weather-source-chip', 'Sources');
  summary.setAttribute('aria-label', 'Show weather data sources');
  disclosure.appendChild(summary);
  disclosure.appendChild(buildWeatherSourceTooltip(rows));
  disclosure.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && disclosure.open) {
      disclosure.open = false;
      summary.focus();
    }
  });
  return disclosure;
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
