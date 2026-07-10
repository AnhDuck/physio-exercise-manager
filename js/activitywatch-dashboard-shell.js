// ActivityWatch dashboard modal shell and render orchestration.

const ACTIVITYWATCH_DASHBOARD_OPEN_SESSION_KEY = 'pem_activitywatch_dashboard_open';

function openActivityWatchDashboard() {
  ensureActivityWatchDashboardShell();
  const modal = document.getElementById('activitywatch-dashboard-modal');
  if (!modal) return;
  rememberActivityWatchDashboardOpen(true);
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
  if (typeof hideActivityWatchSelectedCallout === 'function') hideActivityWatchSelectedCallout();
  document.getElementById('activitywatch-dashboard-modal')?.classList.add('hidden');
  rememberActivityWatchDashboardOpen(false);
}

function restoreActivityWatchDashboardIfNeeded() {
  if (!activityWatchDashboardWasOpen()) return;
  openActivityWatchDashboard();
}

function rememberActivityWatchDashboardOpen(open) {
  try {
    if (open) {
      window.sessionStorage?.setItem(ACTIVITYWATCH_DASHBOARD_OPEN_SESSION_KEY, '1');
    } else {
      window.sessionStorage?.removeItem(ACTIVITYWATCH_DASHBOARD_OPEN_SESSION_KEY);
    }
  } catch (err) {
    // Session restore is a convenience only; storage-blocked browsers can ignore it.
  }
}

function activityWatchDashboardWasOpen() {
  try {
    return window.sessionStorage?.getItem(ACTIVITYWATCH_DASHBOARD_OPEN_SESSION_KEY) === '1';
  } catch (err) {
    return false;
  }
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
        </div>
        <div class="activitywatch-header-actions" id="activitywatch-header-actions">
          <button class="modal-close" id="activitywatch-dashboard-close" type="button" aria-label="Close ActivityWatch dashboard" title="Close" data-ui-icon="x"></button>
        </div>
      </div>
      <div class="modal-body activitywatch-dashboard-body">
        <div class="activitywatch-dashboard-view-tabs" id="activitywatch-dashboard-view-tabs"></div>
        <div class="activitywatch-dashboard-grid">
          <div class="activitywatch-dashboard-main">
            <section class="activitywatch-dashboard-controls" id="activitywatch-dashboard-controls"></section>
            <section class="activitywatch-chart-section">
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
  initializeActivityWatchDashboardRange();
  activityWatchDashboardState.rangeDays = normalizeActivityWatchDashboardRange(activityWatchDashboardState.rangeDays);
  activityWatchDashboardState.rangeEndDate = normalizeActivityWatchDashboardEndDate(activityWatchDashboardState.rangeEndDate);
  activityWatchDashboardState.viewMode = normalizeActivityWatchDashboardViewMode(activityWatchDashboardState.viewMode);
  activityWatchDashboardState.chartGrain = normalizeActivityWatchDashboardChartGrain(activityWatchDashboardState.chartGrain);
  activityWatchDashboardState.workloadBasis = activityWatchDashboardLoadBasisForMode(activityWatchDashboardState.viewMode);
  activityWatchDashboardState.categoryMode = normalizeActivityWatchDashboardCategoryMode(activityWatchDashboardState.categoryMode);
  activityWatchDashboardState.workloadOverlayMode = activityWatchDashboardWorkloadOverlayMode();
  if (activityWatchDashboardState.viewMode !== 'breakdown') {
    activityWatchDashboardState.selectedCategory = '';
    activityWatchDashboardState.hoveredCategory = '';
    activityWatchDashboardState.showAllCategories = false;
  }
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

