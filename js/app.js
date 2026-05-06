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
let settingsModalSnapshot = null;
let toastTimer = null;
let lastBlockDropWarningAt = 0;

const PHYSIO_HEADER_QUOTES = [
  'Let us earn that ice pack.',
  'Tiny reps, suspiciously big destiny.',
  'Mobility is calling, and it brought a clipboard.',
  'Today we negotiate with connective tissue.',
  'A little stretch, a little swagger.',
  'Your future self requested better range of motion.',
  'Time to make the joints less dramatic.',
  'Coffee later. Controlled movement now.',
  'Respect the plan. Befriend the band.',
  'We are only one set away from feeling responsible.',
  'Let us put the therapy in physiotherapy.',
  'Progress: now available in tiny increments.',
  'The resistance band believes in you, unfortunately.',
  'Joint mobility, but make it administratively satisfying.',
  'Today is sponsored by form and patience.',
  'Move gently. Log aggressively.',
  'Your tendons appreciate boring consistency.',
  'Small exercises, large main-character energy.',
  'Another glamorous day at the mobility factory.',
  'Do the set before the set does you.',
  'Stretch like someone with calendar reminders.',
  'Let us turn stiffness into paperwork.',
  'The road to recovery has excellent tracking.',
  'Nothing says wellness like counting to ten slowly.',
  'Your range of motion has entered the chat.',
  'Every rep is a tiny memo to your nervous system.',
  'Today we make discomfort file a status report.',
  'Low drama, high compliance.',
  'The body keeps score, so we made a spreadsheet.',
  'A noble quest, mostly involving elastic.',
  'Make the physio proud and the muscles confused.',
  'One controlled rep at a time, obviously.',
  'Welcome back to strategic wiggling.',
  'Your recovery arc has tasks due today.',
  'Let us knock a set off your list.',
  'Soft tissue, firm commitment.',
  'The vibes are clinical and mildly triumphant.',
  'Rehab: because momentum loves receipts.',
  'Today we collect reps like responsible adults.',
  'Some heroes wear braces and track sets.',
  'Your joints asked for a status meeting.',
  'Motion first, overthinking second.',
  'The plan is simple: move, log, repeat.',
  'Let us be brave in a very small range.',
  'Consistency: boring, effective, rude.',
  'Theraband time, naturally.',
  'Your muscles have been assigned homework.',
  'Recovery looks suspiciously like showing up.',
  'Do the tiny thing. Become slightly less creaky.',
  'Physio time: the glamorous admin of healing.'
];

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
  setHeaderQuote();
  render();
  bindStaticEvents();
  renderNotesPanel();
  startRealtimeUpdates();
});

function setHeaderQuote() {
  const quote = document.getElementById('header-quote');
  if (!quote) return;

  const index = Math.floor(Math.random() * PHYSIO_HEADER_QUOTES.length);
  quote.textContent = PHYSIO_HEADER_QUOTES[index];
}

// One-shot data migrations for existing localStorage installs
function runMigrations() {
  let exercisesChanged = false;
  // Move "Rubber Band Pinky & Ring Finger" from Arm Day 1 → Arm Day 2
  const pinky = exercises.find(e => e.id === 'a1-8');
  if (pinky && pinky.group === 'arm-day1') {
    pinky.group = 'arm-day2';
    pinky.order = 5;
    exercisesChanged = true;
  }

  if (!settings.defaultBlocksApplied) {
    settings.defaultBlocksApplied = true;
    saveSettings(settings);
  }

  ensureBlockSettings();

  exercises.forEach(ex => {
    if (ex.blockTitle && normalizedBlockId(ex)) {
      ensureBlockDefinition(ex.group, normalizedBlockId(ex), ex.blockTitle);
      delete ex.blockTitle;
      exercisesChanged = true;
    }
    if ('blockMinGapHours' in ex) {
      delete ex.blockMinGapHours;
      exercisesChanged = true;
    }
    if ('blockPreferredGapHours' in ex) {
      delete ex.blockPreferredGapHours;
      exercisesChanged = true;
    }
  });

  if (exercisesChanged) {
    saveExercises(exercises);
  }
  saveSettings(settings);
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

  const months = [...new Set(dates.map(d => MONTH_ABBR[d.getMonth()]))];
  const monthLabel = months.join(' / ');

  const app = document.getElementById('app');
  app.innerHTML = '';
  document.body.classList.toggle('dense-mode', isDenseMode);
  document.body.classList.toggle('set-tracker-open', Boolean(activeTracker));

  app.appendChild(buildColHeaders(dates, todayS, monthLabel));

  let exerciseNumber = 1;
  for (const group of GROUP_ORDER) {
    const exs = exercises
      .filter(e => e.group === group)
      .sort((a, b) => a.order - b.order);
    app.appendChild(buildGroupSection(group, exs, dates, todayS, exerciseNumber));
    exerciseNumber += exs.length;
  }

  updateCompactHeader();
  renderSetTracker();
  renderNotesPanel();
}

