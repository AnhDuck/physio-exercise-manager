// Timeline view state, range filtering, search, and progressive loading.

const TIMELINE_DEFAULT_RANGE = 'past-30-days';
const TIMELINE_CHUNK_SIZE = 200;
const TIMELINE_SUMMARY_SEPARATOR = ` ${String.fromCharCode(183)} `;
const TIMELINE_RANGE_OPTIONS = [
  { value: 'current-waking-day', label: 'Current waking day', days: 1, sessionOnly: true },
  { value: 'past-7-days', label: 'Past 7 days', days: 7 },
  { value: 'past-30-days', label: 'Past 30 days', days: 30 },
  { value: 'past-90-days', label: 'Past 90 days', days: 90 },
  { value: 'past-year', label: 'Past year', days: 365 },
  { value: 'all-time', label: 'All time', allTime: true },
];
const TIMELINE_TYPE_FILTERS = [
  { key: 'exercises', label: 'Exercises', types: ['exercise-log'] },
  { key: 'notes', label: 'Notes', types: ['note'] },
  { key: 'dose-changes', label: 'Dose changes', types: ['dose-change'] },
  { key: 'exercise-additions', label: 'Exercise additions', types: ['exercise-added'] },
];

let timelineViewState = {
  initialized: false,
  range: TIMELINE_DEFAULT_RANGE,
  searchText: '',
  typeFilters: defaultTimelineTypeFilters(),
  loadedLimit: TIMELINE_CHUNK_SIZE,
  controlsExpanded: false,
};

function defaultTimelineTypeFilters() {
  return TIMELINE_TYPE_FILTERS.reduce((acc, filter) => {
    acc[filter.key] = true;
    return acc;
  }, {});
}

function initializeTimelineViewState() {
  if (timelineViewState.initialized) return;
  timelineViewState.range = normalizeTimelineRange(settings.timelineRange, false);
  timelineViewState.typeFilters = defaultTimelineTypeFilters();
  timelineViewState.loadedLimit = TIMELINE_CHUNK_SIZE;
  timelineViewState.initialized = true;
}

function normalizeTimelineRange(value, allowCurrentWakingDay = true) {
  const option = TIMELINE_RANGE_OPTIONS.find(item => item.value === value);
  if (!option) return TIMELINE_DEFAULT_RANGE;
  if (option.sessionOnly && !allowCurrentWakingDay) return TIMELINE_DEFAULT_RANGE;
  return option.value;
}

function setTimelineRange(value) {
  initializeTimelineViewState();
  timelineViewState.range = normalizeTimelineRange(value, true);
  timelineViewState.loadedLimit = TIMELINE_CHUNK_SIZE;
  settings.timelineRange = timelineViewState.range === 'current-waking-day'
    ? TIMELINE_DEFAULT_RANGE
    : timelineViewState.range;
  saveSettings(settings);
  renderNotesPanel();
}

function setTimelineSearchText(value) {
  initializeTimelineViewState();
  timelineViewState.searchText = String(value || '');
  timelineViewState.loadedLimit = TIMELINE_CHUNK_SIZE;
  renderNotesPanel();
}

function timelineFiltersAreActive() {
  initializeTimelineViewState();
  if (timelineViewState.searchText.trim()) return true;
  if (timelineViewState.range !== TIMELINE_DEFAULT_RANGE) return true;
  return TIMELINE_TYPE_FILTERS.some(filter => !timelineViewState.typeFilters[filter.key]);
}

function setTimelineControlsExpanded(open) {
  initializeTimelineViewState();
  const next = Boolean(open);
  if (timelineViewState.controlsExpanded === next) return;
  timelineViewState.controlsExpanded = next;
  renderTimelineSearchControls(getTimelineVisibleItems());
}

function timelineControlsExpanded() {
  initializeTimelineViewState();
  return Boolean(timelineViewState.controlsExpanded);
}

function toggleTimelineTypeFilter(key) {
  initializeTimelineViewState();
  if (!Object.prototype.hasOwnProperty.call(timelineViewState.typeFilters, key)) return;
  const enabledCount = Object.values(timelineViewState.typeFilters).filter(Boolean).length;
  if (timelineViewState.typeFilters[key] && enabledCount <= 1) {
    showToast('At least one timeline type must stay selected.');
    return;
  }
  timelineViewState.typeFilters[key] = !timelineViewState.typeFilters[key];
  timelineViewState.loadedLimit = TIMELINE_CHUNK_SIZE;
  renderNotesPanel();
}

function resetTimelineFilters() {
  initializeTimelineViewState();
  timelineViewState.range = TIMELINE_DEFAULT_RANGE;
  timelineViewState.searchText = '';
  timelineViewState.typeFilters = defaultTimelineTypeFilters();
  timelineViewState.loadedLimit = TIMELINE_CHUNK_SIZE;
  settings.timelineRange = TIMELINE_DEFAULT_RANGE;
  saveSettings(settings);
  renderNotesPanel();
}

function loadOlderTimelineItems() {
  initializeTimelineViewState();
  timelineViewState.loadedLimit += TIMELINE_CHUNK_SIZE;
  renderNotesPanel();
}

