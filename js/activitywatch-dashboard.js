// ActivityWatch dashboard panel and category visualizations.

const ACTIVITYWATCH_DASHBOARD_RANGE_OPTIONS = [
  { days: 7, label: 'Last 7 days' },
  { days: 14, label: 'Last 2 weeks' },
  { days: 30, label: 'Last 30 days' },
  { days: 90, label: 'Last 90 days' },
];
const ACTIVITYWATCH_DASHBOARD_DEFAULT_RANGE_DAYS = 14;
const ACTIVITYWATCH_SELECTED_CATEGORY_LIMIT = 8;
const ACTIVITYWATCH_DASHBOARD_OTHER_CATEGORY = 'Other';
const ACTIVITYWATCH_DASHBOARD_CATEGORY_COLORS = {
  YouTube: '#d96b6b',
  Health: '#66bfa3',
  Games: '#f59e0b',
  Codex: '#6baee8',
  ChatGPT: '#77c6bd',
  IM: '#e0b95f',
  Business: '#7f98d8',
  Katana: '#e09268',
  Uncategorized: '#a4acb8',
  Other: '#707884',
};

const activityWatchDashboardState = {
  selectedDate: '',
  rangeDays: ACTIVITYWATCH_DASHBOARD_DEFAULT_RANGE_DAYS,
  rangeEndDate: '',
  selectedCategory: '',
  hoveredCategory: '',
  detailMode: 'day',
  showAllCategories: false,
  advancedSyncOpen: false,
  advancedSyncMode: '',
  advancedSyncCustomStart: '',
  advancedSyncCustomEnd: '',
};

function openActivityWatchDashboard() {
  ensureActivityWatchDashboardShell();
  const modal = document.getElementById('activitywatch-dashboard-modal');
  if (!modal) return;
  const current = activityWatchCurrentWakingDateStr();
  if (!activityWatchDashboardState.rangeEndDate) {
    activityWatchDashboardState.rangeEndDate = current;
  }
  modal.classList.remove('hidden');
  renderActivityWatchDashboard();
  maybeSyncActivityWatchRecent('dashboard-open');
}

function closeActivityWatchDashboard() {
  document.getElementById('activitywatch-dashboard-modal')?.classList.add('hidden');
}

