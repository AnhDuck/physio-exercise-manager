// Shared Timed Work and ActivityWatch overlay math.

function workloadActivityWatchWorkSeconds(dateStr) {
  const day = typeof getActivityWatchDay === 'function' ? getActivityWatchDay(dateStr) : null;
  const joiner = typeof ACTIVITYWATCH_CATEGORY_JOINER === 'string' ? ACTIVITYWATCH_CATEGORY_JOINER : ' > ';
  let total = 0;
  Object.entries(day?.categoryTotals || {}).forEach(([category, seconds]) => {
    const topLevel = String(category || '').split(joiner)[0];
    if (topLevel === 'Work') total += Math.max(0, Number(seconds) || 0);
  });
  return Math.round(total);
}

function getWorkloadActivityWatchOverlayForDate(dateStr) {
  const day = typeof getActivityWatchDay === 'function' ? getActivityWatchDay(dateStr) : null;
  const workloadTotalSeconds = workloadDisplayTotalSeconds(dateStr);
  const activityWatchWorkSeconds = workloadActivityWatchWorkSeconds(dateStr);
  const activityWatchTotalSeconds = Math.max(0, Math.round(Number(day?.totalActiveSeconds) || 0));
  const manualResidualSeconds = Math.max(0, workloadTotalSeconds - activityWatchWorkSeconds);
  return {
    date: dateStr,
    workloadTotalSeconds,
    activityWatchWorkSeconds,
    activityWatchTotalSeconds,
    manualResidualSeconds,
    conflict: activityWatchWorkSeconds > workloadTotalSeconds,
  };
}

function getWorkloadActivityWatchOverlayTotals(dateStrs) {
  const totals = {
    workloadTotalSeconds: 0,
    activityWatchWorkSeconds: 0,
    activityWatchTotalSeconds: 0,
    manualResidualSeconds: 0,
    conflict: false,
  };
  (dateStrs || []).forEach(dateStr => {
    const overlay = getWorkloadActivityWatchOverlayForDate(dateStr);
    totals.workloadTotalSeconds += overlay.workloadTotalSeconds;
    totals.activityWatchWorkSeconds += overlay.activityWatchWorkSeconds;
    totals.activityWatchTotalSeconds += overlay.activityWatchTotalSeconds;
    totals.manualResidualSeconds += overlay.manualResidualSeconds;
    totals.conflict = totals.conflict || overlay.conflict;
  });
  return totals;
}

window.getWorkloadActivityWatchOverlayForDate = getWorkloadActivityWatchOverlayForDate;
window.getWorkloadActivityWatchOverlayTotals = getWorkloadActivityWatchOverlayTotals;
