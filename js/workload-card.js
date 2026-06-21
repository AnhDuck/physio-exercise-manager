// Workload Today dashboard card and timer state.

const WORKLOAD_REVIEW_THRESHOLD_SECONDS = 6 * 60 * 60;
const WORKLOAD_TICK_MS = 1000;
const WORKLOAD_HEARTBEAT_MS = 5 * 1000;
const WORKLOAD_REMINDER_SOUND_OPTIONS = {
  'soft-chime': 'Soft chime',
  beep: 'Beep',
  'double-tap': 'Double tap',
};

let workloadCardTickTimer = null;
let workloadReminderTimer = null;
let workloadAudioContext = null;
let workloadAudioUnlockBound = false;
let workloadPageOpenResumeChecked = false;
let workloadLastHeartbeatAt = 0;

function startWorkloadCard() {
  if (!workloadPageOpenResumeChecked) {
    workloadPageOpenResumeChecked = true;
    resumeWorkloadTimerAfterPageOpen();
  }
  syncWorkloadTimerRollover();
  syncWorkloadCardTicker();
  syncWorkloadTimerCues();
  window.addEventListener('beforeunload', pauseWorkloadTimerForPageClose);
  window.addEventListener('pagehide', pauseWorkloadTimerForPageClose);
}

function stopWorkloadCard() {
  window.clearInterval(workloadCardTickTimer);
  window.clearTimeout(workloadReminderTimer);
  workloadCardTickTimer = null;
  workloadReminderTimer = null;
  window.removeEventListener('beforeunload', pauseWorkloadTimerForPageClose);
  window.removeEventListener('pagehide', pauseWorkloadTimerForPageClose);
  updateWorkloadRunningVisualCue();
}

