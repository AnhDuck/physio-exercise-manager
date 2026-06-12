// Main-screen dashboard cards for the always-on PEM view.

const HOME_CARDS_CLOCK_MS = 30 * 1000;
const HOME_CARDS_REFRESH_CHECK_MS = 60 * 1000;

function getHomeCardsSettings() {
  settings.homeCards = normalizeHomeCardsSettings(settings.homeCards);
  return settings.homeCards;
}

function buildHomeCardsRow() {
  const row = el('section', 'home-cards-row');
  row.setAttribute('aria-label', 'Dashboard cards');

  const cards = el('div', 'home-cards-grid');
  const cfg = getHomeCardsSettings();
  if (cfg.weather.enabled && typeof buildWeatherCard === 'function') {
    cards.appendChild(buildWeatherCard());
  }
  if (cfg.activityWatchMini.enabled && typeof buildActivityWatchMiniCard === 'function') {
    cards.appendChild(buildActivityWatchMiniCard());
  }

  row.appendChild(cards);
  return row;
}

function renderHomeCards() {
  const current = document.querySelector('.home-cards-row');
  if (!current || !current.parentNode) return;
  current.replaceWith(buildHomeCardsRow());
}

function startHomeCards() {
  stopHomeCards();
  maybeRefreshHomeCards('startup');
  homeCardsTimer = window.setInterval(() => maybeRefreshHomeCards('auto'), HOME_CARDS_REFRESH_CHECK_MS);
  homeCardsClockTimer = window.setInterval(renderHomeCards, HOME_CARDS_CLOCK_MS);
  document.addEventListener('click', handleHomeCardActionClick);
  document.addEventListener('visibilitychange', handleHomeCardsVisibilityChange);
  window.addEventListener('focus', handleHomeCardsFocus);
}

function stopHomeCards() {
  if (homeCardsTimer) window.clearInterval(homeCardsTimer);
  if (homeCardsClockTimer) window.clearInterval(homeCardsClockTimer);
  homeCardsTimer = null;
  homeCardsClockTimer = null;
  document.removeEventListener('click', handleHomeCardActionClick);
  document.removeEventListener('visibilitychange', handleHomeCardsVisibilityChange);
  window.removeEventListener('focus', handleHomeCardsFocus);
}

function handleHomeCardActionClick(e) {
  const button = e.target.closest('[data-home-card-action]');
  if (!button) return;
  if (button.dataset.homeCardAction === 'refresh-weather') {
    refreshWeatherIfNeeded('manual', { force: true });
  } else if (button.dataset.homeCardAction === 'randomize-weather-preview') {
    if (typeof randomizeWeatherPreviewMode === 'function') randomizeWeatherPreviewMode();
  } else if (button.dataset.homeCardAction === 'reset-weather-preview') {
    if (typeof resetWeatherPreviewMode === 'function') resetWeatherPreviewMode();
  } else if (button.dataset.homeCardAction === 'preview-weather-alert') {
    if (typeof previewWeatherAlertMode === 'function') previewWeatherAlertMode();
  } else if (button.dataset.homeCardAction === 'refresh-activitywatch-mini') {
    refreshActivityWatchMiniIfNeeded('manual', { force: true });
  } else if (button.dataset.homeCardAction === 'toggle-activitywatch-mini-mode') {
    if (typeof setActivityWatchMiniCategoryMode === 'function') {
      setActivityWatchMiniCategoryMode(button.dataset.activitywatchMiniMode);
    }
  } else if (button.dataset.homeCardAction === 'open-activitywatch-dashboard') {
    if (typeof openActivityWatchDashboard === 'function') openActivityWatchDashboard();
  } else if (button.dataset.homeCardAction === 'open-weather-settings') {
    openSettingsModal();
    setSettingsTab('general', true);
    window.setTimeout(() => document.getElementById('setting-weather-location-search')?.focus(), 0);
  }
}

function handleHomeCardsVisibilityChange() {
  if (document.visibilityState === 'visible') maybeRefreshHomeCards('visible');
}

function handleHomeCardsFocus() {
  maybeRefreshHomeCards('focus');
}

function maybeRefreshHomeCards(trigger = 'auto', options = {}) {
  if (typeof refreshWeatherIfNeeded === 'function') refreshWeatherIfNeeded(trigger, options);
  if (typeof refreshActivityWatchMiniIfNeeded === 'function') refreshActivityWatchMiniIfNeeded(trigger, options);
}

function forceRefreshHomeCards(trigger = 'manual') {
  maybeRefreshHomeCards(trigger, { force: true });
}

function homeCardRelativeTime(isoString) {
  const then = isoString ? new Date(isoString).getTime() : 0;
  if (!then) return 'Never';
  const seconds = Math.max(0, Math.round((Date.now() - then) / 1000));
  if (seconds < 45) return 'Just now';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hr ago`;
  const days = Math.round(hours / 24);
  return `${days} day${days === 1 ? '' : 's'} ago`;
}

function homeCardFormatTime(isoString, timeZone = '') {
  if (!isoString) return '--:--';
  const localMatch = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})/.exec(String(isoString));
  if (localMatch && !/[zZ]|[+-]\d{2}:\d{2}$/.test(String(isoString))) {
    const hour = Number(localMatch[2]);
    const minute = Number(localMatch[3]);
    const hour12 = hour % 12 || 12;
    const suffix = hour >= 12 ? 'PM' : 'AM';
    return `${hour12}:${String(minute).padStart(2, '0')} ${suffix}`;
  }
  try {
    return new Intl.DateTimeFormat([], {
      hour: 'numeric',
      minute: '2-digit',
      timeZone: timeZone || undefined,
    }).format(new Date(isoString));
  } catch (_) {
    return '--:--';
  }
}
