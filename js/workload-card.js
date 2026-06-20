// Workload Today dashboard card and timer state.

const WORKLOAD_REVIEW_THRESHOLD_SECONDS = 6 * 60 * 60;
const WORKLOAD_TICK_MS = 1000;

let workloadCardTickTimer = null;

function startWorkloadCard() {
  syncWorkloadTimerRollover();
  syncWorkloadCardTicker();
}

function stopWorkloadCard() {
  window.clearInterval(workloadCardTickTimer);
  workloadCardTickTimer = null;
}

function syncWorkloadCardTicker() {
  window.clearInterval(workloadCardTickTimer);
  workloadCardTickTimer = null;
  if (!workloadData?.timer?.running) return;
  workloadCardTickTimer = window.setInterval(() => {
    syncWorkloadTimerRollover();
    if (document.activeElement?.closest?.('.workload-card')) return;
    if (typeof renderHomeCards === 'function') renderHomeCards();
  }, WORKLOAD_TICK_MS);
}

function buildWorkloadCard(options = {}) {
  syncWorkloadTimerRollover();
  syncWorkloadCardTicker();

  const compact = Boolean(options.compact);
  const dateStr = workloadCurrentDateStr();
  const totalSeconds = workloadDisplayTotalSeconds(dateStr);
  const runningSeconds = workloadRunningSecondsForDate(dateStr);
  const day = workloadDay(dateStr);
  const card = el('article', `home-card workload-card${workloadData.timer.running ? ' is-running' : ''}${day.needsReview ? ' needs-review' : ''}`);
  card.setAttribute('aria-label', 'Workload today');

  if (compact) return buildWorkloadCompactCard(card, dateStr, totalSeconds, runningSeconds, day);

  const header = el('div', 'workload-card-header');
  const title = el('div', 'workload-card-title');
  title.appendChild(elText('span', 'home-card-kicker', 'Workload Today'));
  title.appendChild(elText('strong', '', workloadDateLabel(dateStr)));
  header.appendChild(title);
  card.appendChild(header);

  const main = el('div', 'workload-main');
  const timerSeconds = workloadData.timer.running ? runningSeconds : 0;
  main.appendChild(elText('div', 'workload-timer-value', formatWorkloadClockDuration(timerSeconds)));
  main.appendChild(elText('div', 'workload-total-note', `Today total ${formatWorkloadDuration(totalSeconds)}`));
  card.appendChild(main);

  const primary = elText('button', `workload-primary-btn ${workloadData.timer.running ? 'is-stop' : 'is-start'}`, workloadData.timer.running ? 'Stop' : 'Start work');
  primary.type = 'button';
  primary.dataset.homeCardAction = workloadData.timer.running ? 'workload-stop' : 'workload-start';
  card.appendChild(primary);

  if (workloadData.timer.running) {
    const reset = elText('button', 'workload-reset-btn', 'Reset');
    reset.type = 'button';
    reset.dataset.homeCardAction = 'workload-reset';
    card.appendChild(reset);
  }

  const manual = el('div', 'workload-manual-grid');
  [
    { label: '+15m', seconds: 15 * 60 },
    { label: '+30m', seconds: 30 * 60 },
    { label: '-15m', seconds: -15 * 60 },
  ].forEach(item => {
    const button = elText('button', 'workload-adjust-btn', item.label);
    button.type = 'button';
    button.dataset.homeCardAction = 'workload-adjust';
    button.dataset.workloadDeltaSeconds = String(item.seconds);
    manual.appendChild(button);
  });
  card.appendChild(manual);

  const comparison = buildWorkloadComparison(dateStr, totalSeconds);
  card.appendChild(comparison);

  const footer = el('div', 'workload-footer');
  if (day.needsReview) {
    footer.appendChild(elText('span', 'workload-review-flag', day.reviewNote || 'Needs review'));
  } else {
    footer.appendChild(elText('span', '', `Day starts ${workloadPersonalDayStartTime()}`));
  }
  card.appendChild(footer);

  return card;
}

function buildWorkloadCompactCard(card, dateStr, totalSeconds, runningSeconds, day) {
  card.className = `home-card home-card-compact workload-compact-card${workloadData.timer.running ? ' is-running' : ''}${day.needsReview ? ' needs-review' : ''}`;

  const copy = el('div', 'workload-compact-copy');
  copy.appendChild(elText('span', 'home-card-kicker', 'Workload Today'));
  copy.appendChild(elText('strong', '', formatWorkloadDuration(totalSeconds)));
  const state = workloadData.timer.running
    ? `Running ${formatWorkloadDuration(runningSeconds)}`
    : day.needsReview
      ? 'Needs review'
      : workloadDateLabel(dateStr);
  copy.appendChild(elText('span', 'workload-compact-state', state));
  card.appendChild(copy);

  const button = elText('button', `workload-compact-btn ${workloadData.timer.running ? 'is-stop' : 'is-start'}`, workloadData.timer.running ? 'Stop' : 'Start');
  button.type = 'button';
  button.dataset.homeCardAction = workloadData.timer.running ? 'workload-stop' : 'workload-start';
  card.appendChild(button);
  return card;
}