function syncWorkloadCardTicker() {
  window.clearInterval(workloadCardTickTimer);
  workloadCardTickTimer = null;
  if (!workloadData?.timer?.running) return;
  workloadCardTickTimer = window.setInterval(() => {
    syncWorkloadTimerRollover();
    syncWorkloadTimerCues();
    maybeSaveWorkloadTimerHeartbeat();
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
  }
  if (footer.childNodes.length) card.appendChild(footer);

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

function buildWorkloadComparison(dateStr) {
  const overlay = getWorkloadActivityWatchOverlayForDate(dateStr);
  const awSeconds = overlay.activityWatchWorkSeconds;
  const manualSeconds = overlay.manualResidualSeconds;
  const comparison = el('div', 'workload-comparison');

  const computer = el('div', 'workload-comparison-row');
  computer.appendChild(elText('span', '', 'Computer'));
  computer.appendChild(elText('strong', '', formatWorkloadDuration(awSeconds)));
  comparison.appendChild(computer);

  const manual = el('div', 'workload-comparison-row');
  manual.appendChild(elText('span', '', 'Manual / untracked estimate'));
  manual.appendChild(elText('strong', '', formatWorkloadDuration(manualSeconds)));
  comparison.appendChild(manual);

  if (overlay.conflict) {
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
  const cfg = workloadCueSettings();
  const cardEnabled = document.getElementById('setting-workload-card-enabled');
  const borderEnabled = document.getElementById('setting-workload-running-border-enabled');
  const reminderMinutes = document.getElementById('setting-workload-reminder-minutes');
  const reminderSound = document.getElementById('setting-workload-reminder-sound');
  if (cardEnabled) cardEnabled.checked = cfg.enabled !== false;
  if (borderEnabled) borderEnabled.checked = cfg.runningBorderEnabled !== false;
  if (reminderMinutes) reminderMinutes.value = String(cfg.reminderMinutes);
  if (reminderSound) reminderSound.value = cfg.reminderSound;
}

function autosaveWorkloadCardEnabled() {
  const input = document.getElementById('setting-workload-card-enabled');
  const workload = workloadCueSettings();
  workload.enabled = input ? input.checked : workload.enabled !== false;
  saveWorkloadCueSettings(workload);
  if (typeof startWorkloadCard === 'function') startWorkloadCard();
  renderHomeCards();
}

function autosaveWorkloadCueSettings() {
  const workload = workloadCueSettings();
  const borderEnabled = document.getElementById('setting-workload-running-border-enabled');
  const reminderMinutes = document.getElementById('setting-workload-reminder-minutes');
  const reminderSound = document.getElementById('setting-workload-reminder-sound');
  workload.runningBorderEnabled = borderEnabled ? borderEnabled.checked : workload.runningBorderEnabled !== false;
  workload.reminderMinutes = normalizeWorkloadReminderMinutes(reminderMinutes?.value, workload.reminderMinutes);
  workload.reminderSound = normalizeWorkloadReminderSound(reminderSound?.value, workload.reminderSound);
  saveWorkloadCueSettings(workload);
  syncWorkloadTimerCues();
}

function saveWorkloadCueSettings(workload) {
  const homeCards = getHomeCardsSettings();
  homeCards.workload = normalizeWorkloadCardSettings(workload);
  saveSettings(settings);
  syncWorkloadSettingsControls();
}

function testWorkloadReminderSound() {
  playWorkloadReminderSound(workloadCueSettings().reminderSound);
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
    elapsedSeconds: 0,
  };
  saveWorkloadData();
  workloadLastHeartbeatAt = now.getTime();
  syncWorkloadCardTicker();
  syncWorkloadTimerCues({ started: true });
  renderHomeCards();
}

function stopWorkloadTimerAndAdd() {
  syncWorkloadTimerRollover();
  if (!workloadData.timer.running) return;
  const dateStr = workloadData.timer.date || workloadCurrentDateStr();
  const seconds = workloadRunningSecondsForDate(dateStr);
  const result = commitWorkloadTimerSeconds(dateStr, seconds);
  workloadData.timer = defaultWorkloadData().timer;
  saveWorkloadData();
  syncWorkloadCardTicker();
  syncWorkloadTimerCues();
  renderHomeCards();
  showToast(result.needsReview ? 'Work timer added and marked Needs review.' : `Added ${formatWorkloadDuration(result.seconds)} to Workload Today.`);
}

function resetWorkloadTimer() {
  if (!workloadData.timer.running) return;
  if (!confirm('Reset the active work timer without adding it to today?')) return;
  workloadData.timer = defaultWorkloadData().timer;
  saveWorkloadData();
  syncWorkloadCardTicker();
  syncWorkloadTimerCues();
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
  let startedAt = workloadTimerStartedAtDate();
  if (!startedAt && workloadData.timer.elapsedSeconds <= 0) {
    workloadData.timer = defaultWorkloadData().timer;
    saveWorkloadData();
    syncWorkloadTimerCues();
    return true;
  }
  if (!startedAt) return false;

  let dateStr = workloadData.timer.date || workloadDateStrFor(startedAt);
  for (let guard = 0; guard < 14; guard++) {
    const nextStart = workloadNextDayStart(dateStr);
    if (now < nextStart) break;
    commitWorkloadTimerSeconds(dateStr, workloadData.timer.elapsedSeconds + workloadTimerSegmentSeconds(startedAt, nextStart));
    startedAt = nextStart;
    dateStr = workloadDateStrFor(startedAt);
    workloadData.timer.date = dateStr;
    workloadData.timer.startedAt = startedAt.toISOString();
    workloadData.timer.updatedAt = new Date().toISOString();
    workloadData.timer.elapsedSeconds = 0;
    changed = true;
  }

  if (changed) saveWorkloadData();
  if (changed) syncWorkloadTimerCues();
  return changed;
}

function pauseWorkloadTimerForPageClose() {
  if (!workloadData?.timer?.running) return;
  workloadData = normalizeWorkloadDataForStorage(workloadData);
  syncWorkloadTimerRollover();
  const dateStr = workloadData.timer.date || workloadCurrentDateStr();
  workloadData.timer = {
    ...workloadData.timer,
    running: true,
    date: dateStr,
    startedAt: '',
    updatedAt: new Date().toISOString(),
    elapsedSeconds: workloadRunningSecondsForDate(dateStr),
  };
  saveWorkloadData();
}

function resumeWorkloadTimerAfterPageOpen() {
  workloadData = normalizeWorkloadDataForStorage(workloadData);
  if (!workloadData.timer.running) return false;
  const previousStartedAt = workloadTimerStartedAtDate();
  if (previousStartedAt) {
    const updatedAt = workloadTimerUpdatedAtDate() || previousStartedAt;
    workloadData.timer.elapsedSeconds += workloadTimerSegmentSeconds(previousStartedAt, updatedAt);
    workloadData.timer.startedAt = '';
    workloadData.timer.updatedAt = updatedAt.toISOString();
  }

  const now = new Date();
  const currentDateStr = workloadCurrentDateStr(now);
  const timerDateStr = workloadData.timer.date || currentDateStr;
  const elapsedSeconds = Math.max(0, Math.round(Number(workloadData.timer.elapsedSeconds) || 0));

  if (timerDateStr !== currentDateStr && elapsedSeconds) {
    commitWorkloadTimerSeconds(timerDateStr, elapsedSeconds);
    workloadData.timer.elapsedSeconds = 0;
  }

  workloadData.timer = {
    ...workloadData.timer,
    running: true,
    date: currentDateStr,
    startedAt: now.toISOString(),
    updatedAt: now.toISOString(),
    elapsedSeconds: timerDateStr === currentDateStr ? elapsedSeconds : 0,
  };
  saveWorkloadData();
  workloadLastHeartbeatAt = now.getTime();
  return true;
}

function maybeSaveWorkloadTimerHeartbeat() {
  if (!workloadData?.timer?.running) return;
  const nowMs = Date.now();
  if (nowMs - workloadLastHeartbeatAt < WORKLOAD_HEARTBEAT_MS) return;
  saveWorkloadTimerHeartbeat(new Date(nowMs));
}

function saveWorkloadTimerHeartbeat(now = new Date()) {
  workloadData = normalizeWorkloadDataForStorage(workloadData);
  if (!workloadData.timer.running) return;
  syncWorkloadTimerRollover(now);
  const dateStr = workloadData.timer.date || workloadCurrentDateStr(now);
  workloadData.timer = {
    ...workloadData.timer,
    running: true,
    date: dateStr,
    startedAt: now.toISOString(),
    updatedAt: now.toISOString(),
    elapsedSeconds: workloadRunningSecondsForDate(dateStr),
  };
  saveWorkloadData({ mirror: false });
  workloadLastHeartbeatAt = now.getTime();
}

function workloadCueSettings() {
  const homeCards = getHomeCardsSettings();
  homeCards.workload = normalizeWorkloadCardSettings(homeCards.workload);
  return homeCards.workload;
}

function syncWorkloadTimerCues(options = {}) {
  updateWorkloadRunningVisualCue();
  scheduleWorkloadReminderCue();
  if (options.started) playWorkloadReminderSound(workloadCueSettings().reminderSound);
}

function updateWorkloadRunningVisualCue() {
  const showCue = Boolean(workloadData?.timer?.running && workloadCueSettings().runningBorderEnabled !== false);
  document.body?.classList.toggle('workload-timer-running', showCue);
}

function scheduleWorkloadReminderCue() {
  window.clearTimeout(workloadReminderTimer);
  workloadReminderTimer = null;
  if (!workloadData?.timer?.running) return;
  const minutes = workloadCueSettings().reminderMinutes;
  if (!minutes) return;
  const startedAt = new Date(workloadData.timer.startedAt).getTime();
  if (!startedAt) return;
  const intervalMs = minutes * 60 * 1000;
  const elapsedMs = Math.max(0, Date.now() - startedAt);
  const nextElapsedMs = Math.max(intervalMs, (Math.floor(elapsedMs / intervalMs) + 1) * intervalMs);
  const delayMs = Math.max(1000, nextElapsedMs - elapsedMs);
  workloadReminderTimer = window.setTimeout(runWorkloadReminderCue, delayMs);
}

function runWorkloadReminderCue() {
  if (!workloadData?.timer?.running) return;
  const dateStr = workloadData.timer.date || workloadCurrentDateStr();
  const runningSeconds = workloadRunningSecondsForDate(dateStr);
  playWorkloadReminderSound(workloadCueSettings().reminderSound);
  if (typeof showToast === 'function') {
    showToast(`Work timer still running: ${formatWorkloadDuration(runningSeconds)}`);
  }
  scheduleWorkloadReminderCue();
}

function playWorkloadReminderSound(soundId) {
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  if (!AudioCtx) return;
  workloadAudioContext = workloadAudioContext || new AudioCtx();
  if (workloadAudioContext.state === 'suspended') {
    workloadAudioContext.resume().catch(() => {});
    bindWorkloadAudioUnlock();
  }

  const sound = normalizeWorkloadReminderSound(soundId);
  if (sound === 'beep') {
    playWorkloadToneSequence([{ frequency: 880, duration: 0.16, type: 'square', volume: 0.13 }]);
  } else if (sound === 'double-tap') {
    playWorkloadToneSequence([
      { frequency: 520, duration: 0.055, type: 'triangle', volume: 0.18 },
      { frequency: 420, duration: 0.055, type: 'triangle', volume: 0.16, gap: 0.085 },
    ]);
  } else {
    playWorkloadToneSequence([
      { frequency: 659, duration: 0.18, type: 'sine', volume: 0.11 },
      { frequency: 880, duration: 0.28, type: 'sine', volume: 0.09, gap: 0.035 },
    ]);
  }
}

function playWorkloadToneSequence(notes) {
  if (!workloadAudioContext) return;
  let offset = 0;
  notes.forEach(note => {
    const startAt = workloadAudioContext.currentTime + offset;
    const duration = Math.max(0.04, Number(note.duration) || 0.12);
    const gain = workloadAudioContext.createGain();
    const osc = workloadAudioContext.createOscillator();
    osc.type = note.type || 'sine';
    osc.frequency.setValueAtTime(Number(note.frequency) || 660, startAt);
    gain.gain.setValueAtTime(0.0001, startAt);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.01, Number(note.volume) || 0.1), startAt + 0.018);
    gain.gain.exponentialRampToValueAtTime(0.0001, startAt + duration);
    osc.connect(gain);
    gain.connect(workloadAudioContext.destination);
    osc.start(startAt);
    osc.stop(startAt + duration + 0.03);
    offset += duration + Math.max(0.02, Number(note.gap) || 0.045);
  });
}

