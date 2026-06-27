// Timeline display, grouping, item rows, and shared formatting.

function groupedTimelineEvents(items = timelineEvents()) {
  const groups = [];
  const byDate = new Map();
  items.forEach(ev => {
    const date = ev.date || 'undated';
    if (!byDate.has(date)) {
      const group = { date, events: [] };
      byDate.set(date, group);
      groups.push(group);
    }
    byDate.get(date).events.push(ev);
  });
  return groups;
}

function renderTimelineSearchControls(view) {
  const tools = document.querySelector('.timeline-tools');
  const searchPanel = document.getElementById('timeline-search-panel');
  const input = document.getElementById('timeline-search-input');
  const range = document.getElementById('timeline-range');
  const types = document.getElementById('timeline-type-filters');
  const status = document.getElementById('timeline-filter-status');
  const clear = document.getElementById('timeline-filter-reset');
  if (!input || !range || !types || !status) return;

  const expanded = timelineControlsExpanded();
  tools?.classList.toggle('timeline-tools-collapsed', !expanded);
  searchPanel?.setAttribute('aria-expanded', String(expanded));
  input.value = timelineViewState.searchText;
  if (clear) clear.hidden = !timelineFiltersAreActive();

  if (!range.options.length) {
    TIMELINE_RANGE_OPTIONS.forEach(option => {
      const opt = document.createElement('option');
      opt.value = option.value;
      opt.textContent = option.label;
      range.appendChild(opt);
    });
  }
  range.value = timelineViewState.range;

  types.innerHTML = '';
  TIMELINE_TYPE_FILTERS.forEach(filter => {
    const button = el('button', 'timeline-type-filter');
    button.type = 'button';
    button.dataset.timelineTypeFilter = filter.key;
    button.classList.toggle('active', Boolean(timelineViewState.typeFilters[filter.key]));
    button.setAttribute('aria-pressed', String(Boolean(timelineViewState.typeFilters[filter.key])));
    button.appendChild(timelineTypeFilterIcon(filter.key));
    button.appendChild(elText('span', 'timeline-type-filter-label', filter.label));
    types.appendChild(button);
  });

  status.textContent = view.statusText;
}

function timelineTypeFilterIcon(key) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('class', 'timeline-type-filter-icon');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');

  const iconParts = {
    exercises: [
      ['path', { d: 'M4 6h3' }],
      ['path', { d: 'M4 12h3' }],
      ['path', { d: 'M4 18h3' }],
      ['path', { d: 'M11 6h9' }],
      ['path', { d: 'M11 12h9' }],
      ['path', { d: 'm11 18 2 2 5-6' }],
    ],
    notes: [
      ['path', { d: 'M7 3h7l4 4v14H7z' }],
      ['path', { d: 'M14 3v5h5' }],
      ['path', { d: 'M10 12h6' }],
      ['path', { d: 'M10 16h4' }],
    ],
    'dose-changes': [
      ['path', { d: 'M10 21 3 14a4.2 4.2 0 0 1 0-6l1-1a4.2 4.2 0 0 1 6 0l7 7a4.2 4.2 0 0 1 0 6l-1 1a4.2 4.2 0 0 1-6 0Z' }],
      ['path', { d: 'm8 10 6 6' }],
      ['path', { d: 'M15 6h5' }],
      ['path', { d: 'M17.5 3.5v5' }],
    ],
    'exercise-additions': [
      ['circle', { cx: '12', cy: '12', r: '8' }],
      ['path', { d: 'M12 8v8' }],
      ['path', { d: 'M8 12h8' }],
    ],
  };

  (iconParts[key] || []).forEach(([tag, attrs]) => {
    const part = document.createElementNS('http://www.w3.org/2000/svg', tag);
    Object.entries(attrs).forEach(([name, value]) => part.setAttribute(name, value));
    svg.appendChild(part);
  });

  return svg;
}

function renderTimelineList(view) {
  const list = document.getElementById('timeline-list');
  if (!list) return;
  list.innerHTML = '';

  if (!view.hasAnyTimelineItems) {
    list.appendChild(elText('div', 'timeline-empty', 'No timeline items yet.'));
    return;
  }
  if (!view.total) {
    list.appendChild(elText('div', 'timeline-empty', 'No results match this search/filter.'));
    return;
  }

  groupedTimelineEvents(view.visibleItems).forEach(group => list.appendChild(buildTimelineDay(group)));
  list.appendChild(buildTimelineLoadControls(view));
}

function buildTimelineLoadControls(view) {
  const controls = el('div', 'timeline-load-controls');
  controls.appendChild(elText('span', 'timeline-showing-status', view.showingText));

  if (view.hasMore) {
    const load = el('button', 'btn-secondary timeline-load-older');
    load.type = 'button';
    load.id = 'timeline-load-older';
    load.textContent = 'Load older';
    controls.appendChild(load);
  }

  return controls;
}