// ── Column headers ────────────────────────────────────────────────
function buildColHeaders(dates, todayS, monthLabel) {
  const row = el('div', 'col-header-row');
  const spacer = el('div', 'spacer');
  const tools = el('div', 'header-tools');
  tools.appendChild(buildDenseToggle());
  spacer.appendChild(tools);
  spacer.appendChild(buildWeekNav(monthLabel));
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

function buildWeekNav(monthLabel) {
  const nav = el('nav', 'week-nav');

  const prev = elText('button', '', '\u2190 Week');
  prev.id = 'btn-prev-week';
  prev.type = 'button';
  prev.addEventListener('click', prevWeek);

  const label = elText('span', 'week-label', monthLabel);
  label.id = 'week-label';

  const next = elText('button', '', 'Week \u2192');
  next.id = 'btn-next-week';
  next.type = 'button';
  next.addEventListener('click', nextWeek);

  const today = elText('button', 'today-btn', 'TODAY');
  today.id = 'btn-today';
  today.type = 'button';
  today.addEventListener('click', goToToday);

  nav.appendChild(prev);
  nav.appendChild(label);
  nav.appendChild(next);
  nav.appendChild(today);
  return nav;
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
  const denseAddBtn = elText('button', 'group-add-btn', '+ Add');
  denseAddBtn.type = 'button';
  denseAddBtn.title = `Add exercise to ${cfg.label}`;
  denseAddBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    openAddModal(group);
  });
  label.appendChild(denseAddBtn);
  header.appendChild(label);

  dates.forEach((date) => {
    const dateS = toDateStr(date);
    const isToday = dateS === todayS;
    header.appendChild(el('div', 'group-header-cell' + (isToday ? ' today' : '')));
  });

  frag.appendChild(header);

  if (isCollapsed) return frag;

  // Exercise rows
  let numberOffset = 0;
  groupedExercisesForRender(exs).forEach(section => {
    section.exercises.forEach((ex, i) => {
      const blockInfo = section.block
        ? {
            ...section.block,
            position: blockPositionClass(i, section.exercises.length),
          }
        : null;
      frag.appendChild(buildExerciseRows(ex, group, dates, todayS, startNumber + numberOffset, blockInfo));
      numberOffset++;
    });
  });

  if (!isDenseMode) {
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
  }

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

function groupedExercisesForRender(exs) {
  const group = exs[0]?.group;
  const blockDefs = group ? blockDefinitionsForGroup(group) : [];
  const blocks = new Map();
  const unblocked = [];

  blockDefs.forEach(block => {
    blocks.set(block.id, {
      block: blockMetaFromDefinition(group, block),
      exercises: [],
      firstOrder: Number.POSITIVE_INFINITY,
      order: block.order,
    });
  });

  exs.forEach(ex => {
    const blockId = normalizedBlockId(ex);
    if (!blockId || !blocks.has(blockId)) {
      unblocked.push(ex);
      return;
    }
    const section = blocks.get(blockId);
    section.exercises.push(ex);
    section.firstOrder = Math.min(section.firstOrder, ex.order);
  });

  const sections = Array.from(blocks.values())
    .filter(section => section.exercises.length)
    .sort((a, b) => a.order - b.order)
    .map(section => ({
      block: section.block,
      exercises: section.exercises.sort((a, b) => a.order - b.order),
    }));

  if (unblocked.length) {
    sections.push({ block: null, exercises: unblocked.sort((a, b) => a.order - b.order) });
  }
  return sections;
}

function exerciseSectionsForGroup(group) {
  return groupedExercisesForRender(sortedExercisesInGroup(group));
}

function displayOrderedExercisesInGroup(group) {
  return exerciseSectionsForGroup(group).flatMap(section => section.exercises);
}

function applyGroupDisplayOrder(group, sections) {
  sections.flatMap(section => section.exercises).forEach((ex, i) => {
    ex.order = i + 1;
  });
}

function normalizedBlockId(ex) {
  return String(ex?.blockId || '').trim();
}

function blockMetaFromDefinition(group, block) {
  return {
    group,
    id: block.id,
    title: blockTitleFor(group, block.id),
  };
}

function blockTitleFor(group, blockId) {
  const block = blockDefinitionsForGroup(group).find(item => item.id === blockId);
  const title = block?.title;
  return title && String(title).trim() ? title : blockTitleFromId(blockId);
}

function ensureBlockSettings() {
  if (!settings.blocks || typeof settings.blocks !== 'object') settings.blocks = {};
  GROUP_ORDER.forEach(group => {
    if (!Array.isArray(settings.blocks[group])) settings.blocks[group] = [];
  });

  if (settings.blockTitles && typeof settings.blockTitles === 'object') {
    Object.entries(settings.blockTitles).forEach(([key, title]) => {
      const [group, blockId] = key.split(':');
      if (GROUP_ORDER.includes(group) && blockId) ensureBlockDefinition(group, blockId, title);
    });
    delete settings.blockTitles;
  }

  exercises.forEach(ex => {
    const blockId = normalizedBlockId(ex);
    if (!blockId) return;
    ensureBlockDefinition(ex.group, blockId, ex.blockTitle);
  });

  GROUP_ORDER.forEach(group => normalizeBlockDefinitionOrders(group));
}