function getTimelineVisibleItems(items = timelineEvents()) {
  initializeTimelineViewState();
  const matchingItems = filterTimelineEvents(items);
  const visibleItems = matchingItems.slice(0, timelineViewState.loadedLimit);
  return {
    matchingItems,
    visibleItems,
    total: matchingItems.length,
    visibleCount: visibleItems.length,
    hasMore: visibleItems.length < matchingItems.length,
    hasAnyTimelineItems: items.length > 0,
    statusText: timelineStatusText(matchingItems.length),
    showingText: timelineShowingText(visibleItems.length, matchingItems.length),
  };
}

function filterTimelineEvents(items = timelineEvents()) {
  initializeTimelineViewState();
  const bounds = getTimelineRangeBounds(timelineViewState.range);
  const search = normalizeTimelineSearchText(timelineViewState.searchText);
  return items
    .filter(ev => eventWithinTimelineRange(ev, bounds))
    .filter(ev => timelineTypeEnabled(ev.type))
    .filter(ev => !search || timelineSearchHaystack(ev).includes(search))
    .sort(compareTimelineEventsNewestFirst);
}

function getTimelineRangeBounds(range = timelineViewState.range, now = new Date()) {
  const option = TIMELINE_RANGE_OPTIONS.find(item => item.value === range)
    || TIMELINE_RANGE_OPTIONS.find(item => item.value === TIMELINE_DEFAULT_RANGE);
  if (option.allTime) return { start: null, end: null };

  const currentStart = getCurrentWakingDayStart(now);
  const start = new Date(currentStart);
  start.setDate(start.getDate() - ((option.days || 1) - 1));

  const end = new Date(currentStart);
  end.setDate(end.getDate() + 1);
  return { start, end };
}

function getCurrentWakingDayStart(now = new Date()) {
  const startMinutes = timeToMinutes(getPersonalDayStartTime()) ?? 0;
  const start = dateFromStr(toDateStr(now));
  start.setHours(Math.floor(startMinutes / 60), startMinutes % 60, 0, 0);
  if (now < start) start.setDate(start.getDate() - 1);
  return start;
}

function eventWithinTimelineRange(ev, bounds) {
  if (!bounds.start && !bounds.end) return true;
  const dateTime = timelineEventDateTime(ev);
  if (!dateTime) return false;
  if (bounds.start && dateTime < bounds.start) return false;
  if (bounds.end && dateTime >= bounds.end) return false;
  return true;
}

function timelineEventDateTime(ev) {
  if (!isValidDateStr(ev?.date)) return null;
  const date = dateFromStr(ev.date);
  const minutes = timeToMinutes(ev.time || '00:00') ?? 0;
  date.setHours(Math.floor(minutes / 60), minutes % 60, 0, 0);
  return date;
}

function timelineTypeEnabled(eventType) {
  const key = timelineTypeKey(eventType);
  return Boolean(key && timelineViewState.typeFilters[key]);
}

function timelineTypeKey(eventType) {
  const filter = TIMELINE_TYPE_FILTERS.find(item => item.types.includes(eventType));
  return filter?.key || '';
}

function timelineSearchHaystack(ev) {
  const changes = Object.entries(ev.changes || {})
    .map(([field, change]) => `${field} ${change.from || 'blank'} ${change.to || 'blank'}`)
    .join(' ');
  const status = exerciseStatusLabel(ev);
  return normalizeTimelineSearchText([
    ev.type,
    ev.text,
    ev.annotation,
    ev.exerciseName,
    ev.exerciseId,
    status,
    eventTitle(ev),
    eventText(ev),
    changes,
  ].filter(Boolean).join(' '));
}

function normalizeTimelineSearchText(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function timelineStatusText(resultCount) {
  return [
    timelineRangeLabel(timelineViewState.range),
    timelineTypesSummary(),
    `${formatNumber(resultCount)} ${resultCount === 1 ? 'result' : 'results'}`,
  ].join(TIMELINE_SUMMARY_SEPARATOR);
}

function timelineShowingText(visibleCount, total) {
  if (!total) return '';
  return `Showing ${formatNumber(visibleCount)} of ${formatNumber(total)} matching ${total === 1 ? 'item' : 'items'}`;
}

function timelineRangeLabel(value = timelineViewState.range) {
  return TIMELINE_RANGE_OPTIONS.find(item => item.value === value)?.label || 'Past 30 days';
}

function timelineTypesSummary() {
  const enabled = TIMELINE_TYPE_FILTERS.filter(item => timelineViewState.typeFilters[item.key]);
  if (enabled.length === TIMELINE_TYPE_FILTERS.length) return 'All types';
  return enabled.map(item => item.label).join(' + ');
}

function timelineControlsSummary(resultCount) {
  const parts = [
    timelineRangeLabel(),
    timelineTypesSummary(),
  ];
  const search = timelineViewState.searchText.trim();
  if (search) parts.push(`Search: ${search}`);
  parts.push(`${formatNumber(resultCount)} ${resultCount === 1 ? 'result' : 'results'}`);
  return parts.join(TIMELINE_SUMMARY_SEPARATOR);
}

function timelineScopeSummary(scopeLabel) {
  const parts = [
    scopeLabel,
    timelineRangeLabel(),
    timelineTypesSummary(),
  ];
  const search = timelineViewState.searchText.trim();
  if (search) parts.push(`Search: ${search}`);
  return parts.join(TIMELINE_SUMMARY_SEPARATOR);
}
