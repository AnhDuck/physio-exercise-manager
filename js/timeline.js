// Notes panel, timeline events, timeline formatting, and event editing.

function eventsForDate(dateStr) {
  return events
    .filter(ev => ev.date === dateStr)
    .sort((a, b) => (a.time || '').localeCompare(b.time || ''));
}

function timelineEvents() {
  const eventItems = events
    .filter(ev => ev.type === 'note' || ev.type === 'dose-change' || ev.type === 'exercise-added')
    .map(ev => ({
      ...ev,
      ...exerciseLinkStatus(ev.exerciseId),
      sortKey: `${ev.date || ''}T${ev.time || '00:00'}`,
    }));
  return eventItems.concat(exerciseLogTimelineEvents())
    .sort((a, b) => (b.sortKey || `${b.date || ''}T${b.time || '00:00'}`)
      .localeCompare(a.sortKey || `${a.date || ''}T${a.time || '00:00'}`));
}

function exerciseLogTimelineEvents() {
  const items = [];
  Object.entries(sessions || {}).forEach(([sessionDate, session]) => {
    if (!session?.setProgress || typeof session.setProgress !== 'object') return;
    Object.entries(session.setProgress).forEach(([exId, rawProgress]) => {
      const progress = normalizeSetProgress(rawProgress, exercises.find(ex => ex.id === exId));
      if (progress.completedSets < 1 || !progress.startedAt) return;
      const startedAt = dateFromIso(progress.startedAt);
      if (!startedAt) return;
      const ex = displayExerciseForLog(exId, progress);
      const date = toDateStr(startedAt);
      const time = `${String(startedAt.getHours()).padStart(2, '0')}:${String(startedAt.getMinutes()).padStart(2, '0')}`;
      items.push({
        id: `exercise-log:${sessionDate}:${exId}`,
        type: 'exercise-log',
        date,
        time,
        sortKey: `${date}T${time}`,
        sessionDate,
        exerciseId: exId,
        exerciseName: ex.name,
        group: ex.group,
        hidden: Boolean(ex.hiddenAt),
        deleted: Boolean(ex.deletedAt),
        missing: Boolean(ex.missing),
        progress,
        snapshot: progressSnapshot(progress, exercises.find(item => item.id === exId)),
      });
    });
  });
  return items;
}

function exerciseLinkStatus(exerciseId) {
  if (!exerciseId) return {};
  const ex = exercises.find(item => item.id === exerciseId);
  return {
    hidden: Boolean(ex?.hiddenAt && !ex?.deletedAt),
    deleted: Boolean(ex?.deletedAt),
    missing: !ex,
  };
}

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
function makeId(prefix) {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
}

function doseChanges(previous, nextFields) {
  const changes = {};
  ['sets', 'reps', 'resistance', 'frequency'].forEach(field => {
    const from = previous[field] ?? '';
    const to = nextFields[field] ?? '';
    if (String(from) !== String(to)) changes[field] = { from, to };
  });
  return changes;
}

function logDoseChange(exercise, changes) {
  events.push({
    id: makeId('event'),
    type: 'dose-change',
    date: todayStr(),
    time: currentTimeStr(),
    exerciseId: exercise.id,
    exerciseName: exercise.name,
    changes,
    createdAt: new Date().toISOString(),
  });
  saveEvents(events);
}

function logExerciseAdded(exercise) {
  events.push({
    id: makeId('event'),
    type: 'exercise-added',
    date: todayStr(),
    time: currentTimeStr(),
    exerciseId: exercise.id,
    exerciseName: exercise.name,
    createdAt: new Date().toISOString(),
  });
  saveEvents(events);
}

function setNotesPanelOpen(open, shouldFocus = false) {
  settings.notesOpen = open;
  saveSettings(settings);
  renderNotesPanel();
  if (shouldFocus && open) {
    window.setTimeout(() => document.getElementById('quick-note-text')?.focus(), 0);
  }
}

