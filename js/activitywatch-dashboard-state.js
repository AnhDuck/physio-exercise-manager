// ActivityWatch dashboard state and shared range/category helpers.

const ACTIVITYWATCH_DASHBOARD_RANGE_OPTIONS = [
  { days: 7, label: 'Last 7 days' },
  { days: 14, label: 'Last 2 weeks' },
  { days: 30, label: 'Last 30 days' },
  { days: 60, label: 'Last 60 days' },
  { days: 90, label: 'Last 90 days' },
];

const ACTIVITYWATCH_DASHBOARD_DEFAULT_RANGE_DAYS = 14;

const ACTIVITYWATCH_SELECTED_CATEGORY_LIMIT = 12;

const ACTIVITYWATCH_DASHBOARD_OTHER_CATEGORY = 'Other';

const ACTIVITYWATCH_WIDE_AXIS_MIN_LABEL_GAP_DAYS = 6;

const activityWatchDashboardState = {
  selectedDate: '',
  rangeDays: ACTIVITYWATCH_DASHBOARD_DEFAULT_RANGE_DAYS,
  rangeEndDate: '',
  categoryMode: 'exact',
  selectedCategory: '',
  hoveredCategory: '',
  detailMode: 'day',
  showAllCategories: false,
  chartScrollKey: '',
  chartScrollLeft: null,
  chartScrollToEnd: false,
  advancedSyncOpen: false,
  advancedSyncMode: '',
  advancedSyncCustomStart: '',
  advancedSyncCustomEnd: '',
};

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

function normalizeActivityWatchDashboardCategoryMode(value) {
  return value === 'top' ? 'top' : 'exact';
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

function topActivityWatchCategories(days, limit) {
  const totals = {};
  days.forEach(day => {
    Object.entries(activityWatchDashboardCategoryTotals(day)).forEach(([category, seconds]) => {
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

