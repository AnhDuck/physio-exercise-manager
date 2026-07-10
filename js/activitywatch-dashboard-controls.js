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
  renderActivityWatchDashboardTabs(days);

  const toolbar = el('div', 'activitywatch-chart-toolbar');
  const rangeTools = el('div', 'activitywatch-range-tools');
  rangeTools.appendChild(buildActivityWatchDateControls(isSyncing));
  const coverageNotice = buildActivityWatchCoverageNotice(days);
  if (coverageNotice) rangeTools.appendChild(coverageNotice);
  toolbar.appendChild(rangeTools);
  toolbar.appendChild(buildActivityWatchViewControls());
  root.appendChild(toolbar);

  if (activityWatchDashboardState.advancedSyncOpen) {
    root.appendChild(buildActivityWatchAdvancedSyncPanel(days, isSyncing, status, progress));
  }
  warnings.forEach(warning => root.appendChild(elText('div', 'activitywatch-warning', warning)));
}

function renderActivityWatchDashboardTabs(days) {
  const root = document.getElementById('activitywatch-dashboard-view-tabs');
  if (!root) return;
  root.innerHTML = '';
  const tabList = el('div', 'activitywatch-dashboard-view-tab-list');
  tabList.setAttribute('role', 'tablist');
  tabList.setAttribute('aria-label', 'ActivityWatch dashboard views');
  [
    ['exposure', 'Exposure', 'exposure'],
    ['workload', 'Load', 'load'],
    ['work', 'Work', 'workload'],
    ['breakdown', 'Breakdown', 'breakdown'],
  ].forEach(([mode, label, icon]) => {
    const button = el('button', '');
    button.type = 'button';
    button.id = `activitywatch-dashboard-view-${mode}`;
    button.setAttribute('role', 'tab');
    button.setAttribute('aria-selected', activityWatchDashboardState.viewMode === mode ? 'true' : 'false');
    button.appendChild(buildAppIconSvg(icon, 'activitywatch-view-tab-icon'));
    button.appendChild(elText('span', '', label));
    button.classList.toggle('is-active', activityWatchDashboardState.viewMode === mode);
    button.addEventListener('click', () => setActivityWatchDashboardViewMode(mode));
    tabList.appendChild(button);
  });
  root.appendChild(tabList);

  const heading = el('div', 'activitywatch-chart-heading');
  heading.appendChild(elText('h3', '', activityWatchDashboardChartTitle()));
  heading.appendChild(elText('span', 'activitywatch-chart-date-range', activityWatchDateRangeLabel(days)));
  root.appendChild(heading);
}

function activityWatchDashboardChartTitle() {
  const grain = activityWatchDashboardState.chartGrain === 'weekly' ? 'weekly' : 'daily';
  if (activityWatchDashboardState.viewMode === 'workload') {
    return `Total tendon load by ${grain === 'weekly' ? 'week' : 'day'}`;
  }
  if (activityWatchDashboardState.viewMode === 'work') {
    return `Work by ${grain === 'weekly' ? 'week' : 'day'}`;
  }
  if (activityWatchDashboardState.viewMode === 'breakdown') {
    return `Computer activity breakdown by ${grain === 'weekly' ? 'week' : 'day'}`;
  }
  return `Computer exposure by ${grain === 'weekly' ? 'week' : 'day'}`;
}

function renderActivityWatchHeaderActions(days, status, progress, isSyncing) {
  const root = document.getElementById('activitywatch-header-actions');
  if (!root) return;
  root.innerHTML = '';
  if (isSyncing) {
    root.appendChild(buildActivityWatchSyncProgress(progress));
  }
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
  advanced.title = 'Resync and connection details';
  advanced.setAttribute('aria-label', 'Resync and connection details');
  advanced.setAttribute('aria-expanded', activityWatchDashboardState.advancedSyncOpen ? 'true' : 'false');
  advanced.appendChild(buildAppIconSvg('wrench'));
  advanced.addEventListener('click', () => {
    activityWatchDashboardState.advancedSyncOpen = !activityWatchDashboardState.advancedSyncOpen;
    ensureActivityWatchAdvancedSyncDefaults(days);
    renderActivityWatchDashboard();
  });
  return advanced;
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
    persistActivityWatchDashboardRange();
    activityWatchDashboardState.selectedCalloutDate = '';
    activityWatchDashboardState.showAllCategories = false;
    renderActivityWatchDashboard();
  });
  controls.appendChild(select);

  const today = buildActivityWatchTodayButton(() => showLatestActivityWatchDashboardRange());
  today.disabled = activityWatchDashboardState.rangeEndDate === activityWatchCurrentWakingDateStr();
  controls.appendChild(today);
  return controls;
}

