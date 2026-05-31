// Glanceable ActivityWatch card for the main screen.

const ACTIVITYWATCH_MINI_STALE_MS = 15 * 60 * 1000;

function activityWatchMiniSettings() {
  return getHomeCardsSettings().activityWatchMini;
}

function buildActivityWatchMiniCard() {
  const cfg = activityWatchMiniSettings();
  const card = el('article', `home-card activitywatch-mini-card ${activityWatchMiniStateClass()}`);
  card.setAttribute('aria-label', 'ActivityWatch today');

  const dateStr = typeof activityWatchCurrentWakingDateStr === 'function' ? activityWatchCurrentWakingDateStr() : todayStr();
  const day = typeof getActivityWatchDay === 'function' ? getActivityWatchDay(dateStr) : null;
  const total = day?.totalActiveSeconds || 0;

  const header = el('div', 'activitywatch-mini-header');
  const title = el('div', 'activitywatch-mini-title');
  title.appendChild(elText('span', 'home-card-kicker', 'ActivityWatch'));
  title.appendChild(elText('strong', '', 'Today active'));
  header.appendChild(title);

  const actions = el('div', 'home-card-actions');
  const openBtn = el('button', 'home-card-icon-btn');
  openBtn.type = 'button';
  openBtn.dataset.homeCardAction = 'open-activitywatch-dashboard';
  openBtn.title = 'Open ActivityWatch dashboard';
  openBtn.setAttribute('aria-label', 'Open ActivityWatch dashboard');
  openBtn.appendChild(buildAppIconSvg('chart'));
  actions.appendChild(openBtn);
  actions.appendChild(buildActivityWatchMiniRefreshButton());
  header.appendChild(actions);
  card.appendChild(header);

  const main = el('div', 'activitywatch-mini-main');
  main.appendChild(elText('div', 'activitywatch-mini-total', formatActivityWatchDuration(total)));
  main.appendChild(elText('div', 'activitywatch-mini-date', activityWatchMiniDateLabel(dateStr)));
  card.appendChild(main);

  card.appendChild(buildActivityWatchMiniStack(day));
  card.appendChild(buildActivityWatchMiniCategoryList(day));
  card.appendChild(buildActivityWatchMiniStatus(day, cfg));
  return card;
}

function buildActivityWatchMiniRefreshButton() {
  const progress = typeof getActivityWatchSyncProgress === 'function' ? getActivityWatchSyncProgress() : null;
  const btn = el('button', 'home-card-icon-btn');
  btn.type = 'button';
  btn.dataset.homeCardAction = 'refresh-activitywatch-mini';
  btn.title = progress?.active ? 'Syncing ActivityWatch' : 'Refresh ActivityWatch today';
  btn.setAttribute('aria-label', btn.title);
  btn.disabled = Boolean(progress?.active);
  btn.appendChild(buildAppIconSvg('reconnect'));
  return btn;
}

function buildActivityWatchMiniStack(day) {
  const stack = el('div', 'activitywatch-mini-stack');
  const categories = activityWatchMiniCategories(day);
  if (!day?.totalActiveSeconds || !categories.length) {
    stack.appendChild(el('span', 'activitywatch-mini-stack-empty'));
    return stack;
  }
  categories.forEach(item => {
    const segment = el('span', 'activitywatch-mini-stack-segment');
    segment.style.width = `${Math.max(2, item.percent)}%`;
    segment.style.background = activityWatchCategoryColor(item.name);
    segment.title = `${item.name}: ${formatActivityWatchDuration(item.seconds)}`;
    stack.appendChild(segment);
  });
  return stack;
}

function buildActivityWatchMiniCategoryList(day) {
  const list = el('div', 'activitywatch-mini-list');
  const categories = activityWatchMiniCategories(day).slice(0, 4);
  if (!day?.totalActiveSeconds || !categories.length) {
    const empty = el('div', 'activitywatch-mini-empty');
    empty.textContent = activityWatchMiniEmptyText();
    list.appendChild(empty);
    return list;
  }
  categories.forEach(item => {
    const row = el('div', 'activitywatch-mini-category');
    const label = el('span', 'activitywatch-mini-category-label');
    const swatch = el('span', 'activitywatch-mini-swatch');
    swatch.style.background = activityWatchCategoryColor(item.name);
    label.appendChild(swatch);
    label.appendChild(elText('span', '', item.name));
    row.appendChild(label);
    row.appendChild(elText('strong', '', formatActivityWatchDuration(item.seconds)));
    list.appendChild(row);
  });
  return list;
}