function ensureActivityWatchDashboardShell() {
  if (document.getElementById('activitywatch-dashboard-modal')) return;
  const overlay = el('div', 'modal-overlay hidden');
  overlay.id = 'activitywatch-dashboard-modal';
  overlay.innerHTML = `
    <div class="modal activitywatch-dashboard-modal" role="dialog" aria-modal="true" aria-labelledby="activitywatch-dashboard-title">
      <div class="modal-titlebar activitywatch-dashboard-titlebar">
        <div>
          <h2 id="activitywatch-dashboard-title">ActivityWatch</h2>
          <div class="activitywatch-dashboard-subtitle" id="activitywatch-dashboard-subtitle"></div>
        </div>
        <button class="modal-close" id="activitywatch-dashboard-close" type="button" aria-label="Close ActivityWatch dashboard" title="Close" data-ui-icon="x"></button>
      </div>
      <div class="modal-body activitywatch-dashboard-body">
        <section class="activitywatch-dashboard-controls" id="activitywatch-dashboard-controls"></section>
        <div class="activitywatch-dashboard-grid">
          <div class="activitywatch-dashboard-main">
            <section class="activitywatch-chart-section">
              <div class="activitywatch-section-heading">
                <div>
                  <h3 id="activitywatch-chart-title">Last 2 weeks</h3>
                  <span class="activitywatch-section-subtitle" id="activitywatch-chart-subtitle"></span>
                </div>
              </div>
              <div class="activitywatch-stacked-chart" id="activitywatch-stacked-chart"></div>
            </section>
          </div>
          <section class="activitywatch-selected-day" id="activitywatch-selected-day"></section>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  hydrateIconButtons(overlay);
  hydrateSettingsIconButtons(overlay);
  document.getElementById('activitywatch-dashboard-close')?.addEventListener('click', closeActivityWatchDashboard);
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) closeActivityWatchDashboard();
  });
}

function renderActivityWatchDashboard() {
  const modal = document.getElementById('activitywatch-dashboard-modal');
  if (!modal || modal.classList.contains('hidden')) return;
  activityWatchDashboardState.rangeDays = normalizeActivityWatchDashboardRange(activityWatchDashboardState.rangeDays);
  activityWatchDashboardState.rangeEndDate = normalizeActivityWatchDashboardEndDate(activityWatchDashboardState.rangeEndDate);
  const days = buildActivityWatchDashboardDays();
  const current = activityWatchCurrentWakingDateStr();
  const selectedInRange = days.some(day => day.date === activityWatchDashboardState.selectedDate);
  if (!selectedInRange) {
    activityWatchDashboardState.selectedDate = days.some(day => day.date === current)
      ? current
      : days[days.length - 1]?.date || '';
  }
  if (!['day', 'range'].includes(activityWatchDashboardState.detailMode)) {
    activityWatchDashboardState.detailMode = 'day';
  }

  renderActivityWatchDashboardControls(days);
  renderActivityWatchStackedChart(days);
  renderActivityWatchDetailPanel(days);
  updateActivityWatchCategoryHighlight();
}

function buildActivityWatchDashboardDays() {
  const end = dateFromStr(normalizeActivityWatchDashboardEndDate(activityWatchDashboardState.rangeEndDate));
  return Array.from({ length: activityWatchDashboardState.rangeDays }, (_, index) => {
    const date = new Date(end);
    date.setDate(date.getDate() - (activityWatchDashboardState.rangeDays - 1 - index));
    const dateStr = toDateStr(date);
    return getActivityWatchDay(dateStr) || buildEmptyActivityWatchDashboardDay(dateStr);
  });
}

function buildEmptyActivityWatchDashboardDay(dateStr) {
  return {
    date: dateStr,
    periodStart: '',
    periodEnd: '',
    totalActiveSeconds: 0,
    categoryTotals: {},
    appTotals: {},
    hourlyCategoryTotals: Array.from({ length: 24 }, () => ({})),
    syncedAt: '',
    queryVersion: ACTIVITYWATCH_QUERY_VERSION,
  };
}

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
  if (chartTitle) {
    chartTitle.textContent = `${activityWatchDashboardRangeLabel(activityWatchDashboardState.rangeDays)} - ${activityWatchDateRangeLabel(days)}`;
  }
  if (chartSubtitle) {
    chartSubtitle.textContent = activityWatchDashboardState.selectedCategory
      ? `Filtered to ${activityWatchDashboardState.selectedCategory}`
      : 'Stacked category totals by waking day';
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

function buildActivityWatchAdvancedSyncPanel(days, isSyncing) {
  ensureActivityWatchAdvancedSyncDefaults(days);
  const panel = el('section', 'activitywatch-advanced-sync-panel');
  const header = el('div', 'activitywatch-advanced-sync-header');
  const copy = el('div', '');
  copy.appendChild(elText('strong', '', 'Advanced sync'));
  copy.appendChild(elText('span', '', 'Use this after ActivityWatch category rules change. Choose the dates first; routine dashboard updates should use Refresh.'));
  header.appendChild(copy);
  const close = el('button', 'activitywatch-advanced-sync-close');
  close.type = 'button';
  close.title = 'Close advanced sync';
  close.setAttribute('aria-label', 'Close advanced sync');
  close.appendChild(buildAppIconSvg('x'));
  close.addEventListener('click', () => {
    activityWatchDashboardState.advancedSyncOpen = false;
    renderActivityWatchDashboard();
  });
  header.appendChild(close);
  panel.appendChild(header);

  const form = el('div', 'activitywatch-advanced-sync-form');
  const modeLabel = el('label', 'activitywatch-advanced-sync-field');
  modeLabel.appendChild(elText('span', '', 'Dates'));
  const mode = el('select', '');
  mode.id = 'activitywatch-advanced-sync-mode';
  activityWatchAdvancedSyncOptions(days).forEach(option => {
    const item = document.createElement('option');
    item.value = option.value;
    item.textContent = option.label;
    mode.appendChild(item);
  });
  mode.value = activityWatchDashboardState.advancedSyncMode;
  mode.addEventListener('change', () => {
    activityWatchDashboardState.advancedSyncMode = mode.value;
    renderActivityWatchDashboard();
  });
  modeLabel.appendChild(mode);
  form.appendChild(modeLabel);

  if (activityWatchDashboardState.advancedSyncMode === 'custom') {
    form.appendChild(buildActivityWatchAdvancedSyncDateInput('Start', 'activitywatch-advanced-sync-start', 'advancedSyncCustomStart'));
    form.appendChild(buildActivityWatchAdvancedSyncDateInput('End', 'activitywatch-advanced-sync-end', 'advancedSyncCustomEnd'));
  }

  const syncDates = activityWatchAdvancedSyncDateStrings(days);
  const count = syncDates.length;
  const summary = el('div', 'activitywatch-advanced-sync-summary');
  summary.appendChild(elText('strong', '', count ? `${formatNumber(count)} waking days` : 'No dates selected'));
  summary.appendChild(elText('span', '', activityWatchAdvancedSyncSummary(syncDates)));
  form.appendChild(summary);

  const run = el('button', 'settings-backup-btn activitywatch-advanced-sync-run');
  run.type = 'button';
  run.dataset.settingsIcon = 'restore';
  run.disabled = isSyncing || !count;
  run.title = count ? `Resync ${formatNumber(count)} selected waking days` : 'Choose dates before resyncing';
  run.addEventListener('click', () => {
    maybeSyncActivityWatchDateStrings('dashboard-advanced-manual', syncDates, { force: true });
  });
  setSettingsButtonContent(run, isSyncing ? 'Syncing...' : 'Resync selected', 'restore');
  form.appendChild(run);
  panel.appendChild(form);

  if (count > 90) {
    panel.appendChild(elText('div', 'activitywatch-advanced-sync-warning', 'Large resyncs can take a while. Last 30 days or the visible range is usually enough after small category edits.'));
  }
  return panel;
}

function buildActivityWatchAdvancedSyncDateInput(label, id, stateKey) {
  const field = el('label', 'activitywatch-advanced-sync-field');
  field.appendChild(elText('span', '', label));
  const input = el('input', '');
  input.type = 'date';
  input.id = id;
  input.max = activityWatchCurrentWakingDateStr();
  input.value = activityWatchDashboardState[stateKey];
  input.addEventListener('change', () => {
    activityWatchDashboardState[stateKey] = input.value;
    renderActivityWatchDashboard();
  });
  field.appendChild(input);
  return field;
}

function ensureActivityWatchAdvancedSyncDefaults(days) {
  const current = activityWatchCurrentWakingDateStr();
  if (!activityWatchDashboardState.advancedSyncMode) {
    activityWatchDashboardState.advancedSyncMode = activityWatchStoredDateStrings().length ? 'visible' : 'last30';
  }
  if (!activityWatchDashboardState.advancedSyncCustomEnd) {
    activityWatchDashboardState.advancedSyncCustomEnd = days[days.length - 1]?.date || current;
  }
  if (!activityWatchDashboardState.advancedSyncCustomStart) {
    const start = dateFromStr(activityWatchDashboardState.advancedSyncCustomEnd);
    start.setDate(start.getDate() - 29);
    activityWatchDashboardState.advancedSyncCustomStart = toDateStr(start);
  }
}

function activityWatchAdvancedSyncOptions(days) {
  const options = [
    { value: 'visible', label: `Visible range (${formatNumber(days.length)} days)` },
    { value: 'last30', label: 'Last 30 days' },
    { value: 'last90', label: 'Last 90 days' },
  ];
  const stored = activityWatchStoredDateStrings();
  if (stored.length) {
    options.push({ value: 'stored', label: `Stored days (${formatNumber(stored.length)} days)` });
  }
  options.push({ value: 'custom', label: 'Custom dates' });
  if (!options.some(option => option.value === activityWatchDashboardState.advancedSyncMode)) {
    activityWatchDashboardState.advancedSyncMode = options[0].value;
  }
  return options;
}

function activityWatchAdvancedSyncDateStrings(days) {
  const mode = activityWatchDashboardState.advancedSyncMode;
  if (mode === 'visible') return days.map(day => day.date).filter(activityWatchIsValidDate);
  if (mode === 'last30') return activityWatchRecentDateStrings(30);
  if (mode === 'last90') return activityWatchRecentDateStrings(90);
  if (mode === 'stored') return activityWatchStoredDateStrings();
  if (mode === 'custom') return activityWatchDateStringsBetween(activityWatchDashboardState.advancedSyncCustomStart, activityWatchDashboardState.advancedSyncCustomEnd);
  return [];
}

function activityWatchAdvancedSyncSummary(dateStrings) {
  if (!dateStrings.length) return 'Choose a valid start and end date.';
  const first = dateStrings[0];
  const last = dateStrings[dateStrings.length - 1];
  return first === last
    ? formatEventDate(first)
    : `${formatEventDate(first)} to ${formatEventDate(last)}`;
}

function activityWatchStoredDateStrings() {
  return Object.keys(activityWatchData.daysByDate || {})
    .filter(activityWatchIsValidDate)
    .sort();
}

function activityWatchDateStringsBetween(startDate, endDate) {
  if (!activityWatchIsValidDate(startDate) || !activityWatchIsValidDate(endDate)) return [];
  const current = activityWatchCurrentWakingDateStr();
  const start = startDate <= endDate ? startDate : endDate;
  let end = startDate <= endDate ? endDate : startDate;
  if (start > current) return [];
  if (end > current) end = current;
  const dates = [];
  const cursor = dateFromStr(start);
  const endObj = dateFromStr(end);
  while (cursor <= endObj) {
    dates.push(toDateStr(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return dates;
}

function shiftActivityWatchDashboardRange(direction) {
  const current = activityWatchCurrentWakingDateStr();
  const end = dateFromStr(activityWatchDashboardState.rangeEndDate || current);
  end.setDate(end.getDate() + (direction * activityWatchDashboardState.rangeDays));
  const nextEnd = toDateStr(end);
  activityWatchDashboardState.rangeEndDate = nextEnd > current ? current : nextEnd;
  activityWatchDashboardState.showAllCategories = false;
  activityWatchDashboardState.hoveredCategory = '';
  renderActivityWatchDashboard();
}

function showLatestActivityWatchDashboardRange() {
  const current = activityWatchCurrentWakingDateStr();
  activityWatchDashboardState.rangeEndDate = current;
  activityWatchDashboardState.selectedDate = current;
  activityWatchDashboardState.showAllCategories = false;
  activityWatchDashboardState.hoveredCategory = '';
  renderActivityWatchDashboard();
}

function buildActivityWatchSyncProgressLegacy(progress) {
  const total = Math.max(1, Number(progress.totalDays) || 1);
  const completed = Math.min(total, Math.max(0, Number(progress.completedDays) || 0));
  const wrap = el('div', 'activitywatch-sync-progress');
  const label = progress.currentDate
    ? `Collecting ${formatEventDate(progress.currentDate)}`
    : 'Collecting ActivityWatch summaries';
  wrap.appendChild(elText('span', '', `${label} - ${formatNumber(completed)} of ${formatNumber(total)} days`));
  const track = el('div', 'activitywatch-sync-progress-track');
  const fill = el('span', '');
  fill.style.width = `${Math.max(3, (completed / total) * 100)}%`;
  track.appendChild(fill);
  wrap.appendChild(track);
  return wrap;
}

function buildActivityWatchSyncProgress(progress) {
  const total = Math.max(1, Number(progress.totalDays) || 1);
  const completed = Math.min(total, Math.max(0, Number(progress.completedDays) || 0));
  const wrap = el('div', 'activitywatch-sync-progress');
  const range = activityWatchProgressDateRange(progress);
  const label = progress.mode === 'fallback'
    ? activityWatchFallbackProgressLabel(progress, completed, total, range)
    : `Requesting ${formatNumber(total)} days at once${range ? ` - ${range}` : ''}`;
  wrap.appendChild(elText('span', '', label));
  const track = el('div', 'activitywatch-sync-progress-track');
  const fill = el('span', '');
  if (progress.mode === 'fallback') {
    fill.style.width = `${Math.max(3, (completed / total) * 100)}%`;
  } else {
    track.classList.add('is-indeterminate');
  }
  track.appendChild(fill);
  wrap.appendChild(track);
  return wrap;
}

function activityWatchFallbackProgressLabel(progress, completed, total, range) {
  if (completed <= 0) {
    return `Full request did not finish; retrying 14-day batches${range ? ` - ${range}` : ''}`;
  }
  return `Retrying in 14-day batches - ${formatNumber(completed)} of ${formatNumber(total)} days synced${range ? ` - latest batch ${range}` : ''}`;
}

function activityWatchProgressDateRange(progress) {
  if (!progress.currentDate) return '';
  if (!progress.currentEndDate || progress.currentEndDate === progress.currentDate) {
    return formatEventDate(progress.currentDate);
  }
  return `${formatEventDate(progress.currentDate)} to ${formatEventDate(progress.currentEndDate)}`;
}

function renderActivityWatchStackedChart(days) {
  const root = document.getElementById('activitywatch-stacked-chart');
  if (!root) return;
  root.innerHTML = '';
  root.classList.toggle('is-dense-range', days.length > 30);
  root.classList.toggle('is-month-range', days.length >= 30);
  root.classList.toggle('is-filtered', Boolean(activityWatchDashboardState.selectedCategory));

  const chartCategories = activityWatchDashboardChartCategories(days);
  const maxSeconds = activityWatchDashboardState.selectedCategory
    ? Math.max(0, ...days.map(day => day.categoryTotals?.[activityWatchDashboardState.selectedCategory] || 0))
    : Math.max(0, ...days.map(day => day.totalActiveSeconds || 0));
  const axis = activityWatchHourAxis(maxSeconds);

  const scale = el('div', 'activitywatch-chart-scale');
  scale.style.setProperty('--activitywatch-tick-count', axis.ticks.length);
  scale.style.gridTemplateRows = `repeat(${Math.max(1, axis.ticks.length - 1)}, minmax(0, 1fr))`;
  axis.ticks.slice().reverse().forEach(tick => {
    scale.appendChild(elText('span', '', activityWatchFormatHourTick(tick)));
  });
  root.appendChild(scale);

  const plot = el('div', 'activitywatch-chart-plot');
  plot.style.setProperty('--activitywatch-day-count', days.length);
  plot.style.setProperty('--activitywatch-grid-step', `${100 / Math.max(1, axis.ticks.length - 1)}%`);
  plot.appendChild(buildActivityWatchMonthBands(days));

  const bars = el('div', 'activitywatch-bars-row');
  days.forEach((day, index) => {
    const barButton = el('button', 'activitywatch-day-bar');
    barButton.type = 'button';
    barButton.dataset.awDate = day.date;
    barButton.classList.toggle('is-selected', day.date === activityWatchDashboardState.selectedDate);
    barButton.title = `${formatEventDate(day.date)} - ${formatActivityWatchDuration(day.totalActiveSeconds)}`;
    barButton.addEventListener('click', () => {
      activityWatchDashboardState.selectedDate = day.date;
      activityWatchDashboardState.detailMode = 'day';
      activityWatchDashboardState.showAllCategories = false;
      activityWatchDashboardState.hoveredCategory = '';
      renderActivityWatchDashboard();
    });

    const plottedSeconds = activityWatchDashboardState.selectedCategory
      ? day.categoryTotals?.[activityWatchDashboardState.selectedCategory] || 0
      : day.totalActiveSeconds || 0;
    const totalLabel = elText('span', 'activitywatch-day-bar-total', activityWatchBarTotalLabel(day, plottedSeconds, index, days.length));
    barButton.appendChild(totalLabel);

    const stack = el('span', 'activitywatch-day-bar-stack');
    stack.style.height = plottedSeconds
      ? `${Math.max(3, Math.min(100, (plottedSeconds / axis.maxSeconds) * 100))}%`
      : '4px';
    const stackTotal = Math.max(1, plottedSeconds || 0);
    chartCategories.forEach(category => {
      const seconds = activityWatchDashboardCategorySeconds(day, category, chartCategories);
      if (!seconds) return;
      const segment = el('span', 'activitywatch-day-bar-segment');
      segment.dataset.awCategory = category;
      segment.style.height = `${Math.max(2, (seconds / stackTotal) * 100)}%`;
      segment.style.background = activityWatchDashboardCategoryColor(category);
      segment.title = `${category}: ${formatActivityWatchDuration(seconds)}`;
      stack.appendChild(segment);
    });
    if (!plottedSeconds) {
      const empty = el('span', 'activitywatch-day-bar-empty');
      stack.appendChild(empty);
    }
    barButton.appendChild(stack);
    barButton.appendChild(elText('span', 'activitywatch-day-bar-label', activityWatchXAxisLabel(day, index, days)));
    bars.appendChild(barButton);
  });
  plot.appendChild(bars);
  root.appendChild(plot);
}

function activityWatchDashboardChartCategories(days) {
  if (activityWatchDashboardState.selectedCategory) {
    return [activityWatchDashboardState.selectedCategory];
  }
  const topCategories = topActivityWatchCategories(days, ACTIVITYWATCH_SELECTED_CATEGORY_LIMIT);
  const hasOther = days.some(day => activityWatchDashboardOtherSeconds(day, topCategories) > 0);
  return hasOther ? [...topCategories, ACTIVITYWATCH_DASHBOARD_OTHER_CATEGORY] : topCategories;
}

function activityWatchDashboardCategorySeconds(day, category, visibleCategories) {
  if (category === ACTIVITYWATCH_DASHBOARD_OTHER_CATEGORY) {
    return activityWatchDashboardOtherSeconds(day, visibleCategories.filter(item => item !== ACTIVITYWATCH_DASHBOARD_OTHER_CATEGORY));
  }
  return day.categoryTotals?.[category] || 0;
}

function activityWatchDashboardOtherSeconds(day, topCategories) {
  const shown = topCategories.reduce((sum, category) => sum + (day.categoryTotals?.[category] || 0), 0);
  return Math.max(0, (day.totalActiveSeconds || 0) - shown);
}

function buildActivityWatchMonthBands(days) {
  const row = el('div', 'activitywatch-month-bands');
  if (!days.length) return row;
  let startIndex = 0;
  while (startIndex < days.length) {
    const startDate = dateFromStr(days[startIndex].date);
    let endIndex = startIndex;
    while (endIndex + 1 < days.length) {
      const next = dateFromStr(days[endIndex + 1].date);
      if (next.getMonth() !== startDate.getMonth() || next.getFullYear() !== startDate.getFullYear()) break;
      endIndex += 1;
    }
    const band = elText('span', '', startDate.toLocaleDateString(undefined, {
      month: 'short',
      year: startDate.getFullYear() !== new Date().getFullYear() ? 'numeric' : undefined,
    }));
    band.style.gridColumn = `${startIndex + 1} / ${endIndex + 2}`;
    row.appendChild(band);
    startIndex = endIndex + 1;
  }
  return row;
}

function renderActivityWatchDetailPanel(days) {
  const root = document.getElementById('activitywatch-selected-day');
  if (!root) return;
  root.innerHTML = '';
  const selectedDay = days.find(day => day.date === activityWatchDashboardState.selectedDate) || days[days.length - 1];
  const mode = activityWatchDashboardState.detailMode;
  const rows = mode === 'range'
    ? activityWatchAggregateCategoryRows(days)
    : activityWatchCategoryRowsForDay(selectedDay);
  const total = mode === 'range'
    ? days.reduce((sum, day) => sum + (day.totalActiveSeconds || 0), 0)
    : selectedDay?.totalActiveSeconds || 0;

  const heading = el('div', 'activitywatch-selected-heading');
  const copy = el('div', '');
  copy.appendChild(elText('span', 'activitywatch-selected-kicker', mode === 'range' ? 'Visible range' : 'Selected day'));
  copy.appendChild(elText('h3', '', mode === 'range' ? activityWatchDateRangeLabel(days) : formatEventDate(selectedDay?.date || '')));
  heading.appendChild(copy);
  heading.appendChild(elText('strong', '', formatActivityWatchDuration(total)));
  root.appendChild(heading);
  if (activityWatchDashboardState.selectedCategory) {
    const filterBar = el('div', 'activitywatch-filter-bar');
    filterBar.appendChild(elText('span', '', `Filtered to ${activityWatchDashboardState.selectedCategory}`));
    const clear = el('button', 'activitywatch-clear-filter-btn');
    clear.type = 'button';
    clear.textContent = 'All categories';
    clear.addEventListener('click', () => {
      activityWatchDashboardState.selectedCategory = '';
      activityWatchDashboardState.hoveredCategory = '';
      renderActivityWatchDashboard();
    });
    filterBar.appendChild(clear);
    root.appendChild(filterBar);
  }
  root.appendChild(buildActivityWatchDetailModeToggle());

  if (!rows.length) {
    root.appendChild(elText('div', 'activitywatch-empty', mode === 'range'
      ? 'No ActivityWatch category data for this range.'
      : 'No ActivityWatch category data for this waking day.'));
    return;
  }

  const rowsToShow = activityWatchDashboardState.showAllCategories
    ? rows
    : rows.slice(0, ACTIVITYWATCH_SELECTED_CATEGORY_LIMIT);
  const list = el('div', 'activitywatch-category-list');
  const max = Math.max(...rows.map(([, seconds]) => seconds), 1);
  rowsToShow.forEach(([category, seconds]) => {
    const row = el('button', 'activitywatch-category-row');
    row.type = 'button';
    row.dataset.awCategory = category;
    row.classList.toggle('is-active', category === activityWatchDashboardState.selectedCategory);
    row.addEventListener('click', () => lockActivityWatchDashboardCategory(category, { toggle: true }));
    addActivityWatchCategoryPreviewHandlers(row, category);

    const label = el('div', 'activitywatch-category-label');
    const swatch = el('span', 'activitywatch-legend-swatch');
    swatch.style.background = activityWatchDashboardCategoryColor(category);
    label.appendChild(swatch);
    label.appendChild(elText('span', '', category));
    row.appendChild(label);

    const meta = el('div', 'activitywatch-category-meta');
    meta.appendChild(elText('strong', '', formatActivityWatchDuration(seconds)));
    meta.appendChild(elText('span', '', formatActivityWatchPercent(seconds, total)));
    row.appendChild(meta);

    const bar = el('div', 'activitywatch-category-meter');
    const fill = el('span', '');
    fill.style.width = `${Math.max(2, (seconds / max) * 100)}%`;
    fill.style.background = activityWatchDashboardCategoryColor(category);
    bar.appendChild(fill);
    row.appendChild(bar);
    list.appendChild(row);
  });
  root.appendChild(list);

  if (rows.length > ACTIVITYWATCH_SELECTED_CATEGORY_LIMIT) {
    const toggle = el('button', 'activitywatch-show-all-btn');
    toggle.type = 'button';
    toggle.textContent = activityWatchDashboardState.showAllCategories
      ? 'Show top categories'
      : `Show all ${formatNumber(rows.length)} categories`;
    toggle.addEventListener('click', () => {
      activityWatchDashboardState.showAllCategories = !activityWatchDashboardState.showAllCategories;
      renderActivityWatchDashboard();
    });
    root.appendChild(toggle);
  }
}

function buildActivityWatchDetailModeToggle() {
  const toggle = el('div', 'activitywatch-detail-toggle');
  [
    ['day', 'Day'],
    ['range', 'Range'],
  ].forEach(([mode, label]) => {
    const button = el('button', '');
    button.type = 'button';
    button.textContent = label;
    button.classList.toggle('is-active', activityWatchDashboardState.detailMode === mode);
    button.addEventListener('click', () => {
      activityWatchDashboardState.detailMode = mode;
      activityWatchDashboardState.showAllCategories = false;
      renderActivityWatchDashboard();
    });
    toggle.appendChild(button);
  });
  return toggle;
}

function activityWatchCategoryRowsForDay(day) {
  return Object.entries(day?.categoryTotals || {})
    .sort((a, b) => b[1] - a[1]);
}

function activityWatchAggregateCategoryRows(days) {
  const totals = {};
  days.forEach(day => {
    Object.entries(day.categoryTotals || {}).forEach(([category, seconds]) => {
      totals[category] = (totals[category] || 0) + seconds;
    });
  });
  return Object.entries(totals)
    .sort((a, b) => b[1] - a[1]);
}

function lockActivityWatchDashboardCategory(category, options = {}) {
  if (!category || category === ACTIVITYWATCH_DASHBOARD_OTHER_CATEGORY) return;
  if (activityWatchDashboardState.selectedCategory) {
    if (activityWatchDashboardState.selectedCategory === category && options.toggle) {
      activityWatchDashboardState.selectedCategory = '';
      activityWatchDashboardState.hoveredCategory = '';
      renderActivityWatchDashboard();
    }
    return;
  }
  activityWatchDashboardState.selectedCategory = category;
  activityWatchDashboardState.hoveredCategory = '';
  activityWatchDashboardState.showAllCategories = false;
  renderActivityWatchDashboard();
}

function addActivityWatchCategoryPreviewHandlers(node, category) {
  node.addEventListener('mouseenter', () => {
    if (activityWatchDashboardState.selectedCategory) return;
    activityWatchDashboardState.hoveredCategory = category;
    updateActivityWatchCategoryHighlight();
  });
  node.addEventListener('mouseleave', () => {
    if (activityWatchDashboardState.selectedCategory) return;
    if (activityWatchDashboardState.hoveredCategory === category) {
      activityWatchDashboardState.hoveredCategory = '';
      updateActivityWatchCategoryHighlight();
    }
  });
}

function updateActivityWatchCategoryHighlight() {
  const active = activityWatchDashboardState.selectedCategory || activityWatchDashboardState.hoveredCategory;
  document.querySelectorAll('#activitywatch-dashboard-modal [data-aw-category]').forEach(node => {
    const isMatch = active && node.dataset.awCategory === active;
    node.classList.toggle('is-highlighted', Boolean(isMatch));
    node.classList.toggle('is-dimmed', Boolean(active && !isMatch));
  });
}

function topActivityWatchCategories(days, limit) {
  const totals = {};
  days.forEach(day => {
    Object.entries(day.categoryTotals || {}).forEach(([category, seconds]) => {
      totals[category] = (totals[category] || 0) + seconds;
    });
  });
  return Object.entries(totals)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([category]) => category);
}

function normalizeActivityWatchDashboardRange(value) {
  const parsed = Number.parseInt(value, 10);
  return ACTIVITYWATCH_DASHBOARD_RANGE_OPTIONS.some(option => option.days === parsed)
    ? parsed
    : ACTIVITYWATCH_DASHBOARD_DEFAULT_RANGE_DAYS;
}

function normalizeActivityWatchDashboardEndDate(value) {
  const current = activityWatchCurrentWakingDateStr();
  if (!activityWatchIsValidDate(value)) return current;
  return value > current ? current : value;
}

function activityWatchDashboardRangeLabel(days) {
  return ACTIVITYWATCH_DASHBOARD_RANGE_OPTIONS.find(option => option.days === days)?.label || 'Last 2 weeks';
}

function activityWatchDateRangeLabel(days) {
  if (!days.length) return '';
  const start = dateFromStr(days[0].date);
  const end = dateFromStr(days[days.length - 1].date);
  const sameYear = start.getFullYear() === end.getFullYear();
  const sameMonth = sameYear && start.getMonth() === end.getMonth();
  const year = end.getFullYear();
  if (sameMonth) {
    return `${start.toLocaleDateString(undefined, { month: 'short' })} ${start.getDate()}-${end.getDate()}, ${year}`;
  }
  return `${start.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}-${end.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}, ${year}`;
}

function activityWatchHourAxis(maxSeconds) {
  const maxHours = Math.max(1, maxSeconds / 3600);
  const step = activityWatchNiceHourStep(maxHours / 5);
  const max = Math.max(step, Math.ceil(maxHours / step) * step);
  const ticks = [];
  for (let value = 0; value <= max + (step / 10); value += step) {
    ticks.push(Number(value.toFixed(2)));
  }
  return {
    maxHours: max,
    maxSeconds: max * 3600,
    ticks,
  };
}

function activityWatchNiceHourStep(raw) {
  return [0.25, 0.5, 0.75, 1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10, 12].find(step => raw <= step) || Math.ceil(raw);
}

function activityWatchFormatHourTick(value) {
  return `${Number.isInteger(value) ? value : value.toFixed(1)}h`;
}

function activityWatchBarTotalLabel(day, plottedSeconds, index, dayCount) {
  if (!plottedSeconds) return '';
  if (dayCount > 14) return '';
  if (dayCount <= 14 || day.date === activityWatchDashboardState.selectedDate || index === 0 || index === dayCount - 1) {
    return formatActivityWatchChartDuration(plottedSeconds, dayCount > 30);
  }
  if (dayCount <= 30 && index % 7 === 0) return formatActivityWatchChartDuration(plottedSeconds, false);
  return '';
}

function formatActivityWatchChartDuration(seconds, compact = false) {
  const total = Math.max(0, Math.round(Number(seconds) || 0));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  if (compact) {
    if (hours) return `${hours}h`;
    return minutes ? `${minutes}m` : '';
  }
  if (hours && minutes) return `${hours}h ${minutes}m`;
  if (hours) return `${hours}h`;
  if (minutes) return `${minutes}m`;
  return total ? '<1m' : '';
}

function activityWatchXAxisLabel(day, index, days) {
  const dayCount = days.length;
  const date = dateFromStr(day.date);
  const selected = day.date === activityWatchDashboardState.selectedDate;
  if (dayCount <= 14) return String(date.getDate());
  if (selected || index === 0 || index === dayCount - 1) return String(date.getDate());
  if (dayCount <= 30) return index % 7 === 0 ? String(date.getDate()) : '';
  if (date.getDate() === 1) return date.toLocaleDateString(undefined, { month: 'short' });
  if (dayCount <= 45 && date.getDay() === 1) return String(date.getDate());
  return '';
}

function activityWatchDashboardCategoryColor(category) {
  const label = String(category || '');
  const topLevel = label.split(ACTIVITYWATCH_CATEGORY_JOINER)[0];
  if (ACTIVITYWATCH_DASHBOARD_CATEGORY_COLORS[label]) return ACTIVITYWATCH_DASHBOARD_CATEGORY_COLORS[label];
  if (ACTIVITYWATCH_DASHBOARD_CATEGORY_COLORS[topLevel]) return ACTIVITYWATCH_DASHBOARD_CATEGORY_COLORS[topLevel];
  return activityWatchAdjustedFallbackColor(label);
}

function activityWatchAdjustedFallbackColor(category) {
  const base = activityWatchCategoryColor(category);
  const match = /^#([0-9a-f]{6})$/i.exec(base);
  if (!match) return base;
  const value = match[1];
  const r = Number.parseInt(value.slice(0, 2), 16);
  const g = Number.parseInt(value.slice(2, 4), 16);
  const b = Number.parseInt(value.slice(4, 6), 16);
  const mix = 28;
  return `#${activityWatchHex(Math.round((r * 0.82) + mix))}${activityWatchHex(Math.round((g * 0.82) + mix))}${activityWatchHex(Math.round((b * 0.82) + mix))}`;
}

