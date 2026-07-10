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
  return personalDayDateStr(now, activityWatchPersonalDayStartTime());
}

function activityWatchWakingDayStart(dateStr) {
  return personalDayStart(dateStr, activityWatchPersonalDayStartTime());
}

function activityWatchPersonalDayStartTime() {
  return personalDayStartTime(settings?.personalDayStartTime);
}

function activityWatchLocalIso(date) {
  return localDateTimeIso(date);
}

function activityWatchNormalizeTime(value) {
  return normalizeTimeStr(value);
}

function activityWatchIsValidTime(value) {
  return isValidTime(value);
}

function activityWatchTimeToMinutes(value) {
  return timeToMinutes(value);
}

function activityWatchIsValidDate(value) {
  return isValidDateStr(value);
}
