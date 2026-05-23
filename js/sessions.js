// Session state, completion, and set-progress helpers.

function restoreActiveTracker() {
  const todayS = todayStr();
  const s = sessions[todayS];
  const exId = s?.activeExerciseId;
  if (!exId || !exercises.some(ex => ex.id === exId && isExerciseActive(ex))) return;
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

function persistSessions() {
  localStorage.setItem('pem_sessions', JSON.stringify(sessions));
}

function targetSetsForExercise(ex) {
  const sets = Number.parseInt(ex?.sets, 10);
  return Number.isFinite(sets) && sets > 0 ? sets : 1;
}

function exerciseSnapshot(ex) {
  return {
    id: ex?.id || '',
    name: ex?.name || '',
    group: ex?.group || '',
    sets: ex?.sets || 1,
    reps: ex?.reps || '',
    resistance: ex?.resistance || '',
    frequency: ex?.frequency || '',
  };
}

function progressSnapshot(progress, ex) {
  return progress?.exerciseSnapshot || (ex ? exerciseSnapshot(ex) : {
    id: '',
    name: '',
    group: '',
    sets: progress?.targetSets || 1,
    reps: '',
    resistance: '',
    frequency: '',
  });
}

function displayExerciseForLog(exId, progress) {
  const ex = exercises.find(item => item.id === exId);
  const snapshot = progressSnapshot(progress, ex);
  return {
    id: exId,
    name: ex?.name || snapshot.name || exId || 'Exercise',
    group: ex?.group || snapshot.group || '',
    sets: ex?.sets || snapshot.sets || progress?.targetSets || 1,
    reps: ex?.reps || snapshot.reps || '',
    resistance: ex?.resistance || snapshot.resistance || '',
    frequency: ex?.frequency || snapshot.frequency || '',
    deletedAt: ex?.deletedAt || null,
    hiddenAt: ex?.hiddenAt || null,
    missing: !ex,
  };
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
function normalizeSetProgress(progress, ex) {
  const loggedTarget = Number.parseInt(progress?.targetSets, 10);
  const targetSets = Number.isFinite(loggedTarget) && loggedTarget > 0
    ? loggedTarget
    : targetSetsForExercise(ex || progress?.exerciseSnapshot);
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
    exerciseSnapshot: progress?.exerciseSnapshot || (ex ? exerciseSnapshot(ex) : null),
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
function migrateSetProgressSnapshots() {
  let changed = false;
  Object.entries(sessions || {}).forEach(([dateStr, session]) => {
    if (!session?.setProgress || typeof session.setProgress !== 'object') return;
    Object.entries(session.setProgress).forEach(([exId, progress]) => {
      const ex = exercises.find(item => item.id === exId);
      if (!progress?.exerciseSnapshot && ex) {
        progress.exerciseSnapshot = exerciseSnapshot(ex);
        changed = true;
      }
      if (!Array.isArray(progress.setCompletedAt)) {
        progress.setCompletedAt = [];
        changed = true;
      }
    });
    if (!Array.isArray(session.completedExercises)) {
      session.completedExercises = [];
      changed = true;
    }
  });
  if (changed) persistSessions();
}
