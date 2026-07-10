// ActivityWatch dashboard state and shared range/category helpers.

const ACTIVITYWATCH_DASHBOARD_RANGE_OPTIONS = [
  { days: 14, label: 'Last 2 weeks' },
  { days: 30, label: 'Last 30 days' },
  { days: 60, label: 'Last 60 days' },
  { days: 90, label: 'Last 90 days' },
];

const ACTIVITYWATCH_DASHBOARD_DEFAULT_RANGE_DAYS = 14;

const ACTIVITYWATCH_SELECTED_CATEGORY_LIMIT = 12;

const ACTIVITYWATCH_DASHBOARD_OTHER_CATEGORY = 'Other';

const ACTIVITYWATCH_DASHBOARD_DATA_START_DATE = '2026-04-17';

const ACTIVITYWATCH_DASHBOARD_VIEW_MODES = ['exposure', 'workload', 'work', 'breakdown'];

const ACTIVITYWATCH_DASHBOARD_CHART_GRAINS = ['daily', 'weekly'];

const ACTIVITYWATCH_DASHBOARD_WORKLOAD_BASES = ['total', 'work'];

const ACTIVITYWATCH_METHODOLOGY_CHANGES = [
  {
    date: '2026-06-18',
    title: 'Methodology change',
    detail: 'Browser work tracking changed to use Brave as the work-browser source. Work-category comparisons before and after this date may not be directly comparable.',
  },
  {
    date: '2026-06-21',
    title: 'Methodology change',
    detail: 'ActivityWatch AFK timeout changed to 90 seconds. Active-computer totals after this date may count less passive or hybrid physical work time than earlier data.',
  },
];

const activityWatchDashboardState = {
  viewMode: 'exposure',
  chartGrain: 'daily',
  workloadBasis: 'total',
  selectedDate: '',
  selectedCalloutDate: '',
  rangeDays: ACTIVITYWATCH_DASHBOARD_DEFAULT_RANGE_DAYS,
  rangeEndDate: '',
  categoryMode: 'top',
  selectedCategory: '',
  hoveredCategory: '',
  detailMode: 'day',
  workloadOverlayMode: '',
  showAllCategories: false,
  chartScrollKey: '',
  chartScrollLeft: null,
  chartScrollToEnd: false,
  advancedSyncOpen: false,
  advancedSyncMode: '',
  advancedSyncCustomStart: '',
  advancedSyncCustomEnd: '',
};

let activityWatchDashboardRangeInitialized = false;

function initializeActivityWatchDashboardRange() {
  if (activityWatchDashboardRangeInitialized) return;
  const storedRange = settings && typeof settings === 'object'
    ? settings.activityWatchDashboardRangeDays
    : null;
  activityWatchDashboardState.rangeDays = normalizeActivityWatchDashboardRange(
    storedRange ?? activityWatchDashboardState.rangeDays
  );
  activityWatchDashboardRangeInitialized = true;
}

function persistActivityWatchDashboardRange() {
  if (!settings || typeof settings !== 'object') return;
  settings.activityWatchDashboardRangeDays = normalizeActivityWatchDashboardRange(
    activityWatchDashboardState.rangeDays
  );
  saveSettings(settings);
}

function buildActivityWatchDashboardDays() {
  const end = dateFromStr(normalizeActivityWatchDashboardEndDate(activityWatchDashboardState.rangeEndDate));
  return Array.from({ length: activityWatchDashboardState.rangeDays }, (_, index) => {
    const date = new Date(end);
    date.setDate(date.getDate() - (activityWatchDashboardState.rangeDays - 1 - index));
    const dateStr = toDateStr(date);
    const storedDay = getActivityWatchDay(dateStr);
    return {
      ...(storedDay || buildEmptyActivityWatchDay(dateStr)),
      hasActivityWatchData: Boolean(storedDay) && dateStr >= ACTIVITYWATCH_DASHBOARD_DATA_START_DATE,
      isBeforeActivityWatchCoverage: dateStr < ACTIVITYWATCH_DASHBOARD_DATA_START_DATE,
    };
  });
}

function shiftActivityWatchDashboardRange(direction) {
  const current = activityWatchCurrentWakingDateStr();
  const end = dateFromStr(activityWatchDashboardState.rangeEndDate || current);
  end.setDate(end.getDate() + (direction * activityWatchDashboardState.rangeDays));
  const nextEnd = toDateStr(end);
  activityWatchDashboardState.rangeEndDate = nextEnd > current ? current : nextEnd;
  activityWatchDashboardState.selectedCalloutDate = '';
  activityWatchDashboardState.showAllCategories = false;
  activityWatchDashboardState.hoveredCategory = '';
  activityWatchDashboardState.chartScrollToEnd = true;
  renderActivityWatchDashboard();
}

