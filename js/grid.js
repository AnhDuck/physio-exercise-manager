// Calendar grid rendering and week navigation.

const GRID_PHONE_MEDIA = '(max-width: 700px)';
const GRID_MODE_THREE_DAY = 'three-day';
const GRID_MODE_WEEK = 'week';

function render() {
  ensureSelectedDate();
  const viewMode = effectiveGridViewMode();
  const dates = visibleGridDates(viewMode);
  const todayS = todayStr();
  const monthLabel = gridDateRangeLabel(dates);

  const app = document.getElementById('app');
  app.innerHTML = '';
  app.dataset.gridMode = viewMode;
  app.style.setProperty('--visible-day-count', String(dates.length));
  document.body.dataset.gridMode = viewMode;
  document.body.classList.toggle('set-tracker-open', Boolean(activeTracker));

  app.appendChild(buildColHeaders(dates, todayS, monthLabel, viewMode));

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
function buildColHeaders(dates, todayS, monthLabel, viewMode) {
  const row = el('div', 'col-header-row');
  row.dataset.gridMode = viewMode;
  const spacer = el('div', 'spacer');
  spacer.appendChild(buildWeekNav(monthLabel, viewMode));
  row.appendChild(spacer);

  dates.forEach((date) => {
    const dateS = toDateStr(date);
    const isToday = dateS === todayS;
    const isSelected = viewMode === GRID_MODE_THREE_DAY && dateS === selectedDateStr;
    const cell = el('div', 'day-header' + (isToday ? ' today' : ''));
    if (isSelected) cell.classList.add('selected-day');
    if (viewMode === GRID_MODE_THREE_DAY) {
      cell.title = isSelected ? 'Selected day' : 'Tap to center this day';
      cell.addEventListener('click', () => selectGridDate(dateS));
    }

    const dow = date.getDay();
    const isArmDay  = dow === 1 || dow === 3 || dow === 5;
    const dayTags = [];

    cell.appendChild(elText('div', 'day-name', dayNameForDate(date)));
    cell.appendChild(elText('div', 'day-date', String(date.getDate())));

    if (isArmDay) {
      const pillRow = el('div', 'day-pill-row');
      const armDay = getArmDayForDate(dateS);
      dayTags.push(armDay);
      if (armDay === 'arm-day1') {
        pillRow.appendChild(elText('span', 'day-pill pill-d1', 'Day 1'));
      } else {
        pillRow.appendChild(elText('span', 'day-pill pill-d2', 'Day 2'));
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

function buildWeekNav(monthLabel, viewMode) {
  const nav = el('nav', 'week-nav');

  const today = elText('button', 'today-btn', 'Today');
  today.id = 'btn-today';
  today.type = 'button';
  today.addEventListener('click', goToToday);

  const prev = elText('button', 'nav-arrow-btn', '\u2039');
  prev.id = 'btn-prev-week';
  prev.type = 'button';
  prev.setAttribute('aria-label', viewMode === GRID_MODE_THREE_DAY ? 'Previous day' : 'Previous week');
  prev.title = viewMode === GRID_MODE_THREE_DAY ? 'Previous day' : 'Previous week';
  prev.addEventListener('click', prevGridPeriod);
  
  const next = elText('button', 'nav-arrow-btn', '\u203A');
  next.id = 'btn-next-week';
  next.type = 'button';
  next.setAttribute('aria-label', viewMode === GRID_MODE_THREE_DAY ? 'Next day' : 'Next week');
  next.title = viewMode === GRID_MODE_THREE_DAY ? 'Next day' : 'Next week';
  next.addEventListener('click', nextGridPeriod);

  const label = elText('span', 'week-label', monthLabel);
  label.id = 'week-label';

  nav.appendChild(today);
  nav.appendChild(prev);
  nav.appendChild(next);
  nav.appendChild(label);
  nav.appendChild(buildGridViewToggle(viewMode));
  return nav;
}

function buildGridViewToggle(viewMode) {
  const toggle = el('div', 'grid-view-toggle');
  toggle.setAttribute('role', 'group');
  toggle.setAttribute('aria-label', 'Grid view');

  const three = elText('button', 'grid-view-option', '3 days');
  three.type = 'button';
  three.dataset.gridView = GRID_MODE_THREE_DAY;
  three.setAttribute('aria-pressed', String(viewMode === GRID_MODE_THREE_DAY));
  three.classList.toggle('is-active', viewMode === GRID_MODE_THREE_DAY);
  three.addEventListener('click', () => setGridViewMode(GRID_MODE_THREE_DAY));

  const week = elText('button', 'grid-view-option', 'Week');
  week.type = 'button';
  week.dataset.gridView = GRID_MODE_WEEK;
  week.setAttribute('aria-pressed', String(viewMode === GRID_MODE_WEEK));
  week.classList.toggle('is-active', viewMode === GRID_MODE_WEEK);
  week.addEventListener('click', () => setGridViewMode(GRID_MODE_WEEK));

  toggle.appendChild(three);
  toggle.appendChild(week);
  return toggle;
}

// ── Group section ────────────────────────────────────────────────
function buildGroupSection(group, exs, dates, todayS, startNumber) {
  const frag = document.createDocumentFragment();
  const cfg = GROUPS[group];

  // Section header
  const header = el('div', 'group-header');
  header.dataset.group = group;
  header.style.borderTopColor = cfg.color;
  if (group === 'arm-day1') header.style.marginTop = '0';
  header.addEventListener('dragover', handleExerciseDragOver);
  header.addEventListener('dragleave', clearDropPosition);
  header.addEventListener('drop', handleExerciseDropAtEnd);

  const label = el('div', 'group-header-label');
  const dot = el('div', 'group-dot');
  dot.style.background = cfg.color;
  label.appendChild(dot);
  label.appendChild(document.createTextNode(cfg.label));
  const addBtn = el('button', 'group-add-btn');
  addBtn.type = 'button';
  addBtn.title = `Add exercise to ${cfg.label}`;
  addBtn.appendChild(buildAppIconSvg('add'));
  addBtn.appendChild(elText('span', 'ui-button-text', 'Add'));
  addBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    openAddModal(group);
  });
  label.appendChild(addBtn);
  header.appendChild(label);

  dates.forEach((date) => {
    const dateS = toDateStr(date);
    const isToday = dateS === todayS;
    header.appendChild(el('div', 'group-header-cell' + (isToday ? ' today' : '')));
  });

  frag.appendChild(header);

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
    ex.instructions ? 'has-instructions' : '',
    ex.changedSinceLastPhysioVisit ? 'changed-since-physio' : '',
  ].filter(Boolean).join(' ');
  const number = elText('span', numberClasses, String(exerciseNumber));
  if (ex.instructions) {
    number.title = 'Show instructions';
    number.setAttribute('role', 'button');
    number.setAttribute('tabindex', '0');
  }
  nameRow.appendChild(number);
  const nameText = el('span', 'ex-name');
  nameText.appendChild(elText('span', 'ex-name-text', ex.name));
  nameText.appendChild(elText('span', 'edit-glyph', String.fromCharCode(9998)));
  nameRow.appendChild(nameText);
  nameText.title = 'Edit exercise';
  nameText.setAttribute('role', 'button');
  nameText.setAttribute('tabindex', '0');
  nameText.addEventListener('click', () => {
    openEditModal(ex.id);
  });
  nameText.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    e.preventDefault();
    openEditModal(ex.id);
  });
  info.appendChild(nameRow);

  const meta = el('div', 'ex-meta');
  meta.appendChild(buildDoseMetaChip('ex-meta-sets', 'S', ex.sets));
  meta.appendChild(elText('span', 'sep ex-meta-sep', '/'));
  meta.appendChild(buildDoseMetaChip('ex-meta-reps', 'R', ex.reps));
  if (ex.resistance) {
    meta.appendChild(elText('span', 'sep ex-meta-sep', '/'));
    meta.appendChild(buildDoseMetaChip('ex-meta-resistance', 'Res', ex.resistance));
  }
  meta.appendChild(elText('span', 'sep ex-meta-sep ex-meta-frequency-sep', '/'));
  meta.appendChild(elText('span', 'ex-meta-item ex-meta-frequency', ex.frequency));
  info.appendChild(meta);

  let instructionRow = null;

  label.appendChild(info);

  if (ex.instructions) {
    instructionRow = buildInstructionRow(ex);
    const toggleInstructions = () => {
      instructionRow.classList.toggle('open', !instructionRow.classList.contains('open'));
      number.classList.toggle('active', instructionRow.classList.contains('open'));
      number.title = instructionRow.classList.contains('open') ? 'Hide instructions' : 'Show instructions';
    };
    number.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleInstructions();
    });
    number.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      e.preventDefault();
      e.stopPropagation();
      toggleInstructions();
    });
  }
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
    btn.title = isActive ? 'Complete all sets' : (done ? 'Open set tracker' : 'Track sets');
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
  if (instructionRow) frag.appendChild(instructionRow);
  return frag;
}