function buildTimelineDay(group) {
  const section = el('section', 'timeline-day');
  const header = el('div', 'timeline-day-header');
  header.appendChild(elText('span', 'timeline-day-title', formatEventDateShort(group.date)));
  const activityWatchChips = typeof getActivityWatchTimelineChips === 'function'
    ? getActivityWatchTimelineChips(group.date)
    : [];
  if (activityWatchChips.length) {
    activityWatchChips.forEach(chip => {
      const chipEl = elText('span', `timeline-day-activitywatch ${chip.className || ''}`, chip.label);
      if (chip.title) {
        chipEl.title = chip.title;
        chipEl.setAttribute('aria-label', chip.title);
      }
      header.appendChild(chipEl);
    });
  } else {
    const activityWatchSummary = typeof getActivityWatchTimelineSummary === 'function'
      ? getActivityWatchTimelineSummary(group.date)
      : '';
    if (activityWatchSummary) {
      header.appendChild(elText('span', 'timeline-day-activitywatch', activityWatchSummary));
    }
  }
  header.title = formatEventDate(group.date);
  section.appendChild(header);

  const rows = el('div', 'timeline-day-rows');
  let lastSegment = null;
  group.events.forEach(ev => {
    const segment = timelineDaySegment(ev.time);
    if (segment === 'late' && lastSegment !== 'late') {
      rows.appendChild(buildTimelineBoundary(ev));
    }
    rows.appendChild(buildTimelineItem(ev));
    lastSegment = segment;
  });
  section.appendChild(rows);
  return section;
}

function timelineDaySegment(timeStr) {
  return isBeforePersonalDayStart(timeStr, getPersonalDayStartTime()) ? 'late' : 'awake';
}

function buildTimelineBoundary(ev) {
  const personalDayStartTime = getPersonalDayStartTime();
  const wakingDay = getWakingDayForEvent(ev?.date, ev?.time, personalDayStartTime);
  const wakingDayLabel = formatShortDate(wakingDay);
  const label = `Before ${formatBoundaryTime(personalDayStartTime)} · ${wakingDayLabel} waking day`;
  const boundary = el('div', 'timeline-boundary');
  boundary.appendChild(elText('span', 'timeline-boundary-label', label));
  return boundary;
}

function getPersonalDayStartTime() {
  return isValidTime(settings.personalDayStartTime)
    ? settings.personalDayStartTime
    : DEFAULT_PERSONAL_DAY_START_TIME;
}

function isBeforePersonalDayStart(eventTime, personalDayStartTime) {
  const eventMinutes = timeToMinutes(eventTime);
  const startMinutes = timeToMinutes(personalDayStartTime);
  if (eventMinutes === null || startMinutes === null) return false;
  return eventMinutes < startMinutes;
}

function getWakingDayForEvent(dateStr, timeStr, personalDayStartTime) {
  if (!isBeforePersonalDayStart(timeStr, personalDayStartTime) || !isValidDateStr(dateStr)) {
    return dateStr;
  }

  const wakingDate = dateFromStr(dateStr);
  wakingDate.setDate(wakingDate.getDate() - 1);
  return toDateStr(wakingDate);
}

function timeToMinutes(timeStr) {
  const [hourRaw, minuteRaw] = (timeStr || '').split(':').map(Number);
  if (
    Number.isNaN(hourRaw) ||
    Number.isNaN(minuteRaw) ||
    hourRaw < 0 ||
    hourRaw > 23 ||
    minuteRaw < 0 ||
    minuteRaw > 59
  ) {
    return null;
  }
  return hourRaw * 60 + minuteRaw;
}

function isValidTime(timeStr) {
  return timeToMinutes(timeStr) !== null;
}

function isValidDateStr(dateStr) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr || '')) return false;
  const date = dateFromStr(dateStr);
  return toDateStr(date) === dateStr;
}

function formatBoundaryTime(timeStr) {
  const [hourRaw, minuteRaw] = timeStr.split(':').map(Number);
  const suffix = hourRaw >= 12 ? 'PM' : 'AM';
  const hour = hourRaw % 12 || 12;
  if (minuteRaw === 0) return `${hour} ${suffix}`;
  return `${hour}:${String(minuteRaw).padStart(2, '0')} ${suffix}`;
}

