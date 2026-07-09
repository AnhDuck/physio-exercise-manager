// ActivityWatch dashboard stacked chart and tooltip behavior.

function renderActivityWatchStackedChart(days) {
  const root = document.getElementById('activitywatch-stacked-chart');
  if (!root) return;
  hideActivityWatchChartTooltip();
  hideActivityWatchSelectedCallout();
  rememberActivityWatchChartScroll(root);
  const items = activityWatchDashboardChartItems(days);
  const scrollKey = activityWatchChartScrollKey(items);
  const shouldRestoreScroll = activityWatchDashboardState.chartScrollKey === scrollKey
    && Number.isFinite(activityWatchDashboardState.chartScrollLeft)
    && !activityWatchDashboardState.chartScrollToEnd;
  root.innerHTML = '';
  root.classList.toggle('is-wide-range', items.length > 45);
  root.classList.toggle('is-dense-range', items.length > 30);
  root.classList.toggle('is-weekly-grain', activityWatchDashboardState.chartGrain === 'weekly');
  root.classList.toggle('is-filtered', activityWatchDashboardState.viewMode === 'breakdown' && Boolean(activityWatchDashboardState.selectedCategory));
  root.classList.toggle('is-workload-overlay', activityWatchDashboardState.viewMode === 'workload' || activityWatchDashboardState.viewMode === 'work');
  root.classList.toggle('has-selected-callout', activityWatchDashboardUsesSelectedCallout());
  root.dataset.awViewMode = activityWatchDashboardState.viewMode;
  root.dataset.awChartGrain = activityWatchDashboardState.chartGrain;
  root.dataset.awScrollKey = scrollKey;

  const rollingAveragePoints = activityWatchDashboardRollingAveragePoints(days);
  const maxSeconds = Math.max(
    0,
    ...items.map(item => activityWatchDashboardPlottedSeconds(item)),
    ...rollingAveragePoints.map(point => point.averageSeconds || 0)
  );
  const axis = activityWatchHourAxis(maxSeconds);

  const scale = el('div', 'activitywatch-chart-scale');
  scale.style.setProperty('--activitywatch-tick-count', axis.ticks.length);
  scale.style.gridTemplateRows = `repeat(${Math.max(1, axis.ticks.length - 1)}, minmax(0, 1fr))`;
  axis.ticks.slice().reverse().forEach(tick => {
    scale.appendChild(elText('span', '', activityWatchFormatHourTick(tick)));
  });
  root.appendChild(scale);

  const plot = el('div', 'activitywatch-chart-plot');
  plot.style.setProperty('--activitywatch-day-count', items.length);
  plot.style.setProperty('--activitywatch-grid-step', `${100 / Math.max(1, axis.ticks.length - 1)}%`);

  const content = el('div', 'activitywatch-chart-content');
  content.style.setProperty('--activitywatch-day-count', items.length);
  const bars = el('div', 'activitywatch-bars-row');
  const axisLabels = activityWatchDashboardXAxisLabels(items);
  let selectedCalloutData = null;
  items.forEach((item, index) => {
    const methodologyChanges = activityWatchDashboardMethodologyChangesForItem(item);
    const barButton = el('button', 'activitywatch-day-bar');
    barButton.type = 'button';
    barButton.dataset.awDate = item.date;
    barButton.classList.toggle('has-methodology-change', Boolean(methodologyChanges.length));
    barButton.classList.toggle('is-selected', activityWatchDashboardItemContainsDate(item, activityWatchDashboardState.selectedDate));
    barButton.classList.toggle('has-no-data', !item.syncedDayCount);
    barButton.setAttribute('aria-label', activityWatchDashboardBarAriaLabel(item, methodologyChanges));
    barButton.addEventListener('click', () => {
      activityWatchDashboardState.selectedDate = item.date;
      activityWatchDashboardState.selectedCalloutDate = item.date;
      activityWatchDashboardState.detailMode = 'day';
      activityWatchDashboardState.showAllCategories = false;
      activityWatchDashboardState.hoveredCategory = '';
      renderActivityWatchDashboard();
    });
    if (methodologyChanges.length) {
      addActivityWatchMethodologyFocusHandlers(barButton, methodologyChanges);
    }

    const plottedSeconds = activityWatchDashboardPlottedSeconds(item);
    barButton.classList.toggle('has-workload-conflict', Boolean(item.overlay?.conflict || item.overlayTotals?.conflict));
    const stackWrap = el('span', 'activitywatch-day-bar-stack-wrap');
    const stackHeight = plottedSeconds
      ? `${Math.max(3, Math.min(100, (plottedSeconds / axis.maxSeconds) * 100))}%`
      : '4px';
    if (activityWatchDashboardUsesSelectedCallout() && item.date === activityWatchDashboardState.selectedCalloutDate) {
      selectedCalloutData = { item, index };
    }
    stackWrap.style.setProperty('--activitywatch-stack-height', stackHeight);
    const stack = el('span', 'activitywatch-day-bar-stack');
    stack.style.height = stackHeight;
    const stackTotal = Math.max(1, plottedSeconds || 0);
    activityWatchDashboardChartSegments(item, items).forEach(segmentData => {
      if (!segmentData.seconds) return;
      const segment = el('span', `activitywatch-day-bar-segment ${segmentData.className || ''}`);
      if (segmentData.category) segment.dataset.awCategory = segmentData.category;
      segment.style.height = `${Math.max(2, (segmentData.seconds / stackTotal) * 100)}%`;
      segment.style.background = segmentData.color;
      segment.setAttribute('aria-label', `${segmentData.label}: ${formatActivityWatchDuration(segmentData.seconds)}`);
      addActivityWatchDashboardSegmentTooltipHandlers(segment, segmentData);
      stack.appendChild(segment);
    });
    if (!plottedSeconds) {
      const empty = el('span', 'activitywatch-day-bar-empty');
      stack.appendChild(empty);
    }
    stackWrap.appendChild(stack);
    barButton.appendChild(stackWrap);
    if (methodologyChanges.length) {
      barButton.appendChild(buildActivityWatchMethodologyMarker(methodologyChanges));
    }
    const axisLabel = axisLabels.get(item.date) || null;
    const label = buildActivityWatchAxisLabel(axisLabel);
    barButton.appendChild(label);
    bars.appendChild(barButton);
  });
  content.appendChild(bars);
  plot.appendChild(content);
  root.appendChild(plot);
  const footerLegend = buildActivityWatchChartFooterLegend(days);
  root.classList.toggle('has-footer-legend', Boolean(footerLegend));
  if (footerLegend) root.appendChild(footerLegend);
  appendActivityWatchRollingAverage(content, rollingAveragePoints, axis);
  bindActivityWatchChartWheelScroll(plot);
  requestAnimationFrame(() => {
    if (shouldRestoreScroll) {
      plot.scrollLeft = activityWatchDashboardState.chartScrollLeft;
    } else if (items.length > 45) {
      plot.scrollLeft = plot.scrollWidth;
    }
    activityWatchDashboardState.chartScrollKey = scrollKey;
    activityWatchDashboardState.chartScrollLeft = plot.scrollLeft;
    activityWatchDashboardState.chartScrollToEnd = false;
    renderActivityWatchSelectedFloatingCallout(root, selectedCalloutData);
  });
}

