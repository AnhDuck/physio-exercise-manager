// Set tracker, timer UI, log editing, and tracker shortcuts.

function handleSetCellClick(exId, dateStr) {
  if (activeTracker?.exerciseId === exId && activeTracker?.dateStr === dateStr) {
    completeActiveExercise();
    return;
  }
  openSetTracker(exId, dateStr);
}
function openSetTracker(exId, dateStr, options = {}) {
  let ex = exercises.find(item => item.id === exId);
  const s = getSessionForEdit(dateStr);
  if (!ex && !s.setProgress[exId]) return;
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
      exerciseSnapshot: exerciseSnapshot(ex),
    };
  } else {
    ex = displayExerciseForLog(exId, s.setProgress[exId]);
    s.setProgress[exId] = normalizeSetProgress(s.setProgress[exId], ex);
    if (
      !options.readOnly &&
      isExerciseActive(ex) &&
      !ex.missing &&
      !isProgressComplete(s.setProgress[exId]) &&
      !s.setProgress[exId].timerStartedAt &&
      !s.setProgress[exId].timerCapped
    ) {
      startSetTimer(s.setProgress[exId]);
    }
  }
  if (options.readOnly) delete s.activeExerciseId;
  else s.activeExerciseId = exId;
  activeTracker = {
    exerciseId: exId,
    dateStr,
    readOnly: Boolean(options.readOnly),
    detailsOpen: Boolean(options.detailsOpen),
  };
  saveSession(dateStr, s);
  render();
  if (!options.skipScroll) window.setTimeout(() => scrollActiveCellIntoView(exId, dateStr), 0);
}

function logSet() {
  const current = getActiveTrackerParts();
  if (!current) return;
  if (activeTracker?.readOnly || !isExerciseActive(current.ex) || current.ex.missing) return;
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
  if (activeTracker?.readOnly || !isExerciseActive(current.ex) || current.ex.missing) return;
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
  if (activeTracker?.readOnly || !isExerciseActive(current.ex) || current.ex.missing) {
    activeTracker = null;
    render();
    return;
  }
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
  if (activeTracker?.readOnly || !isExerciseActive(current.ex) || current.ex.missing) return;
  const { ex, dateStr, session, progress } = current;
  if (progress.completedSets <= 0) return;

  progress.completedAt = null;
  progress.finishedEarly = false;
  progress.completedSets = Math.max(0, progress.completedSets - 1);
  const removedDuration = Math.max(0, Number(progress.setDurations[progress.completedSets]) || 0);
  progress.setDurations.splice(progress.completedSets, 1);
  progress.setCompletedAt.splice(progress.completedSets, 1);
  progress.elapsedSeconds = Math.max(0, Math.min(
    SET_TIMER_CAP_SECONDS,
    (Number(progress.elapsedSeconds) || 0) - removedDuration
  ));
  if (progress.timerCapped && progress.elapsedSeconds < SET_TIMER_CAP_SECONDS) {
    progress.timerCapped = false;
  }
  if (!progress.timerStartedAt && !progress.timerCapped) startSetTimer(progress);
  progress.updatedAt = new Date().toISOString();
  session.setProgress[ex.id] = progress;
  setCompletion(dateStr, ex.id, false);
  saveSession(dateStr, session);
  render();
}

