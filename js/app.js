// ── State ─────────────────────────────────────────────────────────
let exercises = [];
let sessions  = {};
let settings  = {};
let events    = [];
let currentWeekStart = null; // Monday of displayed week (Date)
let editingExId = null;      // exercise id being edited in modal
let uploadTargetId = null;   // exercise id awaiting image upload
let isDenseMode = false;     // compact scan view, persisted in settings
let imageImportPending = false;
let editingEventId = null;
let lastTodayStr = null;
let activeTracker = null;    // { exerciseId, dateStr }
let completedActionMenu = null; // { exerciseId, dateStr }
let lastSetLogAt = 0;
let cueAudioContext = null;

// ── Timer state ───────────────────────────────────────────────────
let timerState    = 'idle';  // 'idle' | 'running' | 'paused'
let timerSeconds  = 0;
let timerInterval = null;

// ── Init ─────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  exercises = loadExercises();
  sessions  = loadSessions();
  settings  = loadSettings();
  isDenseMode = Boolean(settings.denseMode);
  events    = loadEvents();
  runMigrations();
  currentWeekStart = getMonday(new Date());
  lastTodayStr = todayStr();
  restoreActiveTracker();
  render();
  bindStaticEvents();
  renderNotesPanel();
  startRealtimeUpdates();
});

// One-shot data migrations for existing localStorage installs
function runMigrations() {
  // Move "Rubber Band Pinky & Ring Finger" from Arm Day 1 → Arm Day 2
  const pinky = exercises.find(e => e.id === 'a1-8');
  if (pinky && pinky.group === 'arm-day1') {
    pinky.group = 'arm-day2';
    pinky.order = 5;
    saveExercises(exercises);
  }

}

// ── Arm day rotation (pure calendar-based) ────────────────────────
// Anchor: Friday May 1, 2026 = Day 1.
// Each subsequent scheduled day (Mon/Wed/Fri) flips between Day 1 and Day 2.
const ARM_ANCHOR_DATE = '2026-05-01';
const ARM_ANCHOR_DAY  = 'arm-day1';

function getArmDayForDate(dateStr) {
  const date   = dateFromStr(dateStr);
  const anchor = dateFromStr(ARM_ANCHOR_DATE);

  // Count M/W/F days between anchor and date (anchor exclusive, date inclusive
  // when going forward; mirror logic when going backward).
  let mwfCount = 0;
  if (date > anchor) {
    const cursor = new Date(anchor);
    cursor.setDate(cursor.getDate() + 1);
    while (cursor <= date) {
      const dow = cursor.getDay();
      if (dow === 1 || dow === 3 || dow === 5) mwfCount++;
      cursor.setDate(cursor.getDate() + 1);
    }
  } else if (date < anchor) {
    const cursor = new Date(anchor);
    cursor.setDate(cursor.getDate() - 1);
    while (cursor >= date) {
      const dow = cursor.getDay();
      if (dow === 1 || dow === 3 || dow === 5) mwfCount++;
      cursor.setDate(cursor.getDate() - 1);
    }
  }
  const flipped = mwfCount % 2 === 1;
  if (!flipped) return ARM_ANCHOR_DAY;
  return ARM_ANCHOR_DAY === 'arm-day1' ? 'arm-day2' : 'arm-day1';
}

// ── Week helpers ──────────────────────────────────────────────────
function getMonday(date) {
  const d = new Date(date);
  const day = d.getDay(); // 0=Sun
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function weekDates(monday) {
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(d.getDate() + i);
    return d;
  });
}

const DAY_NAMES  = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const MONTH_ABBR = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const GROUP_ORDER = ['arm-day1', 'arm-day2', 'legs'];
const SET_TIMER_CAP_SECONDS = 60 * 60;
const DEFAULT_PERSONAL_DAY_START_TIME = '07:00';

let draggedExerciseId = null;

function todayStr() { return toDateStr(new Date()); }

// ── Main render ───────────────────────────────────────────────────
function render(options = {}) {
  if (!options.preserveCompletedActionMenu) completedActionMenu = null;
  const dates = weekDates(currentWeekStart);
  const todayS = todayStr();

  // Month label in nav
  const months = [...new Set(dates.map(d => MONTH_ABBR[d.getMonth()]))];
  document.getElementById('week-label').textContent = months.join(' / ');

  const app = document.getElementById('app');
  app.innerHTML = '';
  document.body.classList.toggle('dense-mode', isDenseMode);
  document.body.classList.toggle('set-tracker-open', Boolean(activeTracker));

  app.appendChild(buildColHeaders(dates, todayS));

  let exerciseNumber = 1;
  for (const group of GROUP_ORDER) {
    const exs = exercises
      .filter(e => e.group === group)
      .sort((a, b) => a.order - b.order);
    app.appendChild(buildGroupSection(group, exs, dates, todayS, exerciseNumber));
    exerciseNumber += exs.length;
  }

  app.appendChild(buildSummaryRow(dates, todayS));
  updateCompactHeader();
  renderSetTracker();
  renderNotesPanel();
}

// ── Column headers ────────────────────────────────────────────────
function buildColHeaders(dates, todayS) {
  const row = el('div', 'col-header-row');
  const spacer = el('div', 'spacer');
  const tools = el('div', 'header-tools');
  tools.appendChild(buildDenseToggle());
  spacer.appendChild(tools);
  row.appendChild(spacer);

  dates.forEach((date, i) => {
    const dateS = toDateStr(date);
    const isToday = dateS === todayS;
    const cell = el('div', 'day-header' + (isToday ? ' today' : ''));

    const dow = date.getDay();
    const isArmDay  = dow === 1 || dow === 3 || dow === 5;
    const legsDays  = settings.legsDays !== undefined ? settings.legsDays : [1, 3, 5];
    const isLegsDay = legsDays.includes(dow);
    const dayTags = [];

    cell.appendChild(elText('div', 'day-name', DAY_NAMES[i]));
    cell.appendChild(elText('div', 'day-date', String(date.getDate())));

    if (isArmDay || isLegsDay) {
      const pillRow = el('div', 'day-pill-row');
      if (isArmDay) {
        const armDay = getArmDayForDate(dateS);
        dayTags.push(armDay);
        if (armDay === 'arm-day1') {
          pillRow.appendChild(elText('span', 'day-pill pill-d1', 'Day 1'));
        } else {
          pillRow.appendChild(elText('span', 'day-pill pill-d2', 'Day 2'));
        }
      }
      if (isLegsDay) {
        dayTags.push('legs');
        pillRow.appendChild(elText('span', 'day-pill pill-leg', 'Legs'));
      }
      cell.appendChild(pillRow);
    }

    if (dayTags.length) {
      dayTags.forEach(tag => cell.classList.add(`tag-${tag}`));
    }

    row.appendChild(cell);
  });

  return row;
}

// ── Group section ────────────────────────────────────────────────
function buildGroupSection(group, exs, dates, todayS, startNumber) {
  const frag = document.createDocumentFragment();
  const cfg = GROUPS[group];
  const isCollapsed = !isDenseMode && (settings.collapsedGroups || []).includes(group);

  // Section header
  const header = el('div', 'group-header' + (isCollapsed ? ' collapsed' : ''));
  header.dataset.group = group;
  header.style.borderTopColor = cfg.color;
  if (group === 'arm-day1') header.style.marginTop = '0';
  header.title = isDenseMode
    ? 'Dense view keeps all groups open'
    : (isCollapsed ? 'Click to expand' : 'Click to collapse');
  header.addEventListener('click', () => toggleGroupCollapse(group));
  header.addEventListener('dragover', handleExerciseDragOver);
  header.addEventListener('dragleave', clearDropPosition);
  header.addEventListener('drop', handleExerciseDropAtEnd);

  const label = el('div', 'group-header-label');
  label.appendChild(elText('span', 'collapse-chevron', '▾'));
  const dot = el('div', 'group-dot');
  dot.style.background = cfg.color;
  label.appendChild(dot);
  label.appendChild(document.createTextNode(cfg.label));
  header.appendChild(label);

  dates.forEach((date) => {
    const dateS = toDateStr(date);
    const isToday = dateS === todayS;
    header.appendChild(el('div', 'group-header-cell' + (isToday ? ' today' : '')));
  });

  frag.appendChild(header);

  if (isCollapsed) return frag;

  // Exercise rows
  exs.forEach((ex, i) => frag.appendChild(buildExerciseRow(ex, group, dates, todayS, startNumber + i)));

  // Add exercise button
  const addRow = el('div', 'add-exercise-row');
  addRow.dataset.group = group;
  addRow.addEventListener('dragover', handleExerciseDragOver);
  addRow.addEventListener('dragleave', clearDropPosition);
  addRow.addEventListener('drop', handleExerciseDropAtEnd);
  const addBtn = el('button', 'add-exercise-btn');
  addBtn.textContent = '+ Add exercise';
  addBtn.dataset.group = group;
  addBtn.addEventListener('click', () => openAddModal(group));
  addRow.appendChild(addBtn);
  frag.appendChild(addRow);

  return frag;
}

