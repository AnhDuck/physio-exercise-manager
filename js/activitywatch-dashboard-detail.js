// ActivityWatch dashboard day/range detail panel.

function renderActivityWatchDetailPanel(days) {
  if (activityWatchDashboardState.viewMode === 'exposure') {
    renderActivityWatchExposureDetailPanel(days);
    return;
  }
  if (activityWatchDashboardState.viewMode === 'workload') {
    renderActivityWatchLoadDetailPanel(days);
    return;
  }
  if (activityWatchDashboardState.viewMode === 'work') {
    renderActivityWatchWorkDetailPanel(days);
    return;
  }
  renderActivityWatchBreakdownDetailPanel(days);
}

function renderActivityWatchBreakdownDetailPanel(days) {
  const root = document.getElementById('activitywatch-selected-day');
  if (!root) return;
  root.innerHTML = '';
  root.classList.remove('is-stacked-summary');
  const selectedItem = activityWatchDashboardSelectedItem(days);
  const selectedDays = activityWatchDashboardSelectedPeriodDays(days);
  const mode = activityWatchDashboardState.detailMode;
  const rows = mode === 'range'
    ? activityWatchAggregateCategoryRows(days)
    : activityWatchCategoryRowsForItem(selectedItem);
  const total = mode === 'range'
    ? activityWatchDashboardDataDays(days).reduce((sum, day) => sum + (day.totalActiveSeconds || 0), 0)
    : activityWatchBreakdownSelectedTotal(selectedItem);

  const heading = el('div', 'activitywatch-selected-heading');
  const copy = el('div', '');
  copy.appendChild(elText('h3', '', activityWatchDetailHeadingLabel(mode, selectedItem)));
  copy.appendChild(elText('span', 'activitywatch-selected-date', mode === 'range' ? activityWatchDateRangeLabel(days) : activityWatchDashboardItemLabel(selectedItem)));
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

  if (!rows.length) {
    root.appendChild(elText('div', 'activitywatch-empty', mode === 'range'
      ? 'No ActivityWatch category data for this range.'
      : selectedItem?.isWeekly
        ? 'No ActivityWatch category data for this week.'
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
  const labelId = 'activitywatch-detail-tabs-label';
  const label = elText('span', 'activitywatch-control-label activitywatch-detail-tabs-label', 'Details');
  label.id = labelId;
  wrap.appendChild(label);
  const toggle = el('div', 'activitywatch-detail-toggle');
  toggle.setAttribute('role', 'tablist');
  toggle.setAttribute('aria-labelledby', labelId);
  const selectedLabel = activityWatchDashboardState.chartGrain === 'weekly' ? 'Selected week' : 'Selected day';
  [
    ['day', selectedLabel],
    ['range', 'Visible range'],
  ].forEach(([mode, label]) => {
    const button = el('button', '');
    button.type = 'button';
    button.id = `activitywatch-detail-tab-${mode}`;
    button.setAttribute('role', 'tab');
    button.setAttribute('aria-selected', activityWatchDashboardState.detailMode === mode ? 'true' : 'false');
    button.setAttribute('aria-controls', 'activitywatch-selected-day');
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

function activityWatchCategoryRowsForItem(item) {
  return Object.entries(activityWatchDashboardCategoryTotals(item))
    .sort((a, b) => b[1] - a[1]);
}

function activityWatchBreakdownSelectedTotal(item) {
  if (!item) return 0;
  return item.totalActiveSeconds || 0;
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
  header.appendChild(elText('strong', '', overlayMode === 'tendon' ? WORKLOAD_TERMS.totalTendonLoad : 'Timed work split'));
  header.appendChild(elText('span', '', overlayMode === 'tendon'
    ? 'Computer active time + physical work estimate'
    : detailMode === 'range'
      ? 'Computer work + physical work estimate for the visible range'
      : 'Computer work + physical work estimate for the selected day'));
  summary.appendChild(header);

  const grid = el('div', 'activitywatch-overlay-metrics');
  grid.appendChild(buildActivityWatchOverlayMetric(WORKLOAD_TERMS.timedWorkTotal, totals.workloadTotalSeconds, WORKLOAD_TERM_HELP.timedWorkTotal));
  if (overlayMode === 'tendon') {
    grid.appendChild(buildActivityWatchOverlayMetric(WORKLOAD_TERMS.computerActiveTime, totals.activityWatchTotalSeconds, WORKLOAD_TERM_HELP.computerActiveTime));
  }
  grid.appendChild(buildActivityWatchOverlayMetric(WORKLOAD_TERMS.computerWork, totals.activityWatchWorkSeconds, WORKLOAD_TERM_HELP.computerWork));
  grid.appendChild(buildActivityWatchOverlayMetric(WORKLOAD_TERMS.physicalWorkEstimate, totals.manualResidualSeconds, WORKLOAD_TERM_HELP.physicalWorkEstimate));
  summary.appendChild(grid);

  if (totals.conflict) {
    summary.appendChild(elText('div', 'activitywatch-compact-warning activitywatch-overlay-conflict', 'Data conflict: computer work exceeds timed work total for at least one day shown.'));
  }
  return summary;
}

function buildActivityWatchOverlayMetric(label, seconds, help = '') {
  const metric = el('div', 'activitywatch-overlay-metric');
  if (help) metric.title = `${label}: ${help}`;
  metric.appendChild(elText('span', '', label));
  metric.appendChild(elText('strong', '', formatActivityWatchDuration(seconds)));
  return metric;
}

function activityWatchAggregateCategoryRows(days) {
  return activityWatchDashboardCategoryRows(days);
}

function renderActivityWatchExposureDetailPanel(days) {
  const root = document.getElementById('activitywatch-selected-day');
  if (!root) return;
  root.innerHTML = '';
  root.classList.add('is-stacked-summary');
  const rangeDays = activityWatchDashboardDataDays(days);
  const rangeTotals = activityWatchDashboardExposureTotals(rangeDays);

  buildActivityWatchRangePanel(
    root,
    'Visible range',
    activityWatchDateRangeLabel(days),
    [
      [WORKLOAD_TERMS.computerActiveTime, formatActivityWatchDuration(rangeTotals.totalActiveSeconds), 'featured'],
      [WORKLOAD_TERMS.computerWork, formatActivityWatchDuration(rangeTotals.computerWorkSeconds)],
      ['Work share', formatActivityWatchPercent(rangeTotals.computerWorkSeconds, rangeTotals.totalActiveSeconds)],
      ['Daily average', formatActivityWatchDuration(activityWatchDashboardAverageSeconds(rangeTotals.totalActiveSeconds, rangeDays.length))],
      ...activityWatchRangeExtremesRows(days, 'exposure'),
    ],
    rangeDays.length ? '' : 'No ActivityWatch data for this range.'
  );
}

function renderActivityWatchLoadDetailPanel(days) {
  const root = document.getElementById('activitywatch-selected-day');
  if (!root) return;
  root.innerHTML = '';
  root.classList.add('is-stacked-summary');
  renderActivityWatchLoadWorkDetailPanel(root, days, 'load');
}

function renderActivityWatchWorkDetailPanel(days) {
  const root = document.getElementById('activitywatch-selected-day');
  if (!root) return;
  root.innerHTML = '';
  root.classList.add('is-stacked-summary');
  renderActivityWatchLoadWorkDetailPanel(root, days, 'work');
}

function renderActivityWatchLoadWorkDetailPanel(root, days, mode) {
  const selectedItem = activityWatchDashboardSelectedItem(days);
  if (!selectedItem?.syncedDayCount) {
    buildActivityWatchRangePanel(
      root,
      activityWatchDetailHeadingLabel('day', selectedItem),
      selectedItem ? activityWatchDashboardItemLabel(selectedItem) : activityWatchDateRangeLabel(days),
      [],
      selectedItem?.isWeekly ? 'No ActivityWatch data for this week.' : 'No ActivityWatch data for this waking day.'
    );
    return;
  }

  const overlay = activityWatchDashboardOverlayForItem(selectedItem);
  const isWeekly = Boolean(selectedItem.isWeekly);
  const basis = mode === 'work' ? 'work' : 'total';
  const displayedSeconds = activityWatchDashboardWorkloadItemSeconds(selectedItem, basis);
  const headingTitle = isWeekly ? 'Selected week' : 'Selected day';
  const valueLabel = mode === 'work' ? 'Work' : WORKLOAD_TERMS.totalTendonLoad;
  const valueNote = mode === 'work'
    ? 'Computer work + physical work estimate'
    : 'Computer active time + physical work estimate';
  const averageSuffix = isWeekly ? ' avg/day' : '';

  root.appendChild(buildActivityWatchSummaryHeading(headingTitle, activityWatchDashboardItemLabel(selectedItem), displayedSeconds));
  root.appendChild(buildActivityWatchMetricList([
    [`${valueLabel}${averageSuffix}`, formatActivityWatchDuration(displayedSeconds), 'featured', valueNote],
    [`${WORKLOAD_TERMS.timedWorkTotal}${averageSuffix}`, formatActivityWatchDuration(overlay.workloadTotalSeconds)],
  ]));

  root.appendChild(buildActivityWatchSourceBreakdown(mode, overlay, displayedSeconds, averageSuffix));

  if (overlay.conflict) {
    root.appendChild(elText('div', 'activitywatch-compact-warning activitywatch-overlay-conflict', 'Data conflict: Computer Work exceeds Timed work total for this selection.'));
  }
}

function buildActivityWatchSourceBreakdown(mode, overlay, displayedSeconds, averageSuffix) {
  const total = Math.max(0, Number(displayedSeconds) || 0);
  const computerWork = Math.min(overlay.activityWatchWorkSeconds, overlay.activityWatchTotalSeconds);
  const otherComputer = Math.max(0, overlay.activityWatchTotalSeconds - computerWork);
  const rows = mode === 'work'
    ? [
        [WORKLOAD_TERMS.computerWork, computerWork, activityWatchDashboardCategoryColor('Work')],
        [WORKLOAD_TERMS.physicalWorkEstimate, overlay.manualResidualSeconds, 'rgba(121,214,189,.88)'],
      ]
    : [
        ['Other computer', otherComputer, 'rgba(99,179,255,.52)'],
        [WORKLOAD_TERMS.computerWork, computerWork, activityWatchDashboardCategoryColor('Work')],
        [WORKLOAD_TERMS.physicalWorkEstimate, overlay.manualResidualSeconds, 'rgba(121,214,189,.88)'],
      ];

  const section = el('section', 'activitywatch-source-breakdown');
  const heading = el('div', 'activitywatch-overlay-summary-header');
  heading.appendChild(elText('strong', '', mode === 'work' ? 'Work split' : 'Load sources'));
  heading.appendChild(elText('span', '', mode === 'work'
    ? 'Intentional work only'
    : 'What contributed to total tendon load'));
  section.appendChild(heading);

  const list = el('div', 'activitywatch-summary-list activitywatch-source-list');
  rows.forEach(([label, seconds, color]) => {
    const row = el('div', 'activitywatch-summary-row activitywatch-source-row');
    const labelWrap = el('span', 'activitywatch-source-label');
    const swatch = el('span', 'activitywatch-legend-swatch');
    swatch.style.background = color;
    labelWrap.appendChild(swatch);
    labelWrap.appendChild(elText('span', '', `${label}${averageSuffix}`));
    row.appendChild(labelWrap);
    const value = el('strong', '');
    value.appendChild(elText('span', '', formatActivityWatchDuration(seconds)));
    value.appendChild(elText('em', '', formatActivityWatchPercent(seconds, total)));
    row.appendChild(value);
    list.appendChild(row);
  });
  section.appendChild(list);
  return section;
}

function buildActivityWatchRangePanel(root, title, subtitle, rows, emptyMessage = '') {
  root.appendChild(buildActivityWatchSummaryHeading(title, subtitle, ''));
  if (rows?.length) root.appendChild(buildActivityWatchMetricList(rows));
  if (emptyMessage) root.appendChild(elText('div', 'activitywatch-empty', emptyMessage));
}

function buildActivityWatchSummaryHeading(title, subtitle, seconds) {
  const heading = el('div', 'activitywatch-selected-heading');
  const copy = el('div', '');
  copy.appendChild(elText('h3', '', title));
  copy.appendChild(elText('span', 'activitywatch-selected-date', subtitle || ''));
  heading.appendChild(copy);
  if (Number.isFinite(seconds)) {
    heading.appendChild(elText('strong', '', formatActivityWatchDuration(seconds)));
  }
  return heading;
}

function buildActivityWatchSummarySection(title, subtitle, seconds, rows, emptyMessage = '', extraContent = null) {
  const section = el('section', 'activitywatch-summary-card');
  section.appendChild(buildActivityWatchSummaryHeading(title, subtitle, seconds));
  if (rows?.length) section.appendChild(buildActivityWatchMetricList(rows));
  if (extraContent) section.appendChild(extraContent);
  if (emptyMessage) section.appendChild(elText('div', 'activitywatch-empty', emptyMessage));
  return section;
}

function buildActivityWatchMetricList(rows) {
  const list = el('div', 'activitywatch-summary-tile-grid');
  rows.forEach(([label, value, variant = '', note = '']) => {
    const row = el('div', 'activitywatch-summary-tile');
    row.classList.toggle('is-featured', variant === 'featured');
    row.classList.toggle('is-wide', variant === 'wide' || variant === 'featured');
    row.appendChild(elText('span', '', label));
    row.appendChild(elText('strong', '', value));
    if (note) row.appendChild(elText('em', '', note));
    list.appendChild(row);
  });
  return list;
}

function activityWatchDashboardExposureTotals(days) {
  const totals = {
    totalActiveSeconds: 0,
    computerWorkSeconds: 0,
  };
  (days || []).forEach(day => {
    totals.totalActiveSeconds += Math.max(0, Number(day?.totalActiveSeconds) || 0);
    totals.computerWorkSeconds += activityWatchDashboardOverlayForDay(day).activityWatchWorkSeconds;
  });
  return totals;
}

function activityWatchDashboardAverageSeconds(total, count) {
  return count ? total / count : 0;
}

function buildActivityWatchRangeExtremes(days, metric, labelPrefix = '') {
  const dataDays = activityWatchDashboardDataDays(days);
  const wrap = el('div', 'activitywatch-summary-list activitywatch-summary-extremes');
  if (!dataDays.length) return wrap;
  const scored = dataDays.map(day => ({
    day,
    seconds: metric === 'workload' || metric === 'work'
      ? activityWatchDashboardWorkloadPlottedSecondsForDay(day, metric === 'work' ? 'work' : 'total')
      : day.totalActiveSeconds || 0,
  }));
  const highest = scored.reduce((best, item) => item.seconds > best.seconds ? item : best, scored[0]);
  const lowest = scored.reduce((best, item) => item.seconds < best.seconds ? item : best, scored[0]);
  [
    ['Highest day', `${formatEventDate(highest.day.date)} · ${formatActivityWatchDuration(highest.seconds)}`],
    ['Lowest day', `${formatEventDate(lowest.day.date)} · ${formatActivityWatchDuration(lowest.seconds)}`],
  ].forEach(([label, value]) => {
    const row = el('div', 'activitywatch-summary-row');
    row.appendChild(elText('span', '', labelPrefix ? `${labelPrefix}${label.toLowerCase()}` : label));
    row.appendChild(elText('strong', '', value));
    wrap.appendChild(row);
  });
  return wrap;
}

function activityWatchRangeExtremesRows(days, metric) {
  const useWeekly = activityWatchDashboardState.chartGrain === 'weekly';
  const items = useWeekly
    ? activityWatchDashboardChartItems(days).filter(item => item.syncedDayCount > 0)
    : activityWatchDashboardDataDays(days);
  if (!items.length) return [];
  const scored = items.map(item => ({
    item,
    seconds: useWeekly
      ? activityWatchDashboardPlottedSeconds(item)
      : metric === 'workload'
        ? activityWatchDashboardWorkloadPlottedSecondsForDay(item, 'total')
        : metric === 'work'
          ? activityWatchDashboardWorkloadPlottedSecondsForDay(item, 'work')
        : item.totalActiveSeconds || 0,
  }));
  const highest = scored.reduce((best, item) => item.seconds > best.seconds ? item : best, scored[0]);
  const lowest = scored.reduce((best, item) => item.seconds < best.seconds ? item : best, scored[0]);
  const label = useWeekly ? 'week' : 'day';
  return [
    [`Highest ${label}`, `${activityWatchRangeExtremeLabel(highest.item)} - ${formatActivityWatchDuration(highest.seconds)}`, 'wide'],
    [`Lowest ${label}`, `${activityWatchRangeExtremeLabel(lowest.item)} - ${formatActivityWatchDuration(lowest.seconds)}`, 'wide'],
  ];
}

function activityWatchRangeExtremeLabel(item) {
  if (!item?.isWeekly) return formatEventDate(item?.date || '');
  return `${formatEventDate(item.startDate)} to ${formatEventDate(item.endDate)}`;
}

function activityWatchDetailHeadingLabel(mode, selectedItem) {
  if (mode === 'range') return 'Visible range';
  return selectedItem?.isWeekly ? 'Selected week' : 'Selected day';
}