function showLatestActivityWatchDashboardRange() {
  const current = activityWatchCurrentWakingDateStr();
  activityWatchDashboardState.rangeEndDate = current;
  activityWatchDashboardState.selectedDate = current;
  activityWatchDashboardState.selectedCalloutDate = '';
  activityWatchDashboardState.showAllCategories = false;
  activityWatchDashboardState.hoveredCategory = '';
  activityWatchDashboardState.chartScrollToEnd = true;
  renderActivityWatchDashboard();
}

function setActivityWatchDashboardViewMode(mode) {
  const nextMode = normalizeActivityWatchDashboardViewMode(mode);
  if (activityWatchDashboardState.viewMode === nextMode) return;
  activityWatchDashboardState.viewMode = nextMode;
  activityWatchDashboardState.workloadBasis = activityWatchDashboardLoadBasisForMode(nextMode);
  activityWatchDashboardState.selectedCalloutDate = '';
  activityWatchDashboardState.hoveredCategory = '';
  activityWatchDashboardState.workloadOverlayMode = '';
  activityWatchDashboardState.showAllCategories = false;
  if (nextMode !== 'breakdown') {
    activityWatchDashboardState.selectedCategory = '';
  }
  activityWatchDashboardState.chartScrollToEnd = true;
  renderActivityWatchDashboard();
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
  if (normalizeActivityWatchDashboardViewMode(activityWatchDashboardState.viewMode) !== 'breakdown') return;
  const active = activityWatchDashboardState.selectedCategory || activityWatchDashboardState.hoveredCategory;
  document.querySelectorAll('#activitywatch-dashboard-modal [data-aw-category]').forEach(node => {
    const isMatch = active && node.dataset.awCategory === active;
    node.classList.toggle('is-highlighted', Boolean(isMatch));
    node.classList.toggle('is-dimmed', Boolean(active && !isMatch));
  });
}

function getActivityWatchMethodologyChange(dateStr) {
  return ACTIVITYWATCH_METHODOLOGY_CHANGES.find(item => item.date === dateStr) || null;
}

function getActivityWatchMethodologyChangesForDates(dateStrs) {
  const dateSet = new Set((dateStrs || []).filter(Boolean));
  return ACTIVITYWATCH_METHODOLOGY_CHANGES.filter(item => dateSet.has(item.date));
}

function activityWatchMethodologyTooltip(change) {
  if (!change) return '';
  return `${formatEventDate(change.date)} - ${change.title}. Break in series: ${change.detail}`;
}

function activityWatchMethodologyMarkdown(change) {
  if (!change) return '';
  return `Break in series - ${change.title}: ${change.detail}`;
}

function normalizeActivityWatchDashboardCategoryMode(value) {
  return value === 'top' ? 'top' : 'exact';
}

function normalizeActivityWatchDashboardViewMode(value) {
  return ACTIVITYWATCH_DASHBOARD_VIEW_MODES.includes(value) ? value : 'exposure';
}

function normalizeActivityWatchDashboardChartGrain(value) {
  return ACTIVITYWATCH_DASHBOARD_CHART_GRAINS.includes(value) ? value : 'daily';
}

function normalizeActivityWatchDashboardWorkloadBasis(value) {
  return ACTIVITYWATCH_DASHBOARD_WORKLOAD_BASES.includes(value) ? value : 'total';
}

function activityWatchDashboardUsesRollingAverage() {
  return activityWatchDashboardState.chartGrain === 'daily'
    && ['exposure', 'workload', 'work', 'breakdown'].includes(activityWatchDashboardState.viewMode);
}

function activityWatchDashboardUsesTopCategories() {
  return normalizeActivityWatchDashboardCategoryMode(activityWatchDashboardState.categoryMode) === 'top';
}

function activityWatchDashboardDisplayCategory(category) {
  const label = String(category || '');
  if (!activityWatchDashboardUsesTopCategories()) return label;
  return label.split(ACTIVITYWATCH_CATEGORY_JOINER)[0] || label;
}

function activityWatchDashboardCategoryTotals(day) {
  const totals = {};
  Object.entries(day?.categoryTotals || {}).forEach(([category, seconds]) => {
    const displayCategory = activityWatchDashboardDisplayCategory(category);
    totals[displayCategory] = (totals[displayCategory] || 0) + seconds;
  });
  return totals;
}

function activityWatchDashboardCategoryTotal(day, category) {
  return activityWatchDashboardCategoryTotals(day)[category] || 0;
}

