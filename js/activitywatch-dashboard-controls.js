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
  renderActivityWatchDashboardTabs();

  const heading = el('div', 'activitywatch-chart-heading');
  const copy = el('div', '');
  copy.appendChild(elText('h3', '', activityWatchDashboardChartTitle()));
  copy.appendChild(elText('span', '', activityWatchDateRangeLabel(days)));
  heading.appendChild(copy);
  root.appendChild(heading);

  const toolbar = el('div', 'activitywatch-chart-toolbar');
  const rangeTools = el('div', 'activitywatch-range-tools');
  rangeTools.appendChild(buildActivityWatchDateControls(isSyncing));
  const methodologyNotice = buildActivityWatchMethodologyNotice(days);
  if (methodologyNotice) rangeTools.appendChild(methodologyNotice);
  const coverageNotice = buildActivityWatchCoverageNotice(days);
  if (coverageNotice) rangeTools.appendChild(coverageNotice);
  toolbar.appendChild(rangeTools);
  toolbar.appendChild(buildActivityWatchViewControls());
  root.appendChild(toolbar);

  if (activityWatchDashboardState.advancedSyncOpen) {
    root.appendChild(buildActivityWatchAdvancedSyncPanel(days, isSyncing, status, progress));
  }
  if (isSyncing) {
    root.appendChild(buildActivityWatchSyncProgress(progress));
  }
  warnings.forEach(warning => root.appendChild(elText('div', 'activitywatch-warning', warning)));
}

function renderActivityWatchDashboardTabs() {
  const root = document.getElementById('activitywatch-dashboard-view-tabs');
  if (!root) return;
  root.innerHTML = '';
  root.setAttribute('role', 'tablist');
  root.setAttribute('aria-label', 'ActivityWatch dashboard views');
  [
    ['exposure', 'Exposure'],
    ['workload', 'Workload'],
    ['breakdown', 'Breakdown'],
  ].forEach(([mode, label]) => {
    const button = el('button', '');
    button.type = 'button';
    button.id = `activitywatch-dashboard-view-${mode}`;
    button.setAttribute('role', 'tab');
    button.setAttribute('aria-selected', activityWatchDashboardState.viewMode === mode ? 'true' : 'false');
    button.textContent = label;
    button.classList.toggle('is-active', activityWatchDashboardState.viewMode === mode);
    button.addEventListener('click', () => setActivityWatchDashboardViewMode(mode));
    root.appendChild(button);
  });
}

function activityWatchDashboardChartTitle() {
  const grain = activityWatchDashboardState.chartGrain === 'weekly' ? 'weekly' : 'daily';
  if (activityWatchDashboardState.viewMode === 'workload') {
    return activityWatchDashboardState.workloadBasis === 'work'
      ? `Work-only load by ${grain === 'weekly' ? 'week' : 'day'}`
      : `Total load by ${grain === 'weekly' ? 'week' : 'day'}`;
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

function buildActivityWatchMethodologyNotice(days) {
  const changes = getActivityWatchMethodologyChangesForDates((days || []).map(day => day.date));
  if (!changes.length) return null;
  const notice = el('div', 'activitywatch-methodology-notice');
  notice.tabIndex = 0;
  notice.setAttribute('role', 'note');
  const label = changes.length === 1
    ? 'Methodology change - Break in series'
    : `Methodology change - ${formatNumber(changes.length)} breaks in series`;
  const tooltip = changes.map(activityWatchMethodologyTooltip).join(' ');
  notice.setAttribute('aria-label', tooltip);
  notice.textContent = label;
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

  if (activityWatchDashboardState.viewMode === 'workload') {
    const basis = el('div', 'activitywatch-breakdown-control');
    basis.appendChild(elText('span', 'activitywatch-control-label', 'Load:'));
    basis.appendChild(buildActivityWatchWorkloadBasisToggle());
    controls.appendChild(basis);
  }

  if (activityWatchDashboardState.viewMode === 'breakdown') {
    const breakdown = el('div', 'activitywatch-breakdown-control');
    breakdown.appendChild(elText('span', 'activitywatch-control-label', 'Stack by:'));
    breakdown.appendChild(buildActivityWatchCategoryModeToggle());
    controls.appendChild(breakdown);
  }

  if (['exposure', 'workload'].includes(activityWatchDashboardState.viewMode) && activityWatchDashboardState.chartGrain === 'daily') {
    const average = el('div', 'activitywatch-overlay-control');
    average.appendChild(elText('span', 'activitywatch-control-label', 'Trend:'));
    average.appendChild(buildActivityWatchRollingAverageToggle());
    controls.appendChild(average);
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
      activityWatchDashboardState.hoveredCategory = '';
      activityWatchDashboardState.showAllCategories = false;
      activityWatchDashboardState.chartScrollToEnd = true;
      renderActivityWatchDashboard();
    }
  );
}

function buildActivityWatchWorkloadBasisToggle() {
  return buildActivityWatchSegmentedToggle(
    'ActivityWatch workload basis',
    [
      ['total', 'Total load'],
      ['work', 'Work only'],
    ],
    activityWatchDashboardState.workloadBasis,
    (mode) => {
      activityWatchDashboardState.workloadBasis = normalizeActivityWatchDashboardWorkloadBasis(mode);
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

function buildActivityWatchRollingAverageToggle() {
  const label = '7-day average';
  const title = 'Show trailing 7-day average. Each point uses that day plus the previous 6 waking days.';
  const wrap = el('label', 'activitywatch-overlay-toggle');
  const input = el('input', '');
  input.type = 'checkbox';
  input.setAttribute('role', 'switch');
  input.setAttribute('aria-label', label);
  input.checked = Boolean(activityWatchDashboardState.showRollingAverage);
  input.title = title;
  input.addEventListener('change', () => {
    activityWatchDashboardState.showRollingAverage = input.checked;
    activityWatchDashboardState.hoveredCategory = '';
    renderActivityWatchDashboard();
  });
  wrap.appendChild(input);
  wrap.appendChild(el('span', 'activitywatch-overlay-switch'));
  wrap.appendChild(elText('span', '', label));
  wrap.title = title;
  wrap.classList.toggle('is-active', Boolean(activityWatchDashboardState.showRollingAverage));
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

