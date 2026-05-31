// ActivityWatch dashboard labels, axis formatting, colors, and status text.

const ACTIVITYWATCH_DASHBOARD_CATEGORY_COLORS = {
  YouTube: '#d96b6b',
  Health: '#66bfa3',
  Games: '#f59e0b',
  Codex: '#6baee8',
  ChatGPT: '#77c6bd',
  IM: '#e0b95f',
  Business: '#7f98d8',
  Katana: '#e09268',
  Uncategorized: '#a4acb8',
  Other: '#707884',
};

function activityWatchDashboardRangeLabel(days) {
  return ACTIVITYWATCH_DASHBOARD_RANGE_OPTIONS.find(option => option.days === days)?.label || 'Last 2 weeks';
}

function activityWatchDateRangeLabel(days) {
  if (!days.length) return '';
  const start = dateFromStr(days[0].date);
  const end = dateFromStr(days[days.length - 1].date);
  const sameYear = start.getFullYear() === end.getFullYear();
  const sameMonth = sameYear && start.getMonth() === end.getMonth();
  const year = end.getFullYear();
  if (sameMonth) {
    return `${start.toLocaleDateString(undefined, { month: 'short' })} ${start.getDate()}-${end.getDate()}, ${year}`;
  }
  return `${start.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}-${end.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}, ${year}`;
}

function activityWatchHourAxis(maxSeconds) {
  const maxHours = Math.max(1, maxSeconds / 3600);
  const step = activityWatchNiceHourStep(maxHours / 5);
  const max = Math.max(step, Math.ceil(maxHours / step) * step);
  const ticks = [];
  for (let value = 0; value <= max + (step / 10); value += step) {
    ticks.push(Number(value.toFixed(2)));
  }
  return {
    maxHours: max,
    maxSeconds: max * 3600,
    ticks,
  };
}

function activityWatchNiceHourStep(raw) {
  return [0.25, 0.5, 0.75, 1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10, 12].find(step => raw <= step) || Math.ceil(raw);
}

function activityWatchFormatHourTick(value) {
  return `${Number.isInteger(value) ? value : value.toFixed(1)}h`;
}

function activityWatchBarTotalLabel(day, plottedSeconds, index, dayCount) {
  if (!plottedSeconds) return '';
  if (dayCount > 14) return '';
  if (dayCount <= 14 || day.date === activityWatchDashboardState.selectedDate || index === 0 || index === dayCount - 1) {
    return formatActivityWatchChartDuration(plottedSeconds, dayCount > 30);
  }
  if (dayCount <= 30 && index % 7 === 0) return formatActivityWatchChartDuration(plottedSeconds, false);
  return '';
}

function formatActivityWatchChartDuration(seconds, compact = false) {
  const total = Math.max(0, Math.round(Number(seconds) || 0));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  if (compact) {
    if (hours) return `${hours}h`;
    return minutes ? `${minutes}m` : '';
  }
  if (hours && minutes) return `${hours}h ${minutes}m`;
  if (hours) return `${hours}h`;
  if (minutes) return `${minutes}m`;
  return total ? '<1m' : '';
}

function activityWatchXAxisLabels(days) {
  const labels = new Map();
  if (!Array.isArray(days) || !days.length) return labels;
  const dayCount = days.length;
  if (dayCount <= 30) {
    days.forEach((day, index) => {
      const label = activityWatchXAxisLabel(day, index, days);
      if (label) labels.set(day.date, label);
    });
    return labels;
  }

  const candidates = [];
  days.forEach((day, index) => {
    const date = dateFromStr(day.date);
    const selected = day.date === activityWatchDashboardState.selectedDate;
    if (selected) candidates.push({ day, index, priority: 100, forceMonth: true });
    if (index === 0 || index === dayCount - 1) candidates.push({ day, index, priority: 90, forceMonth: true });
    if (date.getDate() === 1) candidates.push({ day, index, priority: 80, forceMonth: false, dayOnly: true });
    if (index % 14 === 0) candidates.push({ day, index, priority: 50, forceMonth: false });
  });

  const chosen = [];
  const minGap = dayCount > 45 ? ACTIVITYWATCH_WIDE_AXIS_MIN_LABEL_GAP_DAYS : 4;
  candidates
    .sort((a, b) => b.priority - a.priority || a.index - b.index)
    .forEach(candidate => {
      if (chosen.some(item => Math.abs(item.index - candidate.index) < minGap)) return;
      chosen.push(candidate);
    });

  chosen
    .sort((a, b) => a.index - b.index)
    .forEach(candidate => {
      const date = dateFromStr(candidate.day.date);
      const previousDate = candidate.index > 0 ? dateFromStr(days[candidate.index - 1].date) : null;
      labels.set(candidate.day.date, candidate.dayOnly
        ? String(date.getDate())
        : activityWatchCompactAxisDate(date, previousDate, candidate.forceMonth));
    });
  return labels;
}

