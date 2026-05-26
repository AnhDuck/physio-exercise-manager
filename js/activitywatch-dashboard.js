// ActivityWatch dashboard panel and category visualizations.

const ACTIVITYWATCH_DASHBOARD_RANGE_OPTIONS = [
  { days: 7, label: 'Last 7 days' },
  { days: 14, label: 'Last 2 weeks' },
  { days: 30, label: 'Last 30 days' },
  { days: 90, label: 'Last 90 days' },
];
const ACTIVITYWATCH_DASHBOARD_DEFAULT_RANGE_DAYS = 14;
const ACTIVITYWATCH_SELECTED_CATEGORY_LIMIT = 8;

let activityWatchDashboardSelectedDate = '';
let activityWatchDashboardRangeDays = ACTIVITYWATCH_DASHBOARD_DEFAULT_RANGE_DAYS;
let activityWatchDashboardShowAllCategories = false;

function openActivityWatchDashboard() {
  ensureActivityWatchDashboardShell();
  const modal = document.getElementById('activitywatch-dashboard-modal');
  if (!modal) return;
  if (!activityWatchDashboardSelectedDate) {
    activityWatchDashboardSelectedDate = activityWatchCurrentWakingDateStr();
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
            <section class="activitywatch-dashboard-summary" id="activitywatch-dashboard-summary"></section>
            <section class="activitywatch-chart-section">
              <div class="activitywatch-section-heading">
                <div>
                  <h3 id="activitywatch-chart-title">Last 2 weeks</h3>
                  <span class="activitywatch-section-subtitle" id="activitywatch-chart-subtitle"></span>
                </div>
              </div>
              <div class="activitywatch-stacked-chart" id="activitywatch-stacked-chart"></div>
              <div class="activitywatch-chart-legend" id="activitywatch-chart-legend"></div>
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
  const days = getActivityWatchRecentDays(activityWatchDashboardRangeDays);
  if (!activityWatchDashboardSelectedDate || !days.some(day => day.date === activityWatchDashboardSelectedDate)) {
    const current = activityWatchCurrentWakingDateStr();
    activityWatchDashboardSelectedDate = days.some(day => day.date === current)
      ? current
      : days[days.length - 1]?.date || '';
  }

  renderActivityWatchDashboardControls(days);
  renderActivityWatchDashboardSummary(days);
  renderActivityWatchStackedChart(days);
  renderActivityWatchSelectedDay(days.find(day => day.date === activityWatchDashboardSelectedDate) || days[days.length - 1]);
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
  const copy = el('div', 'activitywatch-control-copy');
  copy.appendChild(elText('strong', '', activityWatchDashboardStatusTitle(status, progress)));
  copy.appendChild(elText('span', '', activityWatchDashboardStatusDetail(status, progress)));
  row.appendChild(copy);

  const pill = elText('span', 'settings-status-pill', activityWatchStatusPill(status));
  pill.classList.toggle('is-muted', ['idle', 'syncing'].includes(status.code));
  pill.classList.toggle('is-backup-issue', activityWatchStatusIsIssue(status));
  row.appendChild(pill);

  const actions = el('div', 'activitywatch-control-actions');
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
  select.value = String(activityWatchDashboardRangeDays);
  select.addEventListener('change', () => {
    activityWatchDashboardRangeDays = normalizeActivityWatchDashboardRange(select.value);
    activityWatchDashboardShowAllCategories = false;
    renderActivityWatchDashboard();
  });
  rangeLabel.appendChild(select);
  actions.appendChild(rangeLabel);

  const refresh = el('button', 'settings-backup-btn activitywatch-refresh-btn');
  refresh.id = 'activitywatch-dashboard-refresh';
  refresh.type = 'button';
  refresh.dataset.settingsIcon = 'reconnect';
  refresh.disabled = isSyncing;
  refresh.title = `Refresh latest ${formatNumber(ACTIVITYWATCH_RECENT_SYNC_DAYS)} waking days`;
  refresh.addEventListener('click', () => {
    maybeSyncActivityWatchRecent('dashboard-manual', { force: true });
  });
  setSettingsButtonContent(refresh, isSyncing ? 'Syncing...' : 'Refresh recent', 'reconnect');
  actions.appendChild(refresh);

  const syncRange = el('button', 'settings-backup-btn activitywatch-sync-range-btn');
  syncRange.id = 'activitywatch-dashboard-sync-range';
  syncRange.type = 'button';
  syncRange.dataset.settingsIcon = 'reconnect';
  syncRange.disabled = isSyncing;
  syncRange.title = `Refetch every day in ${activityWatchDashboardRangeLabel(activityWatchDashboardRangeDays)}`;
  syncRange.addEventListener('click', () => {
    maybeSyncActivityWatchRange('dashboard-range-manual', activityWatchDashboardRangeDays, { force: true });
  });
  setSettingsButtonContent(syncRange, isSyncing ? 'Syncing range...' : 'Sync selected range', 'reconnect');
  actions.appendChild(syncRange);

  row.appendChild(actions);
  root.appendChild(row);

  if (isSyncing) {
    root.appendChild(buildActivityWatchSyncProgress(progress));
  }
  warnings.forEach(warning => root.appendChild(elText('div', 'activitywatch-warning', warning)));

  const chartSubtitle = document.getElementById('activitywatch-chart-subtitle');
  const chartTitle = document.getElementById('activitywatch-chart-title');
  if (chartTitle) chartTitle.textContent = `${activityWatchDashboardRangeLabel(activityWatchDashboardRangeDays)} · ${activityWatchDateRangeLabel(days)}`;
  if (chartSubtitle) {
    chartSubtitle.textContent = `Routine refresh syncs the latest ${formatNumber(ACTIVITYWATCH_RECENT_SYNC_DAYS)} waking days. Use Sync selected range for older history.`;
  }
}

function buildActivityWatchSyncProgressLegacy(progress) {
  const total = Math.max(1, Number(progress.totalDays) || 1);
  const completed = Math.min(total, Math.max(0, Number(progress.completedDays) || 0));
  const wrap = el('div', 'activitywatch-sync-progress');
  const label = progress.currentDate
    ? `Collecting ${formatEventDate(progress.currentDate)}`
    : 'Collecting ActivityWatch summaries';
  wrap.appendChild(elText('span', '', `${label} · ${formatNumber(completed)} of ${formatNumber(total)} days`));
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

function renderActivityWatchDashboardSummary(days) {
  const root = document.getElementById('activitywatch-dashboard-summary');
  if (!root) return;
  root.innerHTML = '';
  const syncedDays = days.filter(day => day.totalActiveSeconds > 0);
  const total = syncedDays.reduce((sum, day) => sum + day.totalActiveSeconds, 0);
  const average = syncedDays.length ? total / syncedDays.length : 0;
  root.appendChild(buildActivityWatchSummaryCard('Total active', formatActivityWatchDuration(total), activityWatchDashboardRangeLabel(activityWatchDashboardRangeDays)));
  root.appendChild(buildActivityWatchSummaryCard('Daily average', formatActivityWatchDuration(average), `${formatNumber(syncedDays.length)} days with data`));
  root.appendChild(buildActivityWatchSummaryCard('Last sync', activityWatchData.lastSyncAt ? formatAutoBackupDateTime(activityWatchData.lastSyncAt) : 'Never', activityWatchData.lastSyncTrigger || 'Waiting'));
}

function buildActivityWatchSummaryCard(label, value, detail) {
  const card = el('div', 'activitywatch-summary-card');
  card.appendChild(elText('span', '', label));
  card.appendChild(elText('strong', '', value));
  card.appendChild(elText('small', '', detail));
  return card;
}

function renderActivityWatchStackedChart(days) {
  const root = document.getElementById('activitywatch-stacked-chart');
  const legend = document.getElementById('activitywatch-chart-legend');
  if (!root || !legend) return;
  root.innerHTML = '';
  legend.innerHTML = '';
  root.classList.toggle('is-dense-range', days.length > 30);
  root.classList.toggle('is-month-range', days.length >= 30);

  const maxSeconds = Math.max(0, ...days.map(day => day.totalActiveSeconds || 0));
  const axis = activityWatchHourAxis(maxSeconds);
  const categories = topActivityWatchCategories(days, 8);

  const scale = el('div', 'activitywatch-chart-scale');
  scale.style.setProperty('--activitywatch-tick-count', axis.ticks.length);
  scale.style.gridTemplateRows = `repeat(${Math.max(1, axis.ticks.length - 1)}, minmax(0, 1fr))`;
  axis.ticks.slice().reverse().forEach(tick => {
    scale.appendChild(elText('span', '', `${tick}h`));
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
    barButton.classList.toggle('is-selected', day.date === activityWatchDashboardSelectedDate);
    barButton.title = `${formatEventDate(day.date)} - ${formatActivityWatchDuration(day.totalActiveSeconds)}`;
    barButton.addEventListener('click', () => {
      activityWatchDashboardSelectedDate = day.date;
      activityWatchDashboardShowAllCategories = false;
      renderActivityWatchDashboard();
    });

    const totalLabel = elText('span', 'activitywatch-day-bar-total', activityWatchBarTotalLabel(day, index, days.length));
    barButton.appendChild(totalLabel);

    const stack = el('span', 'activitywatch-day-bar-stack');
    stack.style.height = day.totalActiveSeconds
      ? `${Math.max(3, Math.min(100, (day.totalActiveSeconds / axis.maxSeconds) * 100))}%`
      : '4px';
    const total = Math.max(1, day.totalActiveSeconds || 0);
    categories.forEach(category => {
      const seconds = day.categoryTotals[category] || 0;
      if (!seconds) return;
      const segment = el('span', 'activitywatch-day-bar-segment');
      segment.style.height = `${Math.max(2, (seconds / total) * 100)}%`;
      segment.style.background = activityWatchCategoryColor(category);
      segment.title = `${category}: ${formatActivityWatchDuration(seconds)}`;
      stack.appendChild(segment);
    });
    if (!day.totalActiveSeconds) {
      const empty = el('span', 'activitywatch-day-bar-empty');
      stack.appendChild(empty);
    }
    barButton.appendChild(stack);
    barButton.appendChild(elText('span', 'activitywatch-day-bar-label', activityWatchDayNumberLabel(day.date)));
    bars.appendChild(barButton);
  });
  plot.appendChild(bars);
  root.appendChild(plot);

  categories.forEach(category => {
    const item = el('div', 'activitywatch-legend-item');
    const swatch = el('span', 'activitywatch-legend-swatch');
    swatch.style.background = activityWatchCategoryColor(category);
    item.appendChild(swatch);
    item.appendChild(elText('span', '', category));
    legend.appendChild(item);
  });
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

function renderActivityWatchSelectedDay(day) {
  const root = document.getElementById('activitywatch-selected-day');
  if (!root || !day) return;
  root.innerHTML = '';
  const heading = el('div', 'activitywatch-selected-heading');
  const copy = el('div', '');
  copy.appendChild(elText('span', 'activitywatch-selected-kicker', 'Selected day'));
  copy.appendChild(elText('h3', '', formatEventDate(day.date)));
  heading.appendChild(copy);
  heading.appendChild(elText('strong', '', formatActivityWatchDuration(day.totalActiveSeconds)));
  root.appendChild(heading);

  const categoryRows = Object.entries(day.categoryTotals || {})
    .sort((a, b) => b[1] - a[1]);
  if (!categoryRows.length) {
    root.appendChild(elText('div', 'activitywatch-empty', 'No ActivityWatch category data for this waking day.'));
    return;
  }

  const rowsToShow = activityWatchDashboardShowAllCategories
    ? categoryRows
    : categoryRows.slice(0, ACTIVITYWATCH_SELECTED_CATEGORY_LIMIT);
  const list = el('div', 'activitywatch-category-list');
  const max = Math.max(...categoryRows.map(([, seconds]) => seconds), 1);
  rowsToShow.forEach(([category, seconds]) => {
    const row = el('div', 'activitywatch-category-row');
    const label = el('div', 'activitywatch-category-label');
    const swatch = el('span', 'activitywatch-legend-swatch');
    swatch.style.background = activityWatchCategoryColor(category);
    label.appendChild(swatch);
    label.appendChild(elText('span', '', category));
    row.appendChild(label);
    row.appendChild(elText('strong', '', formatActivityWatchDuration(seconds)));
    const bar = el('div', 'activitywatch-category-meter');
    const fill = el('span', '');
    fill.style.width = `${Math.max(2, (seconds / max) * 100)}%`;
    fill.style.background = activityWatchCategoryColor(category);
    bar.appendChild(fill);
    row.appendChild(bar);
    list.appendChild(row);
  });
  root.appendChild(list);

  if (categoryRows.length > ACTIVITYWATCH_SELECTED_CATEGORY_LIMIT) {
    const toggle = el('button', 'activitywatch-show-all-btn');
    toggle.type = 'button';
    toggle.textContent = activityWatchDashboardShowAllCategories
      ? 'Show top categories'
      : `Show all ${formatNumber(categoryRows.length)} categories`;
    toggle.addEventListener('click', () => {
      activityWatchDashboardShowAllCategories = !activityWatchDashboardShowAllCategories;
      renderActivityWatchDashboard();
    });
    root.appendChild(toggle);
  }
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
  const step = activityWatchNiceHourStep(maxHours / 4);
  const max = Math.max(step, Math.ceil(maxHours / step) * step);
  const ticks = [];
  for (let value = 0; value <= max; value += step) {
    ticks.push(value);
  }
  return {
    maxHours: max,
    maxSeconds: max * 3600,
    ticks,
  };
}

function activityWatchNiceHourStep(raw) {
  return [1, 2, 3, 4, 6, 8, 12].find(step => raw <= step) || Math.ceil(raw);
}

function activityWatchBarTotalLabel(day, index, dayCount) {
  if (!day.totalActiveSeconds) return '';
  if (dayCount <= 30 || day.date === activityWatchDashboardSelectedDate || index === dayCount - 1 || index % 7 === 0) {
    return formatActivityWatchChartDuration(day.totalActiveSeconds, dayCount > 30);
  }
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

function activityWatchDayNumberLabel(dateStr) {
  return String(dateFromStr(dateStr).getDate());
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
      return `${lastSync}. Requesting the selected range in one ActivityWatch call.`;
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