function toggleNotesPanel() {
  setNotesPanelOpen(!settings.notesOpen, true);
}

function openNotesModal(dateStr = todayStr()) {
  setNotesPanelOpen(true, true);
  document.getElementById('quick-note-date').value = dateStr;
}

function renderNotesPanel() {
  const panel = document.getElementById('notes-panel');
  const buttons = document.querySelectorAll('.notes-toggle');
  if (!panel || !buttons.length) return;

  const isOpen = Boolean(settings.notesOpen);
  const label = isOpen ? 'Hide notes panel' : 'Show notes panel';
  document.body.classList.toggle('notes-open', isOpen);
  buttons.forEach(btn => {
    btn.classList.toggle('active', isOpen);
    btn.setAttribute('aria-expanded', String(isOpen));
    btn.title = label;
    btn.setAttribute('aria-label', label);
  });

  const dateField = document.getElementById('quick-note-date');
  const timeField = document.getElementById('quick-note-time');
  if (!dateField.value) dateField.value = todayStr();
  if (!timeField.value) timeField.value = currentTimeStr();
  syncQuickNoteDateTime();

  const list = document.getElementById('timeline-list');
  list.innerHTML = '';
  const groups = groupedTimelineEvents();
  if (!groups.length) {
    list.appendChild(elText('div', 'timeline-empty', 'No notes or regimen changes yet.'));
    return;
  }
  groups.forEach(group => list.appendChild(buildTimelineDay(group)));
}

function addQuickNote() {
  const textField = document.getElementById('quick-note-text');
  const text = textField.value.trim();
  if (!text) { alert('Note text is required.'); return; }

  events.push({
    id: makeId('event'),
    type: 'note',
    date: document.getElementById('quick-note-date').value || todayStr(),
    time: document.getElementById('quick-note-time').value || currentTimeStr(),
    text,
    createdAt: new Date().toISOString(),
  });
  saveEvents(events);
  textField.value = '';
  document.getElementById('quick-note-date').value = todayStr();
  document.getElementById('quick-note-time').value = currentTimeStr();
  renderNotesPanel();
  textField.focus();
}

async function copyTimelineMarkdown() {
  const timeline = timelineEvents();
  if (!timeline.length) {
    showToast('No notes or timeline items to copy.');
    return;
  }

  const markdown = buildTimelineMarkdown(timeline);
  const copied = await writeTextToClipboard(markdown);
  const count = timeline.length;
  const chars = markdown.length;

  if (copied) {
    showToast(`Copied ${formatNumber(count)} timeline ${count === 1 ? 'item' : 'items'} (${formatNumber(chars)} characters).`);
  } else {
    showToast(`Could not copy ${formatNumber(count)} timeline ${count === 1 ? 'item' : 'items'} (${formatNumber(chars)} characters).`);
  }
}

function buildTimelineMarkdown(timeline) {
  const lines = [
    '# Physio Timeline Notes',
    '',
    `Generated: ${formatExportTimestamp(new Date())}`,
    `Items: ${formatNumber(timeline.length)}`,
    `Date range: ${timelineDateRange(timeline)}`,
    '',
  ];

  groupedTimelineEvents(timeline).forEach((group, groupIndex) => {
    if (groupIndex > 0) lines.push('');
    lines.push(`## ${formatEventDate(group.date)}`);
    lines.push('');
    let lastSegment = null;
    group.events.forEach(ev => {
      const segment = timelineDaySegment(ev.time);
      if (segment === 'late' && lastSegment !== 'late') {
        lines.push(`_Before ${formatBoundaryTime(getPersonalDayStartTime())} - ${formatShortDate(getWakingDayForEvent(ev.date, ev.time, getPersonalDayStartTime()))} waking day_`);
      }
      lines.push(formatTimelineEventMarkdown(ev));
      lastSegment = segment;
    });
  });

  return lines.join('\n');
}