function toggleGroupCollapse(group) {
  if (isDenseMode) return;
  const collapsed = settings.collapsedGroups || [];
  const idx = collapsed.indexOf(group);
  if (idx === -1) collapsed.push(group);
  else            collapsed.splice(idx, 1);
  settings.collapsedGroups = collapsed;
  saveSettings(settings);
  render();
}

// ── Exercise row ──────────────────────────────────────────────────
function sortedExercisesInGroup(group) {
  return exercises
    .filter(e => e.group === group)
    .sort((a, b) => a.order - b.order);
}

function normalizeGroupOrders(groups = GROUP_ORDER) {
  groups.forEach(group => {
    sortedExercisesInGroup(group).forEach((ex, i) => { ex.order = i + 1; });
  });
}

function moveExercise(dragId, targetGroup, targetId = null, position = 'after') {
  const dragged = exercises.find(ex => ex.id === dragId);
  if (!dragged || !targetGroup) return;
  if (targetId === dragId) return;

  const oldGroup = dragged.group;
  const targetItems = sortedExercisesInGroup(targetGroup).filter(ex => ex.id !== dragId);
  let insertAt = targetItems.length;

  if (targetId) {
    const targetIndex = targetItems.findIndex(ex => ex.id === targetId);
    if (targetIndex !== -1) insertAt = targetIndex + (position === 'after' ? 1 : 0);
  }

  dragged.group = targetGroup;
  targetItems.splice(insertAt, 0, dragged);
  targetItems.forEach((ex, i) => { ex.order = i + 1; });
  if (oldGroup !== targetGroup) normalizeGroupOrders([oldGroup]);

  saveExercises(exercises);
  render();
}

function handleExerciseDragStart(e) {
  draggedExerciseId = e.currentTarget.dataset.exId;
  e.currentTarget.classList.add('dragging');
  e.dataTransfer.effectAllowed = 'move';
  e.dataTransfer.setData('text/plain', draggedExerciseId);
}

function handleExerciseDragEnd(e) {
  e.currentTarget.draggable = false;
  e.currentTarget.classList.remove('dragging');
  document.querySelectorAll('.drop-before, .drop-after, .drop-end').forEach(elm => {
    elm.classList.remove('drop-before', 'drop-after', 'drop-end');
  });
  draggedExerciseId = null;
}

function handleExerciseDragOver(e) {
  if (!draggedExerciseId) return;
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';

  const target = e.currentTarget;
  clearDropPosition({ currentTarget: target });

  if (target.classList.contains('exercise-row')) {
    const rect = target.getBoundingClientRect();
    const isAfter = e.clientY > rect.top + rect.height / 2;
    target.classList.add(isAfter ? 'drop-after' : 'drop-before');
  } else {
    target.classList.add('drop-end');
  }
}

function clearDropPosition(e) {
  e.currentTarget.classList.remove('drop-before', 'drop-after', 'drop-end');
}

function handleExerciseDropOnRow(e) {
  if (!draggedExerciseId) return;
  e.preventDefault();
  const target = e.currentTarget;
  const position = target.classList.contains('drop-before') ? 'before' : 'after';
  moveExercise(draggedExerciseId, target.dataset.group, target.dataset.exId, position);
}

function handleExerciseDropAtEnd(e) {
  if (!draggedExerciseId) return;
  e.preventDefault();
  e.stopPropagation();
  moveExercise(draggedExerciseId, e.currentTarget.dataset.group);
}

function buildExerciseRow(ex, group, dates, todayS, exerciseNumber) {
  const row = el('div', 'exercise-row');
  row.style.setProperty('--exercise-group-color', GROUPS[group].color);
  row.dataset.exId = ex.id;
  row.dataset.group = group;
  row.addEventListener('dragstart', handleExerciseDragStart);
  row.addEventListener('dragend', handleExerciseDragEnd);
  row.addEventListener('dragover', handleExerciseDragOver);
  row.addEventListener('dragleave', clearDropPosition);
  row.addEventListener('drop', handleExerciseDropOnRow);

  // Label cell
  const label = el('div', 'ex-label');

  const dragHandle = el('button', 'drag-handle');
  dragHandle.type = 'button';
  dragHandle.title = 'Drag to reorder';
  dragHandle.setAttribute('aria-label', 'Drag to reorder exercise');
  dragHandle.innerHTML = '&#9776;';
  dragHandle.addEventListener('mousedown', () => { row.draggable = true; });
  dragHandle.addEventListener('mouseup', () => { row.draggable = false; });
  label.appendChild(dragHandle);

  // Thumbnail
  const thumb = el('div', 'ex-thumb');
  thumb.title = 'Click to set image';
  if (ex.image) {
    const img = document.createElement('img');
    img.src = ex.image;
    img.alt = ex.name;
    thumb.appendChild(img);
  } else {
    thumb.innerHTML = '&#128247;';
  }
  thumb.addEventListener('click', () => openImageModal(ex.id));
  label.appendChild(thumb);

  // Info
  const info = el('div', 'ex-info');
  const nameRow = el('div', 'ex-name-row');
  nameRow.appendChild(elText('span', 'ex-number', String(exerciseNumber)));
  nameRow.appendChild(elText('span', 'ex-name', ex.name));
  info.appendChild(nameRow);

  const meta = el('div', 'ex-meta');
  meta.appendChild(elText('span', 'ex-meta-item ex-meta-chip ex-meta-sets', isDenseMode ? `S ${ex.sets}` : `Sets: ${ex.sets}`));
  meta.appendChild(elText('span', 'sep ex-meta-sep', '/'));
  meta.appendChild(elText('span', 'ex-meta-item ex-meta-chip ex-meta-reps', isDenseMode ? `R ${ex.reps}` : `Reps: ${ex.reps}`));
  if (ex.resistance) {
    meta.appendChild(elText('span', 'sep ex-meta-sep', '/'));
    meta.appendChild(elText('span', 'ex-meta-item ex-meta-chip ex-meta-resistance', isDenseMode ? `Res ${ex.resistance}` : `Resistance: ${ex.resistance}`));
  }
  meta.appendChild(elText('span', 'sep ex-meta-sep ex-meta-frequency-sep', '/'));
  meta.appendChild(elText('span', 'ex-meta-item ex-meta-frequency', ex.frequency));
  info.appendChild(meta);

  let instrText = null;

  label.appendChild(info);

  // Edit button
  const actions = el('div', 'ex-actions');
  if (ex.instructions) {
    const tog = el('button', 'btn-icon instructions-toggle');
    tog.title = 'Show instructions';
    tog.setAttribute('aria-label', 'Show instructions');
    tog.innerHTML = '&#9432;';
    instrText = el('div', 'instructions-text');
    instrText.textContent = ex.instructions;
    instrText.style.display = 'none';
    tog.addEventListener('click', () => {
      const open = instrText.style.display !== 'none';
      instrText.style.display = open ? 'none' : 'block';
      tog.classList.toggle('active', !open);
      tog.title = open ? 'Show instructions' : 'Hide instructions';
      tog.setAttribute('aria-label', open ? 'Show instructions' : 'Hide instructions');
    });
    actions.appendChild(tog);
  }
  const editBtn = el('button', 'btn-icon');
  editBtn.title = 'Edit exercise';
  editBtn.innerHTML = '&#9998;';
  editBtn.addEventListener('click', () => openEditModal(ex.id));
  actions.appendChild(editBtn);
  label.appendChild(actions);
  if (instrText) label.appendChild(instrText);

  row.appendChild(label);

  // Day cells
  dates.forEach((date) => {
    const dateS = toDateStr(date);
    const isToday = dateS === todayS;

    const progress = getSetProgress(dateS, ex.id);
    const done = isExerciseDone(dateS, ex.id);
    const isActive = activeTracker?.dateStr === dateS && activeTracker?.exerciseId === ex.id;
    const cell = el('div', 'day-cell' + (isToday ? ' today' : '') + (isActive ? ' active-tracked' : ''));
    cell.dataset.exId = ex.id;
    cell.dataset.dateStr = dateS;
    const doseEvents = events.filter(ev =>
      ev.type === 'dose-change' && ev.date === dateS && ev.exerciseId === ex.id
    );

    const btn = el('button', 'check-btn set-cell-btn' + (done ? ' done' : '') + (progress && !done ? ' in-progress' : ''));
    btn.title = isActive ? 'Complete all sets' : (done ? 'View or clear log' : 'Track sets');
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      handleSetCellClick(ex.id, dateS);
    });
    if (done) {
      btn.innerHTML = '&#10003;';
    } else if (progress) {
      btn.appendChild(elText('span', 'set-progress-text', `${progress.completedSets}/${progress.targetSets}`));
    } else {
      btn.innerHTML = '';
    }

    cell.appendChild(btn);
    if (isCompletedActionMenuOpen(ex.id, dateS)) {
      cell.appendChild(buildCompletedActionMenu(ex.id, dateS));
    }
    if (doseEvents.length) {
      const marker = elText('button', 'dose-marker', String(doseEvents.length));
      marker.title = 'Dose change logged';
      marker.addEventListener('click', (e) => {
        e.stopPropagation();
        openNotesModal(dateS);
      });
      cell.appendChild(marker);
    }
    row.appendChild(cell);
  });

  return row;
}