function buildActivityWatchChartFooterLegend(days) {
  const legend = el('div', 'activitywatch-chart-footer-legend');
  const sources = buildActivityWatchChartSourceLegend();
  if (sources) legend.appendChild(sources);
  if (activityWatchDashboardUsesRollingAverage()) {
    legend.appendChild(buildActivityWatchRollingAverageLegend());
  }
  const methodology = buildActivityWatchMethodologyLegend(days);
  if (methodology) legend.appendChild(methodology);
  return legend.childElementCount ? legend : null;
}

function buildActivityWatchChartSourceLegend() {
  let items = [];
  if (activityWatchDashboardState.viewMode === 'workload') {
    items = [
      ['Other computer', 'rgba(99,179,255,.62)'],
      [WORKLOAD_TERMS.computerWork, activityWatchDashboardCategoryColor('Work')],
      [WORKLOAD_TERMS.physicalWorkEstimate, 'rgba(121,214,189,.88)'],
    ];
  } else if (activityWatchDashboardState.viewMode === 'work') {
    items = [
      [WORKLOAD_TERMS.computerWork, activityWatchDashboardCategoryColor('Work')],
      [WORKLOAD_TERMS.physicalWorkEstimate, 'rgba(121,214,189,.88)'],
    ];
  }
  if (!items.length) return null;
  const legend = el('span', 'activitywatch-source-legend');
  items.forEach(([label, color]) => {
    const item = el('span', 'activitywatch-source-legend-item');
    const swatch = el('span', 'activitywatch-legend-swatch');
    swatch.style.background = color;
    item.appendChild(swatch);
    item.appendChild(elText('span', '', label));
    legend.appendChild(item);
  });
  return legend;
}