function normalizeActivityWatchDashboardOverlayMode(value) {
  return ['work', 'tendon'].includes(value) ? value : '';
}

function activityWatchDashboardWorkloadOverlayMode() {
  return '';
}

function activityWatchDashboardCanShowWorkloadOverlay() {
  return activityWatchDashboardUsesTopCategories()
    && activityWatchDashboardState.selectedCategory === 'Work'
    && typeof getWorkloadActivityWatchOverlayForDate === 'function';
}

function activityWatchDashboardCanShowTendonLoadOverlay() {
  return activityWatchDashboardUsesTopCategories()
    && typeof getWorkloadActivityWatchOverlayForDate === 'function';
}

function activityWatchDashboardOverlayForDay(day) {
  if (typeof getWorkloadActivityWatchOverlayForDate !== 'function') {
    return {
      workloadTotalSeconds: 0,
      activityWatchWorkSeconds: 0,
      activityWatchTotalSeconds: Math.max(0, Number(day?.totalActiveSeconds) || 0),
      manualResidualSeconds: 0,
      conflict: false,
    };
  }
  return getWorkloadActivityWatchOverlayForDate(day?.date || '');
}

function activityWatchDashboardOverlayTotals(days) {
  const dateStrs = (days || []).filter(activityWatchDashboardDayHasData).map(day => day.date).filter(Boolean);
  if (typeof getWorkloadActivityWatchOverlayTotals === 'function') {
    return getWorkloadActivityWatchOverlayTotals(dateStrs);
  }
  return {
    workloadTotalSeconds: 0,
    activityWatchWorkSeconds: 0,
    activityWatchTotalSeconds: (days || []).reduce((sum, day) => sum + (day.totalActiveSeconds || 0), 0),
    manualResidualSeconds: 0,
    conflict: false,
  };
}

function topActivityWatchCategories(days, limit) {
  return activityWatchDashboardCategoryRows(days)
    .slice(0, limit)
    .map(([category]) => category);
}

