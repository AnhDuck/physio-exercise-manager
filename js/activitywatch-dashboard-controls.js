// ActivityWatch dashboard top controls.

function renderActivityWatchDashboardControls(days) {
  const root = document.getElementById('activitywatch-dashboard-controls');
  if (!root) return;
  const status = getActivityWatchStatus();
  const progress = typeof getActivityWatchSyncProgress === 'function'
    ? getActivityWatchSyncProgress()
    : { active: status.code === 'syncing', totalDays: 0, completedDays: 0 };
  const isSyncing = Boolean(progress.active || status.code === 'syncing');
  const warnings = status.warnings || [];
  root.innerHTML = '';

  renderActivityWatchHeaderActions(days, status, progress, isSyncing);

  const heading = el('div', 'activitywatch-chart-heading');
  const copy = el('div', '');
  copy.appendChild(elText('h3', '', 'Computer activity by day'));
  copy.appendChild(elText('span', '', activityWatchDateRangeLabel(days)));
  heading.appendChild(copy);
  root.appendChild(heading);

  const toolbar = el('div', 'activitywatch-chart-toolbar');
  toolbar.appendChild(buildActivityWatchDateControls(isSyncing));
  toolbar.appendChild(buildActivityWatchViewControls());
  root.appendChild(toolbar);
  const overlayToggle = buildActivityWatchOverlayToggle();
  if (overlayToggle) {
    const overlayRow = el('div', 'activitywatch-chart-overlay-row');
    overlayRow.appendChild(overlayToggle);
    root.appendChild(overlayRow);
  }

  if (activityWatchDashboardState.advancedSyncOpen) {
    root.appendChild(buildActivityWatchAdvancedSyncPanel(days, isSyncing, status, progress));
  }
  if (isSyncing) {
    root.appendChild(buildActivityWatchSyncProgress(progress));
  }
  warnings.forEach(warning => root.appendChild(elText('div', 'activitywatch-warning', warning)));
}

function renderActivityWatchHeaderActions(days, status, progress, isSyncing) {
  const root = document.getElementById('activitywatch-header-actions');
  if (!root) return;
  root.innerHTML = '';
  root.appendChild(buildActivityWatchSyncRefreshButton(status, progress, isSyncing));
  root.appendChild(buildActivityWatchAdvancedButton(days));
  const close = el('button', 'modal-close');
  close.id = 'activitywatch-dashboard-close';
  close.type = 'button';
  close.title = 'Close';
  close.setAttribute('aria-label', 'Close ActivityWatch dashboard');
  close.dataset.uiIcon = 'x';
  close.addEventListener('click', closeActivityWatchDashboard);
  root.appendChild(close);
  hydrateIconButtons(root);
}

function buildActivityWatchSyncRefreshButton(status, progress, isSyncing) {
  const button = el('button', 'settings-backup-btn activitywatch-sync-refresh-btn');
  button.id = 'activitywatch-dashboard-refresh';
  button.type = 'button';
  button.dataset.settingsIcon = 'reconnect';
  button.disabled = isSyncing;
  button.title = `Refresh latest ${formatNumber(ACTIVITYWATCH_RECENT_SYNC_DAYS)} waking days`;
  button.addEventListener('click', () => {
    maybeSyncActivityWatchRecent('dashboard-manual', { force: true });
  });
  setSettingsButtonContent(button, activityWatchSyncRefreshLabel(status, progress, isSyncing), 'reconnect');
  return button;
}

function activityWatchSyncRefreshLabel(status, progress, isSyncing) {
  if (isSyncing || progress.active) return 'Syncing...';
  if (status.code === 'ok') return 'Synced';
  if (status.code === 'cors-blocked' || status.code === 'file-origin' || status.code === 'missing-window' || status.code === 'missing-afk') return 'Setup needed';
  if (activityWatchStatusIsIssue(status)) return 'Error';
  return 'Refresh';
}

function buildActivityWatchAdvancedButton(days) {
  const advanced = el('button', 'activitywatch-advanced-sync-toggle');
  advanced.type = 'button';
  advanced.title = 'Advanced ActivityWatch sync';
  advanced.setAttribute('aria-label', 'Advanced ActivityWatch sync');
  advanced.setAttribute('aria-expanded', activityWatchDashboardState.advancedSyncOpen ? 'true' : 'false');
  advanced.appendChild(buildAppIconSvg('wrench'));
  advanced.addEventListener('click', () => {
    activityWatchDashboardState.advancedSyncOpen = !activityWatchDashboardState.advancedSyncOpen;
    ensureActivityWatchAdvancedSyncDefaults(days);
    renderActivityWatchDashboard();
  });
  return advanced;
}