function activityWatchChartScrollKey(days) {
  if (!days.length) return 'empty';
  return `${days.length}:${days[0].date}:${days[days.length - 1].date}`;
}

function rememberActivityWatchChartScroll(root) {
  const plot = root.querySelector('.activitywatch-chart-plot');
  if (!plot) return;
  activityWatchDashboardState.chartScrollLeft = plot.scrollLeft;
}

function bindActivityWatchChartWheelScroll(plot) {
  plot.addEventListener('scroll', () => {
    activityWatchDashboardState.chartScrollLeft = plot.scrollLeft;
    positionActivityWatchSelectedCallout();
  }, { passive: true });

  plot.addEventListener('wheel', (event) => {
    if (plot.scrollWidth <= plot.clientWidth) return;
    const rawDelta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : -event.deltaY;
    const delta = activityWatchWheelDeltaPixels(rawDelta, event.deltaMode, plot.clientWidth);
    if (!delta) return;
    const nextScrollLeft = Math.max(0, Math.min(plot.scrollWidth - plot.clientWidth, plot.scrollLeft + delta));
    if (nextScrollLeft === plot.scrollLeft) return;
    event.preventDefault();
    plot.scrollLeft = nextScrollLeft;
    activityWatchDashboardState.chartScrollLeft = nextScrollLeft;
  }, { passive: false });
}

function activityWatchWheelDeltaPixels(delta, deltaMode, pageSize) {
  if (deltaMode === 1) return delta * 16;
  if (deltaMode === 2) return delta * pageSize;
  return delta;
}

function addActivityWatchBarSegmentTooltipHandlers(segment, category, seconds) {
  addActivityWatchCategoryPreviewHandlers(segment, category);
  segment.addEventListener('pointerenter', (event) => {
    showActivityWatchChartTooltip(event, category, seconds);
  });
  segment.addEventListener('pointermove', (event) => {
    positionActivityWatchChartTooltip(event);
  });
  segment.addEventListener('pointerleave', hideActivityWatchChartTooltip);
  segment.addEventListener('pointercancel', hideActivityWatchChartTooltip);
}

function addActivityWatchDashboardSegmentTooltipHandlers(segment, segmentData) {
  if (segmentData.category && activityWatchDashboardState.viewMode === 'breakdown') {
    addActivityWatchCategoryPreviewHandlers(segment, segmentData.category);
  }
  segment.addEventListener('pointerenter', (event) => {
    showActivityWatchChartTooltip(event, segmentData.label, segmentData.seconds);
  });
  segment.addEventListener('pointermove', positionActivityWatchChartTooltip);
  segment.addEventListener('pointerleave', hideActivityWatchChartTooltip);
  segment.addEventListener('pointercancel', hideActivityWatchChartTooltip);
}

function activityWatchDashboardBarAriaLabel(item, methodologyChanges) {
  const base = `${activityWatchDashboardItemLabel(item)} - ${formatActivityWatchDuration(activityWatchDashboardPlottedSeconds(item))}`;
  const dataNote = item.syncedDayCount ? '' : '. No ActivityWatch data';
  const methodology = methodologyChanges.length
    ? `. ${methodologyChanges.map(activityWatchMethodologyTooltip).join(' ')}`
    : '';
  return `${base}${dataNote}${methodology}`;
}

function activityWatchDashboardUsesSelectedCallout() {
  return false;
}

function buildActivityWatchSelectedCallout(item) {
  const card = el('span', `activitywatch-selected-callout is-${activityWatchDashboardState.viewMode}`);
  card.setAttribute('aria-hidden', 'true');
  card.appendChild(elText('span', 'activitywatch-selected-callout-date', activityWatchDashboardItemLabel(item)));

  const main = activityWatchSelectedCalloutMain(item);
  const value = el('span', 'activitywatch-selected-callout-main');
  value.appendChild(el('span', 'activitywatch-selected-callout-dot'));
  value.appendChild(elText('strong', '', main.value));
  value.appendChild(elText('span', '', main.label));
  card.appendChild(value);
  return card;
}

