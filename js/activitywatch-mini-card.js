// Glanceable ActivityWatch card for the main screen.

const ACTIVITYWATCH_MINI_STALE_MS = 15 * 60 * 1000;

function activityWatchMiniSettings() {
  return getHomeCardsSettings().activityWatchMini;
}

function activityWatchMiniCategoryMode() {
  return normalizeActivityWatchMiniCategoryMode(activityWatchMiniSettings().categoryMode);
}

function buildActivityWatchMiniCard(options = {}) {
  const compact = Boolean(options.compact);
  const cfg = activityWatchMiniSettings();
  const card = el('article', `home-card activitywatch-mini-card ${activityWatchMiniStateClass()}`);
  card.setAttribute('aria-label', 'ActivityWatch today');

  const dateStr = typeof activityWatchCurrentWakingDateStr === 'function' ? activityWatchCurrentWakingDateStr() : todayStr();
  const day = typeof getActivityWatchDay === 'function' ? getActivityWatchDay(dateStr) : null;
  const total = day?.totalActiveSeconds || 0;
  if (compact) return buildActivityWatchMiniCompactCard(cfg, day, total);

  const header = el('div', 'activitywatch-mini-header');
  const title = el('div', 'activitywatch-mini-title');
  title.appendChild(elText('span', 'home-card-kicker', 'ActivityWatch'));
  title.appendChild(elText('strong', '', 'Today active'));
  header.appendChild(title);

  const actions = el('div', 'home-card-actions');
  actions.appendChild(buildActivityWatchMiniCategoryModeToggle());
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

function buildActivityWatchMiniCompactCard(cfg, day, total) {
  const card = el('article', `home-card home-card-compact activitywatch-compact-card ${activityWatchMiniStateClass()}`);
  card.setAttribute('aria-label', 'ActivityWatch today summary');

  const main = el('div', 'activitywatch-compact-main');
  const copy = el('div', 'activitywatch-compact-copy');
  copy.appendChild(elText('span', 'home-card-kicker', 'ActivityWatch Today'));
  copy.appendChild(elText('strong', '', formatActivityWatchDuration(total)));
  main.appendChild(copy);
  main.appendChild(buildActivityWatchMiniCompactStack(day));
  card.appendChild(main);

  const actions = el('div', 'home-card-actions');
  const openBtn = el('button', 'home-card-icon-btn');
  openBtn.type = 'button';
  openBtn.dataset.homeCardAction = 'open-activitywatch-dashboard';
  openBtn.title = 'Open ActivityWatch dashboard';
  openBtn.setAttribute('aria-label', 'Open ActivityWatch dashboard');
  openBtn.appendChild(buildAppIconSvg('chart'));
  actions.appendChild(openBtn);
  actions.appendChild(buildActivityWatchMiniRefreshButton());
  card.appendChild(actions);
  return card;
}

function buildActivityWatchMiniCategoryModeToggle() {
  const toggle = el('div', 'activitywatch-mini-mode-toggle');
  const currentMode = activityWatchMiniCategoryMode();
  toggle.setAttribute('aria-label', 'ActivityWatch card category display');
  [
    { mode: 'exact', label: 'Categories' },
    { mode: 'top', label: 'Groups' },
  ].forEach(({ mode, label }) => {
    const button = elText('button', '', label);
    button.type = 'button';
    button.dataset.homeCardAction = 'toggle-activitywatch-mini-mode';
    button.dataset.activitywatchMiniMode = mode;
    button.classList.toggle('is-active', currentMode === mode);
    button.setAttribute('aria-pressed', String(currentMode === mode));
    toggle.appendChild(button);
  });
  return toggle;
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
    segment.title = `${item.name}: ${formatActivityWatchDuration(item.seconds)} (${formatActivityWatchMiniPercent(item.percent)})`;
    stack.appendChild(segment);
  });
  return stack;
}

function buildActivityWatchMiniCompactStack(day) {
  const stack = el('div', 'activitywatch-mini-stack activitywatch-compact-stack');
  const categories = activityWatchMiniCategories(day);
  if (!day?.totalActiveSeconds || !categories.length) {
    stack.appendChild(el('span', 'activitywatch-mini-stack-empty'));
    return stack;
  }
  categories.forEach(item => {
    const segment = el('span', 'activitywatch-mini-stack-segment activitywatch-compact-segment');
    segment.style.width = `${Math.max(2, item.percent)}%`;
    segment.style.background = activityWatchCategoryColor(item.name);
    segment.title = `${item.name}: ${formatActivityWatchDuration(item.seconds)} (${formatActivityWatchMiniPercent(item.percent)})`;
    const label = activityWatchCompactSegmentLabel(item);
    if (label) segment.appendChild(elText('span', '', label));
    stack.appendChild(segment);
  });
  return stack;
}

function buildActivityWatchMiniCategoryList(day) {
  const list = el('div', 'activitywatch-mini-list');
  const categories = activityWatchMiniCategories(day);
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
    const meta = el('span', 'activitywatch-mini-category-meta');
    meta.appendChild(elText('strong', '', formatActivityWatchDuration(item.seconds)));
    meta.appendChild(elText('span', '', formatActivityWatchMiniPercent(item.percent)));
    row.appendChild(meta);
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
  const totals = {};
  Object.entries(day.categoryTotals || {}).forEach(([name, seconds]) => {
    const displayName = activityWatchMiniDisplayCategory(name);
    totals[displayName] = (totals[displayName] || 0) + Math.max(0, Number(seconds) || 0);
  });
  return Object.entries(totals)
    .map(([name, seconds]) => ({
      name,
      seconds,
      percent: total ? (seconds / total) * 100 : 0,
    }))
    .filter(item => item.seconds > 0)
    .sort((a, b) => b.seconds - a.seconds);
}

function activityWatchMiniDisplayCategory(category) {
  const label = String(category || '');
  if (activityWatchMiniCategoryMode() !== 'top') return label;
  return label.split(ACTIVITYWATCH_CATEGORY_JOINER)[0] || label;
}

function setActivityWatchMiniCategoryMode(mode) {
  const cfg = activityWatchMiniSettings();
  const nextMode = normalizeActivityWatchMiniCategoryMode(mode);
  if (normalizeActivityWatchMiniCategoryMode(cfg.categoryMode) === nextMode) return;
  cfg.categoryMode = nextMode;
  saveSettings(settings);
  renderHomeCards();
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

function formatActivityWatchMiniPercent(percent) {
  const value = Math.max(0, Number(percent) || 0);
  if (value > 0 && value < 1) return '<1%';
  return `${Math.round(value)}%`;
}

function activityWatchCompactSegmentLabel(item) {
  if (!item || item.percent < 10) return '';
  const duration = formatActivityWatchDuration(item.seconds);
  if (item.percent >= 18) return `${duration} ${formatActivityWatchMiniPercent(item.percent)}`;
  return duration;
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