function buildInstructionRow(ex) {
  const row = el('div', 'instruction-row');
  const cell = el('div', 'instruction-cell');
  if (ex.image) {
    const media = el('div', 'instruction-media');
    const img = document.createElement('img');
    img.src = ex.image;
    img.alt = ex.name;
    media.appendChild(img);
    cell.appendChild(media);
  }
  cell.appendChild(elText('p', 'instruction-copy', ex.instructions));
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
function prevGridPeriod() {
  if (effectiveGridViewMode() === GRID_MODE_THREE_DAY) {
    moveSelectedGridDate(-1);
    return;
  }
  currentWeekStart = new Date(currentWeekStart);
  currentWeekStart.setDate(currentWeekStart.getDate() - 7);
  selectedDateStr = toDateStr(currentWeekStart);
  render();
}

function nextGridPeriod() {
  if (effectiveGridViewMode() === GRID_MODE_THREE_DAY) {
    moveSelectedGridDate(1);
    return;
  }
  currentWeekStart = new Date(currentWeekStart);
  currentWeekStart.setDate(currentWeekStart.getDate() + 7);
  selectedDateStr = toDateStr(currentWeekStart);
  render();
}

function goToToday() {
  currentWeekStart = getMonday(new Date());
  selectedDateStr = todayStr();
  render();
}

function ensureSelectedDate() {
  if (!isValidDateStr(selectedDateStr)) selectedDateStr = todayStr();
  if (!currentWeekStart) currentWeekStart = getMonday(dateFromStr(selectedDateStr));
}

function isPhoneGridViewport() {
  return Boolean(window.matchMedia?.(GRID_PHONE_MEDIA).matches);
}

function effectiveGridViewMode() {
  if (!isPhoneGridViewport()) return GRID_MODE_WEEK;
  return gridViewModeOverride === GRID_MODE_WEEK ? GRID_MODE_WEEK : GRID_MODE_THREE_DAY;
}

function visibleGridDates(viewMode = effectiveGridViewMode()) {
  if (viewMode === GRID_MODE_WEEK) return weekDates(currentWeekStart);
  const selected = dateFromStr(selectedDateStr || todayStr());
  return [-1, 0, 1].map(offset => {
    const date = new Date(selected);
    date.setDate(date.getDate() + offset);
    return date;
  });
}

function selectGridDate(dateStr) {
  if (!isValidDateStr(dateStr)) return;
  selectedDateStr = dateStr;
  currentWeekStart = getMonday(dateFromStr(dateStr));
  render();
}

function moveSelectedGridDate(offsetDays) {
  ensureSelectedDate();
  const date = dateFromStr(selectedDateStr);
  date.setDate(date.getDate() + offsetDays);
  selectGridDate(toDateStr(date));
}

function setGridViewMode(mode) {
  gridViewModeOverride = mode === GRID_MODE_WEEK ? GRID_MODE_WEEK : GRID_MODE_THREE_DAY;
  if (gridViewModeOverride === GRID_MODE_WEEK) {
    currentWeekStart = getMonday(dateFromStr(selectedDateStr || todayStr()));
  }
  render();
}

function bindGridViewportListener() {
  const query = window.matchMedia?.(GRID_PHONE_MEDIA);
  if (!query) return;
  const handleChange = () => render();
  if (typeof query.addEventListener === 'function') {
    query.addEventListener('change', handleChange);
  } else if (typeof query.addListener === 'function') {
    query.addListener(handleChange);
  }
}

function dayNameForDate(date) {
  return DAY_NAMES[(date.getDay() + 6) % 7];
}

function gridDateRangeLabel(dates) {
  if (!dates.length) return '';
  const first = dates[0];
  const last = dates[dates.length - 1];
  const sameMonth = first.getMonth() === last.getMonth() && first.getFullYear() === last.getFullYear();
  if (sameMonth) return `${MONTH_NAMES[first.getMonth()]} ${first.getFullYear()}`;
  if (first.getFullYear() === last.getFullYear()) {
    return `${MONTH_ABBR[first.getMonth()]}-${MONTH_ABBR[last.getMonth()]} ${first.getFullYear()}`;
  }
  return `${MONTH_ABBR[first.getMonth()]} ${first.getFullYear()}-${MONTH_ABBR[last.getMonth()]} ${last.getFullYear()}`;
}

// ── Compact col-header on scroll ──────────────────────────────────
function updateCompactHeader() {
  const colHeader = document.querySelector('.col-header-row');
  if (colHeader) colHeader.classList.add('compact');
}

