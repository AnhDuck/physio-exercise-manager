// Workload Today dashboard card and timer state.

const WORKLOAD_REVIEW_THRESHOLD_SECONDS = 6 * 60 * 60;
const WORKLOAD_TICK_MS = 1000;

let workloadCardTickTimer = null;

function startWorkloadCard() {
  syncWorkloadTimerRollover();
  syncWorkloadCardTicker();
  document.addEventListener('change', handleWorkloadCardInputChange);
  document.addEventListener('keydown', handleWorkloadCardKeydown);
}

function stopWorkloadCard() {
  window.clearInterval(workloadCardTickTimer);
  workloadCardTickTimer = null;
  document.removeEventListener('change', handleWorkloadCardInputChange);
  document.removeEventListener('keydown', handleWorkloadCardKeydown);
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
  const status = elText('span', `workload-state-pill${workloadData.timer.running ? ' is-running' : ''}`, workloadData.timer.running ? 'Timer running' : 'Timer stopped');
  header.appendChild(status);
  card.appendChild(header);

  const main = el('div', 'workload-main');
  main.appendChild(elText('div', 'workload-total', formatWorkloadDuration(totalSeconds)));
  const timerLine = workloadData.timer.running
    ? `Current timer: ${formatWorkloadDuration(runningSeconds)}`
    : 'Timer ready';
  main.appendChild(elText('div', 'workload-timer-line', timerLine));
  card.appendChild(main);

  const primary = elText('button', 'workload-primary-btn', workloadData.timer.running ? 'Stop + add' : 'Start work');
  primary.type = 'button';
  primary.dataset.homeCardAction = workloadData.timer.running ? 'workload-stop' : 'workload-start';
  card.appendChild(primary);

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
  manual.appendChild(buildWorkloadSetTotalControl(totalSeconds));
  card.appendChild(manual);

  const comparison = buildWorkloadComparison(dateStr, totalSeconds);
  card.appendChild(comparison);

  const footer = el('div', 'workload-footer');
  if (day.needsReview) {
    footer.appendChild(elText('span', 'workload-review-flag', day.reviewNote || 'Needs review'));
  } else {
    footer.appendChild(elText('span', '', `Day starts ${workloadPersonalDayStartTime()}`));
  }
  const reset = elText('button', 'workload-reset-btn', 'Reset timer');
  reset.type = 'button';
  reset.dataset.homeCardAction = 'workload-reset';
  reset.disabled = !workloadData.timer.running;
  footer.appendChild(reset);
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

  const button = elText('button', 'workload-compact-btn', workloadData.timer.running ? 'Stop + add' : 'Start');
  button.type = 'button';
  button.dataset.homeCardAction = workloadData.timer.running ? 'workload-stop' : 'workload-start';
  card.appendChild(button);
  return card;
}

function buildWorkloadSetTotalControl(totalSeconds) {
  const wrap = el('label', 'workload-set-total');
  wrap.appendChild(elText('span', '', 'Set total'));
  const input = el('input', '');
  input.id = 'workload-set-total-input';
  input.type = 'text';
  input.inputMode = 'decimal';
  input.autocomplete = 'off';
  input.spellcheck = false;
  input.value = formatWorkloadDuration(totalSeconds);
  input.setAttribute('aria-label', 'Set today work total');
  wrap.appendChild(input);
  return wrap;
}

function buildWorkloadComparison(dateStr, totalSeconds) {
  const awSeconds = workloadActivityWatchWorkSeconds(dateStr);
  const manualSeconds = Math.max(0, totalSeconds - awSeconds);
  const comparison = el('div', 'workload-comparison');

  const computer = el('div', 'workload-comparison-row');
  computer.appendChild(elText('span', '', 'Computer work'));
  computer.appendChild(elText('strong', '', formatWorkloadDuration(awSeconds)));
  comparison.appendChild(computer);

  const manual = el('div', 'workload-comparison-row');
  manual.appendChild(elText('span', '', 'Manual/physical estimate'));
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

function handleWorkloadCardInputChange(event) {
  if (event.target?.id !== 'workload-set-total-input') return;
  setWorkloadTodayTotalFromText(event.target.value);
}

function handleWorkloadCardKeydown(event) {
  if (event.target?.id !== 'workload-set-total-input' || event.key !== 'Enter') return;
  event.preventDefault();
  setWorkloadTodayTotalFromText(event.target.value);
  event.target.blur();
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

function setWorkloadTodayTotalFromText(text) {
  syncWorkloadTimerRollover();
  const parsed = parseWorkloadDurationText(text);
  if (parsed === null) {
    alert('Use minutes, seconds, 1h 30m 15s, 1:30, or 0:01:30 for the Workload total.');
    renderHomeCards();
    return;
  }
  const dateStr = workloadCurrentDateStr();
  const day = workloadDay(dateStr);
  const activeSeconds = workloadRunningSecondsForDate(dateStr);
  day.totalSeconds = Math.max(0, Math.round(parsed - activeSeconds));
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

function parseWorkloadDurationText(value) {
  const text = String(value || '').trim().toLowerCase();
  if (!text) return null;
  const clock = /^(\d{1,2}):(\d{1,2}):(\d{1,2})$/.exec(text);
  if (clock) return ((Number(clock[1]) * 3600) + (Number(clock[2]) * 60) + Number(clock[3]));
  const colon = /^(\d{1,2}):(\d{1,2})$/.exec(text);
  if (colon) return ((Number(colon[1]) * 60) + Number(colon[2])) * 60;
  const numberOnly = /^\d+(\.\d+)?$/.exec(text);
  if (numberOnly) return Math.round(Number(text) * 60);
  const hourMatch = /(\d+(?:\.\d+)?)\s*h/.exec(text);
  const minuteMatch = /(\d+(?:\.\d+)?)\s*m/.exec(text);
  const secondMatch = /(\d+(?:\.\d+)?)\s*s/.exec(text);
  if (!hourMatch && !minuteMatch && !secondMatch) return null;
  const hours = hourMatch ? Number(hourMatch[1]) : 0;
  const minutes = minuteMatch ? Number(minuteMatch[1]) : 0;
  const seconds = secondMatch ? Number(secondMatch[1]) : 0;
  return Math.round(((hours * 60) + minutes) * 60 + seconds);
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