function blockDefinitionsForGroup(group) {
  ensureBlocksContainer(group);
  return settings.blocks[group].sort((a, b) => a.order - b.order);
}

function ensureBlocksContainer(group) {
  if (!settings.blocks || typeof settings.blocks !== 'object') settings.blocks = {};
  if (!Array.isArray(settings.blocks[group])) settings.blocks[group] = [];
}

function ensureBlockDefinition(group, blockId, title = '') {
  ensureBlocksContainer(group);
  const id = normalizeBlockInput(blockId);
  if (!id) return null;
  let block = settings.blocks[group].find(item => item.id === id);
  if (!block) {
    const maxOrder = settings.blocks[group].reduce((max, item) => Math.max(max, Number(item.order) || 0), 0);
    block = { id, title: '', order: maxOrder + 1 };
    settings.blocks[group].push(block);
  }
  if (title && !block.title) block.title = String(title).trim();
  return block;
}

function normalizeBlockDefinitionOrders(group) {
  ensureBlocksContainer(group);
  settings.blocks[group]
    .sort((a, b) => (Number(a.order) || 0) - (Number(b.order) || 0))
    .forEach((block, i) => {
      block.id = normalizeBlockInput(block.id);
      block.order = i + 1;
      block.title = String(block.title || '').trim();
    });
  settings.blocks[group] = settings.blocks[group].filter(block => block.id);
}

function blockTitleFromId(blockId) {
  const suffix = String(blockId || '')
    .replace(/^block[-_ ]*/i, '')
    .replace(/[-_]+/g, ' ')
    .trim();
  if (!suffix) return 'Block';
  return `Block ${suffix.toUpperCase()}`;
}

function blockPositionClass(index, count) {
  if (count === 1) return ' single';
  if (index === 0) return ' first';
  if (index === count - 1) return ' last';
  return ' middle';
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
  const draggedBlockId = normalizedBlockId(dragged);

  if (draggedBlockId) {
    const target = exercises.find(ex => ex.id === targetId);
    if (!target || target.group !== targetGroup || normalizedBlockId(target) !== draggedBlockId) {
      showBlockDropWarning(dragged, target);
      return;
    }

    const sections = exerciseSectionsForGroup(targetGroup);
    const section = sections.find(item => item.block?.id === draggedBlockId);
    if (!section) return;
    const targetItems = section.exercises.filter(ex => ex.id !== dragId);
    let insertAt = targetItems.findIndex(ex => ex.id === targetId);
    if (insertAt === -1) return;
    if (position === 'after') insertAt += 1;
    targetItems.splice(insertAt, 0, dragged);
    section.exercises = targetItems;
    applyGroupDisplayOrder(targetGroup, sections);

    saveExercises(exercises);
    render();
    refreshOpenBlockSettings();
    return;
  }

  const oldGroup = dragged.group;
  const targetItems = sortedExercisesInGroup(targetGroup).filter(ex => ex.id !== dragId);
  let insertAt = targetItems.length;

  if (targetId) {
    const targetIndex = targetItems.findIndex(ex => ex.id === targetId);
    if (targetIndex !== -1) insertAt = targetIndex + (position === 'after' ? 1 : 0);
  }

  dragged.group = targetGroup;
  if (oldGroup !== targetGroup) dragged.blockId = '';
  targetItems.splice(insertAt, 0, dragged);
  targetItems.forEach((ex, i) => { ex.order = i + 1; });
  if (oldGroup !== targetGroup) normalizeGroupOrders([oldGroup]);

  saveExercises(exercises);
  render();
  refreshOpenBlockSettings();
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
  document.querySelectorAll('.drop-before, .drop-after, .drop-end, .drop-denied').forEach(elm => {
    elm.classList.remove('drop-before', 'drop-after', 'drop-end', 'drop-denied');
  });
  draggedExerciseId = null;
}

function handleExerciseDragOver(e) {
  if (!draggedExerciseId) return;
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';

  const target = e.currentTarget;
  clearDropPosition({ currentTarget: target });

  if (isBlockedGridDrop(draggedExerciseId, target)) {
    e.dataTransfer.dropEffect = 'none';
    target.classList.add('drop-denied');
    showBlockDropWarningThrottled(exercises.find(ex => ex.id === draggedExerciseId), target);
    return;
  }

  if (target.classList.contains('exercise-row')) {
    const rect = target.getBoundingClientRect();
    const isAfter = e.clientY > rect.top + rect.height / 2;
    target.classList.add(isAfter ? 'drop-after' : 'drop-before');
  } else {
    target.classList.add('drop-end');
  }
}

function clearDropPosition(e) {
  e.currentTarget.classList.remove('drop-before', 'drop-after', 'drop-end', 'drop-denied');
}

function handleExerciseDropOnRow(e) {
  if (!draggedExerciseId) return;
  e.preventDefault();
  e.stopPropagation();
  const target = e.currentTarget;
  if (isBlockedGridDrop(draggedExerciseId, target)) {
    showBlockDropWarning(exercises.find(ex => ex.id === draggedExerciseId), target);
    clearDropPosition({ currentTarget: target });
    return;
  }
  const position = target.classList.contains('drop-before') ? 'before' : 'after';
  moveExercise(draggedExerciseId, target.dataset.group, target.dataset.exId, position);
}

