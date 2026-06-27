// ActivityWatch waking-day date and time helpers.

function activityWatchRecentDateStrings(count) {
  const current = activityWatchCurrentWakingDateStr();
  const dates = [];
  for (let offset = count - 1; offset >= 0; offset--) {
    const date = dateFromStr(current);
    date.setDate(date.getDate() - offset);
    dates.push(toDateStr(date));
  }
  return dates;
}

function activityWatchCurrentWakingDateStr(now = new Date()) {
  const start = activityWatchWakingDayStart(toDateStr(now));
  if (now < start) {
    start.setDate(start.getDate() - 1);
  }
  return toDateStr(start);
}

function activityWatchWakingDayStart(dateStr) {
  const date = dateFromStr(dateStr);
  const minutes = activityWatchTimeToMinutes(activityWatchPersonalDayStartTime()) || 0;
  date.setHours(Math.floor(minutes / 60), minutes % 60, 0, 0);
  return date;
}

function activityWatchPersonalDayStartTime() {
  return activityWatchIsValidTime(settings?.personalDayStartTime)
    ? settings.personalDayStartTime
    : DEFAULT_PERSONAL_DAY_START_TIME;
}

function activityWatchLocalIso(date) {
  const offset = -date.getTimezoneOffset();
  const sign = offset >= 0 ? '+' : '-';
  const abs = Math.abs(offset);
  return `${date.getFullYear()}-${activityWatchPad(date.getMonth() + 1)}-${activityWatchPad(date.getDate())}T${activityWatchPad(date.getHours())}:${activityWatchPad(date.getMinutes())}:${activityWatchPad(date.getSeconds())}${sign}${activityWatchPad(Math.floor(abs / 60))}:${activityWatchPad(abs % 60)}`;
}

function activityWatchPad(value) {
  return String(value).padStart(2, '0');
}

function activityWatchNormalizeTime(value) {
  const text = String(value || '').trim();
  const match = /^(\d{1,2}):(\d{2})$/.exec(text);
  if (!match) return '';
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return '';
  return `${activityWatchPad(hour)}:${activityWatchPad(minute)}`;
}

function activityWatchIsValidTime(value) {
  return Boolean(activityWatchNormalizeTime(value));
}

function activityWatchTimeToMinutes(value) {
  const normalized = activityWatchNormalizeTime(value);
  if (!normalized) return null;
  const [hour, minute] = normalized.split(':').map(Number);
  return hour * 60 + minute;
}

function activityWatchIsValidDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ''))) return false;
  const date = dateFromStr(value);
  return toDateStr(date) === value;
}
