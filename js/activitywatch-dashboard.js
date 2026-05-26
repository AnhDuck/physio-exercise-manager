// ActivityWatch dashboard panel and category visualizations.

let activityWatchDashboardSelectedDate = '';

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
        <section class="activitywatch-dashboard-status" id="activitywatch-dashboard-status"></section>
        <section class="activitywatch-dashboard-summary" id="activitywatch-dashboard-summary"></section>
        <section class="activitywatch-chart-section">
          <div class="activitywatch-section-heading">
            <h3>Past 30 waking days</h3>
            <button class="settings-backup-btn activitywatch-refresh-btn" id="activitywatch-dashboard-refresh" type="button" data-settings-icon="reconnect">Refresh</button>
          </div>
          <div class="activitywatch-stacked-chart" id="activitywatch-stacked-chart"></div>
          <div class="activitywatch-chart-legend" id="activitywatch-chart-legend"></div>
        </section>
        <section class="activitywatch-selected-day" id="activitywatch-selected-day"></section>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  hydrateIconButtons(overlay);
  hydrateSettingsIconButtons(overlay);
  document.getElementById('activitywatch-dashboard-close')?.addEventListener('click', closeActivityWatchDashboard);
  document.getElementById('activitywatch-dashboard-refresh')?.addEventListener('click', () => {
    maybeSyncActivityWatchRecent('dashboard-manual', { force: true });
  });
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) closeActivityWatchDashboard();
  });
}

function renderActivityWatchDashboard() {
  const modal = document.getElementById('activitywatch-dashboard-modal');
  if (!modal || modal.classList.contains('hidden')) return;
  const days = getActivityWatchRecentDays(ACTIVITYWATCH_DASHBOARD_DAYS);
  if (!activityWatchDashboardSelectedDate || !days.some(day => day.date === activityWatchDashboardSelectedDate)) {
    activityWatchDashboardSelectedDate = activityWatchCurrentWakingDateStr();
  }

  renderActivityWatchDashboardStatus();
  renderActivityWatchDashboardSummary(days);
  renderActivityWatchStackedChart(days);
  renderActivityWatchSelectedDay(days.find(day => day.date === activityWatchDashboardSelectedDate) || days[days.length - 1]);
}

function renderActivityWatchDashboardStatus() {
  const root = document.getElementById('activitywatch-dashboard-status');
  const subtitle = document.getElementById('activitywatch-dashboard-subtitle');
  if (!root) return;
  const status = getActivityWatchStatus();
  const warnings = status.warnings || [];
  root.innerHTML = '';
  const row = el('div', 'activitywatch-status-row');
  const copy = el('div', 'activitywatch-status-copy');
  copy.appendChild(elText('strong', '', activityWatchStatusTitle(status)));
  copy.appendChild(elText('span', '', activityWatchStatusDetail(status)));
  row.appendChild(copy);
  const pill = elText('span', 'settings-status-pill', activityWatchStatusPill(status));
  pill.classList.toggle('is-muted', ['idle', 'syncing'].includes(status.code));
  pill.classList.toggle('is-backup-issue', activityWatchStatusIsIssue(status));
  row.appendChild(pill);
  root.appendChild(row);
  warnings.forEach(warning => root.appendChild(elText('div', 'activitywatch-warning', warning)));
  if (subtitle) {
    const source = activityWatchData.host
      ? `${activityWatchData.host}${activityWatchData.activityWatchVersion ? ` - ${activityWatchData.activityWatchVersion}` : ''}`
      : getActivityWatchServerUrl();
    subtitle.textContent = source;
  }
}

function renderActivityWatchDashboardSummary(days) {
  const root = document.getElementById('activitywatch-dashboard-summary');
  if (!root) return;
  root.innerHTML = '';
  const syncedDays = days.filter(day => day.totalActiveSeconds > 0);
  const total = syncedDays.reduce((sum, day) => sum + day.totalActiveSeconds, 0);
  const average = syncedDays.length ? total / syncedDays.length : 0;
  root.appendChild(buildActivityWatchSummaryCard('Total active', formatActivityWatchDuration(total), `${formatNumber(syncedDays.length)} days with data`));
  root.appendChild(buildActivityWatchSummaryCard('Daily average', formatActivityWatchDuration(average), 'Across days with data'));
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
  const maxSeconds = Math.max(1, ...days.map(day => day.totalActiveSeconds || 0));
  const categories = topActivityWatchCategories(days, 8);

  days.forEach(day => {
    const barButton = el('button', 'activitywatch-day-bar');
    barButton.type = 'button';
    barButton.classList.toggle('is-selected', day.date === activityWatchDashboardSelectedDate);
    barButton.title = `${formatEventDate(day.date)} - ${formatActivityWatchDuration(day.totalActiveSeconds)}`;
    barButton.addEventListener('click', () => {
      activityWatchDashboardSelectedDate = day.date;
      renderActivityWatchDashboard();
    });

    const stack = el('span', 'activitywatch-day-bar-stack');
    stack.style.height = `${Math.max(4, (day.totalActiveSeconds / maxSeconds) * 100)}%`;
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
    barButton.appendChild(elText('span', 'activitywatch-day-bar-label', shortActivityWatchDateLabel(day.date)));
    root.appendChild(barButton);
  });

  categories.forEach(category => {
    const item = el('div', 'activitywatch-legend-item');
    const swatch = el('span', 'activitywatch-legend-swatch');
    swatch.style.background = activityWatchCategoryColor(category);
    item.appendChild(swatch);
    item.appendChild(elText('span', '', category));
    legend.appendChild(item);
  });
}

function renderActivityWatchSelectedDay(day) {
  const root = document.getElementById('activitywatch-selected-day');
  if (!root || !day) return;
  root.innerHTML = '';
  const heading = el('div', 'activitywatch-section-heading');
  heading.appendChild(elText('h3', '', `${formatEventDate(day.date)} - ${formatActivityWatchDuration(day.totalActiveSeconds)}`));
  root.appendChild(heading);

  const categoryRows = Object.entries(day.categoryTotals || {})
    .sort((a, b) => b[1] - a[1]);
  if (!categoryRows.length) {
    root.appendChild(elText('div', 'activitywatch-empty', 'No ActivityWatch category data for this waking day.'));
    return;
  }

  const list = el('div', 'activitywatch-category-list');
  const max = Math.max(...categoryRows.map(([, seconds]) => seconds), 1);
  categoryRows.forEach(([category, seconds]) => {
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

function shortActivityWatchDateLabel(dateStr) {
  const date = dateFromStr(dateStr);
  return `${date.getMonth() + 1}/${date.getDate()}`;
}
