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
  selectedDate: '',
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

function buildActivityWatchDashboardDays() {
  const end = dateFromStr(normalizeActivityWatchDashboardEndDate(activityWatchDashboardState.rangeEndDate));
  return Array.from({ length: activityWatchDashboardState.rangeDays }, (_, index) => {
    const date = new Date(end);
    date.setDate(date.getDate() - (activityWatchDashboardState.rangeDays - 1 - index));
    const dateStr = toDateStr(date);
    return getActivityWatchDay(dateStr) || buildEmptyActivityWatchDay(dateStr);
  });
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
  const mode = normalizeActivityWatchDashboardOverlayMode(activityWatchDashboardState.workloadOverlayMode);
  if (mode === 'work' && activityWatchDashboardCanShowWorkloadOverlay()) return mode;
  if (mode === 'tendon' && activityWatchDashboardCanShowTendonLoadOverlay()) return mode;
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
  const dateStrs = (days || []).map(day => day.date).filter(Boolean);
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
  days.forEach(day => {
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

