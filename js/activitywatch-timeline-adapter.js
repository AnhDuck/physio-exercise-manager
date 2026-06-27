// Timeline-facing ActivityWatch summary helpers.

function getActivityWatchTimelineSummary(dateStr) {
  const chips = getActivityWatchTimelineChips(dateStr);
  if (chips.length) return chips[0].label;
  return '';
}

function getActivityWatchTimelineChips(dateStr) {
  const day = getActivityWatchDay(dateStr);
  const totalActiveSeconds = Math.max(0, Math.round(Number(day?.totalActiveSeconds) || 0));
  const chips = [];
  const methodologyChange = typeof getActivityWatchMethodologyChange === 'function'
    ? getActivityWatchMethodologyChange(dateStr)
    : null;
  if (methodologyChange) {
    chips.push({
      className: 'is-methodology-change',
      label: methodologyChange.title,
      title: typeof activityWatchMethodologyTooltip === 'function'
        ? activityWatchMethodologyTooltip(methodologyChange)
        : methodologyChange.detail,
    });
  }
  if (totalActiveSeconds) {
    chips.push({
      className: 'is-computer-active',
      label: `${WORKLOAD_TERMS.computerActiveTime} ${formatActivityWatchDuration(totalActiveSeconds)}`,
      title: `${WORKLOAD_TERMS.computerActiveTime}: ${WORKLOAD_TERM_HELP.computerActiveTime}`,
    });
  }

  const overlay = timelineWorkloadOverlayForDate(dateStr);
  if (overlay && timelineHasTimedWorkData(overlay)) {
    const totalTendonSeconds = overlay.activityWatchTotalSeconds + overlay.manualResidualSeconds;
    chips.push({
      className: 'is-total-tendon-load',
      label: `${WORKLOAD_TERMS.totalTendonLoad} ${formatActivityWatchDuration(totalTendonSeconds)}`,
      title: `${WORKLOAD_TERMS.totalTendonLoad}: ${WORKLOAD_TERM_HELP.totalTendonLoad} ${WORKLOAD_TERMS.physicalWorkEstimate} is ${formatActivityWatchDuration(overlay.manualResidualSeconds)} here.`,
    });
  }
  return chips;
}

function getActivityWatchTimelineMarkdownSummary(dateStr) {
  const day = getActivityWatchDay(dateStr);
  const totalActiveSeconds = Math.max(0, Math.round(Number(day?.totalActiveSeconds) || 0));
  const overlay = timelineWorkloadOverlayForDate(dateStr);
  const hasOverlay = overlay && timelineHasTimedWorkData(overlay);
  const methodologyChange = typeof getActivityWatchMethodologyChange === 'function'
    ? getActivityWatchMethodologyChange(dateStr)
    : null;
  if (!totalActiveSeconds && !hasOverlay && !methodologyChange) return '';

  const parts = [];
  if (methodologyChange) {
    parts.push(typeof activityWatchMethodologyMarkdown === 'function'
      ? activityWatchMethodologyMarkdown(methodologyChange)
      : `Break in series - ${methodologyChange.title}: ${methodologyChange.detail}`);
  }
  if (totalActiveSeconds) {
    parts.push(`${WORKLOAD_TERMS.computerActiveTime}: ${formatActivityWatchDuration(totalActiveSeconds)}`);
  }
  if (hasOverlay) {
    const totalTendonSeconds = overlay.activityWatchTotalSeconds + overlay.manualResidualSeconds;
    parts.push(`${WORKLOAD_TERMS.totalTendonLoad}: ${formatActivityWatchDuration(totalTendonSeconds)}`);
    parts.push(`${WORKLOAD_TERMS.physicalWorkEstimate}: ${formatActivityWatchDuration(overlay.manualResidualSeconds)}`);
    parts.push(`${WORKLOAD_TERMS.timedWorkTotal}: ${formatActivityWatchDuration(overlay.workloadTotalSeconds)}`);
    parts.push(`${WORKLOAD_TERMS.computerWork}: ${formatActivityWatchDuration(overlay.activityWatchWorkSeconds)}`);
  }
  return parts.join('; ');
}

function timelineWorkloadOverlayForDate(dateStr) {
  if (typeof getWorkloadActivityWatchOverlayForDate !== 'function') return null;
  return getWorkloadActivityWatchOverlayForDate(dateStr);
}

function timelineHasTimedWorkData(overlay) {
  return Boolean(
    overlay &&
    (
      overlay.workloadTotalSeconds ||
      overlay.activityWatchWorkSeconds ||
      overlay.manualResidualSeconds
    )
  );
}