function buildActivityWatchControlStats(days) {
  const stats = el('div', 'activitywatch-control-stats');
  const activeDays = days.filter(day => day.totalActiveSeconds > 0);
  const total = activeDays.reduce((sum, day) => sum + day.totalActiveSeconds, 0);
  const average = activeDays.length ? total / activeDays.length : 0;
  stats.appendChild(buildActivityWatchSummaryCard('Total active', formatActivityWatchDuration(total), activityWatchDashboardRangeLabel(activityWatchDashboardState.rangeDays)));
  stats.appendChild(buildActivityWatchSummaryCard('Daily average', formatActivityWatchDuration(average), `${formatNumber(activeDays.length)} days with data`));
  return stats;
}

function buildActivityWatchControlStatus(status, progress) {
  const statusWrap = el('div', 'activitywatch-control-status');
  const copy = el('div', 'activitywatch-control-copy');
  copy.appendChild(elText('strong', '', activityWatchDashboardStatusTitle(status, progress)));
  copy.appendChild(elText('span', '', activityWatchDashboardStatusDetail(status, progress)));
  statusWrap.appendChild(copy);

  const pill = elText('span', 'settings-status-pill', activityWatchStatusPill(status));
  pill.classList.toggle('is-muted', ['idle', 'syncing'].includes(status.code));
  pill.classList.toggle('is-backup-issue', activityWatchStatusIsIssue(status));
  statusWrap.appendChild(pill);
  return statusWrap;
}

function buildActivityWatchControlActions(days, isSyncing) {
  const actions = el('div', 'activitywatch-control-actions');

  const refresh = el('button', 'settings-backup-btn activitywatch-refresh-btn');
  refresh.id = 'activitywatch-dashboard-refresh';
  refresh.type = 'button';
  refresh.dataset.settingsIcon = 'reconnect';
  refresh.disabled = isSyncing;
  refresh.title = `Refresh latest ${formatNumber(ACTIVITYWATCH_RECENT_SYNC_DAYS)} waking days`;
  refresh.addEventListener('click', () => {
    maybeSyncActivityWatchRecent('dashboard-manual', { force: true });
  });
  setSettingsButtonContent(refresh, isSyncing ? 'Syncing...' : 'Refresh', 'reconnect');
  actions.appendChild(refresh);

  const pager = el('div', 'activitywatch-range-pager');

  const previous = buildActivityWatchPagerButton('Previous range', 'chevron-left', () => shiftActivityWatchDashboardRange(-1));
  previous.disabled = isSyncing;
  pager.appendChild(previous);

  const next = buildActivityWatchPagerButton('Next range', 'chevron-right', () => shiftActivityWatchDashboardRange(1));
  next.disabled = isSyncing || activityWatchDashboardState.rangeEndDate >= activityWatchCurrentWakingDateStr();
  pager.appendChild(next);

  const today = buildActivityWatchTodayButton(() => showLatestActivityWatchDashboardRange());
  today.disabled = activityWatchDashboardState.rangeEndDate === activityWatchCurrentWakingDateStr();
  pager.appendChild(today);
  actions.appendChild(pager);

  const rangeLabel = el('label', 'activitywatch-range-control');
  rangeLabel.setAttribute('for', 'activitywatch-dashboard-range');
  rangeLabel.appendChild(elText('span', '', 'Range'));
  const select = el('select', '');
  select.id = 'activitywatch-dashboard-range';
  ACTIVITYWATCH_DASHBOARD_RANGE_OPTIONS.forEach(option => {
    const item = document.createElement('option');
    item.value = String(option.days);
    item.textContent = option.label;
    select.appendChild(item);
  });
  select.value = String(activityWatchDashboardState.rangeDays);
  select.addEventListener('change', () => {
    activityWatchDashboardState.rangeDays = normalizeActivityWatchDashboardRange(select.value);
    activityWatchDashboardState.showAllCategories = false;
    renderActivityWatchDashboard();
  });
  rangeLabel.appendChild(select);
  actions.appendChild(rangeLabel);

  const advanced = el('button', 'activitywatch-advanced-sync-toggle');
  advanced.type = 'button';
  advanced.title = 'Advanced ActivityWatch sync';
  advanced.setAttribute('aria-label', 'Advanced ActivityWatch sync');
  advanced.setAttribute('aria-expanded', activityWatchDashboardState.advancedSyncOpen ? 'true' : 'false');
  advanced.appendChild(buildAppIconSvg('wrench'));
  advanced.addEventListener('click', () => {
    activityWatchDashboardState.advancedSyncOpen = !activityWatchDashboardState.advancedSyncOpen;
    ensureActivityWatchAdvancedSyncDefaults(days);
    renderActivityWatchDashboard();
  });
  actions.appendChild(advanced);
  return actions;
}