function buildActivityWatchMethodologyLegend(days) {
  const changes = getActivityWatchMethodologyChangesForDates((days || []).map(day => day.date));
  if (!changes.length) return null;
  const notice = el('span', 'activitywatch-methodology-legend');
  notice.tabIndex = 0;
  notice.setAttribute('role', 'note');
  const tooltip = changes.map(activityWatchMethodologyTooltip).join(' ');
  notice.setAttribute('aria-label', tooltip);
  notice.appendChild(el('span', 'activitywatch-methodology-legend-marker'));
  notice.appendChild(elText('span', '', 'Methodology change'));
  notice.addEventListener('pointerenter', (event) => {
    showActivityWatchChartTooltipText(event, tooltip, true);
  });
  notice.addEventListener('pointermove', (event) => {
    positionActivityWatchChartTooltip(event);
  });
  notice.addEventListener('pointerleave', hideActivityWatchChartTooltip);
  notice.addEventListener('pointercancel', hideActivityWatchChartTooltip);
  notice.addEventListener('focus', () => {
    const rect = notice.getBoundingClientRect();
    showActivityWatchChartTooltipText({
      clientX: rect.left + (rect.width / 2),
      clientY: rect.bottom + 8,
    }, tooltip, true);
  });
  notice.addEventListener('blur', hideActivityWatchChartTooltip);
  return notice;
}

function buildActivityWatchCoverageNotice(days) {
  if (!activityWatchDashboardHasCoverageGap(days)) return null;
  const notice = el('div', 'activitywatch-methodology-notice activitywatch-coverage-notice');
  notice.tabIndex = 0;
  notice.setAttribute('role', 'note');
  const text = `ActivityWatch coverage starts ${formatEventDate(ACTIVITYWATCH_DASHBOARD_DATA_START_DATE)}. Earlier dates are treated as no data and are excluded from averages.`;
  notice.setAttribute('aria-label', text);
  notice.textContent = 'Coverage starts Apr 17';
  notice.addEventListener('pointerenter', (event) => {
    showActivityWatchChartTooltipText(event, text, true);
  });
  notice.addEventListener('pointermove', (event) => {
    positionActivityWatchChartTooltip(event);
  });
  notice.addEventListener('pointerleave', hideActivityWatchChartTooltip);
  notice.addEventListener('pointercancel', hideActivityWatchChartTooltip);
  notice.addEventListener('focus', () => {
    const rect = notice.getBoundingClientRect();
    showActivityWatchChartTooltipText({
      clientX: rect.left + (rect.width / 2),
      clientY: rect.bottom + 8,
    }, text, true);
  });
  notice.addEventListener('blur', hideActivityWatchChartTooltip);
  return notice;
}

function buildActivityWatchViewControls() {
  const controls = el('div', 'activitywatch-view-controls');
  const grain = el('div', 'activitywatch-breakdown-control');
  grain.appendChild(elText('span', 'activitywatch-control-label', 'Grain:'));
  grain.appendChild(buildActivityWatchChartGrainToggle());
  controls.appendChild(grain);

  if (activityWatchDashboardState.viewMode === 'breakdown') {
    const breakdown = el('div', 'activitywatch-breakdown-control');
    breakdown.appendChild(elText('span', 'activitywatch-control-label', 'Stack by:'));
    breakdown.appendChild(buildActivityWatchCategoryModeToggle());
    controls.appendChild(breakdown);
  }

  return controls;
}

function buildActivityWatchChartGrainToggle() {
  return buildActivityWatchSegmentedToggle(
    'ActivityWatch chart grain',
    [
      ['daily', 'Daily'],
      ['weekly', 'Weekly'],
    ],
    activityWatchDashboardState.chartGrain,
    (mode) => {
      activityWatchDashboardState.chartGrain = normalizeActivityWatchDashboardChartGrain(mode);
      activityWatchDashboardState.selectedCalloutDate = '';
      activityWatchDashboardState.hoveredCategory = '';
      activityWatchDashboardState.showAllCategories = false;
      activityWatchDashboardState.chartScrollToEnd = true;
      renderActivityWatchDashboard();
    }
  );
}

function buildActivityWatchSegmentedToggle(label, options, value, onChange) {
  const toggle = el('div', 'activitywatch-category-mode-toggle segmented-control');
  toggle.setAttribute('role', 'group');
  toggle.setAttribute('aria-label', label);
  options.forEach(([mode, text]) => {
    const button = el('button', '');
    button.type = 'button';
    button.textContent = text;
    button.classList.toggle('is-active', value === mode);
    button.addEventListener('click', () => {
      if (value === mode) return;
      onChange(mode);
    });
    toggle.appendChild(button);
  });
  return toggle;
}

function buildActivityWatchCategoryModeToggle() {
  return buildActivityWatchSegmentedToggle(
    'ActivityWatch category grouping',
    [
      ['exact', 'Categories'],
      ['top', 'Groups'],
    ],
    normalizeActivityWatchDashboardCategoryMode(activityWatchDashboardState.categoryMode),
    (mode) => {
      activityWatchDashboardState.categoryMode = mode;
      activityWatchDashboardState.selectedCategory = '';
      activityWatchDashboardState.hoveredCategory = '';
      activityWatchDashboardState.workloadOverlayMode = '';
      activityWatchDashboardState.showAllCategories = false;
      renderActivityWatchDashboard();
    }
  );
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

function buildActivityWatchRollingAverageLegend() {
  const legend = el('span', 'activitywatch-average-legend');
  legend.setAttribute('aria-label', 'Yellow line shows the trailing 7-day average');
  legend.appendChild(el('span', 'activitywatch-average-legend-line'));
  legend.appendChild(elText('span', '', '7-day average'));
  return legend;
}

