// ActivityWatch dashboard stacked chart and tooltip behavior.

function renderActivityWatchStackedChart(days) {
  const root = document.getElementById('activitywatch-stacked-chart');
  if (!root) return;
  hideActivityWatchChartTooltip();
  rememberActivityWatchChartScroll(root);
  const scrollKey = activityWatchChartScrollKey(days);
  const shouldRestoreScroll = activityWatchDashboardState.chartScrollKey === scrollKey
    && Number.isFinite(activityWatchDashboardState.chartScrollLeft)
    && !activityWatchDashboardState.chartScrollToEnd;
  root.innerHTML = '';
  root.classList.toggle('is-wide-range', days.length > 45);
  root.classList.toggle('is-dense-range', days.length > 30);
  root.classList.toggle('is-month-range', days.length >= 30);
  root.classList.toggle('is-filtered', Boolean(activityWatchDashboardState.selectedCategory));
  root.classList.toggle('is-workload-overlay', Boolean(activityWatchDashboardWorkloadOverlayMode()));
  root.dataset.awScrollKey = scrollKey;

  const overlayMode = activityWatchDashboardWorkloadOverlayMode();
  const chartCategories = activityWatchDashboardChartCategories(days);
  const maxSeconds = overlayMode
    ? Math.max(0, ...days.map(day => activityWatchDashboardOverlayPlottedSeconds(day, overlayMode)))
    : activityWatchDashboardState.selectedCategory
    ? Math.max(0, ...days.map(day => activityWatchDashboardCategoryTotal(day, activityWatchDashboardState.selectedCategory)))
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
  const axisLabels = activityWatchXAxisLabels(days);
  days.forEach((day, index) => {
    const barButton = el('button', 'activitywatch-day-bar');
    barButton.type = 'button';
    barButton.dataset.awDate = day.date;
    barButton.classList.toggle('is-selected', day.date === activityWatchDashboardState.selectedDate);
    barButton.setAttribute('aria-label', `${formatEventDate(day.date)} - ${formatActivityWatchDuration(day.totalActiveSeconds)}`);
    barButton.addEventListener('click', () => {
      activityWatchDashboardState.selectedDate = day.date;
      activityWatchDashboardState.detailMode = 'day';
      activityWatchDashboardState.showAllCategories = false;
      activityWatchDashboardState.hoveredCategory = '';
      renderActivityWatchDashboard();
    });

    const overlay = overlayMode ? activityWatchDashboardOverlayForDay(day) : null;
    const plottedSeconds = overlayMode
      ? activityWatchDashboardOverlayPlottedSeconds(day, overlayMode)
      : activityWatchDashboardState.selectedCategory
      ? activityWatchDashboardCategoryTotal(day, activityWatchDashboardState.selectedCategory)
      : day.totalActiveSeconds || 0;
    barButton.classList.toggle('has-workload-conflict', Boolean(overlay?.conflict));
    const totalLabelText = activityWatchBarTotalLabel(day, plottedSeconds, index, days.length);
    const totalLabel = elText('span', 'activitywatch-day-bar-total', totalLabelText);
    totalLabel.classList.toggle('has-label', Boolean(totalLabelText));
    barButton.appendChild(totalLabel);

    const stack = el('span', 'activitywatch-day-bar-stack');
    stack.style.height = plottedSeconds
      ? `${Math.max(3, Math.min(100, (plottedSeconds / axis.maxSeconds) * 100))}%`
      : '4px';
    const stackTotal = Math.max(1, plottedSeconds || 0);
    if (overlayMode) {
      activityWatchDashboardOverlaySegments(day, overlayMode).forEach(segmentData => {
        if (!segmentData.seconds) return;
        const segment = el('span', `activitywatch-day-bar-segment activitywatch-overlay-segment ${segmentData.className}`);
        if (segmentData.category) segment.dataset.awCategory = segmentData.category;
        segment.style.height = `${Math.max(2, (segmentData.seconds / stackTotal) * 100)}%`;
        segment.style.background = segmentData.color;
        segment.setAttribute('aria-label', `${segmentData.label}: ${formatActivityWatchDuration(segmentData.seconds)}`);
        addActivityWatchOverlaySegmentTooltipHandlers(segment, segmentData);
        stack.appendChild(segment);
      });
    } else {
      chartCategories.forEach(category => {
        const seconds = activityWatchDashboardCategorySeconds(day, category, chartCategories);
        if (!seconds) return;
        const segment = el('span', 'activitywatch-day-bar-segment');
        segment.dataset.awCategory = category;
        segment.style.height = `${Math.max(2, (seconds / stackTotal) * 100)}%`;
        segment.style.background = activityWatchDashboardCategoryColor(category);
        segment.setAttribute('aria-label', `${category}: ${formatActivityWatchDuration(seconds)}`);
        addActivityWatchBarSegmentTooltipHandlers(segment, category, seconds);
        stack.appendChild(segment);
      });
    }
    if (!plottedSeconds) {
      const empty = el('span', 'activitywatch-day-bar-empty');
      stack.appendChild(empty);
    }
    barButton.appendChild(stack);
    const axisLabel = axisLabels.get(day.date) || '';
    const label = elText('span', 'activitywatch-day-bar-label', axisLabel);
    label.classList.toggle('has-label', Boolean(axisLabel));
    label.classList.toggle('is-edge-start', Boolean(axisLabel) && index === 0);
    label.classList.toggle('is-edge-end', Boolean(axisLabel) && index === days.length - 1);
    barButton.appendChild(label);
    bars.appendChild(barButton);
  });
  plot.appendChild(bars);
  root.appendChild(plot);
  bindActivityWatchChartWheelScroll(plot);
  requestAnimationFrame(() => {
    if (shouldRestoreScroll) {
      plot.scrollLeft = activityWatchDashboardState.chartScrollLeft;
    } else if (days.length > 45) {
      plot.scrollLeft = plot.scrollWidth;
    }
    activityWatchDashboardState.chartScrollKey = scrollKey;
    activityWatchDashboardState.chartScrollLeft = plot.scrollLeft;
    activityWatchDashboardState.chartScrollToEnd = false;
  });
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
  const tooltip = ensureActivityWatchChartTooltip();
  tooltip.textContent = `${category}: ${formatActivityWatchDuration(seconds)}`;
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
        label: 'Total computer active time',
        seconds: overlay.activityWatchTotalSeconds,
        color: 'rgba(99,179,255,.88)',
        className: 'is-computer-total',
        category: '',
      },
      {
        label: 'Manual / untracked estimate',
        seconds: overlay.manualResidualSeconds,
        color: 'rgba(121,214,189,.88)',
        className: 'is-manual-estimate',
        category: '',
      },
    ];
  }
  return [
    {
      label: 'ActivityWatch computer Work',
      seconds: overlay.activityWatchWorkSeconds,
      color: activityWatchDashboardCategoryColor('Work'),
      className: 'is-computer-work',
      category: 'Work',
    },
    {
      label: 'Manual / untracked estimate',
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
    const label = startDate.toLocaleDateString(undefined, {
      month: 'short',
      year: startDate.getFullYear() !== new Date().getFullYear() ? 'numeric' : undefined,
    });
    const band = elText('span', '', label);
    band.classList.add('activitywatch-month-band');
    band.classList.toggle('is-short-month', (endIndex - startIndex + 1) < 4);
    band.style.gridColumn = `${startIndex + 1} / ${endIndex + 2}`;
    band.title = label;
    row.appendChild(band);
    startIndex = endIndex + 1;
  }
  return row;
}