function clearActiveProgress() {
  const current = getActiveTrackerParts();
  if (!current) return;
  if (activeTracker?.readOnly) return;
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
  const session = getSessionForEdit(activeTracker.dateStr);
  let progress = session.setProgress[activeTracker.exerciseId];
  let ex = exercises.find(item => item.id === activeTracker.exerciseId);
  if (!ex && !progress) return null;
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
      exerciseSnapshot: exerciseSnapshot(ex),
    };
  }
  ex = displayExerciseForLog(activeTracker.exerciseId, progress);
  progress = normalizeSetProgress(progress, ex);
  if (!activeTracker.readOnly && isExerciseActive(ex) && !ex.missing && enforceTimerCap(progress)) {
    progress.updatedAt = new Date().toISOString();
    saveSession(activeTracker.dateStr, session);
  }
  session.setProgress[activeTracker.exerciseId] = progress;
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
  const isHistoricalOnly = activeTracker?.readOnly || !isExerciseActive(ex) || ex.missing;
  const group = GROUPS[ex.group] || {};
  const panel = el(
    'section',
    'set-tracker' +
      (done ? ' complete' : '') +
      (isHistoricalOnly ? ' historical-only' : '') +
      (trackerWindowFocused() ? '' : ' is-window-unfocused')
  );
  panel.style.setProperty('--tracker-color', group.color || 'var(--accent-green)');

  const utility = el('div', 'set-tracker-utility');
  const utilityMain = el('div', 'set-tracker-utility-group set-tracker-utility-main');
  const editLogBtn = buildTrackerIconButton('wrench', isHistoricalOnly ? 'View log details' : 'Edit log', 'set-log-toggle', openLogDetails);
  editLogBtn.setAttribute('aria-haspopup', 'dialog');
  editLogBtn.setAttribute('aria-expanded', String(Boolean(activeTracker?.detailsOpen)));
  const utilityDanger = el('div', 'set-tracker-utility-group set-tracker-utility-danger');
  if (!isHistoricalOnly) {
    utilityDanger.appendChild(buildTrackerIconButton('trash', 'Clear set log', 'set-log-clear', clearActiveProgress));
    utility.appendChild(utilityDanger);
  }
  utilityMain.appendChild(editLogBtn);
  utilityMain.appendChild(buildTrackerIconButton('x', 'Close set tracker', 'set-tracker-close', pauseAndCloseTracker));
  utility.appendChild(utilityMain);

  const main = el('div', 'set-tracker-main');
  const info = el('div', 'set-tracker-info');
  const startMeta = el('div', 'set-tracker-start-meta');
  if (ex.hiddenAt || ex.deletedAt || ex.missing) {
    const status = ex.missing ? 'Missing exercise log' : (ex.hiddenAt ? 'Hidden exercise log' : 'Deleted exercise log');
    startMeta.appendChild(elText('div', 'set-tracker-kicker set-tracker-deleted-kicker', status));
  }
  startMeta.appendChild(elText('div', 'set-tracker-kicker', trackerStartedLabel(progress)));
  const sessionDayLabel = trackerSessionDayLabel(progress, dateStr);
  if (sessionDayLabel) {
    startMeta.appendChild(elText('div', 'set-tracker-session-day', sessionDayLabel));
  }
  startMeta.appendChild(buildTrackerFocusIndicator());
  info.appendChild(startMeta);
  const titleRow = el('div', 'set-tracker-title-row');
  titleRow.appendChild(elText('div', 'set-tracker-name', ex.name));
  const groupPill = elText('span', 'set-tracker-group-pill', group.label || ex.group || 'Exercise');
  titleRow.appendChild(groupPill);
  info.appendChild(titleRow);

  const metaRow = el('div', 'set-tracker-meta');
  metaRow.appendChild(elText('span', 'set-tracker-meta-pill set-tracker-set-count', trackerCompletedSetText(progress)));
  metaRow.appendChild(elText('span', 'set-tracker-meta-pill set-tracker-current-set', trackerCurrentSetText(progress)));
  metaRow.appendChild(elText('span', 'set-tracker-meta-pill', `${ex.reps} reps`));
  if (ex.resistance) metaRow.appendChild(elText('span', 'set-tracker-meta-pill', ex.resistance));
  metaRow.appendChild(elText('span', 'set-tracker-meta-pill set-tracker-status-pill', trackerStatusText(progress)));
  info.appendChild(metaRow);

  const progressWrap = el('div', 'set-tracker-progress');
  progressWrap.setAttribute('aria-label', `${trackerCompletedSetText(progress)}. ${trackerCurrentSetText(progress)}.`);
  progressWrap.style.setProperty('--set-count', Math.max(1, progress.targetSets));
  const currentSet = trackerCurrentSetNumber(progress);
  for (let i = 1; i <= progress.targetSets; i++) {
    const segment = el('span', 'set-segment' + (i <= progress.completedSets ? ' filled' : '') + (i === currentSet ? ' current' : ''));
    segment.title = i <= progress.completedSets ? `Set ${i} complete` : (i === currentSet ? `Current set ${i}` : `Set ${i} not started`);
    progressWrap.appendChild(segment);
  }
  info.appendChild(progressWrap);
  main.appendChild(info);
  main.appendChild(utility);
  panel.appendChild(main);

  const actions = el('div', 'set-tracker-actions');
  const mainActions = el('div', 'set-tracker-main-actions');
  const completeSet = el('button', 'set-action set-action-primary');
  completeSet.appendChild(buildAppIconSvg('check-circle'));
  completeSet.appendChild(elText('span', 'set-action-label', 'Complete Set'));
  completeSet.disabled = done || progress.timerCapped || isHistoricalOnly;
  applyTrackerTooltip(completeSet, TRACKER_SHORTCUT_TOOLTIP);
  completeSet.addEventListener('click', logSet);
  mainActions.appendChild(completeSet);
  actions.appendChild(mainActions);

  const timer = el('div', 'set-tracker-timer');
  const sinceSetMetric = el('div', 'set-tracker-metric set-tracker-metric-since');
  sinceSetMetric.appendChild(elText('div', 'set-tracker-timer-label', 'Current set timer'));
  sinceSetMetric.appendChild(elText('div', 'set-tracker-timer-value', trackerCurrentSetTimeValue(progress)));
  const timerDetail = trackerTimerDetail(progress);
  if (timerDetail) sinceSetMetric.appendChild(elText('div', 'set-tracker-timer-detail', timerDetail));
  timer.appendChild(sinceSetMetric);
  const totalMetric = el('div', 'set-tracker-metric set-tracker-metric-total');
  totalMetric.appendChild(elText('div', 'set-tracker-timer-label', 'Total elapsed'));
  totalMetric.appendChild(elText('div', 'set-tracker-timer-value', trackerTotalTimeValue(progress)));
  timer.appendChild(totalMetric);
  const setTimeline = buildCompletedSetTimeline(progress);
  if (setTimeline) timer.appendChild(setTimeline);
  panel.appendChild(timer);
  const logEditModal = buildLogEditModal(ex, dateStr, progress);
  if (logEditModal) panel.appendChild(logEditModal);
  panel.appendChild(actions);

  root.appendChild(panel);
}