function buildWorkloadComparison(dateStr, totalSeconds) {
  const awSeconds = workloadActivityWatchWorkSeconds(dateStr);
  const manualSeconds = Math.max(0, totalSeconds - awSeconds);
  const comparison = el('div', 'workload-comparison');

  const computer = el('div', 'workload-comparison-row');
  computer.appendChild(elText('span', '', 'Computer'));
  computer.appendChild(elText('strong', '', formatWorkloadDuration(awSeconds)));
  comparison.appendChild(computer);

  const manual = el('div', 'workload-comparison-row');
  manual.appendChild(elText('span', '', 'Manual / physical'));
  manual.appendChild(elText('strong', '', formatWorkloadDuration(manualSeconds)));
  comparison.appendChild(manual);

  if (awSeconds > totalSeconds) {
    comparison.appendChild(elText('div', 'workload-warning', 'Computer work > total. Check.'));
  }

  return comparison;
}

function handleWorkloadHomeCardAction(button) {
  const action = button?.dataset?.homeCardAction || '';
  if (action === 'workload-start') {
    startWorkloadTimer();
  } else if (action === 'workload-stop') {
    stopWorkloadTimerAndAdd();
  } else if (action === 'workload-adjust') {
    adjustWorkloadToday(Number(button.dataset.workloadDeltaSeconds) || 0);
  } else if (action === 'workload-reset') {
    resetWorkloadTimer();
  }
}

function syncWorkloadSettingsControls() {
  const input = document.getElementById('setting-workload-card-enabled');
  if (!input) return;
  input.checked = getHomeCardsSettings().workload?.enabled !== false;
}

function autosaveWorkloadCardEnabled() {
  const input = document.getElementById('setting-workload-card-enabled');
  const homeCards = getHomeCardsSettings();
  homeCards.workload = normalizeWorkloadCardSettings(homeCards.workload);
  homeCards.workload.enabled = input ? input.checked : homeCards.workload.enabled !== false;
  saveSettings(settings);
  syncWorkloadSettingsControls();
  if (homeCards.workload.enabled) {
    if (typeof startWorkloadCard === 'function') startWorkloadCard();
  } else if (typeof stopWorkloadCard === 'function') {
    stopWorkloadCard();
  }
  renderHomeCards();
}

function startWorkloadTimer() {
  syncWorkloadTimerRollover();
  if (workloadData.timer.running) return;
  const now = new Date();
  workloadData.timer = {
    running: true,
    date: workloadDateStrFor(now),
    startedAt: now.toISOString(),
    updatedAt: now.toISOString(),
  };
  saveWorkloadData();
  syncWorkloadCardTicker();
  renderHomeCards();
}

function stopWorkloadTimerAndAdd() {
  syncWorkloadTimerRollover();
  if (!workloadData.timer.running) return;
  const now = new Date();
  const startedAt = new Date(workloadData.timer.startedAt);
  const result = commitWorkloadTimerSegment(workloadData.timer.date || workloadDateStrFor(startedAt), startedAt, now);
  workloadData.timer = defaultWorkloadData().timer;
  saveWorkloadData();
  syncWorkloadCardTicker();
  renderHomeCards();
  showToast(result.needsReview ? 'Work timer added and marked Needs review.' : `Added ${formatWorkloadDuration(result.seconds)} to Workload Today.`);
}

function resetWorkloadTimer() {
  if (!workloadData.timer.running) return;
  if (!confirm('Reset the active work timer without adding it to today?')) return;
  workloadData.timer = defaultWorkloadData().timer;
  saveWorkloadData();
  syncWorkloadCardTicker();
  renderHomeCards();
}

function adjustWorkloadToday(deltaSeconds) {
  syncWorkloadTimerRollover();
  const dateStr = workloadCurrentDateStr();
  const day = workloadDay(dateStr);
  day.totalSeconds = Math.max(0, Math.round(day.totalSeconds + deltaSeconds));
  day.updatedAt = new Date().toISOString();
  workloadData.daysByDate[dateStr] = day;
  saveWorkloadData();
  renderHomeCards();
}