function activityWatchHex(value) {
  return Math.max(0, Math.min(255, value)).toString(16).padStart(2, '0');
}

function formatActivityWatchPercent(seconds, totalSeconds) {
  const total = Number(totalSeconds) || 0;
  if (total <= 0 || !seconds) return '0%';
  const percent = (seconds / total) * 100;
  if (percent > 0 && percent < 1) return '<1%';
  return `${Math.round(percent)}%`;
}

function activityWatchDashboardStatusTitle(status, progress) {
  if (progress.active && progress.totalDays) {
    if (progress.mode === 'single') return 'Syncing ActivityWatch';
    return `Syncing ActivityWatch ${formatNumber(progress.completedDays)} / ${formatNumber(progress.totalDays)}`;
  }
  return activityWatchStatusTitle(status);
}

function activityWatchDashboardStatusDetail(status, progress) {
  const lastSync = activityWatchData.lastSyncAt
    ? `Last sync ${formatAutoBackupDateTime(activityWatchData.lastSyncAt)}`
    : 'Last sync never';
  if (progress.active) {
    if (progress.mode === 'single') {
      return `${lastSync}. Requesting ActivityWatch summaries in one call.`;
    }
    if (progress.mode === 'fallback') {
      return `${lastSync}. Full-range sync fell back to 14-day batches.`;
    }
    return `${lastSync}. Routine refresh covers the latest ${formatNumber(ACTIVITYWATCH_RECENT_SYNC_DAYS)} waking days.`;
  }
  const message = status.message || 'ActivityWatch has not synced yet.';
  return `${message} ${lastSync}.`;
}

function activityWatchStatusTitle(status) {
  if (status.code === 'ok') return 'ActivityWatch synced';
  if (status.code === 'warning') return 'ActivityWatch synced with warnings';
  if (status.code === 'syncing') return 'Syncing ActivityWatch';
  if (status.code === 'cors-blocked') return 'CORS setup needed';
  if (status.code === 'offline') return 'ActivityWatch unavailable';
  if (status.code === 'file-origin') return 'Local server required';
  if (status.code === 'missing-window') return 'Window watcher missing';
  if (status.code === 'missing-afk') return 'AFK watcher missing';
  if (status.code === 'query-error') return 'ActivityWatch query failed';
  return 'ActivityWatch waiting';
}

function activityWatchStatusDetail(status) {
  if (status.message) return status.message;
  return 'ActivityWatch has not synced yet.';
}

function activityWatchStatusPill(status) {
  if (status.code === 'ok') return 'Synced';
  if (status.code === 'warning') return 'Review';
  if (status.code === 'syncing') return 'Syncing';
  if (status.code === 'idle') return 'Waiting';
  return 'Issue';
}

function activityWatchStatusIsIssue(status) {
  return !['ok', 'warning', 'syncing', 'idle'].includes(status.code);
}