function handleExerciseDropAtEnd(e) {
  if (!draggedExerciseId) return;
  e.preventDefault();
  e.stopPropagation();
  const target = e.currentTarget;
  if (isBlockedGridDrop(draggedExerciseId, target)) {
    showBlockDropWarning(exercises.find(ex => ex.id === draggedExerciseId), target);
    clearDropPosition({ currentTarget: target });
    return;
  }
  moveExercise(draggedExerciseId, e.currentTarget.dataset.group);
}

function isBlockedGridDrop(dragId, target) {
  const dragged = exercises.find(ex => ex.id === dragId);
  if (!dragged) return true;
  const targetId = target.dataset.exId;
  const draggedBlockId = normalizedBlockId(dragged);

  if (draggedBlockId) {
    if (!target.classList.contains('exercise-row') || !targetId) return true;
    const targetExercise = exercises.find(ex => ex.id === targetId);
    return !targetExercise
      || targetExercise.group !== dragged.group
      || normalizedBlockId(targetExercise) !== draggedBlockId;
  }

  return target.classList.contains('block-row');
}

function showBlockDropWarning(dragged = null, target = null) {
  if (dragged && normalizedBlockId(dragged)) {
    showToast('Exercises inside a block can only be reordered within that block. Move blocks in Settings.');
    return;
  }
  if (target && target.classList?.contains('block-row')) {
    showToast('Unblocked exercises must stay below blocks. Assign blocks in Settings.');
    return;
  }
  showToast('Blocks are managed in Settings. Unblocked exercises must stay below blocks.');
}

function showBlockDropWarningThrottled(dragged = null, target = null) {
  const now = Date.now();
  if (now - lastBlockDropWarningAt < 1800) return;
  lastBlockDropWarningAt = now;
  showBlockDropWarning(dragged, target);
}

