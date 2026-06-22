// ActivityWatch dashboard day/range detail panel.

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
  copy.appendChild(elText('h3', '', mode === 'range' ? 'Visible range' : 'Selected day'));
  copy.appendChild(elText('span', 'activitywatch-selected-date', mode === 'range' ? activityWatchDateRangeLabel(days) : formatEventDate(selectedDay?.date || '')));
  heading.appendChild(copy);
  heading.appendChild(elText('strong', '', formatActivityWatchDuration(total)));
  root.appendChild(heading);
  root.appendChild(buildActivityWatchDetailStats(days, mode, total));
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
  const overlayMode = activityWatchDashboardWorkloadOverlayMode();
  if (overlayMode) {
    root.appendChild(buildActivityWatchOverlaySummary(mode === 'range' ? days : [selectedDay], overlayMode, mode));
  }

  if (!rows.length) {
    root.appendChild(elText('div', 'activitywatch-empty', mode === 'range'
      ? 'No ActivityWatch category data for this range.'
      : 'No ActivityWatch category data for this waking day.'));
    return;
  }

  const rowsToShow = activityWatchDashboardState.showAllCategories
    ? rows
    : rows.slice(0, ACTIVITYWATCH_SELECTED_CATEGORY_LIMIT);
  const list = el('div', 'activitywatch-detail-list activitywatch-category-list');
  const max = Math.max(...rows.map(([, seconds]) => seconds), 1);
  rowsToShow.forEach(([category, seconds]) => {
    const row = el('button', 'activitywatch-detail-row activitywatch-category-row');
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

    const bar = el('div', 'activitywatch-detail-meter activitywatch-category-meter');
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
  const wrap = el('div', 'activitywatch-detail-scope-control');
  wrap.appendChild(elText('span', 'activitywatch-control-label', 'Details:'));
  const toggle = el('div', 'activitywatch-detail-toggle');
  [
    ['day', 'Selected day'],
    ['range', 'Visible range'],
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
  wrap.appendChild(toggle);
  return wrap;
}

function activityWatchCategoryRowsForDay(day) {
  return Object.entries(activityWatchDashboardCategoryTotals(day))
    .sort((a, b) => b[1] - a[1]);
}

function buildActivityWatchDetailStats(days, mode, total) {
  const activeDays = days.filter(day => day.totalActiveSeconds > 0);
  const average = activeDays.length ? days.reduce((sum, day) => sum + day.totalActiveSeconds, 0) / activeDays.length : 0;
  const stats = el('div', 'activitywatch-detail-stats');
  if (mode === 'range') {
    stats.appendChild(buildActivityWatchDetailStat('Total active', formatActivityWatchDuration(total)));
    stats.appendChild(buildActivityWatchDetailStat('Daily average', formatActivityWatchDuration(average)));
    stats.appendChild(buildActivityWatchDetailStat('Days with data', formatNumber(activeDays.length)));
  } else {
    stats.appendChild(buildActivityWatchDetailStat('Visible range', formatActivityWatchDuration(days.reduce((sum, day) => sum + day.totalActiveSeconds, 0))));
    stats.appendChild(buildActivityWatchDetailStat('Daily average', formatActivityWatchDuration(average)));
  }
  return stats;
}

function buildActivityWatchDetailStat(label, value) {
  const stat = el('div', 'activitywatch-detail-stat');
  stat.appendChild(elText('span', '', label));
  stat.appendChild(elText('strong', '', value));
  return stat;
}

function buildActivityWatchOverlaySummary(days, overlayMode, detailMode) {
  const summary = el('div', 'activitywatch-overlay-summary');
  const safeDays = (days || []).filter(Boolean);
  const totals = activityWatchDashboardOverlayTotals(safeDays);
  const header = el('div', 'activitywatch-overlay-summary-header');
  header.appendChild(elText('strong', '', overlayMode === 'tendon' ? 'Total tendon load' : 'Workload overlay'));
  header.appendChild(elText('span', '', overlayMode === 'tendon'
    ? 'Computer active time + manual estimate'
    : detailMode === 'range'
      ? 'Work group reconciliation for the visible range'
      : 'Work group reconciliation for the selected day'));
  summary.appendChild(header);

  const grid = el('div', 'activitywatch-overlay-metrics');
  grid.appendChild(buildActivityWatchOverlayMetric('Workload total', totals.workloadTotalSeconds));
  if (overlayMode === 'tendon') {
    grid.appendChild(buildActivityWatchOverlayMetric('Computer active time', totals.activityWatchTotalSeconds));
  }
  grid.appendChild(buildActivityWatchOverlayMetric('Computer Work', totals.activityWatchWorkSeconds));
  grid.appendChild(buildActivityWatchOverlayMetric('Manual / untracked estimate', totals.manualResidualSeconds));
  summary.appendChild(grid);

  if (totals.conflict) {
    summary.appendChild(elText('div', 'activitywatch-compact-warning activitywatch-overlay-conflict', 'Data conflict: ActivityWatch Work exceeds Workload total for at least one day shown.'));
  }
  return summary;
}

function buildActivityWatchOverlayMetric(label, seconds) {
  const metric = el('div', 'activitywatch-overlay-metric');
  metric.appendChild(elText('span', '', label));
  metric.appendChild(elText('strong', '', formatActivityWatchDuration(seconds)));
  return metric;
}

function activityWatchAggregateCategoryRows(days) {
  const totals = {};
  days.forEach(day => {
    Object.entries(activityWatchDashboardCategoryTotals(day)).forEach(([category, seconds]) => {
      totals[category] = (totals[category] || 0) + seconds;
    });
  });
  return Object.entries(totals)
    .sort((a, b) => b[1] - a[1]);
}