function syncWorkloadTimerRollover(now = new Date()) {
  workloadData = normalizeWorkloadDataForStorage(workloadData);
  if (!workloadData.timer.running) return false;
  let changed = false;
  let startedAt = new Date(workloadData.timer.startedAt);
  if (Number.isNaN(startedAt.getTime())) {
    workloadData.timer = defaultWorkloadData().timer;
    saveWorkloadData();
    return true;
  }

  let dateStr = workloadData.timer.date || workloadDateStrFor(startedAt);
  for (let guard = 0; guard < 14; guard++) {
    const nextStart = workloadNextDayStart(dateStr);
    if (now < nextStart) break;
    commitWorkloadTimerSegment(dateStr, startedAt, nextStart);
    startedAt = nextStart;
    dateStr = workloadDateStrFor(startedAt);
    workloadData.timer.date = dateStr;
    workloadData.timer.startedAt = startedAt.toISOString();
    workloadData.timer.updatedAt = new Date().toISOString();
    changed = true;
  }

  if (changed) saveWorkloadData();
  return changed;
}

function commitWorkloadTimerSegment(dateStr, startedAt, endedAt) {
  const seconds = Math.max(0, Math.round((endedAt.getTime() - startedAt.getTime()) / 1000));
  if (!seconds) return { seconds: 0, needsReview: false };
  const day = workloadDay(dateStr);
  day.totalSeconds = Math.max(0, Math.round(day.totalSeconds + seconds));
  day.updatedAt = new Date().toISOString();
  const needsReview = seconds > WORKLOAD_REVIEW_THRESHOLD_SECONDS;
  if (needsReview) {
    day.needsReview = true;
    day.reviewNote = `Needs review: timer segment was ${formatWorkloadDuration(seconds)}.`;
  }
  workloadData.daysByDate[dateStr] = day;
  return { seconds, needsReview };
}

function workloadDay(dateStr) {
  const existing = workloadData?.daysByDate?.[dateStr];
  return normalizeWorkloadDay(dateStr, existing || {});
}

function workloadDisplayTotalSeconds(dateStr) {
  return workloadDay(dateStr).totalSeconds + workloadRunningSecondsForDate(dateStr);
}

function workloadRunningSecondsForDate(dateStr) {
  if (!workloadData?.timer?.running || workloadData.timer.date !== dateStr) return 0;
  const startedAt = new Date(workloadData.timer.startedAt).getTime();
  if (!startedAt) return 0;
  return Math.max(0, Math.round((Date.now() - startedAt) / 1000));
}

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

function workloadCurrentDateStr(now = new Date()) {
  return workloadDateStrFor(now);
}

function workloadDateStrFor(date) {
  const dayStart = workloadDayStart(toDateStr(date));
  if (date < dayStart) {
    dayStart.setDate(dayStart.getDate() - 1);
  }
  return toDateStr(dayStart);
}

function workloadDayStart(dateStr) {
  const start = dateFromStr(dateStr);
  const [hour, minute] = workloadPersonalDayStartTime().split(':').map(Number);
  start.setHours(hour, minute, 0, 0);
  return start;
}

function workloadNextDayStart(dateStr) {
  const next = workloadDayStart(dateStr);
  next.setDate(next.getDate() + 1);
  return next;
}

function workloadPersonalDayStartTime() {
  return isValidStoredTime(settings?.personalDayStartTime)
    ? settings.personalDayStartTime
    : DEFAULT_PERSONAL_DAY_START_TIME;
}

function formatWorkloadDuration(seconds) {
  const totalSeconds = Math.max(0, Math.round(Number(seconds) || 0));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const remainingSeconds = totalSeconds % 60;
  if (hours && minutes && remainingSeconds) return `${hours}h ${minutes}m ${remainingSeconds}s`;
  if (hours && minutes) return `${hours}h ${minutes}m`;
  if (hours && remainingSeconds) return `${hours}h ${remainingSeconds}s`;
  if (hours) return `${hours}h`;
  if (minutes && remainingSeconds) return `${minutes}m ${remainingSeconds}s`;
  if (minutes) return `${minutes}m`;
  if (remainingSeconds) return `${remainingSeconds}s`;
  return '0s';
}

function formatWorkloadClockDuration(seconds) {
  const totalSeconds = Math.max(0, Math.round(Number(seconds) || 0));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const remainingSeconds = totalSeconds % 60;
  const paddedMinutes = hours ? String(minutes).padStart(2, '0') : String(minutes);
  const paddedSeconds = String(remainingSeconds).padStart(2, '0');
  return hours ? `${hours}:${paddedMinutes}:${paddedSeconds}` : `${paddedMinutes}:${paddedSeconds}`;
}

function workloadDateLabel(dateStr) {
  const date = dateFromStr(dateStr);
  return new Intl.DateTimeFormat([], { weekday: 'short', month: 'short', day: 'numeric' }).format(date);
}

window.startWorkloadCard = startWorkloadCard;
window.stopWorkloadCard = stopWorkloadCard;
window.buildWorkloadCard = buildWorkloadCard;
window.handleWorkloadHomeCardAction = handleWorkloadHomeCardAction;
window.syncWorkloadSettingsControls = syncWorkloadSettingsControls;
window.autosaveWorkloadCardEnabled = autosaveWorkloadCardEnabled;