function buildExerciseRows(ex, group, dates, todayS, exerciseNumber, blockInfo = null) {
  const frag = document.createDocumentFragment();
  const row = el('div', 'exercise-row' + blockRowClass(blockInfo));
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
  const dragTooltip = blockInfo
    ? 'Drag and drop to reorder exercises inside this block. Move blocks in Settings.'
    : 'Drag to reorder exercise';
  dragHandle.title = dragTooltip;
  dragHandle.setAttribute('aria-label', dragTooltip);
  dragHandle.innerHTML = '&#9776;';
  dragHandle.addEventListener('mousedown', () => {
    row.draggable = true;
  });
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
  if (blockInfo && (blockInfo.position === ' first' || blockInfo.position === ' single')) {
    info.appendChild(buildBlockHeader(blockInfo));
  }
  const nameRow = el('div', 'ex-name-row');
  const number = elText('span', 'ex-number' + (ex.instructions && isDenseMode ? ' has-instructions' : ''), String(exerciseNumber));
  if (ex.instructions && isDenseMode) {
    number.title = 'Show instructions';
    number.setAttribute('role', 'button');
    number.setAttribute('tabindex', '0');
  }
  nameRow.appendChild(number);
  const nameText = el('span', 'ex-name');
  nameText.appendChild(elText('span', 'ex-name-text', ex.name));
  if (isDenseMode) {
    nameText.appendChild(elText('span', 'dense-edit-glyph', String.fromCharCode(9998)));
  }
  nameRow.appendChild(nameText);
  if (isDenseMode) {
    nameText.title = 'Edit exercise';
    nameText.setAttribute('role', 'button');
    nameText.setAttribute('tabindex', '0');
  }
  nameText.addEventListener('click', () => {
    if (isDenseMode) openEditModal(ex.id);
  });
  nameText.addEventListener('keydown', (e) => {
    if (!isDenseMode || (e.key !== 'Enter' && e.key !== ' ')) return;
    e.preventDefault();
    openEditModal(ex.id);
  });
  info.appendChild(nameRow);

  const meta = el('div', 'ex-meta');
  meta.appendChild(buildDoseMetaChip('ex-meta-sets', 'S', ex.sets, `Sets: ${ex.sets}`));
  meta.appendChild(elText('span', 'sep ex-meta-sep', '/'));
  meta.appendChild(buildDoseMetaChip('ex-meta-reps', 'R', ex.reps, `Reps: ${ex.reps}`));
  if (ex.resistance) {
    meta.appendChild(elText('span', 'sep ex-meta-sep', '/'));
    meta.appendChild(buildDoseMetaChip('ex-meta-resistance', 'Res', ex.resistance, `Resistance: ${ex.resistance}`));
  }
  meta.appendChild(elText('span', 'sep ex-meta-sep ex-meta-frequency-sep', '/'));
  meta.appendChild(elText('span', 'ex-meta-item ex-meta-frequency', ex.frequency));
  info.appendChild(meta);

  let instrText = null;
  let denseInstrRow = null;

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
    denseInstrRow = buildDenseInstructionRow(ex);
    const toggleInstructions = () => {
      const open = instrText.style.display !== 'none';
      if (isDenseMode) {
        denseInstrRow.classList.toggle('open', !denseInstrRow.classList.contains('open'));
        number.classList.toggle('active', denseInstrRow.classList.contains('open'));
        number.title = denseInstrRow.classList.contains('open') ? 'Hide instructions' : 'Show instructions';
        return;
      }
      instrText.style.display = open ? 'none' : 'block';
      tog.classList.toggle('active', !open);
      tog.title = open ? 'Show instructions' : 'Hide instructions';
      tog.setAttribute('aria-label', open ? 'Show instructions' : 'Hide instructions');
    };
    tog.addEventListener('click', () => {
      toggleInstructions();
    });
    number.addEventListener('click', (e) => {
      if (!isDenseMode) return;
      e.stopPropagation();
      toggleInstructions();
    });
    number.addEventListener('keydown', (e) => {
      if (!isDenseMode || (e.key !== 'Enter' && e.key !== ' ')) return;
      e.preventDefault();
      e.stopPropagation();
      toggleInstructions();
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
    const cell = el('div', 'day-cell' + (isToday ? ' today' : '') + (isActive ? ' active-tracked' : '') + blockCellClass(blockInfo));
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

  frag.appendChild(row);
  if (denseInstrRow) frag.appendChild(denseInstrRow);
  return frag;
}

function buildDenseInstructionRow(ex) {
  const row = el('div', 'dense-instructions-row');
  const cell = el('div', 'dense-instructions-cell');
  if (ex.image) {
    const media = el('div', 'dense-instructions-media');
    const img = document.createElement('img');
    img.src = ex.image;
    img.alt = ex.name;
    media.appendChild(img);
    cell.appendChild(media);
  }
  cell.appendChild(elText('p', 'dense-instructions-copy', ex.instructions));
  row.appendChild(cell);
  return row;
}

// ── Summary row ───────────────────────────────────────────────────
function blockRowClass(blockInfo) {
  if (!blockInfo) return '';
  return ` block-row block-${blockInfo.position.trim()}`;
}

function blockCellClass(blockInfo) {
  if (!blockInfo) return '';
  return ` block-cell block-${blockInfo.position.trim()}`;
}

function buildBlockHeader(blockInfo) {
  const header = el('div', 'block-inline-header');
  header.appendChild(elText('span', 'block-title', blockInfo.title));
  return header;
}

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
    confirmAndClearExerciseProgress(exId, dateStr);
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
    setCompletedAt: Array.isArray(progress?.setCompletedAt)
      ? progress.setCompletedAt.slice(0, targetSets)
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
      setCompletedAt: [],
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
  progress.setCompletedAt[progress.completedSets] = now.toISOString();
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
  progress.setCompletedAt[progress.targetSets - 1] = progress.updatedAt;
  progress.finishedEarly = false;
  session.setProgress[ex.id] = progress;
  setCompletion(dateStr, ex.id, true);
  saveSession(dateStr, session);
  playFinishCue();
  render();
}

function pauseAndCloseTracker() {
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
    progress.setCompletedAt.splice(progress.completedSets, 1);
    if (!progress.timerStartedAt && !progress.timerCapped) startSetTimer(progress);
  } else if (progress.completedSets >= progress.targetSets) {
    progress.completedSets = Math.max(0, progress.completedSets - 1);
    progress.setDurations.splice(progress.completedSets, 1);
    progress.setCompletedAt.splice(progress.completedSets, 1);
    if (!progress.timerStartedAt && !progress.timerCapped) startSetTimer(progress);
  } else {
    progress.completedSets = Math.max(0, progress.completedSets - 1);
    progress.setDurations.splice(progress.completedSets, 1);
    progress.setCompletedAt.splice(progress.completedSets, 1);
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
  confirmAndClearExerciseProgress(current.ex.id, current.dateStr);
}

function confirmAndClearExerciseProgress(exId, dateStr) {
  const ex = exercises.find(item => item.id === exId);
  const label = ex?.name || 'this exercise';
  if (!confirm(`Clear the set log for ${label} on ${dateStr}? This cannot be undone.`)) return;
  clearExerciseProgress(exId, dateStr);
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
      setDurations: [],
      setCompletedAt: [],
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
  info.appendChild(elText('div', 'set-tracker-kicker', `${dateStr} | Started ${trackerStartedTime(progress)}`));
  const titleRow = el('div', 'set-tracker-title-row');
  titleRow.appendChild(elText('div', 'set-tracker-name', ex.name));
  const progressWrap = el('div', 'set-tracker-progress');
  for (let i = 1; i <= progress.targetSets; i++) {
    progressWrap.appendChild(el('span', 'set-dot' + (i <= progress.completedSets ? ' filled' : '')));
  }
  titleRow.appendChild(progressWrap);
  info.appendChild(titleRow);
  info.appendChild(elText('div', 'set-tracker-meta', `${progress.completedSets}/${progress.targetSets} sets | ${ex.reps} reps${ex.resistance ? ` | ${ex.resistance}` : ''}`));
  main.appendChild(info);
  const utility = el('div', 'set-tracker-utility');
  utility.appendChild(elText('div', 'set-tracker-help', 'Arrow keys adjust sets | Pause & Close saves partial progress'));
  const clear = elText('button', 'set-action set-action-danger', 'Clear');
  clear.addEventListener('click', clearActiveProgress);
  utility.appendChild(clear);
  main.appendChild(utility);
  panel.appendChild(main);

  const actions = el('div', 'set-tracker-actions');
  const mainActions = el('div', 'set-tracker-main-actions');
  const completeSet = elText('button', 'set-action set-action-primary', 'Complete Set');
  completeSet.disabled = done || progress.timerCapped;
  completeSet.title = 'Right arrow';
  completeSet.addEventListener('click', logSet);
  const doneBtn = elText('button', 'set-action set-action-finish', 'Pause & Close');
  doneBtn.addEventListener('click', pauseAndCloseTracker);
  mainActions.appendChild(completeSet);
  mainActions.appendChild(doneBtn);
  actions.appendChild(mainActions);

  const timer = el('div', 'set-tracker-timer');
  const totalMetric = el('div', 'set-tracker-metric set-tracker-metric-total');
  totalMetric.appendChild(elText('div', 'set-tracker-timer-label', 'Total elapsed'));
  totalMetric.appendChild(elText('div', 'set-tracker-timer-value', trackerTotalTimeValue(progress)));
  timer.appendChild(totalMetric);
  const sinceSetMetric = el('div', 'set-tracker-metric set-tracker-metric-since');
  sinceSetMetric.appendChild(elText('div', 'set-tracker-timer-label', progress.completedSets > 0 ? 'Since last set' : 'Since start'));
  sinceSetMetric.appendChild(elText('div', 'set-tracker-timer-value', trackerSinceLastSetValue(progress)));
  const timerDetail = trackerTimerDetail(progress);
  if (timerDetail) sinceSetMetric.appendChild(elText('div', 'set-tracker-timer-detail', timerDetail));
  timer.appendChild(sinceSetMetric);
  panel.appendChild(timer);
  panel.appendChild(actions);

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

function trackerStartedTime(progress) {
  return formatClockTime(progress.startedAt);
}

function trackerSinceLastSetValue(progress) {
  return fmtShortDuration(secondsSinceLastSet(progress));
}

function trackerTotalTimeValue(progress) {
  return fmtShortDuration(activeElapsedSeconds(progress));
}

function trackerTimerDetail(progress) {
  const parts = [];
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

function secondsSinceLastSet(progress, now = new Date()) {
  const completedSetSeconds = progress.setDurations
    .slice(0, progress.completedSets)
    .reduce((total, value) => total + Math.max(0, Number(value) || 0), 0);
  return Math.max(0, activeElapsedSeconds(progress, now) - completedSetSeconds);
}

function formatClockTime(iso) {
  const time = new Date(iso).getTime();
  if (!iso || Number.isNaN(time)) return '--:--';
  return new Date(time).toLocaleTimeString([], {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
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
    utterance.volume = clampSetCueSpeechVolume(settings.setCueSpeechVolume ?? 1);
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

function normalizeBlockInput(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
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
      delete exercises[idx].blockTitle;
      delete exercises[idx].blockMinGapHours;
      delete exercises[idx].blockPreferredGapHours;
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
  if (e.key === 'Escape') {
    e.preventDefault();
    pauseAndCloseTracker();
  } else if (e.key === 'ArrowRight') {
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
    group.events.forEach(ev => {
      lines.push(formatTimelineEventMarkdown(ev));
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

  const parts = [`**${eventTitle(ev)}**`];
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
  return 'Note';
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

function buildDenseToggle() {
  const label = isDenseMode ? 'Normal View' : 'Dense View';
  const btn = elText('button', 'dense-toggle-btn' + (isDenseMode ? ' active' : ''), label);
  btn.type = 'button';
  btn.title = isDenseMode ? 'Return to normal row height' : 'Compress rows to scan all exercises';
  btn.setAttribute('aria-pressed', isDenseMode ? 'true' : 'false');
  btn.addEventListener('click', toggleDenseMode);
  return btn;
}

function toggleDenseMode() {
  isDenseMode = !isDenseMode;
  settings.denseMode = isDenseMode;
  saveSettings(settings);
  render();
}

// ── Settings modal ────────────────────────────────────────────────
function openSettingsModal() {
  ensureBlockSettings();
  settingsModalSnapshot = {
    settings: JSON.parse(JSON.stringify(settings)),
    exerciseBlocks: exercises.map(ex => ({ id: ex.id, blockId: ex.blockId || '' })),
  };
  const legsDays = settings.legsDays !== undefined ? settings.legsDays : [1, 3, 5];
  document.querySelectorAll('#settings-modal input[data-dow]').forEach(cb => {
    cb.checked = legsDays.includes(Number(cb.dataset.dow));
  });
  document.getElementById('setting-personal-day-start').value = getPersonalDayStartTime();
  document.getElementById('setting-cue-sound').checked = settings.setCueSound !== false;
  document.getElementById('setting-cue-vibrate').checked = settings.setCueVibrate !== false;
  document.getElementById('setting-cue-speech').checked = Boolean(settings.setCueSpeech);
  syncSpeechVolumeControl();
  renderBlockSettings();
  document.getElementById('settings-modal').classList.remove('hidden');
}

function closeSettingsModal(restore = true) {
  if (restore && settingsModalSnapshot) {
    const savedSpeechVolume = settings.setCueSpeechVolume;
    settings = JSON.parse(JSON.stringify(settingsModalSnapshot.settings));
    settings.setCueSpeechVolume = clampSetCueSpeechVolume(savedSpeechVolume);
    settingsModalSnapshot.exerciseBlocks.forEach(saved => {
      const ex = exercises.find(item => item.id === saved.id);
      if (ex) ex.blockId = saved.blockId;
    });
  }
  settingsModalSnapshot = null;
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
  settings.setCueSpeechVolume = readSpeechVolumeSlider();
  readBlockSettingsForm();
  saveSettings(settings);
  saveExercises(exercises);
  closeSettingsModal(false);
  render();
}

function syncSpeechVolumeControl() {
  const input = document.getElementById('setting-cue-speech-volume');
  const speechToggle = document.getElementById('setting-cue-speech');
  if (!input || !speechToggle) return;
  const percent = Math.round(clampSetCueSpeechVolume(settings.setCueSpeechVolume) * 100);
  input.value = String(percent);
  updateSpeechVolumeLabel(percent);
  input.disabled = !speechToggle.checked;
  input.closest('.cue-volume-label')?.classList.toggle('is-disabled', input.disabled);
}

function updateSpeechVolumeLabel(percent = readSpeechVolumeSlider() * 100) {
  const label = document.getElementById('setting-cue-speech-volume-label');
  if (!label) return;
  label.textContent = `Speech volume: ${Math.round(percent)}%`;
}

function readSpeechVolumeSlider() {
  const input = document.getElementById('setting-cue-speech-volume');
  return clampSetCueSpeechVolume(input ? Number(input.value) / 100 : settings.setCueSpeechVolume);
}

function handleSpeechVolumeInput() {
  settings.setCueSpeechVolume = readSpeechVolumeSlider();
  updateSpeechVolumeLabel(settings.setCueSpeechVolume * 100);
  saveSettings(settings);
}

function renderBlockSettings() {
  const root = document.getElementById('settings-blocks');
  if (!root) return;
  root.innerHTML = '';
  GROUP_ORDER.forEach(group => root.appendChild(buildBlockSettingsGroup(group)));
}

function refreshOpenBlockSettings() {
  const modal = document.getElementById('settings-modal');
  if (!modal || modal.classList.contains('hidden')) return;
  readBlockSettingsForm();
  renderBlockSettings();
}

function buildBlockSettingsGroup(group) {
  const cfg = GROUPS[group];
  const panel = el('section', 'block-settings-group');
  panel.style.setProperty('--exercise-group-color', cfg.color);

  const header = el('div', 'block-settings-group-header');
  header.appendChild(elText('h4', '', cfg.label));
  const addBtn = elText('button', 'block-settings-add', '+ Add block');
  addBtn.type = 'button';
  addBtn.addEventListener('click', () => {
    readBlockSettingsForm();
    const block = addBlockDefinition(group);
    renderBlockSettings();
    window.setTimeout(() => {
      const escapeIdent = window.CSS?.escape || ((value) => String(value).replace(/"/g, '\\"'));
      document.querySelector(`#settings-blocks input[data-block-title="${escapeIdent(`${group}:${block.id}`)}"]`)?.focus();
    }, 0);
  });
  header.appendChild(addBtn);
  panel.appendChild(header);

  const blocks = blockDefinitionsForGroup(group);
  const blockList = el('div', 'block-settings-list');
  if (!blocks.length) {
    blockList.appendChild(elText('div', 'block-settings-empty', 'No blocks yet.'));
  } else {
    blocks.forEach((block, index) => blockList.appendChild(buildBlockSettingsRow(group, block, index, blocks.length)));
  }
  panel.appendChild(blockList);

  const exerciseList = el('div', 'block-exercise-list');
  displayOrderedExercisesInGroup(group).forEach(ex => exerciseList.appendChild(buildBlockExerciseAssignment(group, ex)));
  panel.appendChild(exerciseList);

  return panel;
}

function buildBlockSettingsRow(group, block, index, count) {
  const row = el('div', 'block-settings-row');
  const id = elText('div', 'block-settings-id', block.id);
  id.title = 'Block ID';
  row.appendChild(id);

  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'block-settings-title';
  input.value = block.title || '';
  input.placeholder = blockTitleFromId(block.id);
  input.dataset.blockTitle = `${group}:${block.id}`;
  input.setAttribute('aria-label', `Title for ${blockTitleFromId(block.id)}`);
  row.appendChild(input);

  const actions = el('div', 'block-settings-actions');
  const up = elText('button', 'block-settings-move', '↑');
  up.type = 'button';
  up.title = 'Move block up';
  up.disabled = index === 0;
  up.addEventListener('click', () => {
    readBlockSettingsForm();
    moveBlockDefinition(group, block.id, -1);
    renderBlockSettings();
  });
  actions.appendChild(up);

  const down = elText('button', 'block-settings-move', '↓');
  down.type = 'button';
  down.title = 'Move block down';
  down.disabled = index === count - 1;
  down.addEventListener('click', () => {
    readBlockSettingsForm();
    moveBlockDefinition(group, block.id, 1);
    renderBlockSettings();
  });
  actions.appendChild(down);

  const del = elText('button', 'block-settings-delete', 'Delete');
  del.type = 'button';
  del.title = 'Delete block and unassign its exercises';
  del.addEventListener('click', () => {
    if (!confirm(`Delete ${blockTitleFor(group, block.id)} and unassign its exercises?`)) return;
    readBlockSettingsForm();
    deleteBlockDefinition(group, block.id);
    renderBlockSettings();
  });
  actions.appendChild(del);
  row.appendChild(actions);

  return row;
}

function buildBlockExerciseAssignment(group, ex) {
  const row = el('label', 'block-exercise-assignment');
  row.appendChild(elText('span', 'block-exercise-name', ex.name));
  const select = document.createElement('select');
  select.dataset.exerciseBlock = ex.id;
  const none = document.createElement('option');
  none.value = '';
  none.textContent = 'No block';
  select.appendChild(none);
  blockDefinitionsForGroup(group).forEach(block => {
    const option = document.createElement('option');
    option.value = block.id;
    option.textContent = blockTitleFor(group, block.id);
    select.appendChild(option);
  });
  select.value = normalizedBlockId(ex);
  row.appendChild(select);
  return row;
}

function readBlockSettingsForm() {
  ensureBlockSettings();
  document.querySelectorAll('#settings-blocks input[data-block-title]').forEach(input => {
    const [group, blockId] = input.dataset.blockTitle.split(':');
    const block = settings.blocks?.[group]?.find(item => item.id === blockId);
    if (block) block.title = input.value.trim();
  });
  document.querySelectorAll('#settings-blocks select[data-exercise-block]').forEach(select => {
    const ex = exercises.find(item => item.id === select.dataset.exerciseBlock);
    if (ex) ex.blockId = select.value;
  });
}

function addBlockDefinition(group) {
  ensureBlocksContainer(group);
  const id = nextBlockId(group);
  const block = { id, title: '', order: settings.blocks[group].length + 1 };
  settings.blocks[group].push(block);
  normalizeBlockDefinitionOrders(group);
  return block;
}

function nextBlockId(group) {
  ensureBlocksContainer(group);
  const used = new Set(settings.blocks[group].map(block => block.id));
  for (let i = 0; i < 26; i++) {
    const id = `block-${String.fromCharCode(97 + i)}`;
    if (!used.has(id)) return id;
  }
  let n = 27;
  while (used.has(`block-${n}`)) n++;
  return `block-${n}`;
}

function moveBlockDefinition(group, blockId, direction) {
  ensureBlocksContainer(group);
  const blocks = blockDefinitionsForGroup(group);
  const index = blocks.findIndex(block => block.id === blockId);
  const target = index + direction;
  if (index === -1 || target < 0 || target >= blocks.length) return;
  [blocks[index], blocks[target]] = [blocks[target], blocks[index]];
  blocks.forEach((block, i) => { block.order = i + 1; });
}

function deleteBlockDefinition(group, blockId) {
  ensureBlocksContainer(group);
  settings.blocks[group] = settings.blocks[group].filter(block => block.id !== blockId);
  exercises.forEach(ex => {
    if (ex.group === group && normalizedBlockId(ex) === blockId) ex.blockId = '';
  });
  normalizeBlockDefinitionOrders(group);
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
  document.querySelectorAll('.notes-toggle').forEach(btn => {
    btn.addEventListener('click', toggleNotesPanel);
  });
  document.getElementById('timeline-copy').addEventListener('click', copyTimelineMarkdown);
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
  document.getElementById('setting-cue-speech-volume').addEventListener('input', handleSpeechVolumeInput);
  document.getElementById('setting-cue-speech').addEventListener('change', syncSpeechVolumeControl);
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

function buildDoseMetaChip(className, label, value, normalText) {
  if (!isDenseMode) {
    return elText('span', `ex-meta-item ex-meta-chip ${className}`, normalText);
  }

  const chip = el('span', `ex-meta-item ex-meta-chip ${className}`);
  chip.appendChild(elText('span', 'ex-meta-chip-label', label));
  chip.appendChild(elText('span', 'ex-meta-chip-value', String(value)));
  return chip;
}

function showToast(message) {
  let toast = document.getElementById('app-toast');
  if (!toast) {
    toast = el('div', 'app-toast');
    toast.id = 'app-toast';
    toast.setAttribute('role', 'status');
    toast.setAttribute('aria-live', 'polite');
    document.body.appendChild(toast);
  }
  toast.textContent = message;
  toast.classList.add('show');
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => {
    toast.classList.remove('show');
  }, 3200);
}
