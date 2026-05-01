// ── State ─────────────────────────────────────────────────────────
let exercises = [];
let sessions  = {};
let settings  = {};
let currentWeekStart = null; // Monday of displayed week (Date)
let editingExId = null;      // exercise id being edited in modal
let uploadTargetId = null;   // exercise id awaiting image upload
let imageImportPending = false;

// ── Timer state ───────────────────────────────────────────────────
let timerState    = 'idle';  // 'idle' | 'running' | 'paused'
let timerSeconds  = 0;
let timerInterval = null;

// ── Init ─────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  exercises = loadExercises();
  sessions  = loadSessions();
  settings  = loadSettings();
  runMigrations();
  currentWeekStart = getMonday(new Date());
  render();
  bindStaticEvents();
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
  updateCompactHeader();
}

// ── Column headers ────────────────────────────────────────────────
function buildColHeaders(dates, todayS) {
  const row = el('div', 'col-header-row');
  const spacer = el('div', 'spacer');
  spacer.appendChild(buildTimerWidget());
  row.appendChild(spacer);

  dates.forEach((date, i) => {
    const dateS = toDateStr(date);
    const isToday = dateS === todayS;
    const cell = el('div', 'day-header' + (isToday ? ' today' : ''));

    const dow = date.getDay();
    const isArmDay  = dow === 1 || dow === 3 || dow === 5;
    const legsDays  = settings.legsDays !== undefined ? settings.legsDays : [1, 3, 5];
    const isLegsDay = legsDays.includes(dow);

    cell.appendChild(elText('div', 'day-name', DAY_NAMES[i]));
    cell.appendChild(elText('div', 'day-date', String(date.getDate())));

    if (isArmDay || isLegsDay) {
      const pillRow = el('div', 'day-pill-row');
      if (isArmDay) {
        const armDay = getArmDayForDate(dateS);
        if (armDay === 'arm-day1') {
          pillRow.appendChild(elText('span', 'day-pill pill-d1', 'Day 1'));
        } else {
          pillRow.appendChild(elText('span', 'day-pill pill-d2', 'Day 2'));
        }
      }
      if (isLegsDay) {
        pillRow.appendChild(elText('span', 'day-pill pill-leg', 'Legs'));
      }
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
  const isCollapsed = (settings.collapsedGroups || []).includes(group);

  // Section header
  const header = el('div', 'group-header' + (isCollapsed ? ' collapsed' : ''));
  header.style.borderTopColor = cfg.color;
  if (group === 'arm-day1') header.style.marginTop = '0';
  header.title = isCollapsed ? 'Click to expand' : 'Click to collapse';
  header.addEventListener('click', () => toggleGroupCollapse(group));

  const label = el('div', 'group-header-label');
  label.appendChild(elText('span', 'collapse-chevron', '▼'));
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

function toggleGroupCollapse(group) {
  const collapsed = settings.collapsedGroups || [];
  const idx = collapsed.indexOf(group);
  if (idx === -1) collapsed.push(group);
  else            collapsed.splice(idx, 1);
  settings.collapsedGroups = collapsed;
  saveSettings(settings);
  render();
}

// ── Exercise row ──────────────────────────────────────────────────
function buildExerciseRow(ex, group, dates, todayS) {
  const row = el('div', 'exercise-row');
  row.dataset.exId = ex.id;

  // Label cell
  const label = el('div', 'ex-label');

  // Thumbnail
  const thumb = el('div', 'ex-thumb');
  thumb.title = 'Click to set image';
  if (ex.image) {
    const img = document.createElement('img');
    img.src = ex.image;
    img.alt = ex.name;
    thumb.appendChild(img);
  } else {
    thumb.textContent = '📷';
  }
  thumb.addEventListener('click', () => openImageModal(ex.id));
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

    const cell = el('div', 'day-cell' + (isToday ? ' today' : ''));
    const session = sessions[dateS] || {};
    const done = (session.completedExercises || []).includes(ex.id);

    const btn = el('button', 'check-btn' + (done ? ' done' : ''));
    btn.textContent = done ? '✓' : '';
    btn.title = done ? 'Mark incomplete' : 'Mark complete';
    btn.addEventListener('click', () => toggleComplete(ex.id, dateS));

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
    const relevantExs = exercises;
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
function toggleComplete(exId, dateStr) {
  const s = sessions[dateStr] || { completedExercises: [] };
  const idx = s.completedExercises.indexOf(exId);
  if (idx === -1) s.completedExercises.push(exId);
  else            s.completedExercises.splice(idx, 1);
  sessions[dateStr] = s;
  saveSession(dateStr, s);
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

// ── Timer ─────────────────────────────────────────────────────────
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
  if (colHeader) colHeader.classList.toggle('compact', window.scrollY > 0);
}

// ── Static event bindings ─────────────────────────────────────────
function bindStaticEvents() {
  document.getElementById('btn-prev-week').addEventListener('click', prevWeek);
  document.getElementById('btn-next-week').addEventListener('click', nextWeek);
  document.getElementById('btn-today').addEventListener('click', goToToday);
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