function activityWatchSelectedCalloutMain(item) {
  if (!item?.syncedDayCount) {
    return {
      label: 'No data',
      value: '0m',
    };
  }
  if (activityWatchDashboardState.viewMode === 'workload') {
    return {
      label: item.isWeekly
        ? `${WORKLOAD_TERMS.totalTendonLoad} avg/day`
        : WORKLOAD_TERMS.totalTendonLoad,
      value: formatActivityWatchDuration(activityWatchDashboardWorkloadItemSeconds(item, 'total')),
    };
  }
  if (activityWatchDashboardState.viewMode === 'work') {
    return {
      label: item.isWeekly ? 'Work avg/day' : 'Work',
      value: formatActivityWatchDuration(activityWatchDashboardWorkloadItemSeconds(item, 'work')),
    };
  }
  return {
    label: item.isWeekly ? `${WORKLOAD_TERMS.computerActiveTime} avg/day` : WORKLOAD_TERMS.computerActiveTime,
    value: formatActivityWatchDuration(item.totalActiveSeconds || 0),
  };
}

function activityWatchSelectedCalloutRows(item) {
  if (!item?.syncedDayCount) return [];
  return activityWatchSelectedExposureCalloutRows(item);
}

function activityWatchSelectedExposureCalloutRows(item) {
  const overlay = activityWatchDashboardOverlayForItem(item);
  const workColor = activityWatchDashboardCategoryColor('Work');
  const totalActiveSeconds = Math.max(0, Number(item?.totalActiveSeconds) || 0);
  if (!item.isWeekly) {
    return [
      activityWatchSelectedMeterCalloutRow(WORKLOAD_TERMS.computerWork, overlay.activityWatchWorkSeconds, totalActiveSeconds, workColor),
    ];
  }
  const totals = item.overlayTotals || activityWatchDashboardOverlayTotals(item.dataDays || []);
  const weeklyTotal = Math.max(0, Number(item.weeklyTotalActiveSeconds) || 0);
  return [
    activityWatchSelectedPlainCalloutRow('Weekly total', formatActivityWatchDuration(weeklyTotal)),
    activityWatchSelectedMeterCalloutRow(WORKLOAD_TERMS.computerWork, totals.activityWatchWorkSeconds, weeklyTotal, workColor),
  ];
}

function activityWatchSelectedPlainCalloutRow(label, value) {
  return { label, value };
}

function activityWatchSelectedMeterCalloutRow(label, seconds, totalSeconds, color) {
  const safeSeconds = Math.max(0, Number(seconds) || 0);
  const safeTotal = Math.max(0, Number(totalSeconds) || 0);
  return {
    label,
    value: formatActivityWatchDuration(safeSeconds),
    percent: formatActivityWatchPercent(safeSeconds, safeTotal),
    meterPercent: activityWatchCalloutMeterPercent(safeSeconds, safeTotal),
    color,
  };
}

function activityWatchCalloutMeterPercent(seconds, totalSeconds) {
  const safeSeconds = Math.max(0, Number(seconds) || 0);
  const safeTotal = Math.max(0, Number(totalSeconds) || 0);
  if (!safeSeconds || !safeTotal) return 0;
  return Math.max(2, Math.min(100, (safeSeconds / safeTotal) * 100));
}

function ensureActivityWatchSelectedCalloutRoot() {
  let root = document.getElementById('activitywatch-selected-callout-root');
  if (root) return root;
  root = el('div', 'activitywatch-selected-callout-root');
  root.id = 'activitywatch-selected-callout-root';
  document.body.appendChild(root);
  return root;
}

function renderActivityWatchSelectedFloatingCallout(chartRoot, selectedCalloutData) {
  if (!activityWatchDashboardUsesSelectedCallout() || !selectedCalloutData?.item) {
    hideActivityWatchSelectedCallout();
    return;
  }
  const root = ensureActivityWatchSelectedCalloutRoot();
  root.textContent = '';
  const card = buildActivityWatchSelectedCallout(selectedCalloutData.item);
  card.classList.add('is-floating');
  root.appendChild(card);
  positionActivityWatchSelectedCallout(chartRoot);
}