function trackerWindowFocused() {
  return document.hasFocus();
}

function trackerFocusIndicatorText() {
  return trackerWindowFocused() ? 'Arrows ready' : 'Click PEM for arrows';
}

function buildTrackerFocusIndicator() {
  const indicator = elText('div', 'set-tracker-focus-indicator', trackerFocusIndicatorText());
  indicator.setAttribute('role', 'status');
  indicator.setAttribute('aria-live', 'polite');
  indicator.title = 'Left and right arrow shortcuts only work when PEM has keyboard focus.';
  return indicator;
}

function updateSetTrackerFocusIndicator() {
  const tracker = document.querySelector('.set-tracker');
  const indicator = document.querySelector('.set-tracker-focus-indicator');
  if (!tracker || !indicator) return;
  const isFocused = trackerWindowFocused();
  tracker.classList.toggle('is-window-unfocused', !isFocused);
  indicator.textContent = trackerFocusIndicatorText();
}

function buildTrackerIconButton(iconName, label, className, onClick) {
  const button = el('button', `tracker-icon-btn ${className || ''}`.trim());
  button.type = 'button';
  button.title = label;
  button.setAttribute('aria-label', label);
  button.appendChild(buildAppIconSvg(iconName));
  button.addEventListener('click', onClick);
  return button;
}

