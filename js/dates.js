// Date, week, and scheduling helpers.

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