function activityWatchDashboardCategoryRows(days) {
  const totals = {};
  days.filter(activityWatchDashboardDayHasData).forEach(day => {
    Object.entries(activityWatchDashboardCategoryTotals(day)).forEach(([category, seconds]) => {
      totals[category] = (totals[category] || 0) + seconds;
    });
  });
  return Object.entries(totals)
    .sort((a, b) => b[1] - a[1]);
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

function activityWatchDashboardDayHasData(day) {
  return Boolean(day?.hasActivityWatchData) && !day?.isBeforeActivityWatchCoverage;
}

function activityWatchDashboardDataDays(days) {
  return (days || []).filter(activityWatchDashboardDayHasData);
}

function activityWatchDashboardHasCoverageGap(days) {
  return (days || []).some(day => day?.isBeforeActivityWatchCoverage);
}

function activityWatchDashboardMetricSecondsForDay(day, metric = activityWatchDashboardState.viewMode) {
  if (!activityWatchDashboardDayHasData(day)) return 0;
  if (metric === 'workload') {
    return activityWatchDashboardWorkloadPlottedSecondsForDay(day, 'total');
  }
  if (metric === 'work') {
    return activityWatchDashboardWorkloadPlottedSecondsForDay(day, 'work');
  }
  if (metric === 'breakdown' && activityWatchDashboardState.selectedCategory) {
    return activityWatchDashboardCategoryTotal(day, activityWatchDashboardState.selectedCategory);
  }
  return Math.max(0, Number(day?.totalActiveSeconds) || 0);
}

function activityWatchDashboardWorkloadPlottedSecondsForDay(day, basis = activityWatchDashboardState.workloadBasis) {
  const overlay = activityWatchDashboardOverlayForDay(day);
  if (normalizeActivityWatchDashboardWorkloadBasis(basis) === 'work') {
    return overlay.activityWatchWorkSeconds + overlay.manualResidualSeconds;
  }
  return overlay.activityWatchTotalSeconds + overlay.manualResidualSeconds;
}

function activityWatchDashboardTotalLoadSecondsForOverlay(overlay) {
  return (overlay?.activityWatchTotalSeconds || 0) + (overlay?.manualResidualSeconds || 0);
}

function activityWatchDashboardWorkOnlyLoadSecondsForOverlay(overlay) {
  return (overlay?.activityWatchWorkSeconds || 0) + (overlay?.manualResidualSeconds || 0);
}

function activityWatchDashboardLoadBasisForMode(mode = activityWatchDashboardState.viewMode) {
  return mode === 'work' ? 'work' : 'total';
}

function activityWatchDashboardChartItems(days) {
  return activityWatchDashboardState.chartGrain === 'weekly'
    ? activityWatchDashboardWeeklyItems(days)
    : (days || []).map(day => activityWatchDashboardDailyItem(day));
}

function activityWatchDashboardDailyItem(day) {
  const dataDays = activityWatchDashboardDayHasData(day) ? [day] : [];
  return {
    ...day,
    isWeekly: false,
    startDate: day?.date || '',
    endDate: day?.date || '',
    sourceDays: day ? [day] : [],
    dataDays,
    syncedDayCount: dataDays.length,
    weeklyTotalActiveSeconds: day?.totalActiveSeconds || 0,
  };
}

function activityWatchDashboardWeeklyItems(days) {
  const groups = new Map();
  (days || []).forEach(day => {
    const key = activityWatchDashboardWeekStartDate(day.date);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(day);
  });
  return Array.from(groups.entries()).map(([startDate, sourceDays]) => {
    const end = dateFromStr(startDate);
    end.setDate(end.getDate() + 6);
    const endDate = toDateStr(end);
    const dataDays = activityWatchDashboardDataDays(sourceDays);
    const divisor = Math.max(1, dataDays.length);
    const categoryTotals = {};
    dataDays.forEach(day => {
      Object.entries(day.categoryTotals || {}).forEach(([category, seconds]) => {
        categoryTotals[category] = (categoryTotals[category] || 0) + seconds;
      });
    });
    Object.keys(categoryTotals).forEach(category => {
      categoryTotals[category] = Math.round(categoryTotals[category] / divisor);
    });
    const totalActiveSeconds = Math.round(dataDays.reduce((sum, day) => sum + (day.totalActiveSeconds || 0), 0) / divisor);
    const overlayTotals = activityWatchDashboardOverlayTotals(dataDays);
    return {
      date: startDate,
      startDate,
      endDate,
      isWeekly: true,
      sourceDays,
      dataDays,
      syncedDayCount: dataDays.length,
      totalActiveSeconds,
      weeklyTotalActiveSeconds: dataDays.reduce((sum, day) => sum + (day.totalActiveSeconds || 0), 0),
      categoryTotals,
      overlayTotals,
      hasActivityWatchData: dataDays.length > 0,
      isBeforeActivityWatchCoverage: sourceDays.every(day => day?.isBeforeActivityWatchCoverage),
    };
  });
}

function activityWatchDashboardWeekStartDate(dateStr) {
  const date = dateFromStr(dateStr);
  const day = date.getDay();
  const offset = day === 0 ? -6 : 1 - day;
  date.setDate(date.getDate() + offset);
  return toDateStr(date);
}

function activityWatchDashboardItemContainsDate(item, dateStr) {
  if (!item || !dateStr) return false;
  return item.isWeekly
    ? dateStr >= item.startDate && dateStr <= item.endDate
    : item.date === dateStr;
}

function activityWatchDashboardSelectedItem(days) {
  const items = activityWatchDashboardChartItems(days);
  return items.find(item => activityWatchDashboardItemContainsDate(item, activityWatchDashboardState.selectedDate))
    || items[items.length - 1]
    || null;
}

function activityWatchDashboardSelectedPeriodDays(days) {
  if (activityWatchDashboardState.detailMode === 'range') return days || [];
  const selectedItem = activityWatchDashboardSelectedItem(days);
  return selectedItem?.sourceDays || [];
}

function activityWatchDashboardRollingAveragePoints(days) {
  if (!activityWatchDashboardUsesRollingAverage()) return [];
  return (days || []).map(day => {
    const windowDays = activityWatchDashboardRollingWindowDays(day.date)
      .map(dateStr => getActivityWatchDay(dateStr))
      .filter(Boolean)
      .map(sourceDay => ({
        ...sourceDay,
        hasActivityWatchData: sourceDay.date >= ACTIVITYWATCH_DASHBOARD_DATA_START_DATE,
        isBeforeActivityWatchCoverage: sourceDay.date < ACTIVITYWATCH_DASHBOARD_DATA_START_DATE,
      }))
      .filter(activityWatchDashboardDayHasData);
    const total = windowDays.reduce((sum, sourceDay) => (
      sum + activityWatchDashboardMetricSecondsForDay(sourceDay)
    ), 0);
    return {
      date: day.date,
      averageSeconds: windowDays.length ? total / windowDays.length : 0,
      syncedDayCount: windowDays.length,
    };
  });
}

function activityWatchDashboardRollingWindowDays(endDateStr) {
  const end = dateFromStr(endDateStr);
  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(end);
    date.setDate(date.getDate() - (6 - index));
    return toDateStr(date);
  });
}