function formatTimelineEventMarkdown(ev) {
  const time = formatEventTime(ev.time) || 'No time';
  return `- **${time}** - ${formatTimelineEventMarkdownBody(ev)}`;
}

function formatTimelineEventMarkdownBody(ev) {
  if (ev.type === 'note') return formatMarkdownEntryText(ev.text || '');
  if (ev.type === 'exercise-log') {
    const parts = [`**${eventTitle(ev)}**`];
    const detail = eventText(ev);
    if (detail) parts.push(detail);
    return parts.join(': ');
  }

  const status = exerciseStatusLabel(ev);
  const parts = [`**${status ? `${status}: ` : ''}${eventTitle(ev)}**`];
  const detail = eventText(ev);
  if (detail) parts.push(detail);
  if (ev.annotation) parts.push(formatMarkdownEntryText(ev.annotation));
  return parts.join(': ');
}

function formatMarkdownEntryText(text) {
  return String(text || '')
    .replace(/\r\n?/g, '\n')
    .trim()
    .replace(/\n/g, '\n  ');
}

function timelineDateRange(timeline) {
  const dates = timeline
    .map(ev => ev.date)
    .filter(date => date && date !== 'undated')
    .sort();

  if (!dates.length) return 'No dated items';
  const first = dates[0];
  const last = dates[dates.length - 1];
  if (first === last) return formatEventDate(first);
  return `${formatEventDate(first)} - ${formatEventDate(last)}`;
}

function formatExportTimestamp(date) {
  return `${formatEventDate(toDateStr(date))} ${formatEventTime(`${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`)}`;
}
async function writeTextToClipboard(text) {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (err) {
      // File URLs and non-secure contexts often reject the async Clipboard API.
    }
  }

  return fallbackCopyText(text);
}

function fallbackCopyText(text) {
  if (copyTextWithEvent(text)) return true;

  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.setAttribute('readonly', '');
  textarea.style.position = 'fixed';
  textarea.style.left = '-9999px';
  textarea.style.top = '0';

  const selection = document.getSelection();
  const selectedRange = selection && selection.rangeCount ? selection.getRangeAt(0) : null;

  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();

  let copied = false;
  try {
    copied = document.execCommand('copy');
  } catch (err) {
    copied = false;
  }

  document.body.removeChild(textarea);

  if (selection && selectedRange) {
    selection.removeAllRanges();
    selection.addRange(selectedRange);
  }

  return copied;
}

function copyTextWithEvent(text) {
  let copied = false;
  const handleCopy = (event) => {
    event.clipboardData.setData('text/plain', text);
    event.preventDefault();
    copied = true;
  };

  document.addEventListener('copy', handleCopy);
  try {
    copied = document.execCommand('copy') && copied;
  } catch (err) {
    copied = false;
  }
  document.removeEventListener('copy', handleCopy);

  return copied;
}
function formatNumber(value) {
  return Number(value).toLocaleString();
}

