// ── State ─────────────────────────────────────────────────────────
let exercises = [];
let sessions  = {};
let settings  = {};
let currentWeekStart = null; // Monday of displayed week (Date)
let editingExId = null;      // exercise id being edited in modal
let uploadTargetId = null;   // exercise id awaiting image upload

// ── Init ─────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  exercises = loadExercises();
  sessions  = loadSessions();
  settings  = loadSettings();
  currentWeekStart = getMonday(new Date());
  render();
  bindStaticEvents();
});

// ── Arm day rotation ──────────────────────────────────────────────
function getArmDayForDate(dateStr) {
  // If this date's session already has an armDay locked in, use it.
  if (sessions[dateStr]?.armDay) return sessions[dateStr].armDay;

  // Otherwise, count how many past arm sessions are confirmed before this date.
  const pastCount = Object.entries(sessions)
    .filter(([d, s]) => d < dateStr && s.armDay)
    .length;
  return (settings.armSessionCount + pastCount) % 2 === 0 ? 'arm-day1' : 'arm-day2';
}

// Called when user clicks a day-cell checkbox for an arm exercise.
// Locks in the arm day for that date if not already set.
function ensureArmDayLocked(dateStr) {
  if (sessions[dateStr]?.armDay) return;
  const armDay = getArmDayForDate(dateStr);
  const s = sessions[dateStr] || { completedExercises: [] };
  s.armDay = armDay;
  sessions[dateStr] = s;
  saveSession(dateStr, s);
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

function todayStr() { return toDateStr(new Date()); }

// ── Main render ───────────────────────────────────────────────────
function render() {
  const dates = weekDates(currentWeekStart);
  const todayS = todayStr();

  // Month label in nav
  const months = [...new Set(dates.map(d => MONTH_ABBR[d.getMonth()]))];
  document.getElementById('week-label').textContent = months.join(' / ');

  const app = document.getElementById('app');
  app.innerHTML = '';

  app.appendChild(buildColHeaders(dates, todayS));

  const groupOrder = ['arm-day1', 'arm-day2', 'legs'];
  for (const group of groupOrder) {
    const exs = exercises
      .filter(e => e.group === group)
      .sort((a, b) => a.order - b.order);
    app.appendChild(buildGroupSection(group, exs, dates, todayS));
  }

  app.appendChild(buildSummaryRow(dates, todayS));
}

// ── Column headers ────────────────────────────────────────────────
function buildColHeaders(dates, todayS) {
  const row = el('div', 'col-header-row');
  row.appendChild(el('div', 'spacer'));

  dates.forEach((date, i) => {
    const dateS = toDateStr(date);
    const isToday = dateS === todayS;
    const cell = el('div', 'day-header' + (isToday ? ' today' : ''));

    // Pills only on scheduled days: Mon (1), Wed (3), Fri (5)
    const dow = date.getDay();
    const isScheduledDay = dow === 1 || dow === 3 || dow === 5;

    cell.appendChild(elText('div', 'day-name', DAY_NAMES[i]));
    cell.appendChild(elText('div', 'day-date', String(date.getDate())));

    if (isScheduledDay) {
      const armDay = getArmDayForDate(dateS);
      const pillRow = el('div', 'day-pill-row');
      if (armDay === 'arm-day1') {
        pillRow.appendChild(elText('span', 'day-pill pill-d1', 'D1'));
      } else {
        pillRow.appendChild(elText('span', 'day-pill pill-d2', 'D2'));
      }
      pillRow.appendChild(elText('span', 'day-pill pill-leg', 'LEG'));
      cell.appendChild(pillRow);
    }

    row.appendChild(cell);
  });

  return row;
}

// ── Group section ────────────────────────────────────────────────
function buildGroupSection(group, exs, dates, todayS) {
  const frag = document.createDocumentFragment();
  const cfg = GROUPS[group];

  // Section header
  const header = el('div', 'group-header');
  header.style.borderColor = cfg.color;

  const label = el('div', 'group-header-label');
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

  // Exercise rows
  exs.forEach(ex => frag.appendChild(buildExerciseRow(ex, group, dates, todayS)));

  // Add exercise button
  const addRow = el('div', 'add-exercise-row');
  const addBtn = el('button', 'add-exercise-btn');
  addBtn.textContent = '+ Add exercise';
  addBtn.dataset.group = group;
  addBtn.addEventListener('click', () => openAddModal(group));
  addRow.appendChild(addBtn);
  frag.appendChild(addRow);

  return frag;
}

// ── Exercise row ──────────────────────────────────────────────────
function buildExerciseRow(ex, group, dates, todayS) {
  const row = el('div', 'exercise-row');
  row.dataset.exId = ex.id;

  // Label cell
  const label = el('div', 'ex-label');

  // Thumbnail
  const thumb = el('div', 'ex-thumb');
  thumb.title = 'Click to upload image';
  if (ex.image) {
    const img = document.createElement('img');
    img.src = ex.image;
    img.alt = ex.name;
    thumb.appendChild(img);
  } else {
    thumb.textContent = '📷';
  }
  thumb.addEventListener('click', () => openImageUpload(ex.id));
  label.appendChild(thumb);

  // Info
  const info = el('div', 'ex-info');
  info.appendChild(elText('div', 'ex-name', ex.name));

  const meta = el('div', 'ex-meta');
  meta.appendChild(elText('span', '', `Sets: ${ex.sets}`));
  meta.appendChild(elText('span', 'sep', '·'));
  meta.appendChild(elText('span', '', `Reps: ${ex.reps}`));
  if (ex.resistance) {
    meta.appendChild(elText('span', 'sep', '·'));
    meta.appendChild(elText('span', '', `Resistance: ${ex.resistance}`));
  }
  meta.appendChild(elText('span', 'sep', '·'));
  meta.appendChild(elText('span', '', ex.frequency));
  info.appendChild(meta);

  if (ex.instructions) {
    const tog = el('button', 'instructions-toggle');
    tog.innerHTML = '▸ Instructions';
    const instrText = el('div', 'instructions-text');
    instrText.textContent = ex.instructions;
    instrText.style.display = 'none';
    tog.addEventListener('click', () => {
      const open = instrText.style.display !== 'none';
      instrText.style.display = open ? 'none' : 'block';
      tog.innerHTML = (open ? '▸' : '▾') + ' Instructions';
    });
    info.appendChild(tog);
    info.appendChild(instrText);
  }

  label.appendChild(info);

  // Edit button
  const actions = el('div', 'ex-actions');
  const editBtn = el('button', 'btn-icon');
  editBtn.title = 'Edit exercise';
  editBtn.textContent = '✎';
  editBtn.addEventListener('click', () => openEditModal(ex.id));
  actions.appendChild(editBtn);
  label.appendChild(actions);

  row.appendChild(label);

  // Day cells
  dates.forEach((date) => {
    const dateS = toDateStr(date);
    const isToday = dateS === todayS;
    const armDayForDate = getArmDayForDate(dateS);
    const isArmEx = group === 'arm-day1' || group === 'arm-day2';
    // Dim arm exercises that don't belong to this day's arm rotation
    const dimmed = isArmEx && group !== armDayForDate;

    const cell = el('div', 'day-cell' + (isToday ? ' today' : '') + (dimmed ? ' dimmed' : ''));
    const session = sessions[dateS] || {};
    const done = (session.completedExercises || []).includes(ex.id);

    const btn = el('button', 'check-btn' + (done ? ' done' : ''));
    btn.textContent = done ? '✓' : '';
    btn.title = done ? 'Mark incomplete' : 'Mark complete';
    btn.addEventListener('click', () => toggleComplete(ex.id, dateS, group));

    cell.appendChild(btn);
    row.appendChild(cell);
  });

  return row;
}

// ── Summary row ───────────────────────────────────────────────────
function buildSummaryRow(dates, todayS) {
  const row = el('div', 'summary-row');
  row.appendChild(elText('div', 'summary-label', 'Completion'));

  dates.forEach((date) => {
    const dateS = toDateStr(date);
    const isToday = dateS === todayS;
    const armDay = getArmDayForDate(dateS);
    const relevantExs = exercises.filter(e =>
      e.group === 'legs' || e.group === armDay
    );
    const done = relevantExs.filter(e =>
      (sessions[dateS]?.completedExercises || []).includes(e.id)
    ).length;
    const pct = relevantExs.length === 0 ? 0 : Math.round(done / relevantExs.length * 100);
    const cell = el('div', 'summary-pct' + (isToday ? ' today' : '') + (pct === 100 ? ' full' : ''));
    cell.textContent = pct + '%';
    row.appendChild(cell);
  });

  return row;
}

// ── Toggle completion ─────────────────────────────────────────────
function toggleComplete(exId, dateStr, group) {
  const isArmEx = group === 'arm-day1' || group === 'arm-day2';
  if (isArmEx) ensureArmDayLocked(dateStr);

  const s = sessions[dateStr] || { completedExercises: [] };
  const idx = s.completedExercises.indexOf(exId);
  if (idx === -1) {
    s.completedExercises.push(exId);
  } else {
    s.completedExercises.splice(idx, 1);
  }
  sessions[dateStr] = s;
  saveSession(dateStr, s);

  // If all arm exercises for this date are now done, bump the arm session counter
  if (isArmEx) {
    const armDay = s.armDay || getArmDayForDate(dateStr);
    const armExs = exercises.filter(e => e.group === armDay);
    const allArmDone = armExs.every(e => s.completedExercises.includes(e.id));
    if (allArmDone && !s.armSessionCounted) {
      settings.armSessionCount++;
      s.armSessionCounted = true;
      saveSettings(settings);
      saveSession(dateStr, s);
    } else if (!allArmDone && s.armSessionCounted) {
      settings.armSessionCount = Math.max(0, settings.armSessionCount - 1);
      s.armSessionCounted = false;
      saveSettings(settings);
      saveSession(dateStr, s);
    }
  }

  render();
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
    if (idx !== -1) exercises[idx] = { ...exercises[idx], ...fields };
  } else {
    const maxOrder = exercises.filter(e => e.group === fields.group)
      .reduce((m, e) => Math.max(m, e.order), 0);
    exercises.push({
      id: 'ex-' + Date.now(),
      image: null,
      order: maxOrder + 1,
      ...fields,
    });
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

// ── Image upload ──────────────────────────────────────────────────
function openImageUpload(exId) {
  uploadTargetId = exId;
  document.getElementById('image-upload-input').click();
}

function handleImageUpload(file) {
  if (!file || !uploadTargetId) return;
  const reader = new FileReader();
  reader.onload = (e) => {
    const idx = exercises.findIndex(ex => ex.id === uploadTargetId);
    if (idx !== -1) {
      exercises[idx].image = e.target.result;
      saveExercises(exercises);
      render();
    }
    uploadTargetId = null;
  };
  reader.readAsDataURL(file);
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

// ── Static event bindings ─────────────────────────────────────────
function bindStaticEvents() {
  document.getElementById('btn-prev-week').addEventListener('click', prevWeek);
  document.getElementById('btn-next-week').addEventListener('click', nextWeek);
  document.getElementById('btn-today').addEventListener('click', goToToday);

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
