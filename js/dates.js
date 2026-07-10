// Date, time, week, and scheduling helpers.

function toDateStr(date) {
  const value = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(value.getTime())) return '';
  const y = value.getFullYear();
  const m = String(value.getMonth() + 1).padStart(2, '0');
  const d = String(value.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function dateFromStr(dateStr) {
  const [year, month, day] = String(dateStr || '').split('-').map(Number);
  return new Date(year, month - 1, day);
}

function isValidDateStr(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ''))) return false;
  const date = dateFromStr(value);
  return !Number.isNaN(date.getTime()) && toDateStr(date) === value;
}

function normalizeTimeStr(value) {
  if (typeof value !== 'string') return '';
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) return '';
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return '';
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

function timeToMinutes(value) {
  const normalized = normalizeTimeStr(value);
  if (!normalized) return null;
  const [hour, minute] = normalized.split(':').map(Number);
  return hour * 60 + minute;
}

function isValidTime(value) {
  return timeToMinutes(value) !== null;
}

function personalDayStartTime(value) {
  return normalizeTimeStr(value) || DEFAULT_PERSONAL_DAY_START_TIME;
}

function personalDayStart(dateStr, startTime = DEFAULT_PERSONAL_DAY_START_TIME) {
  const start = dateFromStr(dateStr);
  const minutes = timeToMinutes(personalDayStartTime(startTime)) || 0;
  start.setHours(Math.floor(minutes / 60), minutes % 60, 0, 0);
  return start;
}

function nextPersonalDayStart(dateStr, startTime = DEFAULT_PERSONAL_DAY_START_TIME) {
  const next = personalDayStart(dateStr, startTime);
  next.setDate(next.getDate() + 1);
  return next;
}

function personalDayDateStr(date, startTime = DEFAULT_PERSONAL_DAY_START_TIME) {
  const instant = date instanceof Date ? new Date(date) : new Date(date);
  if (Number.isNaN(instant.getTime())) return '';
  const start = personalDayStart(toDateStr(instant), startTime);
  if (instant < start) start.setDate(start.getDate() - 1);
  return toDateStr(start);
}

function localDateTimeIso(date) {
  const value = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(value.getTime())) return '';
  const offset = -value.getTimezoneOffset();
  const sign = offset >= 0 ? '+' : '-';
  const absoluteOffset = Math.abs(offset);
  return `${toDateStr(value)}T${String(value.getHours()).padStart(2, '0')}:${String(value.getMinutes()).padStart(2, '0')}:${String(value.getSeconds()).padStart(2, '0')}${sign}${String(Math.floor(absoluteOffset / 60)).padStart(2, '0')}:${String(absoluteOffset % 60).padStart(2, '0')}`;
}

function getArmDayForDate(dateStr) {
  const date   = dateFromStr(dateStr);
  const anchor = dateFromStr(ARM_ANCHOR_DATE);

  // Count M/W/F days between anchor and date (anchor exclusive, date inclusive
  // when going forward; mirror logic when going backward).
  let mwfCount = 0;
  if (date > anchor) {
    const cursor = new Date(anchor);
    cursor.setDate(cursor.getDate() + 1);
    while (cursor <= date) {
      const dow = cursor.getDay();
      if (dow === 1 || dow === 3 || dow === 5) mwfCount++;
      cursor.setDate(cursor.getDate() + 1);
    }
  } else if (date < anchor) {
    const cursor = new Date(anchor);
    cursor.setDate(cursor.getDate() - 1);
    while (cursor >= date) {
      const dow = cursor.getDay();
      if (dow === 1 || dow === 3 || dow === 5) mwfCount++;
      cursor.setDate(cursor.getDate() - 1);
    }
  }
  const flipped = mwfCount % 2 === 1;
  if (!flipped) return ARM_ANCHOR_DAY;
  return ARM_ANCHOR_DAY === 'arm-day1' ? 'arm-day2' : 'arm-day1';
}

// ── Week helpers ──────────────────────────────────────────────────
function getMonday(date) {
  const d = new Date(date);
  const day = d.getDay(); // 0=Sun
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function weekDates(monday) {
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(d.getDate() + i);
    return d;
  });
}
function todayStr() { return toDateStr(new Date()); }