function buildTimelineItem(ev) {
  const status = exerciseStatusLabel(ev);
  const inactiveClass = status
    ? ` timeline-exercise-${status.toLowerCase()}`
    : '';
  const item = el('article', 'timeline-row timeline-' + ev.type + inactiveClass);
  const content = el('div', 'timeline-row-content');
  content.appendChild(elText('span', 'timeline-time', formatEventTime(ev.time)));

  if (ev.type === 'note') {
    content.appendChild(elText('span', 'timeline-separator', '-'));
    content.appendChild(elText('span', 'timeline-note-text', ev.text || ''));
  } else if (ev.type === 'exercise-log') {
    content.appendChild(elText('span', 'timeline-separator', '-'));
    appendExerciseStatusBadge(content, ev);
    content.appendChild(elText('span', 'timeline-event-title', eventTitle(ev)));
    const detail = eventText(ev);
    if (detail) content.appendChild(elText('span', 'timeline-event-detail', detail));
    item.title = status ? 'Open historical exercise log' : 'Open exercise log';
    item.setAttribute('role', 'button');
    item.setAttribute('tabindex', '0');
    item.addEventListener('click', () => openExerciseLogFromTimeline(ev));
    item.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      e.preventDefault();
      openExerciseLogFromTimeline(ev);
    });
  } else {
    content.appendChild(elText('span', 'timeline-separator', '-'));
    appendExerciseStatusBadge(content, ev);
    content.appendChild(elText('span', 'timeline-event-title', eventTitle(ev)));
    const detail = eventText(ev);
    if (detail) content.appendChild(elText('span', 'timeline-event-detail', detail));
    if (ev.annotation) content.appendChild(elText('span', 'timeline-event-annotation', ev.annotation));
  }

  item.appendChild(content);
  if (ev.type === 'exercise-log') return item;
  const editBtn = el('button', 'timeline-edit');
  editBtn.type = 'button';
  editBtn.title = 'Edit timeline item';
  editBtn.setAttribute('aria-label', 'Edit timeline item');
  editBtn.innerHTML = '&#9998;';
  editBtn.addEventListener('click', () => openEventModal(ev.id));
  item.appendChild(editBtn);
  return item;
}

function openExerciseLogFromTimeline(ev) {
  if (!ev?.exerciseId || !ev.sessionDate) return;
  currentWeekStart = getMonday(dateFromStr(ev.sessionDate));
  openSetTracker(ev.exerciseId, ev.sessionDate, {
    readOnly: Boolean(ev.hidden || ev.deleted || ev.missing),
    detailsOpen: Boolean(ev.hidden || ev.deleted || ev.missing),
    skipScroll: Boolean(ev.hidden || ev.deleted || ev.missing),
  });
  if (!ev.hidden && !ev.deleted && !ev.missing) {
    window.setTimeout(() => scrollActiveCellIntoView(ev.exerciseId, ev.sessionDate), 0);
  }
}

function formatEventDateShort(dateStr) {
  return formatShortDate(dateStr);
}

function formatShortDate(dateStr) {
  if (!dateStr || dateStr === 'undated') return 'No date';
  if (!isValidDateStr(dateStr)) return dateStr;
  const d = dateFromStr(dateStr);
  return `${MONTH_ABBR[d.getMonth()]} ${d.getDate()}`;
}

function formatEventDate(dateStr) {
  if (!dateStr || dateStr === 'undated') return 'No date';
  if (!isValidDateStr(dateStr)) return dateStr;
  const d = dateFromStr(dateStr);
  return `${MONTH_ABBR[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}

function formatEventTime(timeStr) {
  if (!timeStr) return '';
  const [hourRaw, minuteRaw] = timeStr.split(':').map(Number);
  if (Number.isNaN(hourRaw) || Number.isNaN(minuteRaw)) return timeStr;
  const suffix = hourRaw >= 12 ? 'PM' : 'AM';
  const hour = hourRaw % 12 || 12;
  return `${hour}:${String(minuteRaw).padStart(2, '0')} ${suffix}`;
}

function eventTitle(ev) {
  if (ev.type === 'dose-change') return `Dose change: ${ev.exerciseName || 'Exercise'}`;
  if (ev.type === 'exercise-added') return `Added exercise: ${ev.exerciseName || 'Exercise'}`;
  if (ev.type === 'exercise-log') {
    const prefix = ev.hidden ? 'Hidden exercise' : (ev.deleted || ev.missing ? 'Deleted exercise' : 'Exercise');
    return `${prefix}: ${ev.exerciseName || ev.exerciseId || 'Exercise'}`;
  }
  return 'Note';
}

function exerciseStatusLabel(ev) {
  if (ev?.hidden) return 'Hidden';
  if (ev?.deleted || ev?.missing) return 'Deleted';
  return '';
}

function appendExerciseStatusBadge(content, ev) {
  const label = exerciseStatusLabel(ev);
  if (!label) return;
  content.appendChild(elText('span', `timeline-link-status timeline-link-status-${label.toLowerCase()}`, label));
}

function eventText(ev) {
  if (ev.type === 'exercise-log') {
    const progress = ev.progress || {};
    const snapshot = ev.snapshot || {};
    return `${progress.completedSets || 0}/${progress.targetSets || snapshot.sets || '?'} sets`;
  }
  if (ev.type === 'dose-change') {
    return Object.entries(ev.changes || {})
      .map(([field, change]) => `${field}: ${change.from || 'blank'} -> ${change.to || 'blank'}`)
      .join(' / ');
  }
  if (ev.type === 'exercise-added') return 'New exercise added to the program.';
  return ev.text || '';
}