function positionActivityWatchSelectedCallout(chartRoot = document.getElementById('activitywatch-stacked-chart')) {
  const card = document.querySelector('#activitywatch-selected-callout-root .activitywatch-selected-callout');
  if (!card || !chartRoot) return;
  const selected = chartRoot.querySelector('.activitywatch-day-bar.is-selected');
  const stack = selected?.querySelector('.activitywatch-day-bar-stack');
  if (!stack) {
    hideActivityWatchSelectedCallout();
    return;
  }
  const stackRect = stack.getBoundingClientRect();
  const cardRect = card.getBoundingClientRect();
  const margin = 8;
  const halfWidth = cardRect.width / 2;
  const centeredLeft = stackRect.left + (stackRect.width / 2);
  const clampedLeft = Math.max(margin + halfWidth, Math.min(window.innerWidth - margin - halfWidth, centeredLeft));
  card.style.left = `${clampedLeft}px`;
  card.style.setProperty('--activitywatch-callout-anchor-offset', `${centeredLeft - clampedLeft}px`);
  card.style.top = `${stackRect.top - cardRect.height - 30}px`;
}

function hideActivityWatchSelectedCallout() {
  const root = document.getElementById('activitywatch-selected-callout-root');
  if (!root) return;
  root.textContent = '';
}

function addActivityWatchOverlaySegmentTooltipHandlers(segment, segmentData) {
  if (segmentData.category) {
    addActivityWatchCategoryPreviewHandlers(segment, segmentData.category);
  }
  segment.addEventListener('pointerenter', (event) => {
    showActivityWatchChartTooltip(event, segmentData.label, segmentData.seconds);
  });
  segment.addEventListener('pointermove', (event) => {
    positionActivityWatchChartTooltip(event);
  });
  segment.addEventListener('pointerleave', hideActivityWatchChartTooltip);
  segment.addEventListener('pointercancel', hideActivityWatchChartTooltip);
}

function buildActivityWatchMethodologyMarker(changes) {
  const marker = el('span', 'activitywatch-methodology-marker');
  marker.setAttribute('aria-hidden', 'true');
  return marker;
}

function buildActivityWatchAxisLabel(labelData) {
  const label = el('span', 'activitywatch-day-bar-label');
  label.classList.toggle('has-label', Boolean(labelData));
  if (!labelData) return label;
  label.appendChild(elText('span', 'activitywatch-day-label-number', labelData.day || ''));
  if (labelData.month) {
    label.appendChild(elText('span', 'activitywatch-day-label-month', labelData.month));
  }
  return label;
}

function addActivityWatchMethodologyFocusHandlers(barButton, changes) {
  const tooltip = (Array.isArray(changes) ? changes : [changes]).filter(Boolean).map(activityWatchMethodologyTooltip).join(' ');
  barButton.addEventListener('pointerenter', (event) => {
    showActivityWatchChartTooltipText(event, tooltip, true);
  });
  barButton.addEventListener('pointermove', positionActivityWatchChartTooltip);
  barButton.addEventListener('pointerleave', hideActivityWatchChartTooltip);
  barButton.addEventListener('pointercancel', hideActivityWatchChartTooltip);
  barButton.addEventListener('focus', () => {
    const rect = barButton.getBoundingClientRect();
    showActivityWatchChartTooltipText({
      clientX: rect.left + (rect.width / 2),
      clientY: rect.top + 8,
    }, tooltip, true);
  });
  barButton.addEventListener('blur', hideActivityWatchChartTooltip);
}

function ensureActivityWatchChartTooltip() {
  let tooltip = document.getElementById('activitywatch-chart-tooltip');
  if (tooltip) return tooltip;
  tooltip = el('div', 'activitywatch-chart-tooltip');
  tooltip.id = 'activitywatch-chart-tooltip';
  tooltip.setAttribute('role', 'tooltip');
  tooltip.hidden = true;
  document.body.appendChild(tooltip);
  return tooltip;
}

function showActivityWatchChartTooltip(event, category, seconds) {
  showActivityWatchChartTooltipText(event, `${category}: ${formatActivityWatchDuration(seconds)}`, false);
}

function showActivityWatchChartTooltipText(event, text, allowWrap = false) {
  const tooltip = ensureActivityWatchChartTooltip();
  tooltip.textContent = text;
  tooltip.classList.remove('is-average-tooltip');
  tooltip.classList.toggle('allows-wrap', allowWrap);
  tooltip.hidden = false;
  tooltip.classList.add('is-visible');
  positionActivityWatchChartTooltip(event);
}

