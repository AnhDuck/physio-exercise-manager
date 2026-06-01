// ActivityWatch dashboard top controls.

function renderActivityWatchDashboardControls(days) {
  const root = document.getElementById('activitywatch-dashboard-controls');
  const subtitle = document.getElementById('activitywatch-dashboard-subtitle');
  if (!root) return;
  const status = getActivityWatchStatus();
  const progress = typeof getActivityWatchSyncProgress === 'function'
    ? getActivityWatchSyncProgress()
    : { active: status.code === 'syncing', totalDays: 0, completedDays: 0 };
  const isSyncing = Boolean(progress.active || status.code === 'syncing');
  const warnings = status.warnings || [];
  root.innerHTML = '';

  const source = activityWatchData.host
    ? `${activityWatchData.host}${activityWatchData.activityWatchVersion ? ` - ${activityWatchData.activityWatchVersion}` : ''}`
    : getActivityWatchServerUrl();
  if (subtitle) subtitle.textContent = source;

  const row = el('div', 'activitywatch-control-row');
  row.appendChild(buildActivityWatchControlStats(days));
  row.appendChild(buildActivityWatchControlStatus(status, progress));
  row.appendChild(buildActivityWatchControlActions(days, isSyncing));
  root.appendChild(row);

  if (activityWatchDashboardState.advancedSyncOpen) {
    root.appendChild(buildActivityWatchAdvancedSyncPanel(days, isSyncing));
  }
  if (isSyncing) {
    root.appendChild(buildActivityWatchSyncProgress(progress));
  }
  warnings.forEach(warning => root.appendChild(elText('div', 'activitywatch-warning', warning)));

  const chartSubtitle = document.getElementById('activitywatch-chart-subtitle');
  const chartTitle = document.getElementById('activitywatch-chart-title');
  const chartActions = document.getElementById('activitywatch-chart-actions');
  if (chartTitle) {
    chartTitle.textContent = `${activityWatchDashboardRangeLabel(activityWatchDashboardState.rangeDays)} - ${activityWatchDateRangeLabel(days)}`;
  }
  if (chartSubtitle) {
    chartSubtitle.textContent = activityWatchDashboardState.selectedCategory
      ? `Filtered to ${activityWatchDashboardState.selectedCategory}`
      : activityWatchDashboardUsesTopCategories()
        ? 'Stacked top-level category totals by waking day'
        : 'Stacked category totals by waking day';
  }
  if (chartActions) {
    chartActions.innerHTML = '';
    chartActions.appendChild(buildActivityWatchCategoryModeToggle());
  }
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

function buildActivityWatchCategoryModeToggle() {
  const toggle = el('div', 'activitywatch-category-mode-toggle');
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
      activityWatchDashboardState.showAllCategories = false;
      renderActivityWatchDashboard();
    });
    toggle.appendChild(button);
  });
  return toggle;
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