// ── Summary row ───────────────────────────────────────────────────
function eventsForDate(dateStr) {
  return events
    .filter(ev => ev.date === dateStr)
    .sort((a, b) => (a.time || '').localeCompare(b.time || ''));
}

function timelineEvents() {
  return events
    .filter(ev => ev.type === 'note' || ev.type === 'dose-change' || ev.type === 'exercise-added')
    .sort((a, b) => {
      const aKey = `${a.date || ''}T${a.time || '00:00'}`;
      const bKey = `${b.date || ''}T${b.time || '00:00'}`;
      return bKey.localeCompare(aKey);
    });
}

function groupedTimelineEvents() {
  const groups = [];
  const byDate = new Map();
  timelineEvents().forEach(ev => {
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

function buildSummaryRow(dates, todayS) {
  const row = el('div', 'summary-row');
  row.appendChild(elText('div', 'summary-label', 'Completion'));

  dates.forEach((date) => {
    const dateS = toDateStr(date);
    const isToday = dateS === todayS;
    const relevantExs = exercises;
    const done = relevantExs.filter(e => isExerciseDone(dateS, e.id)).length;
    const pct = relevantExs.length === 0 ? 0 : Math.round(done / relevantExs.length * 100);
    const cell = el('div', 'summary-pct' + (isToday ? ' today' : '') + (pct === 100 ? ' full' : ''));
    cell.textContent = pct + '%';
    row.appendChild(cell);
  });

  return row;
}

// ── Toggle completion ─────────────────────────────────────────────
function toggleComplete(exId, dateStr) {
  const s = sessions[dateStr] || { completedExercises: [] };
  const idx = s.completedExercises.indexOf(exId);
  if (idx === -1) s.completedExercises.push(exId);
  else            s.completedExercises.splice(idx, 1);
  sessions[dateStr] = s;
  saveSession(dateStr, s);
  render();
}

function restoreActiveTracker() {
  const todayS = todayStr();
  const s = sessions[todayS];
  const exId = s?.activeExerciseId;
  if (!exId || !exercises.some(ex => ex.id === exId)) return;
  if (isExerciseDone(todayS, exId)) {
    delete s.activeExerciseId;
    saveSession(todayS, s);
    return;
  }
  activeTracker = { exerciseId: exId, dateStr: todayS };
}

function getSessionForEdit(dateStr) {
  const s = sessions[dateStr] || {};
  if (!Array.isArray(s.completedExercises)) s.completedExercises = [];
  if (!s.setProgress || typeof s.setProgress !== 'object') s.setProgress = {};
  sessions[dateStr] = s;
  return s;
}

function targetSetsForExercise(ex) {
  const sets = Number.parseInt(ex?.sets, 10);
  return Number.isFinite(sets) && sets > 0 ? sets : 1;
}

function getSetProgress(dateStr, exId) {
  const progress = sessions[dateStr]?.setProgress?.[exId];
  if (!progress) return null;
  const ex = exercises.find(item => item.id === exId);
  return normalizeSetProgress(progress, ex);
}

function isProgressComplete(progress) {
  return Boolean(progress?.completedAt || progress?.finishedEarly || progress?.completedSets >= progress?.targetSets);
}

function isExerciseDone(dateStr, exId) {
  const progress = getSetProgress(dateStr, exId);
  return isProgressComplete(progress) || (sessions[dateStr]?.completedExercises || []).includes(exId);
}

function setCompletion(dateStr, exId, complete) {
  const s = getSessionForEdit(dateStr);
  const idx = s.completedExercises.indexOf(exId);
  if (complete && idx === -1) s.completedExercises.push(exId);
  if (!complete && idx !== -1) s.completedExercises.splice(idx, 1);
}

function isCompletedActionMenuOpen(exId, dateStr) {
  return completedActionMenu?.exerciseId === exId && completedActionMenu?.dateStr === dateStr;
}

function openCompletedActionMenu(exId, dateStr) {
  completedActionMenu = { exerciseId: exId, dateStr };
  render({ preserveCompletedActionMenu: true });
}

function closeCompletedActionMenu() {
  if (!completedActionMenu) return;
  completedActionMenu = null;
  render();
}

function buildCompletedActionMenu(exId, dateStr) {
  const menu = el('div', 'completed-action-menu');
  menu.setAttribute('role', 'menu');
  menu.addEventListener('click', (e) => e.stopPropagation());

  const view = elText('button', 'completed-action completed-action-view', 'View Log');
  view.type = 'button';
  view.setAttribute('role', 'menuitem');
  view.addEventListener('click', () => {
    completedActionMenu = null;
    openSetTracker(exId, dateStr);
  });

  const clear = elText('button', 'completed-action completed-action-clear', 'Clear Log');
  clear.type = 'button';
  clear.setAttribute('role', 'menuitem');
  clear.addEventListener('click', () => {
    completedActionMenu = null;
    clearExerciseProgress(exId, dateStr);
  });

  menu.appendChild(view);
  menu.appendChild(clear);
  return menu;
}

function handleSetCellClick(exId, dateStr) {
  if (isExerciseDone(dateStr, exId) && !(activeTracker?.exerciseId === exId && activeTracker?.dateStr === dateStr)) {
    openCompletedActionMenu(exId, dateStr);
    return;
  }
  completedActionMenu = null;
  if (activeTracker?.exerciseId === exId && activeTracker?.dateStr === dateStr) {
    completeActiveExercise();
    return;
  }
  openSetTracker(exId, dateStr);
}

function normalizeSetProgress(progress, ex) {
  const targetSets = targetSetsForExercise(ex);
  return {
    completedSets: Math.min(targetSets, Math.max(0, Number(progress?.completedSets) || 0)),
    targetSets,
    startedAt: progress?.startedAt,
    updatedAt: progress?.updatedAt,
    completedAt: progress?.completedAt || null,
    finishedEarly: Boolean(progress?.finishedEarly),
    setDurations: Array.isArray(progress?.setDurations)
      ? progress.setDurations.map(value => Math.max(0, Number(value) || 0))
      : [],
    timerStartedAt: progress?.timerStartedAt || null,
    elapsedSeconds: Math.max(0, Number(progress?.elapsedSeconds) || 0),
    timerStoppedAt: progress?.timerStoppedAt || null,
    timerCapped: Boolean(progress?.timerCapped),
  };
}

function activeElapsedSeconds(progress, now = new Date()) {
  const base = Math.max(0, Number(progress.elapsedSeconds) || 0);
  if (!progress.timerStartedAt || progress.timerStoppedAt || progress.timerCapped || isProgressComplete(progress)) {
    return Math.min(base, SET_TIMER_CAP_SECONDS);
  }
  const running = Math.max(0, Math.floor((now.getTime() - new Date(progress.timerStartedAt).getTime()) / 1000));
  return Math.min(base + running, SET_TIMER_CAP_SECONDS);
}

function currentTimerSegmentSeconds(progress, now = new Date()) {
  if (!progress.timerStartedAt || progress.timerStoppedAt || progress.timerCapped) return 0;
  return Math.max(0, Math.floor((now.getTime() - new Date(progress.timerStartedAt).getTime()) / 1000));
}

function startSetTimer(progress, now = new Date()) {
  if (isProgressComplete(progress) || progress.timerCapped) return progress;
  progress.timerStartedAt = now.toISOString();
  progress.timerStoppedAt = null;
  return progress;
}

function stopSetTimer(progress, now = new Date()) {
  if (progress.timerStartedAt && !progress.timerStoppedAt && !progress.timerCapped) {
    progress.elapsedSeconds = Math.min(
      SET_TIMER_CAP_SECONDS,
      progress.elapsedSeconds + currentTimerSegmentSeconds(progress, now)
    );
  }
  progress.timerStartedAt = null;
  progress.timerStoppedAt = now.toISOString();
  return progress;
}

function enforceTimerCap(progress, now = new Date()) {
  if (activeElapsedSeconds(progress, now) < SET_TIMER_CAP_SECONDS || progress.timerCapped) return false;
  progress.elapsedSeconds = SET_TIMER_CAP_SECONDS;
  progress.timerStartedAt = null;
  progress.timerStoppedAt = now.toISOString();
  progress.timerCapped = true;
  return true;
}

function openSetTracker(exId, dateStr) {
  const ex = exercises.find(item => item.id === exId);
  if (!ex) return;
  const s = getSessionForEdit(dateStr);
  if (!s.setProgress[exId]) {
    const now = new Date().toISOString();
    const wasComplete = s.completedExercises.includes(exId);
    const targetSets = targetSetsForExercise(ex);
    s.setProgress[exId] = {
      completedSets: wasComplete ? targetSets : 0,
      targetSets,
      startedAt: now,
      updatedAt: now,
      completedAt: wasComplete ? now : null,
      finishedEarly: false,
      setDurations: [],
      timerStartedAt: wasComplete ? null : now,
      elapsedSeconds: 0,
      timerStoppedAt: wasComplete ? now : null,
      timerCapped: false,
    };
  } else {
    s.setProgress[exId] = normalizeSetProgress(s.setProgress[exId], ex);
    if (!isProgressComplete(s.setProgress[exId]) && !s.setProgress[exId].timerStartedAt && !s.setProgress[exId].timerCapped) {
      startSetTimer(s.setProgress[exId]);
    }
  }
  s.activeExerciseId = exId;
  activeTracker = { exerciseId: exId, dateStr };
  saveSession(dateStr, s);
  render();
  window.setTimeout(() => scrollActiveCellIntoView(exId, dateStr), 0);
}

function logSet() {
  const current = getActiveTrackerParts();
  if (!current) return;
  const nowMs = Date.now();
  if (nowMs - lastSetLogAt < 450) return;
  lastSetLogAt = nowMs;

  const { ex, dateStr, session, progress } = current;
  const now = new Date();
  enforceTimerCap(progress, now);
  if (progress.timerCapped || isProgressComplete(progress)) {
    session.setProgress[ex.id] = progress;
    saveSession(dateStr, session);
    render();
    return;
  }
  const setDuration = currentTimerSegmentSeconds(progress, now);
  progress.setDurations[progress.completedSets] = setDuration;
  progress.elapsedSeconds = Math.min(SET_TIMER_CAP_SECONDS, progress.elapsedSeconds + setDuration);
  progress.completedSets = Math.min(progress.targetSets, progress.completedSets + 1);
  progress.updatedAt = now.toISOString();
  progress.finishedEarly = false;
  if (progress.completedSets >= progress.targetSets) {
    progress.completedAt = progress.updatedAt;
    progress.timerStartedAt = null;
    progress.timerStoppedAt = progress.updatedAt;
    setCompletion(dateStr, ex.id, true);
  } else {
    progress.completedAt = null;
    if (!progress.timerCapped) startSetTimer(progress, now);
    setCompletion(dateStr, ex.id, false);
  }
  session.setProgress[ex.id] = progress;
  saveSession(dateStr, session);
  playSetCue(progress.completedSets);
  render();
}

function completeActiveExercise() {
  const current = getActiveTrackerParts();
  if (!current) return;
  const { ex, dateStr, session, progress } = current;
  const now = new Date();
  enforceTimerCap(progress, now);
  stopSetTimer(progress, now);
  progress.completedSets = progress.targetSets;
  progress.updatedAt = now.toISOString();
  progress.completedAt = progress.updatedAt;
  progress.finishedEarly = false;
  session.setProgress[ex.id] = progress;
  setCompletion(dateStr, ex.id, true);
  saveSession(dateStr, session);
  playFinishCue();
  render();
}

function doneActiveExercise() {
  const current = getActiveTrackerParts();
  if (!current) return;
  const { ex, dateStr, session, progress } = current;
  const now = new Date();
  enforceTimerCap(progress, now);
  stopSetTimer(progress, now);
  progress.updatedAt = now.toISOString();
  progress.finishedEarly = false;
  if (progress.completedSets >= progress.targetSets) {
    progress.completedAt = progress.updatedAt;
    setCompletion(dateStr, ex.id, true);
  } else {
    progress.completedAt = null;
    setCompletion(dateStr, ex.id, false);
  }
  session.setProgress[ex.id] = progress;
  delete session.activeExerciseId;
  saveSession(dateStr, session);
  activeTracker = null;
  render();
}

function decrementActiveSet() {
  const current = getActiveTrackerParts();
  if (!current) return;
  const { ex, dateStr, session, progress } = current;
  if (progress.completedAt || progress.finishedEarly) {
    progress.completedAt = null;
    progress.finishedEarly = false;
    progress.completedSets = Math.max(0, progress.completedSets - 1);
    progress.setDurations.splice(progress.completedSets, 1);
    if (!progress.timerStartedAt && !progress.timerCapped) startSetTimer(progress);
  } else if (progress.completedSets >= progress.targetSets) {
    progress.completedSets = Math.max(0, progress.completedSets - 1);
    progress.setDurations.splice(progress.completedSets, 1);
    if (!progress.timerStartedAt && !progress.timerCapped) startSetTimer(progress);
  } else {
    progress.completedSets = Math.max(0, progress.completedSets - 1);
    progress.setDurations.splice(progress.completedSets, 1);
    if (!progress.timerStartedAt && !progress.timerCapped) startSetTimer(progress);
  }
  progress.updatedAt = new Date().toISOString();
  session.setProgress[ex.id] = progress;
  setCompletion(dateStr, ex.id, false);
  saveSession(dateStr, session);
  render();
}

function clearActiveProgress() {
  const current = getActiveTrackerParts();
  if (!current) return;
  clearExerciseProgress(current.ex.id, current.dateStr);
}

function clearExerciseProgress(exId, dateStr) {
  const session = getSessionForEdit(dateStr);
  delete session.setProgress[exId];
  if (session.activeExerciseId === exId) delete session.activeExerciseId;
  setCompletion(dateStr, exId, false);
  saveSession(dateStr, session);
  if (activeTracker?.exerciseId === exId && activeTracker?.dateStr === dateStr) activeTracker = null;
  render();
}

function closeSetTracker() {
  if (activeTracker?.dateStr) {
    const s = getSessionForEdit(activeTracker.dateStr);
    delete s.activeExerciseId;
    saveSession(activeTracker.dateStr, s);
  }
  activeTracker = null;
  render();
}

function scrollActiveCellIntoView(exId, dateStr) {
  const escapeIdent = window.CSS?.escape || ((value) => String(value).replace(/"/g, '\\"'));
  const selector = `.day-cell[data-ex-id="${escapeIdent(exId)}"][data-date-str="${escapeIdent(dateStr)}"]`;
  const cell = document.querySelector(selector);
  const tracker = document.querySelector('.set-tracker');
  if (!cell || !tracker) return;

  const cellRect = cell.getBoundingClientRect();
  const trackerRect = tracker.getBoundingClientRect();
  const overlap = cellRect.bottom - trackerRect.top;
  if (overlap > -16) {
    window.scrollBy({ top: overlap + 28, behavior: 'smooth' });
  }
}

function getActiveTrackerParts() {
  if (!activeTracker) return null;
  const ex = exercises.find(item => item.id === activeTracker.exerciseId);
  if (!ex) return null;
  const session = getSessionForEdit(activeTracker.dateStr);
  let progress = session.setProgress[ex.id];
  if (!progress) {
    const now = new Date().toISOString();
    progress = {
      completedSets: 0,
      targetSets: targetSetsForExercise(ex),
      startedAt: now,
      updatedAt: now,
      completedAt: null,
      finishedEarly: false,
    };
  }
  progress = normalizeSetProgress(progress, ex);
  if (enforceTimerCap(progress)) {
    progress.updatedAt = new Date().toISOString();
    saveSession(activeTracker.dateStr, session);
  }
  session.setProgress[ex.id] = progress;
  return { ex, dateStr: activeTracker.dateStr, session, progress };
}

function renderSetTracker() {
  const root = document.getElementById('set-tracker-root');
  if (!root) return;
  root.innerHTML = '';
  const current = getActiveTrackerParts();
  if (!current) return;

  const { ex, dateStr, progress } = current;
  const done = isProgressComplete(progress);
  const panel = el('section', 'set-tracker' + (done ? ' complete' : ''));
  panel.style.setProperty('--tracker-color', GROUPS[ex.group]?.color || 'var(--accent-green)');

  const main = el('div', 'set-tracker-main');
  const info = el('div', 'set-tracker-info');
  info.appendChild(elText('div', 'set-tracker-kicker', dateStr === todayStr() ? 'Active today' : dateStr));
  info.appendChild(elText('div', 'set-tracker-name', ex.name));
  info.appendChild(elText('div', 'set-tracker-meta', `${progress.completedSets}/${progress.targetSets} sets | ${ex.reps} reps${ex.resistance ? ` | ${ex.resistance}` : ''}`));
  main.appendChild(info);
  panel.appendChild(main);

  const timer = el('div', 'set-tracker-timer');
  timer.appendChild(elText('div', 'set-tracker-timer-label', 'Timer'));
  timer.appendChild(elText('div', 'set-tracker-timer-value', trackerTimerValue(progress)));
  const timerDetail = trackerTimerDetail(progress);
  if (timerDetail) timer.appendChild(elText('div', 'set-tracker-timer-detail', timerDetail));
  panel.appendChild(timer);

  const progressWrap = el('div', 'set-tracker-progress');
  for (let i = 1; i <= progress.targetSets; i++) {
    progressWrap.appendChild(el('span', 'set-dot' + (i <= progress.completedSets ? ' filled' : '')));
  }
  panel.appendChild(progressWrap);

  const close = elText('button', 'set-tracker-close', 'X');
  close.title = 'Close tracker';
  close.setAttribute('aria-label', 'Close tracker');
  close.addEventListener('click', closeSetTracker);
  panel.appendChild(close);

  const actions = el('div', 'set-tracker-actions');
  const completeSet = elText('button', 'set-action set-action-primary', 'Complete Set');
  completeSet.disabled = done || progress.timerCapped;
  completeSet.title = 'Right arrow';
  completeSet.addEventListener('click', logSet);
  const doneBtn = elText('button', 'set-action set-action-finish', 'Done');
  doneBtn.addEventListener('click', doneActiveExercise);
  const clear = elText('button', 'set-action set-action-danger', 'Clear');
  clear.addEventListener('click', clearActiveProgress);
  actions.appendChild(completeSet);
  actions.appendChild(doneBtn);
  actions.appendChild(clear);
  panel.appendChild(actions);

  const footer = el('div', 'set-tracker-footer');
  footer.appendChild(elText('div', 'set-tracker-recency', trackerStatusText(progress)));
  footer.appendChild(elText('div', 'set-tracker-help', 'Arrow keys adjust sets | Double-click checkmark to complete all sets'));
  panel.appendChild(footer);
  root.appendChild(panel);
}

function formatLastLogged(iso) {
  if (!iso) return 'Not logged yet';
  const seconds = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (seconds < 10) return 'Just logged';
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  return new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

function trackerTimerValue(progress) {
  return fmtShortDuration(activeElapsedSeconds(progress));
}

function trackerTimerDetail(progress) {
  const parts = [];
  const lastDuration = progress.setDurations[progress.completedSets - 1];
  if (lastDuration !== undefined) parts.push(`last set ${fmtShortDuration(lastDuration)}`);
  if (progress.timerCapped) parts.push('stopped at 60m');
  return parts.join(' | ');
}

function trackerStatusText(progress) {
  if (progress.timerCapped && !isProgressComplete(progress)) return 'Timer stopped automatically';
  return formatLastLogged(progress.updatedAt);
}

function fmtShortDuration(totalSeconds) {
  const seconds = Math.max(0, Math.floor(totalSeconds || 0));
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  if (minutes >= 60) return '60:00';
  return `${String(minutes).padStart(2, '0')}:${String(remainder).padStart(2, '0')}`;
}

function playSetCue(setNumber) {
  if (settings.setCueSound !== false) playToneSequence([
    [820, 0.12],
    [1120, 0.13],
    [1460, 0.16],
  ]);
  if (settings.setCueVibrate !== false && navigator.vibrate) navigator.vibrate(80);
  if (settings.setCueSpeech && window.speechSynthesis) {
    const utterance = new SpeechSynthesisUtterance(`set ${setNumber} completed`);
    utterance.rate = 1.1;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
  }
}

function playFinishCue() {
  if (settings.setCueSound !== false) playToneSequence([
    [620, 0.14],
    [930, 0.16],
    [1240, 0.2],
  ]);
  if (settings.setCueVibrate !== false && navigator.vibrate) navigator.vibrate([60, 40, 60]);
}

function playToneSequence(notes) {
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  if (!AudioCtx) return;
  cueAudioContext = cueAudioContext || new AudioCtx();
  let offset = 0;
  notes.forEach(([frequency, duration]) => {
    const startAt = cueAudioContext.currentTime + offset;
    const osc = cueAudioContext.createOscillator();
    const gain = cueAudioContext.createGain();
    osc.frequency.value = frequency;
    osc.type = 'triangle';
    gain.gain.setValueAtTime(0.0001, startAt);
    gain.gain.exponentialRampToValueAtTime(0.22, startAt + 0.025);
    gain.gain.exponentialRampToValueAtTime(0.0001, startAt + duration);
    osc.connect(gain);
    gain.connect(cueAudioContext.destination);
    osc.start(startAt);
    osc.stop(startAt + duration + 0.03);
    offset += duration + 0.045;
  });
}

// ── Edit modal ────────────────────────────────────────────────────
function openEditModal(exId) {
  editingExId = exId;
  const ex = exercises.find(e => e.id === exId);
  if (!ex) return;

  document.getElementById('modal-title').textContent = 'Edit Exercise';
  document.getElementById('field-name').value = ex.name;
  document.getElementById('field-sets').value = ex.sets;
  document.getElementById('field-reps').value = ex.reps;
  document.getElementById('field-resistance').value = ex.resistance || '';
  document.getElementById('field-frequency').value = ex.frequency || '';
  document.getElementById('field-instructions').value = ex.instructions || '';
  document.getElementById('field-group').value = ex.group;

  document.getElementById('delete-btn').style.display = 'inline-block';
  showModal();
}

function openAddModal(group) {
  editingExId = null;
  document.getElementById('modal-title').textContent = 'Add Exercise';
  document.getElementById('field-name').value = '';
  document.getElementById('field-sets').value = '3';
  document.getElementById('field-reps').value = '10';
  document.getElementById('field-resistance').value = '';
  document.getElementById('field-frequency').value = '3x/week';
  document.getElementById('field-instructions').value = '';
  document.getElementById('field-group').value = group;
  document.getElementById('delete-btn').style.display = 'none';
  showModal();
}

function showModal() {
  document.getElementById('exercise-modal').classList.remove('hidden');
}

function closeModal() {
  document.getElementById('exercise-modal').classList.add('hidden');
  editingExId = null;
}

function saveExerciseModal() {
  const name = document.getElementById('field-name').value.trim();
  if (!name) { alert('Exercise name is required.'); return; }

  const fields = {
    name,
    sets:         parseInt(document.getElementById('field-sets').value) || 1,
    reps:         document.getElementById('field-reps').value.trim(),
    resistance:   document.getElementById('field-resistance').value.trim(),
    frequency:    document.getElementById('field-frequency').value.trim(),
    instructions: document.getElementById('field-instructions').value.trim(),
    group:        document.getElementById('field-group').value,
  };

  if (editingExId) {
    const idx = exercises.findIndex(e => e.id === editingExId);
    if (idx !== -1) {
      const previous = { ...exercises[idx] };
      const changes = doseChanges(previous, fields);
      exercises[idx] = { ...exercises[idx], ...fields };
      if (Object.keys(changes).length) {
        logDoseChange(exercises[idx], changes);
      }
    }
  } else {
    const maxOrder = exercises.filter(e => e.group === fields.group)
      .reduce((m, e) => Math.max(m, e.order), 0);
    const exercise = {
      id: 'ex-' + Date.now(),
      image: null,
      order: maxOrder + 1,
      ...fields,
    };
    exercises.push(exercise);
    logExerciseAdded(exercise);
  }

  saveExercises(exercises);
  closeModal();
  render();
}

function deleteExercise() {
  if (!editingExId) return;
  if (!confirm('Delete this exercise? This cannot be undone.')) return;
  exercises = exercises.filter(e => e.id !== editingExId);
  saveExercises(exercises);
  closeModal();
  render();
}

// ── Timer ─────────────────────────────────────────────────────────
function currentTimeStr() {
  const now = new Date();
  return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
}

function startRealtimeUpdates() {
  syncRealtimeFields();
  window.setInterval(syncRealtimeFields, 30000);
  window.setInterval(syncSetTrackerTimer, 1000);
}

function syncRealtimeFields() {
  const nowToday = todayStr();
  if (lastTodayStr && nowToday !== lastTodayStr) {
    lastTodayStr = nowToday;
    currentWeekStart = getMonday(new Date());
    render();
    return;
  }
  lastTodayStr = nowToday;
  syncQuickNoteDateTime();
  renderSetTracker();
}

function syncSetTrackerTimer() {
  if (!activeTracker) return;
  const current = getActiveTrackerParts();
  if (!current) return;
  const { dateStr, session, ex, progress } = current;
  if (enforceTimerCap(progress)) {
    progress.updatedAt = new Date().toISOString();
    session.setProgress[ex.id] = progress;
    saveSession(dateStr, session);
  }
  renderSetTracker();
}

function syncQuickNoteDateTime() {
  const textField = document.getElementById('quick-note-text');
  const dateField = document.getElementById('quick-note-date');
  const timeField = document.getElementById('quick-note-time');
  if (!textField || !dateField || !timeField) return;

  const active = document.activeElement;
  const userIsEditingTimestamp = active === dateField || active === timeField;
  const noteInProgress = textField.value.trim().length > 0;
  if (userIsEditingTimestamp || noteInProgress) return;

  dateField.value = todayStr();
  timeField.value = currentTimeStr();
}

function handleSetTrackerKeydown(e) {
  if (completedActionMenu && e.key === 'Escape') {
    e.preventDefault();
    closeCompletedActionMenu();
    return;
  }
  if (!activeTracker) return;
  const tag = document.activeElement?.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
  if (e.key === 'ArrowRight') {
    e.preventDefault();
    logSet();
  } else if (e.key === 'ArrowLeft') {
    e.preventDefault();
    decrementActiveSet();
  }
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

function fillEventSelect(id, items, emptyLabel) {
  const select = document.getElementById(id);
  select.innerHTML = '';
  const empty = document.createElement('option');
  empty.value = '';
  empty.textContent = emptyLabel;
  select.appendChild(empty);
  items.forEach(item => {
    const option = document.createElement('option');
    option.value = item.id;
    option.textContent = item.name;
    select.appendChild(option);
  });
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
  const btn = document.getElementById('btn-notes');
  if (!panel || !btn) return;

  document.body.classList.toggle('notes-open', Boolean(settings.notesOpen));
  btn.classList.toggle('active', Boolean(settings.notesOpen));
  btn.textContent = settings.notesOpen ? 'Hide Notes' : 'Notes';

  fillEventSelect('quick-note-exercise', exercises, 'No exercise tag');
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

  const exerciseId = document.getElementById('quick-note-exercise').value;
  const exercise = exercises.find(ex => ex.id === exerciseId);
  events.push({
    id: makeId('event'),
    type: 'note',
    date: document.getElementById('quick-note-date').value || todayStr(),
    time: document.getElementById('quick-note-time').value || currentTimeStr(),
    exerciseId: exerciseId || undefined,
    exerciseName: exercise?.name,
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

function buildTimelineDay(group) {
  const section = el('section', 'timeline-day');
  const header = elText('div', 'timeline-day-header', formatEventDateShort(group.date));
  header.title = formatEventDate(group.date);
  section.appendChild(header);

  const rows = el('div', 'timeline-day-rows');
  let lastSegment = null;
  group.events.forEach(ev => {
    const segment = timelineDaySegment(ev.time);
    if (lastSegment === 'awake' && segment === 'late') {
      rows.appendChild(buildTimelineBoundary());
    }
    rows.appendChild(buildTimelineItem(ev));
    lastSegment = segment;
  });
  section.appendChild(rows);
  return section;
}

function timelineDaySegment(timeStr) {
  const minutes = timeToMinutes(timeStr);
  if (minutes === null) return 'awake';
  return minutes < getPersonalDayStartMinutes() ? 'late' : 'awake';
}

function buildTimelineBoundary() {
  const boundary = el('div', 'timeline-boundary');
  boundary.appendChild(elText('span', 'timeline-boundary-label', `Before ${formatBoundaryTime(getPersonalDayStartTime())}`));
  return boundary;
}

function getPersonalDayStartTime() {
  return isValidTime(settings.personalDayStartTime)
    ? settings.personalDayStartTime
    : DEFAULT_PERSONAL_DAY_START_TIME;
}

function getPersonalDayStartMinutes() {
  return timeToMinutes(getPersonalDayStartTime()) ?? timeToMinutes(DEFAULT_PERSONAL_DAY_START_TIME);
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

function formatBoundaryTime(timeStr) {
  const [hourRaw, minuteRaw] = timeStr.split(':').map(Number);
  const suffix = hourRaw >= 12 ? 'PM' : 'AM';
  const hour = hourRaw % 12 || 12;
  if (minuteRaw === 0) return `${hour} ${suffix}`;
  return `${hour}:${String(minuteRaw).padStart(2, '0')} ${suffix}`;
}

function buildTimelineItem(ev) {
  const item = el('article', 'timeline-row timeline-' + ev.type);
  const content = el('div', 'timeline-row-content');
  content.appendChild(elText('span', 'timeline-time', formatEventTime(ev.time)));

  if (ev.type === 'note') {
    content.appendChild(elText('span', 'timeline-separator', '-'));
    content.appendChild(elText('span', 'timeline-note-text', ev.text || ''));
  } else {
    content.appendChild(elText('span', 'timeline-separator', '-'));
    content.appendChild(elText('span', 'timeline-event-title', eventTitle(ev)));
    const detail = eventText(ev);
    if (detail) content.appendChild(elText('span', 'timeline-event-detail', detail));
    if (ev.annotation) content.appendChild(elText('span', 'timeline-event-annotation', ev.annotation));
  }

  item.appendChild(content);
  const editBtn = elText('button', 'timeline-edit', 'Edit');
  editBtn.type = 'button';
  editBtn.addEventListener('click', () => openEventModal(ev.id));
  item.appendChild(editBtn);
  return item;
}

function formatEventDateShort(dateStr) {
  if (!dateStr || dateStr === 'undated') return 'No date';
  const d = dateFromStr(dateStr);
  return `${MONTH_ABBR[d.getMonth()]} ${d.getDate()}`;
}

function formatEventDate(dateStr) {
  if (!dateStr || dateStr === 'undated') return 'No date';
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
  fillEventSelect('event-field-exercise', exercises, 'No exercise tag');
  document.getElementById('event-field-exercise').value = ev.exerciseId || '';
  document.getElementById('event-field-exercise').disabled = ev.type !== 'note';
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
  const exerciseId = document.getElementById('event-field-exercise').value;
  const exercise = exercises.find(ex => ex.id === exerciseId);
  ev.date = document.getElementById('event-field-date').value || todayStr();
  ev.time = document.getElementById('event-field-time').value || currentTimeStr();
  if (ev.type === 'note') {
    ev.exerciseId = exerciseId || undefined;
    ev.exerciseName = exercise?.name;
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
  const tags = [ev.symptomName, ev.exerciseName].filter(Boolean).join(' + ');
  return tags || 'Note';
}

function eventText(ev) {
  if (ev.type === 'dose-change') {
    return Object.entries(ev.changes || {})
      .map(([field, change]) => `${field}: ${change.from || 'blank'} -> ${change.to || 'blank'}`)
      .join(' / ');
  }
  if (ev.type === 'exercise-added') return 'New exercise added to the program.';
  return ev.text || '';
}

function fmtTimer(s) {
  const m = Math.floor(s / 60);
  return `${String(m).padStart(2, '0')} m ${String(s % 60).padStart(2, '0')} s`;
}

function buildTimerWidget() {
  const wrap = el('div', 'timer-widget');

  const display = el('div', 'timer-display');
  display.id = 'timer-display';
  display.textContent = fmtTimer(timerSeconds);
  wrap.appendChild(display);

  wrap.appendChild(makeTimerBtns());
  return wrap;
}

function buildDenseToggle() {
  const label = isDenseMode ? 'Normal View' : 'Dense View';
  const btn = elText('button', 'dense-toggle-btn' + (isDenseMode ? ' active' : ''), label);
  btn.type = 'button';
  btn.title = isDenseMode ? 'Return to normal row height' : 'Compress rows to scan all exercises';
  btn.setAttribute('aria-pressed', isDenseMode ? 'true' : 'false');
  btn.addEventListener('click', toggleDenseMode);
  return btn;
}

function makeTimerBtns() {
  const btns = el('div', 'timer-btns');
  if (timerState === 'idle') {
    btns.appendChild(timerBtn('START', 'timer-btn-start', timerStart));
  } else if (timerState === 'running') {
    btns.appendChild(timerBtn('STOP', 'timer-btn-stop', timerStop));
  } else {
    btns.appendChild(timerBtn('RESUME',  'timer-btn-start',   timerResume));
    btns.appendChild(timerBtn('RESTART', 'timer-btn-restart', timerRestart));
    btns.appendChild(timerBtn('SAVE',    'timer-btn-save',    timerSave));
  }
  return btns;
}

function timerBtn(label, cls, handler) {
  const b = elText('button', 'timer-btn ' + cls, label);
  b.addEventListener('click', handler);
  return b;
}

function toggleDenseMode() {
  isDenseMode = !isDenseMode;
  settings.denseMode = isDenseMode;
  saveSettings(settings);
  render();
}

function refreshTimerBtns() {
  const widget = document.querySelector('.timer-widget');
  if (!widget) return;
  const old = widget.querySelector('.timer-btns');
  if (old) old.remove();
  widget.appendChild(makeTimerBtns());
}

function timerStart() {
  timerState = 'running';
  timerInterval = setInterval(() => {
    timerSeconds++;
    const d = document.getElementById('timer-display');
    if (d) d.textContent = fmtTimer(timerSeconds);
  }, 1000);
  refreshTimerBtns();
}

function timerStop() {
  clearInterval(timerInterval);
  timerInterval = null;
  timerState = 'paused';
  refreshTimerBtns();
}

function timerResume() {
  timerState = 'running';
  timerInterval = setInterval(() => {
    timerSeconds++;
    const d = document.getElementById('timer-display');
    if (d) d.textContent = fmtTimer(timerSeconds);
  }, 1000);
  refreshTimerBtns();
}

function timerRestart() {
  clearInterval(timerInterval);
  timerInterval = null;
  timerSeconds  = 0;
  timerState    = 'idle';
  const d = document.getElementById('timer-display');
  if (d) d.textContent = fmtTimer(0);
  refreshTimerBtns();
}

function timerSave() {
  clearInterval(timerInterval);
  timerInterval = null;
  timerSeconds  = 0;
  timerState    = 'idle';
  const d = document.getElementById('timer-display');
  if (d) d.textContent = fmtTimer(0);
  refreshTimerBtns();
}

// ── Settings modal ────────────────────────────────────────────────
function openSettingsModal() {
  const legsDays = settings.legsDays !== undefined ? settings.legsDays : [1, 3, 5];
  document.querySelectorAll('#settings-modal input[data-dow]').forEach(cb => {
    cb.checked = legsDays.includes(Number(cb.dataset.dow));
  });
  document.getElementById('setting-personal-day-start').value = getPersonalDayStartTime();
  document.getElementById('setting-cue-sound').checked = settings.setCueSound !== false;
  document.getElementById('setting-cue-vibrate').checked = settings.setCueVibrate !== false;
  document.getElementById('setting-cue-speech').checked = Boolean(settings.setCueSpeech);
  document.getElementById('settings-modal').classList.remove('hidden');
}

function closeSettingsModal() {
  document.getElementById('settings-modal').classList.add('hidden');
}

function saveSettingsModal() {
  const legsDays = [];
  document.querySelectorAll('#settings-modal input[data-dow]:checked').forEach(cb => {
    legsDays.push(Number(cb.dataset.dow));
  });
  settings.legsDays = legsDays;
  const personalDayStartTime = document.getElementById('setting-personal-day-start').value;
  settings.personalDayStartTime = isValidTime(personalDayStartTime)
    ? personalDayStartTime
    : DEFAULT_PERSONAL_DAY_START_TIME;
  settings.setCueSound = document.getElementById('setting-cue-sound').checked;
  settings.setCueVibrate = document.getElementById('setting-cue-vibrate').checked;
  settings.setCueSpeech = document.getElementById('setting-cue-speech').checked;
  saveSettings(settings);
  closeSettingsModal();
  render();
}

// ── Image import ──────────────────────────────────────────────────
function openImageModal(exId) {
  uploadTargetId = exId;
  const ex = exercises.find(item => item.id === exId);
  const removeBtn = document.getElementById('image-remove-btn');
  document.getElementById('field-image-url').value = '';
  removeBtn.style.display = ex?.image ? 'inline-block' : 'none';
  setImageImportPending(false);
  document.getElementById('image-modal').classList.remove('hidden');
  window.setTimeout(() => document.getElementById('field-image-url').focus(), 0);
}

function closeImageModal() {
  document.getElementById('image-modal').classList.add('hidden');
  document.getElementById('field-image-url').value = '';
  setImageImportPending(false);
  uploadTargetId = null;
}

function openImageUpload() {
  if (!uploadTargetId || imageImportPending) return;
  document.getElementById('image-upload-input').click();
}

function setImageImportPending(pending) {
  imageImportPending = pending;
  document.getElementById('image-import-btn').disabled = pending;
  document.getElementById('image-file-btn').disabled = pending;
  document.getElementById('image-import-btn').textContent = pending ? 'Importing...' : 'Import URL';
}

function storeExerciseImage(exId, imageData) {
  const idx = exercises.findIndex(ex => ex.id === exId);
  if (idx === -1) return false;
  const previousImage = exercises[idx].image;
  exercises[idx].image = imageData;
  try {
    saveExercises(exercises);
  } catch (err) {
    exercises[idx].image = previousImage;
    const msg = err && err.name === 'QuotaExceededError'
      ? 'That image is too large for browser storage. Try a smaller image.'
      : 'Could not save that image.';
    alert(msg);
    return false;
  }
  render();
  return true;
}

function handleImageUpload(file) {
  if (!file || !uploadTargetId) return;
  const targetId = uploadTargetId;
  const reader = new FileReader();
  reader.onload = (e) => {
    if (storeExerciseImage(targetId, e.target.result)) {
      closeImageModal();
    }
  };
  reader.readAsDataURL(file);
}

function removeExerciseImage() {
  if (!uploadTargetId) return;
  if (storeExerciseImage(uploadTargetId, null)) {
    closeImageModal();
  }
}

async function importImageFromUrl() {
  if (!uploadTargetId || imageImportPending) return;
  const rawUrl = document.getElementById('field-image-url').value.trim();
  if (!rawUrl) {
    alert('Paste an image URL or page URL first.');
    return;
  }

  setImageImportPending(true);
  try {
    const imageDataUrl = await resolveImageImport(rawUrl);
    if (storeExerciseImage(uploadTargetId, imageDataUrl)) {
      closeImageModal();
    }
  } catch (err) {
    alert(err?.message || 'Could not import image from that URL.');
  } finally {
    setImageImportPending(false);
  }
}

function normalizeImportUrl(rawUrl) {
  const trimmed = rawUrl.trim();
  if (!trimmed) throw new Error('Paste a valid URL first.');
  try {
    return new URL(trimmed).href;
  } catch (_) {
    return new URL(`https://${trimmed}`).href;
  }
}

async function resolveImageImport(rawUrl) {
  const normalizedUrl = normalizeImportUrl(rawUrl);
  const directImage = await tryFetchImageAsDataUrl(normalizedUrl);
  if (directImage) return directImage;

  const pageImageUrl = await tryExtractImageUrlFromPage(normalizedUrl);
  if (pageImageUrl) {
    const previewImage = await tryFetchImageAsDataUrl(pageImageUrl);
    if (previewImage) return previewImage;
  }

  throw new Error(
    'Could not import from that URL. Try a direct image URL or use Choose File. Some sites block browser-side downloads.'
  );
}

async function tryFetchImageAsDataUrl(url) {
  let response;
  try {
    response = await fetch(url);
  } catch (_) {
    return null;
  }

  if (!response.ok) return null;
  const type = response.headers.get('content-type') || '';
  if (!type.startsWith('image/')) return null;

  const blob = await response.blob();
  return blobToDataUrl(blob);
}

async function tryExtractImageUrlFromPage(pageUrl) {
  let response;
  try {
    response = await fetch(pageUrl);
  } catch (_) {
    return null;
  }

  if (!response.ok) return null;
  const type = response.headers.get('content-type') || '';
  if (!type.includes('text/html')) return null;

  let html;
  try {
    html = await response.text();
  } catch (_) {
    return null;
  }

  const doc = new DOMParser().parseFromString(html, 'text/html');
  const selectors = [
    'meta[property="og:image:secure_url"]',
    'meta[property="og:image"]',
    'meta[name="twitter:image"]',
    'meta[name="twitter:image:src"]',
    'link[rel="image_src"]',
    'img[src]'
  ];

  for (const selector of selectors) {
    const node = doc.querySelector(selector);
    const candidate = node?.content || node?.href || node?.src || node?.getAttribute('src');
    if (!candidate) continue;
    try {
      return new URL(candidate, pageUrl).href;
    } catch (_) {
      continue;
    }
  }

  return null;
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('Could not read downloaded image.'));
    reader.readAsDataURL(blob);
  });
}

// ── Week navigation ───────────────────────────────────────────────
function prevWeek() {
  currentWeekStart = new Date(currentWeekStart);
  currentWeekStart.setDate(currentWeekStart.getDate() - 7);
  render();
}

function nextWeek() {
  currentWeekStart = new Date(currentWeekStart);
  currentWeekStart.setDate(currentWeekStart.getDate() + 7);
  render();
}

function goToToday() {
  currentWeekStart = getMonday(new Date());
  render();
}

// ── Compact col-header on scroll ──────────────────────────────────
function updateCompactHeader() {
  const colHeader = document.querySelector('.col-header-row');
  if (colHeader) colHeader.classList.toggle('compact', isDenseMode || window.scrollY > 0);
}

// ── Static event bindings ─────────────────────────────────────────
function bindStaticEvents() {
  document.getElementById('btn-prev-week').addEventListener('click', prevWeek);
  document.getElementById('btn-next-week').addEventListener('click', nextWeek);
  document.getElementById('btn-today').addEventListener('click', goToToday);
  document.getElementById('btn-notes').addEventListener('click', toggleNotesPanel);
  document.getElementById('notes-panel-close').addEventListener('click', () => setNotesPanelOpen(false));
  document.getElementById('quick-note-save').addEventListener('click', addQuickNote);
  document.getElementById('quick-note-text').addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      addQuickNote();
    }
  });
  document.addEventListener('keydown', handleSetTrackerKeydown);
  document.addEventListener('click', () => closeCompletedActionMenu());
  window.addEventListener('scroll', updateCompactHeader, { passive: true });

  document.getElementById('modal-cancel').addEventListener('click', closeModal);
  document.getElementById('modal-save').addEventListener('click', saveExerciseModal);
  document.getElementById('delete-btn').addEventListener('click', deleteExercise);

  document.getElementById('exercise-modal').addEventListener('click', (e) => {
    if (e.target === document.getElementById('exercise-modal')) closeModal();
  });

  document.getElementById('image-upload-input').addEventListener('change', (e) => {
    handleImageUpload(e.target.files[0]);
    e.target.value = ''; // reset so same file can be re-selected
  });

  document.getElementById('image-file-btn').addEventListener('click', openImageUpload);
  document.getElementById('image-cancel').addEventListener('click', closeImageModal);
  document.getElementById('image-import-btn').addEventListener('click', importImageFromUrl);
  document.getElementById('image-remove-btn').addEventListener('click', removeExerciseImage);
  document.getElementById('field-image-url').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      importImageFromUrl();
    }
  });
  document.getElementById('image-modal').addEventListener('click', (e) => {
    if (e.target === document.getElementById('image-modal')) closeImageModal();
  });

  document.getElementById('btn-settings').addEventListener('click', openSettingsModal);
  document.getElementById('settings-cancel').addEventListener('click', closeSettingsModal);
  document.getElementById('settings-save').addEventListener('click', saveSettingsModal);
  document.getElementById('settings-modal').addEventListener('click', (e) => {
    if (e.target === document.getElementById('settings-modal')) closeSettingsModal();
  });

  document.getElementById('event-cancel').addEventListener('click', closeEventModal);
  document.getElementById('event-save').addEventListener('click', saveEventModal);
  document.getElementById('event-delete-btn').addEventListener('click', deleteEventModal);
  document.getElementById('event-modal').addEventListener('click', (e) => {
    if (e.target === document.getElementById('event-modal')) closeEventModal();
  });
}

// ── DOM helpers ───────────────────────────────────────────────────
function el(tag, className) {
  const e = document.createElement(tag);
  if (className) e.className = className;
  return e;
}

function elText(tag, className, text) {
  const e = el(tag, className);
  e.textContent = text;
  return e;
}