function bindWorkloadAudioUnlock() {
  if (workloadAudioUnlockBound) return;
  workloadAudioUnlockBound = true;
  const unlock = () => {
    if (workloadAudioContext?.state === 'suspended') {
      workloadAudioContext.resume().catch(() => {});
    }
    document.removeEventListener('pointerdown', unlock);
    document.removeEventListener('keydown', unlock);
    workloadAudioUnlockBound = false;
  };
  document.addEventListener('pointerdown', unlock, { once: true });
  document.addEventListener('keydown', unlock, { once: true });
}

function commitWorkloadTimerSegment(dateStr, startedAt, endedAt) {
  return commitWorkloadTimerSeconds(dateStr, workloadTimerSegmentSeconds(startedAt, endedAt));
}

function workloadTimerSegmentSeconds(startedAt, endedAt) {
  return Math.max(0, Math.round((endedAt.getTime() - startedAt.getTime()) / 1000));
}

function commitWorkloadTimerSeconds(dateStr, seconds) {
  seconds = Math.max(0, Math.round(Number(seconds) || 0));
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
  const elapsedSeconds = Math.max(0, Math.round(Number(workloadData.timer.elapsedSeconds) || 0));
  const startedAt = workloadTimerStartedAtDate();
  if (!startedAt) return elapsedSeconds;
  return elapsedSeconds + Math.max(0, Math.round((Date.now() - startedAt.getTime()) / 1000));
}

function workloadTimerStartedAtDate() {
  const startedAt = new Date(workloadData?.timer?.startedAt || '');
  return Number.isNaN(startedAt.getTime()) ? null : startedAt;
}

function workloadTimerUpdatedAtDate() {
  const updatedAt = new Date(workloadData?.timer?.updatedAt || '');
  return Number.isNaN(updatedAt.getTime()) ? null : updatedAt;
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
window.autosaveWorkloadCueSettings = autosaveWorkloadCueSettings;
window.testWorkloadReminderSound = testWorkloadReminderSound;
window.getWorkloadActivityWatchOverlayForDate = getWorkloadActivityWatchOverlayForDate;
window.getWorkloadActivityWatchOverlayTotals = getWorkloadActivityWatchOverlayTotals;