function buildActivityWatchDateControls(isSyncing) {
  const controls = el('div', 'activitywatch-date-controls');

  const previous = buildActivityWatchPagerButton('Previous range', 'chevron-left', () => shiftActivityWatchDashboardRange(-1));
  previous.disabled = isSyncing;
  controls.appendChild(previous);

  const next = buildActivityWatchPagerButton('Next range', 'chevron-right', () => shiftActivityWatchDashboardRange(1));
  next.disabled = isSyncing || activityWatchDashboardState.rangeEndDate >= activityWatchCurrentWakingDateStr();
  controls.appendChild(next);

  const select = el('select', '');
  select.id = 'activitywatch-dashboard-range';
  select.setAttribute('aria-label', 'ActivityWatch date range');
  ACTIVITYWATCH_DASHBOARD_RANGE_OPTIONS.forEach(option => {
    const item = document.createElement('option');
    item.value = String(option.days);
    item.textContent = option.label;
    select.appendChild(item);
  });
  select.value = String(activityWatchDashboardState.rangeDays);
  select.disabled = isSyncing;
  select.addEventListener('change', () => {
    activityWatchDashboardState.rangeDays = normalizeActivityWatchDashboardRange(select.value);
    activityWatchDashboardState.showAllCategories = false;
    renderActivityWatchDashboard();
  });
  controls.appendChild(select);

  const today = buildActivityWatchTodayButton(() => showLatestActivityWatchDashboardRange());
  today.disabled = activityWatchDashboardState.rangeEndDate === activityWatchCurrentWakingDateStr();
  controls.appendChild(today);
  return controls;
}

function buildActivityWatchViewControls() {
  const controls = el('div', 'activitywatch-view-controls');
  const breakdown = el('div', 'activitywatch-breakdown-control');
  breakdown.appendChild(elText('span', '', 'Breakdown:'));
  breakdown.appendChild(buildActivityWatchCategoryModeToggle());
  controls.appendChild(breakdown);
  return controls;
}

function buildActivityWatchCategoryModeToggle() {
  const toggle = el('div', 'activitywatch-category-mode-toggle segmented-control');
  toggle.setAttribute('role', 'group');
  toggle.setAttribute('aria-label', 'ActivityWatch category grouping');
  [
    ['exact', 'Categories'],
    ['top', 'Groups'],
  ].forEach(([mode, label]) => {
    const button = el('button', '');
    button.type = 'button';
    button.textContent = label;
    button.classList.toggle('is-active', normalizeActivityWatchDashboardCategoryMode(activityWatchDashboardState.categoryMode) === mode);
    button.addEventListener('click', () => {
      if (normalizeActivityWatchDashboardCategoryMode(activityWatchDashboardState.categoryMode) === mode) return;
      activityWatchDashboardState.categoryMode = mode;
      activityWatchDashboardState.selectedCategory = '';
      activityWatchDashboardState.hoveredCategory = '';
      activityWatchDashboardState.workloadOverlayMode = '';
      activityWatchDashboardState.showAllCategories = false;
      renderActivityWatchDashboard();
    });
    toggle.appendChild(button);
  });
  return toggle;
}

function buildActivityWatchOverlayToggle() {
  if (activityWatchDashboardCanShowWorkloadOverlay()) {
    return buildActivityWatchOverlayButton('work', 'Show workload overlay', 'Show workload overlay');
  }
  if (activityWatchDashboardCanShowTendonLoadOverlay()) {
    return buildActivityWatchOverlayButton('tendon', 'Total tendon load', 'Total tendon load');
  }
  return null;
}

function buildActivityWatchOverlayButton(mode, label, title) {
  const wrap = el('label', 'activitywatch-overlay-toggle activitywatch-tendon-toggle');
  const active = activityWatchDashboardWorkloadOverlayMode() === mode;
  const input = el('input', '');
  input.type = 'checkbox';
  input.checked = active;
  input.title = title;
  input.addEventListener('change', () => {
    activityWatchDashboardState.workloadOverlayMode = input.checked ? mode : '';
    activityWatchDashboardState.hoveredCategory = '';
    renderActivityWatchDashboard();
  });
  wrap.appendChild(input);
  wrap.appendChild(el('span', 'activitywatch-overlay-checkmark'));
  wrap.appendChild(elText('span', '', label));
  wrap.title = title;
  wrap.classList.toggle('is-active', active);
  return wrap;
}

function buildActivityWatchPagerButton(title, iconName, onClick) {
  const button = el('button', 'activitywatch-pager-btn');
  button.type = 'button';
  button.title = title;
  button.setAttribute('aria-label', title);
  button.appendChild(buildAppIconSvg(iconName));
  button.addEventListener('click', onClick);
  return button;
}

function buildActivityWatchTodayButton(onClick) {
  const button = el('button', 'activitywatch-pager-btn activitywatch-today-btn');
  button.type = 'button';
  button.title = 'Today';
  button.textContent = 'Today';
  button.addEventListener('click', onClick);
  return button;
}

function buildActivityWatchSummaryCard(label, value, detail) {
  const card = el('div', 'activitywatch-summary-card');
  card.appendChild(elText('span', '', label));
  card.appendChild(elText('strong', '', value));
  card.appendChild(elText('small', '', detail));
  return card;
}