function showActivityWatchAverageTooltip(event, point, metricLabel) {
  const tooltip = ensureActivityWatchChartTooltip();
  tooltip.textContent = '';
  tooltip.classList.add('is-average-tooltip', 'allows-wrap');
  tooltip.appendChild(elText('span', 'activitywatch-chart-tooltip-date', formatEventDate(point.date)));
  tooltip.appendChild(elText('span', 'activitywatch-chart-tooltip-value', formatActivityWatchDuration(point.averageSeconds)));
  tooltip.appendChild(elText('span', 'activitywatch-chart-tooltip-label', '7-day average'));
  tooltip.hidden = false;
  tooltip.classList.add('is-visible');
  positionActivityWatchChartTooltip(event);
}

function positionActivityWatchChartTooltip(event) {
  const tooltip = document.getElementById('activitywatch-chart-tooltip');
  if (!tooltip || tooltip.hidden) return;
  const offset = 12;
  const margin = 8;
  const rect = tooltip.getBoundingClientRect();
  let left = event.clientX + offset;
  let top = event.clientY + offset;
  if (left + rect.width > window.innerWidth - margin) {
    left = event.clientX - rect.width - offset;
  }
  if (top + rect.height > window.innerHeight - margin) {
    top = event.clientY - rect.height - offset;
  }
  tooltip.style.left = `${Math.max(margin, left)}px`;
  tooltip.style.top = `${Math.max(margin, top)}px`;
}

function hideActivityWatchChartTooltip() {
  const tooltip = document.getElementById('activitywatch-chart-tooltip');
  if (!tooltip) return;
  tooltip.classList.remove('is-visible');
  tooltip.hidden = true;
}

function setActivityWatchAverageDotActive(dot, active) {
  dot.classList.toggle('is-active', Boolean(active));
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
  return activityWatchDashboardCategoryTotal(day, category);
}

function activityWatchDashboardOverlayPlottedSeconds(day, mode) {
  const overlay = activityWatchDashboardOverlayForDay(day);
  if (mode === 'tendon') {
    return overlay.activityWatchTotalSeconds + overlay.manualResidualSeconds;
  }
  if (mode === 'work') {
    return overlay.activityWatchWorkSeconds + overlay.manualResidualSeconds;
  }
  return 0;
}

function activityWatchDashboardOverlaySegments(day, mode) {
  const overlay = activityWatchDashboardOverlayForDay(day);
  if (mode === 'tendon') {
    return [
      {
        label: WORKLOAD_TERMS.computerActiveTime,
        seconds: overlay.activityWatchTotalSeconds,
        color: 'rgba(99,179,255,.88)',
        className: 'is-computer-total',
        category: '',
      },
      {
        label: WORKLOAD_TERMS.physicalWorkEstimate,
        seconds: overlay.manualResidualSeconds,
        color: 'rgba(121,214,189,.88)',
        className: 'is-manual-estimate',
        category: '',
      },
    ];
  }
  return [
    {
      label: WORKLOAD_TERMS.computerWork,
      seconds: overlay.activityWatchWorkSeconds,
      color: activityWatchDashboardCategoryColor('Work'),
      className: 'is-computer-work',
      category: 'Work',
    },
    {
      label: WORKLOAD_TERMS.physicalWorkEstimate,
      seconds: overlay.manualResidualSeconds,
      color: 'rgba(121,214,189,.88)',
      className: 'is-manual-estimate',
      category: '',
    },
  ];
}

function activityWatchDashboardOtherSeconds(day, topCategories) {
  const shown = topCategories.reduce((sum, category) => sum + activityWatchDashboardCategoryTotal(day, category), 0);
  return Math.max(0, (day.totalActiveSeconds || 0) - shown);
}

function activityWatchDashboardPlottedSeconds(item) {
  if (!item?.syncedDayCount) return 0;
  if (activityWatchDashboardState.viewMode === 'workload') {
    return activityWatchDashboardWorkloadItemSeconds(item, 'total');
  }
  if (activityWatchDashboardState.viewMode === 'work') {
    return activityWatchDashboardWorkloadItemSeconds(item, 'work');
  }
  if (activityWatchDashboardState.viewMode === 'breakdown' && activityWatchDashboardState.selectedCategory) {
    return activityWatchDashboardCategoryTotal(item, activityWatchDashboardState.selectedCategory);
  }
  return Math.max(0, Number(item?.totalActiveSeconds) || 0);
}