function applyTrackerTooltip(node, text, options = {}) {
  node.classList.add('tracker-tooltip');
  node.setAttribute('data-tooltip', text);
  if (options.focusable) node.tabIndex = 0;
}

function buildLogEditModal(ex, dateStr, progress) {
  if (!activeTracker?.detailsOpen) return null;
  const readOnly = activeTracker?.readOnly || !isExerciseActive(ex) || ex.missing;

  const layer = el('div', 'set-log-modal-layer');
  const backdrop = el('button', 'set-log-modal-backdrop');
  backdrop.type = 'button';
  backdrop.setAttribute('aria-label', 'Close log editor');
  backdrop.addEventListener('click', closeLogDetails);
  layer.appendChild(backdrop);

  const modal = el('div', 'set-log-modal');
  modal.setAttribute('role', 'dialog');
  modal.setAttribute('aria-modal', 'true');
  modal.setAttribute('aria-labelledby', 'set-log-modal-title');
  const header = el('div', 'set-log-modal-header');
  header.appendChild(elText('h3', 'set-log-modal-title', readOnly ? 'Log details' : 'Edit log'));
  const close = elText('button', 'set-log-modal-close', '');
  close.type = 'button';
  close.setAttribute('aria-label', 'Close log editor');
  close.appendChild(buildAppIconSvg('x'));
  close.addEventListener('click', closeLogDetails);
  header.appendChild(close);
  modal.appendChild(header);

  const sections = el('div', 'set-log-edit-sections');
  const calendarGroup = el('div', 'set-log-section-group set-log-calendar-group');
  calendarGroup.appendChild(elText('h4', 'set-log-section-title', 'Calendar placement'));
  const calendarSection = el('section', 'set-log-section set-log-calendar-section');
  const sessionField = el('label', 'set-log-field');
  sessionField.appendChild(elText('span', '', 'Calendar day'));
  const sessionInput = document.createElement('input');
  sessionInput.type = 'date';
  sessionInput.id = 'log-session-date';
  sessionInput.value = dateStr;
  sessionInput.disabled = readOnly;
  sessionField.appendChild(sessionInput);
  calendarSection.appendChild(sessionField);
  calendarSection.appendChild(elText('p', 'set-log-section-help', readOnly ? 'Restore the exercise before editing this log.' : 'Controls where this log appears on the calendar.'));
  calendarGroup.appendChild(calendarSection);
  sections.appendChild(calendarGroup);

  const timingGroup = el('div', 'set-log-section-group set-log-time-group');
  timingGroup.appendChild(elText('h4', 'set-log-section-title', 'Actual exercise time'));
  const timingSection = el('section', 'set-log-section set-log-time-section');
  const timing = el('div', 'set-log-edit-grid');
  timing.appendChild(buildDateTimeField('Started at', 'log-start-date', 'log-start-time', progress.startedAt, readOnly));
  timing.appendChild(buildDateTimeField('Finished at', 'log-completed-date', 'log-completed-time', progress.completedAt, readOnly || !isProgressComplete(progress), 'secondary'));
  timingSection.appendChild(timing);
  timingSection.appendChild(elText('p', 'set-log-section-help', readOnly ? 'Historical logs for hidden exercises are read-only.' : 'Started at controls timeline/notes placement. Finished at is when the final set was logged.'));
  timingGroup.appendChild(timingSection);
  sections.appendChild(timingGroup);

  modal.appendChild(sections);

  if (!readOnly) {
    const actions = el('div', 'set-log-edit-actions');
    const save = elText('button', 'set-action set-action-primary set-log-save', 'Save / Move Log');
    save.type = 'button';
    save.addEventListener('click', saveActiveLogDetails);
    actions.appendChild(save);
    modal.appendChild(actions);
  }
  layer.appendChild(modal);
  return layer;
}

function openLogDetails() {
  if (!activeTracker) return;
  activeTracker.detailsOpen = true;
  renderSetTracker();
}