function buildTimelineDay(group) {
  const section = el('section', 'timeline-day');
  const header = elText('div', 'timeline-day-header', formatEventDateShort(group.date));
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

function openEventModal(eventId) {
  const ev = events.find(item => item.id === eventId);
  if (!ev) return;
  editingEventId = eventId;
  const isDoseChange = ev.type === 'dose-change';
  document.getElementById('event-modal-title').textContent = ev.type === 'note' ? 'Edit note' : 'Edit history item';
  document.getElementById('event-field-date').value = ev.date || todayStr();
  document.getElementById('event-field-time').value = ev.time || currentTimeStr();
  document.getElementById('event-field-text').value = ev.type === 'note' ? (ev.text || '') : (ev.annotation || '');
  document.getElementById('event-field-text').placeholder = ev.type === 'note'
    ? 'Timeline note'
    : 'Optional annotation for this history item';
  renderEventDoseFields(ev);
  document.getElementById('event-detail').textContent = ev.type === 'note' || isDoseChange ? '' : eventText(ev);
  document.getElementById('event-delete-btn').style.display = 'inline-block';
  document.getElementById('event-modal').classList.remove('hidden');
}

function closeEventModal() {
  document.getElementById('event-modal').classList.add('hidden');
  renderEventDoseFields(null);
  editingEventId = null;
}

function renderEventDoseFields(ev) {
  const wrap = document.getElementById('event-dose-fields');
  wrap.innerHTML = '';
  if (!ev || ev.type !== 'dose-change') {
    wrap.classList.add('hidden');
    return;
  }

  const changes = ev.changes || {};
  const fields = ['sets', 'reps', 'resistance', 'frequency'].filter(field => changes[field]);
  if (!fields.length) {
    wrap.classList.add('hidden');
    return;
  }

  wrap.classList.remove('hidden');
  wrap.appendChild(elText('div', 'event-dose-heading', 'Dose change'));
  fields.forEach(field => {
    const change = changes[field] || {};
    const row = el('div', 'event-dose-row');
    row.appendChild(elText('div', 'event-dose-label', doseFieldLabel(field)));

    const fromField = buildDoseChangeInput(field, 'from', change.from);
    const toField = buildDoseChangeInput(field, 'to', change.to);
    row.appendChild(fromField);
    row.appendChild(toField);
    wrap.appendChild(row);
  });
}

function buildDoseChangeInput(field, direction, value) {
  const control = el('label', 'event-dose-control');
  control.appendChild(elText('span', '', direction === 'from' ? 'From' : 'To'));
  const input = document.createElement('input');
  input.type = 'text';
  input.value = value ?? '';
  input.dataset.changeField = field;
  input.dataset.changeDirection = direction;
  control.appendChild(input);
  return control;
}

function doseFieldLabel(field) {
  return {
    sets: 'Sets',
    reps: 'Reps',
    resistance: 'Resistance',
    frequency: 'Frequency',
  }[field] || field;
}

function readEventDoseChanges(existingChanges = {}) {
  const changes = {};
  Object.keys(existingChanges).forEach(field => {
    changes[field] = { ...existingChanges[field] };
  });
  document.querySelectorAll('#event-dose-fields input[data-change-field]').forEach(input => {
    const field = input.dataset.changeField;
    const direction = input.dataset.changeDirection;
    if (!changes[field]) changes[field] = { from: '', to: '' };
    changes[field][direction] = input.value.trim();
  });
  return changes;
}

function saveEventModal() {
  const ev = events.find(item => item.id === editingEventId);
  if (!ev) return;
  ev.date = document.getElementById('event-field-date').value || todayStr();
  ev.time = document.getElementById('event-field-time').value || currentTimeStr();
  if (ev.type === 'note') {
    delete ev.exerciseId;
    delete ev.exerciseName;
    ev.text = document.getElementById('event-field-text').value.trim();
  } else {
    ev.annotation = document.getElementById('event-field-text').value.trim();
    if (ev.type === 'dose-change') {
      ev.changes = readEventDoseChanges(ev.changes || {});
    }
  }
  ev.updatedAt = new Date().toISOString();
  saveEvents(events);
  closeEventModal();
  render();
}

function deleteEventModal() {
  const ev = events.find(item => item.id === editingEventId);
  if (!ev) return;
  if (!confirm('Delete this timeline item? This cannot be undone.')) return;
  events = events.filter(item => item.id !== editingEventId);
  saveEvents(events);
  closeEventModal();
  renderNotesPanel();
}

function buildEventItem(ev) {
  const item = el('div', 'event-item');
  item.appendChild(elText('div', 'event-time', ev.time || '--:--'));
  const body = el('div', 'event-body');
  body.appendChild(elText('div', 'event-title', eventTitle(ev)));
  const text = eventText(ev);
  if (text) body.appendChild(elText('div', 'event-text', text));
  item.appendChild(body);
  return item;
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

