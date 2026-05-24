// Timeline data collection and event logging.

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
    .sort(compareTimelineEventsNewestFirst);
}

function compareTimelineEventsNewestFirst(a, b) {
  return (b.sortKey || `${b.date || ''}T${b.time || '00:00'}`)
    .localeCompare(a.sortKey || `${a.date || ''}T${a.time || '00:00'}`);
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