function activityWatchDashboardWorkloadItemSeconds(item, basis) {
  const overlay = activityWatchDashboardOverlayForItem(item);
  if (normalizeActivityWatchDashboardWorkloadBasis(basis) === 'work') {
    return activityWatchDashboardWorkOnlyLoadSecondsForOverlay(overlay);
  }
  return activityWatchDashboardTotalLoadSecondsForOverlay(overlay);
}

function activityWatchDashboardOverlayForItem(item) {
  if (item?.isWeekly) {
    const divisor = Math.max(1, item.syncedDayCount || 0);
    const totals = item.overlayTotals || activityWatchDashboardOverlayTotals(item.dataDays || []);
    return {
      workloadTotalSeconds: Math.round(totals.workloadTotalSeconds / divisor),
      activityWatchWorkSeconds: Math.round(totals.activityWatchWorkSeconds / divisor),
      activityWatchTotalSeconds: Math.round(totals.activityWatchTotalSeconds / divisor),
      manualResidualSeconds: Math.round(totals.manualResidualSeconds / divisor),
      conflict: Boolean(totals.conflict),
    };
  }
  return activityWatchDashboardOverlayForDay(item);
}

function activityWatchDashboardChartSegments(item, items) {
  if (!item?.syncedDayCount) return [];
  if (activityWatchDashboardState.viewMode === 'workload') {
    return activityWatchDashboardLoadSegments(item);
  }
  if (activityWatchDashboardState.viewMode === 'work') {
    return activityWatchDashboardWorkSegments(item);
  }
  if (activityWatchDashboardState.viewMode === 'exposure') {
    return activityWatchDashboardExposureSegments(item);
  }
  const chartCategories = activityWatchDashboardChartCategories(items);
  return chartCategories.map(category => {
    const seconds = activityWatchDashboardCategorySeconds(item, category, chartCategories);
    return {
      label: category,
      seconds,
      color: activityWatchDashboardCategoryColor(category),
      className: '',
      category,
    };
  });
}

function activityWatchDashboardExposureSegments(item) {
  return [
    {
      label: WORKLOAD_TERMS.computerActiveTime,
      seconds: Math.max(0, Number(item.totalActiveSeconds) || 0),
      color: 'rgba(99,179,255,.78)',
      className: 'activitywatch-exposure-total-segment',
    },
  ];
}

function activityWatchDashboardLoadSegments(item) {
  const overlay = activityWatchDashboardOverlayForItem(item);
  const computerWork = Math.min(overlay.activityWatchWorkSeconds, overlay.activityWatchTotalSeconds);
  const otherComputer = Math.max(0, overlay.activityWatchTotalSeconds - computerWork);
  return [
    {
      label: 'Other computer',
      seconds: otherComputer,
      color: 'rgba(99,179,255,.62)',
      className: 'activitywatch-overlay-segment is-other-computer',
    },
    {
      label: WORKLOAD_TERMS.computerWork,
      seconds: computerWork,
      color: activityWatchDashboardCategoryColor('Work'),
      className: 'activitywatch-overlay-segment is-computer-work',
    },
    {
      label: WORKLOAD_TERMS.physicalWorkEstimate,
      seconds: overlay.manualResidualSeconds,
      color: 'rgba(121,214,189,.88)',
      className: 'activitywatch-overlay-segment is-manual-estimate',
    },
  ];
}

function activityWatchDashboardWorkSegments(item) {
  const overlay = activityWatchDashboardOverlayForItem(item);
  const computerWork = Math.min(overlay.activityWatchWorkSeconds, overlay.activityWatchTotalSeconds);
  return [
    {
      label: WORKLOAD_TERMS.computerWork,
      seconds: computerWork,
      color: activityWatchDashboardCategoryColor('Work'),
      className: 'activitywatch-overlay-segment is-computer-work',
    },
    {
      label: WORKLOAD_TERMS.physicalWorkEstimate,
      seconds: overlay.manualResidualSeconds,
      color: 'rgba(121,214,189,.88)',
      className: 'activitywatch-overlay-segment is-manual-estimate',
      detail: 'Timed work total minus Computer Work, never below zero.',
    },
  ];
}

function activityWatchDashboardMethodologyChangesForItem(item) {
  const dates = item?.isWeekly
    ? (item.sourceDays || []).map(day => day.date)
    : [item?.date || ''];
  return getActivityWatchMethodologyChangesForDates(dates);
}

