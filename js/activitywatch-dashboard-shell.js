// ActivityWatch dashboard modal shell and render orchestration.

function openActivityWatchDashboard() {
  ensureActivityWatchDashboardShell();
  const modal = document.getElementById('activitywatch-dashboard-modal');
  if (!modal) return;
  const current = activityWatchCurrentWakingDateStr();
  if (!activityWatchDashboardState.rangeEndDate) {
    activityWatchDashboardState.rangeEndDate = current;
  }
  activityWatchDashboardState.chartScrollToEnd = true;
  modal.classList.remove('hidden');
  renderActivityWatchDashboard();
  maybeSyncActivityWatchRecent('dashboard-open');
}

function closeActivityWatchDashboard() {
  hideActivityWatchChartTooltip();
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
        <div class="activitywatch-dashboard-grid">
          <div class="activitywatch-dashboard-main">
            <section class="activitywatch-dashboard-controls" id="activitywatch-dashboard-controls"></section>
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
  activityWatchDashboardState.categoryMode = normalizeActivityWatchDashboardCategoryMode(activityWatchDashboardState.categoryMode);
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