function closeLogDetails() {
  if (!activeTracker) return;
  activeTracker.detailsOpen = false;
  renderSetTracker();
}

function buildDateTimeField(label, dateId, timeId, iso, disabled = false, variant = '') {
  const field = el('div', `set-log-datetime${variant ? ` ${variant}` : ''}`);
  field.appendChild(elText('span', 'set-log-datetime-label', label));

  const dateInput = document.createElement('input');
  dateInput.type = 'date';
  dateInput.id = dateId;
  dateInput.disabled = disabled;

  const timeInput = document.createElement('input');
  timeInput.type = 'time';
  timeInput.id = timeId;
  timeInput.disabled = disabled;

  const date = dateFromIso(iso);
  if (date) {
    dateInput.value = toDateStr(date);
    timeInput.value = `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
  }

  field.appendChild(dateInput);
  field.appendChild(timeInput);
  return field;
}

function saveActiveLogDetails() {
  if (activeTracker?.readOnly) return;
  const current = getActiveTrackerParts();
  if (!current) return;
  const { ex, dateStr, session, progress } = current;
  if (!isExerciseActive(ex) || ex.missing) return;

  const startedAt = isoFromLocalInputs('log-start-date', 'log-start-time');
  if (!startedAt) {
    alert('Started at date and time are required.');
    return;
  }

  const targetDate = document.getElementById('log-session-date')?.value || dateStr;
  if (!isValidDateStr(targetDate)) {
    alert('Calendar day must be a valid date.');
    return;
  }
  if (targetDate !== dateStr && sessions[targetDate]?.setProgress?.[ex.id]) {
    alert(`${ex.name} already has a log on ${targetDate}. Move blocked.`);
    return;
  }

  progress.startedAt = startedAt;
  if (isProgressComplete(progress)) {
    const completedAt = isoFromLocalInputs('log-completed-date', 'log-completed-time');
    if (!completedAt) {
      alert('Finished at date and time are required for a completed log.');
      return;
    }
    if (new Date(completedAt).getTime() < new Date(startedAt).getTime()) {
      alert('Finished at cannot be before Started at.');
      return;
    }
    progress.completedAt = completedAt;
    if (progress.completedSets > 0) progress.setCompletedAt[progress.completedSets - 1] = completedAt;
  }
  progress.exerciseSnapshot = progress.exerciseSnapshot || exerciseSnapshot(ex);
  progress.updatedAt = new Date().toISOString();
  session.setProgress[ex.id] = progress;

  if (targetDate !== dateStr) {
    moveExerciseLog(ex.id, dateStr, targetDate, progress);
    activeTracker = {
      ...activeTracker,
      dateStr: targetDate,
      readOnly: activeTracker?.readOnly,
      detailsOpen: false,
    };
    currentWeekStart = getMonday(dateFromStr(targetDate));
  } else {
    activeTracker.detailsOpen = false;
    saveSession(dateStr, session);
  }

  showToast('Exercise log saved.');
  render();
}

function isoFromLocalInputs(dateId, timeId) {
  const dateStr = document.getElementById(dateId)?.value;
  const timeStr = document.getElementById(timeId)?.value;
  if (!isValidDateStr(dateStr) || !isValidTime(timeStr)) return null;
  const date = dateFromStr(dateStr);
  const [hour, minute] = timeStr.split(':').map(Number);
  date.setHours(hour, minute, 0, 0);
  return date.toISOString();
}

function moveExerciseLog(exId, fromDate, toDate, progress) {
  const fromSession = getSessionForEdit(fromDate);
  const toSession = getSessionForEdit(toDate);
  if (fromDate === toDate || toSession.setProgress[exId]) return false;

  toSession.setProgress[exId] = progress;
  setCompletion(toDate, exId, isProgressComplete(progress));
  delete fromSession.setProgress[exId];
  if (fromSession.activeExerciseId === exId) delete fromSession.activeExerciseId;
  setCompletion(fromDate, exId, false);
  persistSessions();
  return true;
}

function buildCompletedSetTimeline(progress) {
  const timedSets = progress.setDurations
    .slice(0, progress.completedSets)
    .map((value, index) => ({ index, seconds: Number(value) }))
    .filter(item => Number.isFinite(item.seconds));
  if (!timedSets.length) return null;

  const timeline = el('div', 'set-tracker-set-timeline');
  timeline.appendChild(elText('div', 'set-tracker-timer-label set-tracker-set-timeline-label', 'Completed sets'));
  const list = el('div', 'set-tracker-set-list');
  timedSets.forEach(item => {
    const row = el('div', 'set-tracker-set-item');
    row.appendChild(elText('span', 'set-tracker-set-name', `Set ${item.index + 1}`));
    row.appendChild(elText('span', 'set-tracker-set-duration', fmtShortDuration(item.seconds)));
    list.appendChild(row);
  });
  timeline.appendChild(list);
  return timeline;
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

function trackerStartedLabel(progress) {
  const startedAt = dateFromIso(progress.startedAt);
  if (!startedAt) return 'Started --:--';
  return `Started ${formatEventDate(toDateStr(startedAt))} at ${formatClockTime(startedAt.toISOString())}`;
}

function trackerSessionDayLabel(progress, dateStr) {
  const startedAt = dateFromIso(progress.startedAt);
  if (!startedAt || !isValidDateStr(dateStr)) return '';
  if (toDateStr(startedAt) === dateStr) return '';
  return `Logged to ${formatShortDate(dateStr)} session day`;
}

function trackerCurrentSetTimeValue(progress) {
  return fmtShortDuration(currentSetElapsedSeconds(progress));
}

function trackerTotalTimeValue(progress) {
  return fmtShortDuration(activeElapsedSeconds(progress));
}

function trackerTimerDetail(progress) {
  const parts = [];
  if (progress.timerCapped) parts.push('stopped at 60m');
  return parts.join(' | ');
}

function trackerCompletedSetText(progress) {
  const completed = Math.min(progress.targetSets, Math.max(0, progress.completedSets || 0));
  return `${completed} of ${progress.targetSets} sets completed`;
}

function trackerCurrentSetNumber(progress) {
  if (isProgressComplete(progress)) return null;
  return Math.min(progress.targetSets, Math.max(1, (progress.completedSets || 0) + 1));
}

function trackerCurrentSetText(progress) {
  const currentSet = trackerCurrentSetNumber(progress);
  if (!currentSet) return `All ${progress.targetSets} sets complete`;
  return `Current set: ${currentSet} of ${progress.targetSets}`;
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

function currentSetElapsedSeconds(progress, now = new Date()) {
  if (isProgressComplete(progress)) return 0;
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

function dateFromIso(iso) {
  if (!iso) return null;
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? null : date;
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
  if (isEditingLogDetails()) return;
  refreshSetTrackerTimerDisplay() || renderSetTracker();
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
  if (isEditingLogDetails()) return;
  refreshSetTrackerTimerDisplay() || renderSetTracker();
}

function refreshSetTrackerTimerDisplay() {
  const current = getActiveTrackerParts();
  if (!current) return false;
  const { progress } = current;
  const totalValue = document.querySelector('.set-tracker-metric-total .set-tracker-timer-value');
  const currentValue = document.querySelector('.set-tracker-metric-since .set-tracker-timer-value');
  if (!totalValue || !currentValue) return false;
  totalValue.textContent = trackerTotalTimeValue(progress);
  currentValue.textContent = trackerCurrentSetTimeValue(progress);
  return true;
}

function isEditingLogDetails() {
  const active = document.activeElement;
  return Boolean(active?.closest?.('.set-log-modal'));
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
  if (!activeTracker) return;
  if (e.key === 'Escape' && activeTracker.detailsOpen) {
    e.preventDefault();
    closeLogDetails();
    return;
  }
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