function buildActivityWatchMiniStatus(day) {
  const line = el('div', 'home-card-status-line');
  const progress = typeof getActivityWatchSyncProgress === 'function' ? getActivityWatchSyncProgress() : null;
  if (progress?.active) {
    line.appendChild(elText('span', '', 'Syncing now...'));
    return line;
  }
  const syncedAt = day?.syncedAt || activityWatchData?.lastSyncAt || '';
  const stale = activityWatchMiniIsStale(syncedAt);
  line.appendChild(elText('span', stale ? 'is-stale' : '', syncedAt ? `${stale ? 'Stale - synced' : 'Synced'} ${homeCardRelativeTime(syncedAt)}` : 'Not synced yet'));
  const status = typeof getActivityWatchStatus === 'function' ? getActivityWatchStatus() : null;
  if (status?.code && !['ok', 'idle', 'syncing'].includes(status.code)) {
    line.appendChild(elText('span', 'is-warning', activityWatchMiniStatusSummary(status)));
  }
  return line;
}

function refreshActivityWatchMiniIfNeeded(trigger = 'auto', options = {}) {
  if (typeof maybeSyncActivityWatchDateStrings !== 'function') return Promise.resolve(null);
  const cfg = activityWatchMiniSettings();
  if (!cfg.enabled) return Promise.resolve(null);
  const dateStr = activityWatchCurrentWakingDateStr();
  const day = getActivityWatchDay(dateStr);
  const last = day?.syncedAt ? new Date(day.syncedAt).getTime() : 0;
  const intervalMs = Math.max(1, Number(cfg.refreshMinutes) || 5) * 60 * 1000;
  if (!options.force && last && Date.now() - last < intervalMs) return Promise.resolve(activityWatchData);
  return maybeSyncActivityWatchDateStrings(`mini-${trigger}`, [dateStr], { force: Boolean(options.force) })
    .then(result => {
      renderHomeCards();
      return result;
    });
}

function activityWatchMiniCategories(day) {
  const total = Math.max(0, Number(day?.totalActiveSeconds) || 0);
  if (!total) return [];
  return Object.entries(day.categoryTotals || {})
    .map(([name, seconds]) => ({
      name,
      seconds: Math.max(0, Number(seconds) || 0),
      percent: total ? (Math.max(0, Number(seconds) || 0) / total) * 100 : 0,
    }))
    .filter(item => item.seconds > 0)
    .sort((a, b) => b.seconds - a.seconds);
}

function activityWatchMiniStateClass() {
  const progress = typeof getActivityWatchSyncProgress === 'function' ? getActivityWatchSyncProgress() : null;
  if (progress?.active) return 'is-refreshing';
  const dateStr = typeof activityWatchCurrentWakingDateStr === 'function' ? activityWatchCurrentWakingDateStr() : todayStr();
  const day = typeof getActivityWatchDay === 'function' ? getActivityWatchDay(dateStr) : null;
  if (activityWatchMiniIsStale(day?.syncedAt || activityWatchData?.lastSyncAt)) return 'is-stale';
  return '';
}

function activityWatchMiniIsStale(isoString) {
  const then = isoString ? new Date(isoString).getTime() : 0;
  return !then || Date.now() - then > ACTIVITYWATCH_MINI_STALE_MS;
}

function activityWatchMiniDateLabel(dateStr) {
  const date = dateFromStr(dateStr);
  return new Intl.DateTimeFormat([], { weekday: 'short', month: 'short', day: 'numeric' }).format(date);
}

function activityWatchMiniEmptyText() {
  if (window.location.protocol === 'file:') return 'Open PEM from localhost for ActivityWatch sync.';
  return 'No active time synced for the current waking day yet.';
}

function activityWatchMiniStatusSummary(status) {
  if (!status) return 'ActivityWatch needs attention.';
  if (status.code === 'cors-blocked') return 'ActivityWatch reachable, but PEM is not allowed yet.';
  if (status.code === 'offline') return 'ActivityWatch is offline or unreachable.';
  if (status.code === 'file-origin') return 'Open PEM from localhost for ActivityWatch sync.';
  if (status.code === 'missing-window') return 'ActivityWatch window watcher was not found.';
  if (status.code === 'missing-afk') return 'ActivityWatch AFK watcher was not found.';
  if (status.code === 'query-error') return 'ActivityWatch sync failed.';
  if (status.code === 'warning') return 'ActivityWatch synced with a warning.';
  return status.message || 'ActivityWatch needs attention.';
}

function autosaveActivityWatchMiniRefreshMinutes() {
  const input = document.getElementById('setting-aw-mini-refresh-minutes');
  const cfg = activityWatchMiniSettings();
  cfg.refreshMinutes = clampRefreshMinutes(input?.value, 5, 1, 30);
  if (input) input.value = String(cfg.refreshMinutes);
  saveSettings(settings);
}
