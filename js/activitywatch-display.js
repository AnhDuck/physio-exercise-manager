// Shared ActivityWatch display helpers.

const ACTIVITYWATCH_FALLBACK_COLORS = [
  '#63b3ff',
  '#f5c45a',
  '#79d6bd',
  '#c9a7ff',
  '#f87171',
  '#9ad66f',
  '#f59e0b',
  '#7dd3fc',
  '#f0abfc',
  '#a3e635',
];

function activityWatchCategoryColor(categoryName) {
  const color = activityWatchData.categoryColors?.[categoryName];
  if (color) return color;
  const topLevel = String(categoryName || '').split(ACTIVITYWATCH_CATEGORY_JOINER)[0];
  if (activityWatchData.categoryColors?.[topLevel]) return activityWatchData.categoryColors[topLevel];
  let hash = 0;
  String(categoryName || '').split('').forEach(char => {
    hash = ((hash << 5) - hash + char.charCodeAt(0)) | 0;
  });
  return ACTIVITYWATCH_FALLBACK_COLORS[Math.abs(hash) % ACTIVITYWATCH_FALLBACK_COLORS.length];
}

function formatActivityWatchDuration(seconds, options = {}) {
  const compact = Boolean(options.compact);
  const zeroLabel = Object.prototype.hasOwnProperty.call(options, 'zeroLabel') ? options.zeroLabel : '0m';
  const total = Math.max(0, Math.round(Number(seconds) || 0));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  if (compact) {
    if (hours) return `${hours}h`;
    return minutes ? `${minutes}m` : zeroLabel;
  }
  if (hours && minutes) return `${hours}h ${minutes}m`;
  if (hours) return `${hours}h`;
  if (minutes) return `${minutes}m`;
  return total ? '<1m' : zeroLabel;
}