function activityWatchXAxisLabel(day, index, days) {
  const dayCount = days.length;
  const date = dateFromStr(day.date);
  const selected = day.date === activityWatchDashboardState.selectedDate;
  if (dayCount <= 14) return String(date.getDate());
  if (dayCount <= 30) {
    return activityWatchCompactAxisDate(date, index > 0 ? dateFromStr(days[index - 1].date) : null, selected || index === 0 || index === dayCount - 1 || date.getDate() === 1);
  }
  if (selected || index === 0 || index === dayCount - 1 || activityWatchIsWideRangeTick(date, index, days)) {
    return activityWatchCompactAxisDate(date, index > 0 ? dateFromStr(days[index - 1].date) : null, selected || index === 0 || index === dayCount - 1 || date.getDate() === 1);
  }
  return '';
}

function activityWatchIsWideRangeTick(date, index, days) {
  if (date.getDate() === 1) return true;
  return index % 14 === 0;
}

function activityWatchCompactAxisDate(date, previousDate = null, forceMonth = false) {
  const month = date.toLocaleDateString(undefined, { month: 'short' });
  const day = date.getDate();
  if (forceMonth || !previousDate || previousDate.getMonth() !== date.getMonth()) {
    return `${month} ${day}`;
  }
  return String(day);
}

function activityWatchDashboardCategoryColor(category) {
  const label = String(category || '');
  const topLevel = label.split(ACTIVITYWATCH_CATEGORY_JOINER)[0];
  if (ACTIVITYWATCH_DASHBOARD_CATEGORY_COLORS[label]) return ACTIVITYWATCH_DASHBOARD_CATEGORY_COLORS[label];
  if (ACTIVITYWATCH_DASHBOARD_CATEGORY_COLORS[topLevel]) return ACTIVITYWATCH_DASHBOARD_CATEGORY_COLORS[topLevel];
  return activityWatchAdjustedFallbackColor(label);
}

function activityWatchAdjustedFallbackColor(category) {
  const base = activityWatchCategoryColor(category);
  const match = /^#([0-9a-f]{6})$/i.exec(base);
  if (!match) return base;
  const value = match[1];
  const r = Number.parseInt(value.slice(0, 2), 16);
  const g = Number.parseInt(value.slice(2, 4), 16);
  const b = Number.parseInt(value.slice(4, 6), 16);
  const mix = 28;
  return `#${activityWatchHex(Math.round((r * 0.82) + mix))}${activityWatchHex(Math.round((g * 0.82) + mix))}${activityWatchHex(Math.round((b * 0.82) + mix))}`;
}

function activityWatchHex(value) {
  return Math.max(0, Math.min(255, value)).toString(16).padStart(2, '0');
}

function formatActivityWatchPercent(seconds, totalSeconds) {
  const total = Number(totalSeconds) || 0;
  if (total <= 0 || !seconds) return '0%';
  const percent = (seconds / total) * 100;
  if (percent > 0 && percent < 1) return '<1%';
  return `${Math.round(percent)}%`;
}

function activityWatchDashboardStatusTitle(status, progress) {
  if (progress.active && progress.totalDays) {
    if (progress.mode === 'single') return 'Syncing ActivityWatch';
    return `Syncing ActivityWatch ${formatNumber(progress.completedDays)} / ${formatNumber(progress.totalDays)}`;
  }
  return activityWatchStatusTitle(status);
}

function activityWatchDashboardStatusDetail(status, progress) {
  const lastSync = activityWatchData.lastSyncAt
    ? `Last sync ${formatAutoBackupDateTime(activityWatchData.lastSyncAt)}`
    : 'Last sync never';
  if (progress.active) {
    if (progress.mode === 'single') {
      return `${lastSync}. Requesting ActivityWatch summaries in one call.`;
    }
    if (progress.mode === 'fallback') {
      return `${lastSync}. Full-range sync fell back to 14-day batches.`;
    }
    return `${lastSync}. Routine refresh covers the latest ${formatNumber(ACTIVITYWATCH_RECENT_SYNC_DAYS)} waking days.`;
  }
  const message = status.message || 'ActivityWatch has not synced yet.';
  return `${message} ${lastSync}.`;
}

function activityWatchStatusTitle(status) {
  if (status.code === 'ok') return 'ActivityWatch synced';
  if (status.code === 'warning') return 'ActivityWatch synced with warnings';
  if (status.code === 'syncing') return 'Syncing ActivityWatch';
  if (status.code === 'cors-blocked') return 'CORS setup needed';
  if (status.code === 'offline') return 'ActivityWatch unavailable';
  if (status.code === 'file-origin') return 'Local server required';
  if (status.code === 'missing-window') return 'Window watcher missing';
  if (status.code === 'missing-afk') return 'AFK watcher missing';
  if (status.code === 'query-error') return 'ActivityWatch query failed';
  return 'ActivityWatch waiting';
}

function activityWatchStatusDetail(status) {
  if (status.message) return status.message;
  return 'ActivityWatch has not synced yet.';
}

function activityWatchStatusPill(status) {
  if (status.code === 'ok') return 'Synced';
  if (status.code === 'warning') return 'Review';
  if (status.code === 'syncing') return 'Syncing';
  if (status.code === 'idle') return 'Waiting';
  return 'Issue';
}

function activityWatchStatusIsIssue(status) {
  return !['ok', 'warning', 'syncing', 'idle'].includes(status.code);
}