function activityWatchDashboardItemLabel(item) {
  if (!item) return '';
  if (!item.isWeekly) return formatEventDate(item.date);
  return `${formatEventDate(item.startDate)} to ${formatEventDate(item.endDate)}`;
}

function activityWatchDashboardXAxisLabels(items) {
  if (activityWatchDashboardState.chartGrain !== 'weekly') return activityWatchXAxisLabels(items);
  const labels = new Map();
  items.forEach((item, index) => {
    const start = dateFromStr(item.startDate);
    labels.set(item.date, activityWatchAxisDateParts(start, index > 0 ? dateFromStr(items[index - 1].startDate) : null, true));
  });
  return labels;
}

function appendActivityWatchRollingAverage(plot, points, axis) {
  if (!points.length) return;
  const usable = points
    .map((point, index) => ({ ...point, index }))
    .filter(point => point.syncedDayCount > 0);
  if (!usable.length) return;
  const bars = Array.from(plot.querySelectorAll('.activitywatch-day-bar'));
  const barsRow = plot.querySelector('.activitywatch-bars-row');
  const overlayWidth = barsRow?.offsetWidth || plot.clientWidth || plot.offsetWidth || 1;
  if (!bars.length || !overlayWidth) return;
  const overlay = el('div', 'activitywatch-average-overlay');
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', `0 0 ${overlayWidth} 100`);
  svg.setAttribute('preserveAspectRatio', 'none');
  svg.setAttribute('aria-hidden', 'true');
  const polyline = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
  const max = Math.max(1, axis.maxSeconds);
  const pointText = usable.map(point => {
    const bar = bars[point.index];
    const x = bar ? bar.offsetLeft + (bar.offsetWidth / 2) : ((point.index + 0.5) / points.length) * overlayWidth;
    const y = 100 - Math.max(0, Math.min(100, (point.averageSeconds / max) * 100));
    return `${x.toFixed(2)},${y.toFixed(2)}`;
  }).join(' ');
  polyline.setAttribute('points', pointText);
  svg.appendChild(polyline);
  overlay.appendChild(svg);
  usable.forEach(point => {
    const bar = bars[point.index];
    const x = bar ? bar.offsetLeft + (bar.offsetWidth / 2) : ((point.index + 0.5) / points.length) * overlayWidth;
    const y = 100 - Math.max(0, Math.min(100, (point.averageSeconds / max) * 100));
    const dot = el('span', 'activitywatch-average-dot');
    dot.style.left = `${x}px`;
    dot.style.top = `${y}%`;
    dot.tabIndex = 0;
    const metricLabel = activityWatchRollingAverageMetricLabel();
    const tooltip = `${formatEventDate(point.date)} ${metricLabel} 7-day average: ${formatActivityWatchDuration(point.averageSeconds)}.`;
    dot.setAttribute('aria-label', tooltip);
    dot.addEventListener('pointerenter', (event) => {
      setActivityWatchAverageDotActive(dot, true);
      showActivityWatchAverageTooltip(event, point, metricLabel);
    });
    dot.addEventListener('pointermove', positionActivityWatchChartTooltip);
    dot.addEventListener('pointerleave', () => {
      setActivityWatchAverageDotActive(dot, false);
      hideActivityWatchChartTooltip();
    });
    dot.addEventListener('pointercancel', () => {
      setActivityWatchAverageDotActive(dot, false);
      hideActivityWatchChartTooltip();
    });
    dot.addEventListener('focus', () => {
      const rect = dot.getBoundingClientRect();
      setActivityWatchAverageDotActive(dot, true);
      showActivityWatchAverageTooltip({
        clientX: rect.left + (rect.width / 2),
        clientY: rect.top,
      }, point, metricLabel);
    });
    dot.addEventListener('blur', () => {
      setActivityWatchAverageDotActive(dot, false);
      hideActivityWatchChartTooltip();
    });
    overlay.appendChild(dot);
  });
  plot.appendChild(overlay);
}

function activityWatchRollingAverageMetricLabel() {
  if (activityWatchDashboardState.viewMode === 'workload') {
    return WORKLOAD_TERMS.totalTendonLoad;
  }
  if (activityWatchDashboardState.viewMode === 'work') {
    return 'Work';
  }
  if (activityWatchDashboardState.viewMode === 'breakdown' && activityWatchDashboardState.selectedCategory) {
    return activityWatchDashboardState.selectedCategory;
  }
  return WORKLOAD_TERMS.computerActiveTime;
}

