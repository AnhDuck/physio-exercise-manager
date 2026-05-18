// Calendar grid rendering, dense mode, and week navigation.

function render(options = {}) {
  if (!options.preserveCompletedActionMenu) completedActionMenu = null;
  const dates = weekDates(currentWeekStart);
  const todayS = todayStr();
  const monthLabel = `${MONTH_NAMES[currentWeekStart.getMonth()]} ${currentWeekStart.getFullYear()}`;

  const app = document.getElementById('app');
  app.innerHTML = '';
  document.body.classList.toggle('dense-mode', isDenseMode);
  document.body.classList.toggle('set-tracker-open', Boolean(activeTracker));

  app.appendChild(buildColHeaders(dates, todayS, monthLabel));

  let exerciseNumber = 1;
  for (const group of GROUP_ORDER) {
    const exs = exercises
      .filter(e => e.group === group && isExerciseActive(e))
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

  const today = elText('button', 'today-btn', 'Today');
  today.id = 'btn-today';
  today.type = 'button';
  today.addEventListener('click', goToToday);

  const prev = elText('button', 'nav-arrow-btn', '\u2039');
  prev.id = 'btn-prev-week';
  prev.type = 'button';
  prev.setAttribute('aria-label', 'Previous week');
  prev.title = 'Previous week';
  prev.addEventListener('click', prevWeek);
  
  const next = elText('button', 'nav-arrow-btn', '\u203A');
  next.id = 'btn-next-week';
  next.type = 'button';
  next.setAttribute('aria-label', 'Next week');
  next.title = 'Next week';
  next.addEventListener('click', nextWeek);

  const label = elText('span', 'week-label', monthLabel);
  label.id = 'week-label';

  nav.appendChild(today);
  nav.appendChild(prev);
  nav.appendChild(next);
  nav.appendChild(label);
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
  const numberClasses = [
    'ex-number',
    ex.instructions && isDenseMode ? 'has-instructions' : '',
    ex.changedSinceLastPhysioVisit && isDenseMode ? 'changed-since-physio' : '',
  ].filter(Boolean).join(' ');
  const number = elText('span', numberClasses, String(exerciseNumber));
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

