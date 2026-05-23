// Rolling folder backups via the browser File System Access API.

const AUTO_BACKUP_DB_NAME = 'pem_auto_backup';
const AUTO_BACKUP_DB_VERSION = 1;
const AUTO_BACKUP_STORE = 'handles';
const AUTO_BACKUP_DIR_KEY = 'backup-directory';
const AUTO_BACKUP_PICKER_ID = 'pem-auto-backup-folder';
const AUTO_BACKUP_DATED_PREFIX = 'physio-exercise-auto-backup-';
const AUTO_BACKUP_LATEST_FILE = 'physio-exercise-auto-backup-latest.json';
const AUTO_BACKUP_KEEP_DAYS = 31;
const AUTO_BACKUP_HISTORY_LIMIT = 20;
const AUTO_BACKUP_TIMER_MS = 60 * 1000;
const AUTO_BACKUP_DATED_FILE_RE = /^physio-exercise-auto-backup-(\d{4}-\d{2}-\d{2})\.json$/;
const AUTO_BACKUP_DEFAULT_SETTINGS = {
  time: '06:00',
  folderName: '',
  lastScheduledBackupDate: '',
  lastSuccessAt: '',
  lastErrorAt: '',
  lastError: '',
  needsReconnect: false,
  lastMissedBackupDate: '',
  lastVerifiedAt: '',
  lastVerifiedFile: '',
  lastVerifiedSummary: null,
  history: [],
};

function getAutoBackupSettings() {
  settings.autoBackup = normalizeRuntimeAutoBackupSettings(settings.autoBackup);
  return settings.autoBackup;
}

function normalizeRuntimeAutoBackupSettings(value = {}) {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const time = normalizeAutoBackupTime(source.time) || AUTO_BACKUP_DEFAULT_SETTINGS.time;
  const history = Array.isArray(source.history)
    ? source.history.filter(item => item && typeof item === 'object').slice(0, AUTO_BACKUP_HISTORY_LIMIT)
    : AUTO_BACKUP_DEFAULT_SETTINGS.history;

  return {
    ...AUTO_BACKUP_DEFAULT_SETTINGS,
    ...source,
    time,
    folderName: typeof source.folderName === 'string' ? source.folderName : AUTO_BACKUP_DEFAULT_SETTINGS.folderName,
    lastScheduledBackupDate: typeof source.lastScheduledBackupDate === 'string' ? source.lastScheduledBackupDate : AUTO_BACKUP_DEFAULT_SETTINGS.lastScheduledBackupDate,
    lastSuccessAt: typeof source.lastSuccessAt === 'string' ? source.lastSuccessAt : AUTO_BACKUP_DEFAULT_SETTINGS.lastSuccessAt,
    lastErrorAt: typeof source.lastErrorAt === 'string' ? source.lastErrorAt : AUTO_BACKUP_DEFAULT_SETTINGS.lastErrorAt,
    lastError: typeof source.lastError === 'string' ? source.lastError : AUTO_BACKUP_DEFAULT_SETTINGS.lastError,
    needsReconnect: Boolean(source.needsReconnect),
    lastMissedBackupDate: typeof source.lastMissedBackupDate === 'string' ? source.lastMissedBackupDate : AUTO_BACKUP_DEFAULT_SETTINGS.lastMissedBackupDate,
    lastVerifiedAt: typeof source.lastVerifiedAt === 'string' ? source.lastVerifiedAt : AUTO_BACKUP_DEFAULT_SETTINGS.lastVerifiedAt,
    lastVerifiedFile: typeof source.lastVerifiedFile === 'string' ? source.lastVerifiedFile : AUTO_BACKUP_DEFAULT_SETTINGS.lastVerifiedFile,
    lastVerifiedSummary: source.lastVerifiedSummary && typeof source.lastVerifiedSummary === 'object' && !Array.isArray(source.lastVerifiedSummary)
      ? source.lastVerifiedSummary
      : AUTO_BACKUP_DEFAULT_SETTINGS.lastVerifiedSummary,
    history,
  };
}

function normalizeAutoBackupTime(timeStr) {
  if (typeof timeStr !== 'string') return '';
  const match = /^(\d{1,2}):(\d{2})$/.exec(timeStr.trim());
  if (!match) return '';
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return '';
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

function isFolderAutoBackupSupported() {
  return Boolean(
    window.isSecureContext !== false &&
    window.indexedDB &&
    window.showDirectoryPicker
  );
}

async function initializeAutoBackup() {
  getAutoBackupSettings();
  if (!isFolderAutoBackupSupported()) {
    renderAutoBackupSettings();
    document.addEventListener('visibilitychange', handleAutoBackupVisibilityChange);
    window.addEventListener('focus', handleAutoBackupFocus);
    scheduleAutoBackupChecks();
    maybeRunAutoBackup('startup');
    return;
  }

  try {
    autoBackupDirectoryHandle = await readAutoBackupDirectoryHandle();
    autoBackupHandleLoaded = true;
    const auto = getAutoBackupSettings();
    if (autoBackupDirectoryHandle) {
      const granted = await hasAutoBackupPermission(autoBackupDirectoryHandle);
      if (granted && auto.needsReconnect) {
        auto.needsReconnect = false;
        auto.lastError = '';
        auto.lastErrorAt = '';
        saveSettings(settings);
      } else if (!granted && auto.folderName) {
        auto.needsReconnect = true;
        saveSettings(settings);
      }
    }
  } catch (err) {
    autoBackupHandleLoaded = true;
    autoBackupDirectoryHandle = null;
    const auto = getAutoBackupSettings();
    if (auto.folderName) {
      auto.needsReconnect = true;
      auto.lastError = autoBackupErrorMessage(err);
      auto.lastErrorAt = new Date().toISOString();
      saveSettings(settings);
    }
  }

  renderAutoBackupSettings();
  document.addEventListener('visibilitychange', handleAutoBackupVisibilityChange);
  window.addEventListener('focus', handleAutoBackupFocus);
  scheduleAutoBackupChecks();
  maybeRunAutoBackup('startup');
}

function scheduleAutoBackupChecks() {
  window.clearInterval(autoBackupTimer);
  autoBackupTimer = null;
  autoBackupTimer = window.setInterval(() => {
    maybeRunAutoBackup('timer');
  }, AUTO_BACKUP_TIMER_MS);
}

function handleAutoBackupVisibilityChange() {
  if (!document.hidden) maybeRunAutoBackup('visibility');
}

function handleAutoBackupFocus() {
  maybeRunAutoBackup('focus');
}

async function maybeRunAutoBackup(trigger = 'auto') {
  if (autoBackupRunning) return;

  const auto = getAutoBackupSettings();
  const now = new Date();
  const pending = pendingScheduledAutoBackup(auto, now);
  if (!pending) return;
  if (!isFolderAutoBackupSupported()) {
    recordAutoBackupMissed(pending.dateStr, pending.dueAt, 'Folder backup is unavailable in this browser. Download a JSON backup or open the app in Chrome or Edge desktop.');
    return;
  }
  if (!auto.folderName) {
    recordAutoBackupMissed(pending.dateStr, pending.dueAt, 'No backup folder is connected.');
    return;
  }
  if (auto.needsReconnect) {
    recordAutoBackupMissed(pending.dateStr, pending.dueAt, auto.lastError || 'Reconnect the backup folder to resume automatic backups.');
    return;
  }

  await runFolderBackup('auto', { promptPermission: false, trigger });
}

async function chooseAutoBackupFolder() {
  if (!isFolderAutoBackupSupported()) {
    showToast('Folder backups need Chrome or Edge desktop with file access enabled.');
    renderAutoBackupSettings();
    return;
  }

  try {
    const handle = await window.showDirectoryPicker({
      id: AUTO_BACKUP_PICKER_ID,
      mode: 'readwrite',
      startIn: 'documents',
    });
    const granted = await requestAutoBackupPermission(handle);
    if (!granted) throw new Error('Write permission was not granted.');

    autoBackupDirectoryHandle = handle;
    autoBackupHandleLoaded = true;

    const auto = getAutoBackupSettings();
    auto.folderName = handle.name || 'Selected folder';
    auto.needsReconnect = false;
    auto.lastError = '';
    auto.lastErrorAt = '';
    saveSettings(settings);

    try {
      await writeAutoBackupDirectoryHandle(handle);
    } catch (err) {
      showToast(`Folder connected for this session. Reconnect may be needed after reload: ${autoBackupErrorMessage(err)}`);
    }

    renderAutoBackupSettings();
    showToast(`Backup folder connected: ${auto.folderName}.`);
    maybeRunAutoBackup('folder');
  } catch (err) {
    if (err?.name === 'AbortError') return;
    recordAutoBackupFailure('manual', err);
  }
}

async function runManualFolderBackup() {
  await runFolderBackup('manual', { promptPermission: true, trigger: 'manual' });
}

async function runFolderBackup(type, options = {}) {
  if (!isFolderAutoBackupSupported()) {
    showToast('Folder backups are unavailable in this browser.');
    renderAutoBackupSettings();
    return;
  }
  if (autoBackupRunning) {
    showToast('Backup already running.');
    return;
  }

  autoBackupRunning = true;
  renderAutoBackupSettings();

  const startedAt = new Date();
  const today = toDateStr(startedAt);
  const datedFile = `${AUTO_BACKUP_DATED_PREFIX}${today}.json`;
  const files = [datedFile, AUTO_BACKUP_LATEST_FILE];

  try {
    const handle = await getReadyAutoBackupDirectoryHandle(Boolean(options.promptPermission));
    if (!handle) throw new Error('Choose a backup folder before running folder backups.');

    const backup = buildFullBackup();
    const json = JSON.stringify(backup, null, 2);
    await writeAutoBackupFile(handle, datedFile, json);
    await writeAutoBackupFile(handle, AUTO_BACKUP_LATEST_FILE, json);
    const verified = await verifyAutoBackupFile(handle, AUTO_BACKUP_LATEST_FILE);

    let cleanupMessage = '';
    try {
      const deletedCount = await cleanupOldAutoBackupFiles(handle, startedAt);
      cleanupMessage = deletedCount
        ? `Deleted ${formatNumber(deletedCount)} old ${deletedCount === 1 ? 'backup' : 'backups'}.`
        : 'No old backups to delete.';
    } catch (cleanupErr) {
      cleanupMessage = `Saved files. Cleanup failed: ${autoBackupErrorMessage(cleanupErr)}`;
    }

    recordAutoBackupSuccess(type, {
      at: startedAt,
      files,
      folderName: handle.name || getAutoBackupSettings().folderName,
      message: cleanupMessage,
      verified,
      countsAsScheduled: type === 'auto' || isAtOrAfterAutoBackupTime(startedAt, getAutoBackupSettings().time),
    });
  } catch (err) {
    recordAutoBackupFailure(type, err, { files });
  } finally {
    autoBackupRunning = false;
    renderAutoBackupSettings();
  }
}

async function getReadyAutoBackupDirectoryHandle(promptPermission) {
  let handle = autoBackupDirectoryHandle;
  if (!handle && !autoBackupHandleLoaded) {
    handle = await readAutoBackupDirectoryHandle();
    autoBackupDirectoryHandle = handle;
    autoBackupHandleLoaded = true;
  }

  if (!handle) {
    markAutoBackupNeedsReconnect('Backup folder is not connected.');
    return null;
  }

  const granted = promptPermission
    ? await requestAutoBackupPermission(handle)
    : await hasAutoBackupPermission(handle);
  if (!granted) {
    markAutoBackupNeedsReconnect('Reconnect the backup folder to allow file writes.');
    return null;
  }

  const auto = getAutoBackupSettings();
  if (auto.needsReconnect) {
    auto.needsReconnect = false;
    auto.lastError = '';
    auto.lastErrorAt = '';
    saveSettings(settings);
  }
  return handle;
}

async function writeAutoBackupFile(directoryHandle, fileName, contents) {
  const fileHandle = await directoryHandle.getFileHandle(fileName, { create: true });
  const writable = await fileHandle.createWritable();
  await writable.write(contents);
  await writable.close();
}

async function readAutoBackupFile(directoryHandle, fileName) {
  const fileHandle = await directoryHandle.getFileHandle(fileName);
  const file = await fileHandle.getFile();
  return file.text();
}

async function verifyAutoBackupFile(directoryHandle, fileName) {
  let backup;
  try {
    backup = JSON.parse(await readAutoBackupFile(directoryHandle, fileName));
  } catch (err) {
    throw new Error(`Backup file could not be verified: ${autoBackupErrorMessage(err)}`);
  }

  const errors = validateBackup(backup);
  if (errors.length) {
    throw new Error(`Backup file could not be verified: ${errors[0]}`);
  }

  return {
    at: new Date().toISOString(),
    file: fileName,
    summary: buildBackupSummary(backup.data),
  };
}

async function cleanupOldAutoBackupFiles(directoryHandle, now = new Date()) {
  if (typeof directoryHandle.entries !== 'function') return 0;

  const cutoff = new Date(now);
  cutoff.setHours(0, 0, 0, 0);
  cutoff.setDate(cutoff.getDate() - (AUTO_BACKUP_KEEP_DAYS - 1));
  const cutoffDateStr = toDateStr(cutoff);
  let deletedCount = 0;

  for await (const [name, entry] of directoryHandle.entries()) {
    if (entry.kind !== 'file') continue;
    const match = AUTO_BACKUP_DATED_FILE_RE.exec(name);
    if (!match) continue;
    const fileDate = match[1];
    if (fileDate < cutoffDateStr) {
      await directoryHandle.removeEntry(name);
      deletedCount++;
    }
  }

  return deletedCount;
}

function recordAutoBackupSuccess(type, result) {
  const auto = getAutoBackupSettings();
  const at = result.at || new Date();
  auto.folderName = result.folderName || auto.folderName;
  auto.needsReconnect = false;
  auto.lastSuccessAt = at.toISOString();
  auto.lastError = '';
  auto.lastErrorAt = '';
  if (result.verified) {
    auto.lastVerifiedAt = result.verified.at || at.toISOString();
    auto.lastVerifiedFile = result.verified.file || '';
    auto.lastVerifiedSummary = result.verified.summary || null;
  }
  if (result.countsAsScheduled) {
    auto.lastScheduledBackupDate = toDateStr(at);
  }
  pushAutoBackupHistory({
    id: `${at.getTime()}-${type}`,
    type,
    status: 'success',
    at: at.toISOString(),
    folderName: auto.folderName,
    files: result.files || [],
    message: result.message || 'Backup saved.',
  });
  saveSettings(settings);
  showToast(`${type === 'auto' ? 'Auto backup' : 'Backup'} saved to ${auto.folderName}.`);
}

function recordAutoBackupFailure(type, err, details = {}) {
  const auto = getAutoBackupSettings();
  const at = new Date();
  const message = autoBackupErrorMessage(err);
  auto.lastError = message;
  auto.lastErrorAt = at.toISOString();
  if (isAutoBackupPermissionError(err) || /folder/i.test(message)) {
    auto.needsReconnect = Boolean(auto.folderName);
  }
  pushAutoBackupHistory({
    id: `${at.getTime()}-${type}-error`,
    type,
    status: 'error',
    at: at.toISOString(),
    folderName: auto.folderName,
    files: details.files || [],
    message,
  });
  saveSettings(settings);
  renderAutoBackupSettings();
  showToast(`Backup failed: ${message}`);
}

function recordAutoBackupMissed(dateStr, dueAt, message) {
  const auto = getAutoBackupSettings();
  if (auto.lastMissedBackupDate === dateStr) {
    renderAutoBackupSettings();
    return;
  }

  auto.lastMissedBackupDate = dateStr;
  auto.lastError = message;
  auto.lastErrorAt = dueAt.toISOString();
  if (auto.folderName) auto.needsReconnect = true;
  pushAutoBackupHistory({
    id: `${dueAt.getTime()}-auto-missed`,
    type: 'auto',
    status: 'missed',
    at: dueAt.toISOString(),
    folderName: auto.folderName,
    files: [],
    message,
  });
  saveSettings(settings);
  renderAutoBackupSettings();
}

function pushAutoBackupHistory(entry) {
  const auto = getAutoBackupSettings();
  auto.history = normalizeAutoBackupHistory([entry, ...(auto.history || [])]).slice(0, AUTO_BACKUP_HISTORY_LIMIT);
}

function markAutoBackupNeedsReconnect(message) {
  const auto = getAutoBackupSettings();
  auto.needsReconnect = Boolean(auto.folderName);
  auto.lastError = message;
  auto.lastErrorAt = new Date().toISOString();
  saveSettings(settings);
  renderAutoBackupSettings();
}

function isAtOrAfterAutoBackupTime(date, timeStr) {
  const target = timeToMinutes(timeStr);
  if (target === null) return false;
  return (date.getHours() * 60 + date.getMinutes()) >= target;
}

function scheduledAutoBackupDueAtDate(dateStr, timeStr) {
  const due = dateFromStr(dateStr);
  const [hour, minute] = normalizeAutoBackupTime(timeStr).split(':').map(Number);
  due.setHours(hour, minute, 0, 0);
  return due;
}

function pendingScheduledAutoBackup(auto, now = new Date()) {
  const today = toDateStr(now);
  let pendingDate = today;
  const lastRecorded = latestAutoBackupScheduleDate([
    auto.lastScheduledBackupDate,
    auto.lastMissedBackupDate,
  ]);

  if (lastRecorded) {
    const next = dateFromStr(lastRecorded);
    next.setDate(next.getDate() + 1);
    pendingDate = toDateStr(next);
  }

  if (pendingDate > today) return null;
  const dueAt = scheduledAutoBackupDueAtDate(pendingDate, auto.time);
  if (now < dueAt) return null;
  return { dateStr: pendingDate, dueAt };
}

function latestAutoBackupScheduleDate(values) {
  return values
    .filter(value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value))
    .sort()
    .pop() || '';
}

function getAutoBackupHealth(now = new Date()) {
  const auto = getAutoBackupSettings();
  const supported = isFolderAutoBackupSupported();
  const pending = pendingScheduledAutoBackup(auto, now);

  if (!supported) {
    return {
      ok: false,
      code: 'unsupported',
      title: 'Folder backup is unavailable',
      detail: 'Automatic folder backups cannot run here. Download a JSON backup now, or open the app in Chrome or Edge desktop.',
      action: 'Download JSON',
    };
  }

  if (!auto.folderName) {
    return {
      ok: false,
      code: 'missing-folder',
      title: auto.lastError ? 'Backup folder was not connected' : 'Backups are not connected',
      detail: auto.lastError || 'Choose a backup folder so this app can save automatic daily backups.',
      action: 'Choose folder',
    };
  }

  if (auto.needsReconnect) {
    return {
      ok: false,
      code: 'reconnect',
      title: 'Backup folder needs reconnect',
      detail: auto.lastError || 'Reconnect the backup folder so automatic backups can resume.',
      action: 'Reconnect',
    };
  }

  if (!autoBackupDirectoryHandle) {
    return {
      ok: false,
      code: 'checking',
      title: 'Checking backup folder',
      detail: 'The app is checking whether the saved backup folder can still be used.',
      action: 'Reconnect',
    };
  }

  if (pending) {
    return {
      ok: false,
      code: 'due',
      title: 'Backup is due now',
      detail: 'The scheduled backup has not completed yet. Keep this page open or run a backup now.',
      action: 'Backup now',
    };
  }

  if (auto.lastError) {
    return {
      ok: false,
      code: 'error',
      title: 'Last backup failed',
      detail: auto.lastError,
      action: 'Backup now',
    };
  }

  const dataSafety = getDataSafetyReport();
  if (!dataSafety.ok) {
    return {
      ok: false,
      code: 'data-safety',
      title: 'Saved data needs attention',
      detail: dataSafety.issues[0] || 'The app found a saved data issue.',
      action: 'Open Settings',
    };
  }

  return {
    ok: true,
    code: 'ok',
    title: 'Backups connected',
    detail: 'Folder backup is connected.',
    action: '',
  };
}

function handleBackupHealthAction() {
  const health = getAutoBackupHealth();
  if (health.code === 'unsupported') {
    exportFullBackup();
    return;
  }
  if (health.code === 'data-safety') {
    openSettingsModal();
    setSettingsTab('backup', true);
    return;
  }
  if (health.code === 'due' || health.code === 'error') {
    runManualFolderBackup();
    return;
  }
  chooseAutoBackupFolder();
}

function renderAutoBackupSettings() {
  const folderBtn = document.getElementById('settings-auto-backup-folder');
  const backupNowBtn = document.getElementById('settings-auto-backup-now');
  const folderName = document.getElementById('settings-auto-backup-folder-name');
  const folderState = document.getElementById('settings-auto-backup-folder-state');
  const last = document.getElementById('settings-auto-backup-last');
  const next = document.getElementById('settings-auto-backup-next');
  const issue = document.getElementById('settings-auto-backup-issue');
  const issueText = document.getElementById('settings-auto-backup-issue-text');
  const summary = document.getElementById('settings-auto-backup-summary');
  const toggle = document.getElementById('settings-auto-backup-history-toggle');
  const history = document.getElementById('settings-auto-backup-history');
  if (!folderBtn || !backupNowBtn || !folderName || !folderState || !last || !next || !issue || !issueText || !summary || !toggle || !history) return;

  const auto = getAutoBackupSettings();
  const supported = isFolderAutoBackupSupported();
  const folderReady = supported && Boolean(auto.folderName) && !auto.needsReconnect && Boolean(autoBackupDirectoryHandle);
  const health = getAutoBackupHealth();
  const normalizedHistory = normalizeAutoBackupHistory(auto.history || []);

  folderBtn.disabled = !supported || autoBackupRunning;
  const folderButtonLabel = auto.needsReconnect
    ? 'Reconnect'
    : auto.folderName
      ? 'Change'
      : 'Browse';
  setSettingsButtonContent(folderBtn, folderButtonLabel, auto.needsReconnect ? 'reconnect' : 'folder');
  backupNowBtn.disabled = !folderReady || autoBackupRunning;
  setSettingsButtonContent(backupNowBtn, autoBackupRunning ? 'Backing up...' : 'Backup now', 'backup-now');

  folderName.textContent = autoBackupFolderNameText(auto, supported);
  folderState.textContent = autoBackupFolderStateText(auto, supported, folderReady);
  last.textContent = auto.lastSuccessAt ? formatAutoBackupDateTime(auto.lastSuccessAt) : 'Never';
  next.textContent = supported ? nextAutoBackupDueText(auto) : 'Unavailable';
  issue.hidden = !auto.lastError;
  issueText.textContent = auto.lastError || '';
  updateAutoBackupHealthUi(health);
  renderAutoBackupSummary(summary, normalizedHistory);
  toggle.hidden = normalizedHistory.length <= 1;
  toggle.textContent = autoBackupHistoryExpanded ? 'Hide history' : 'Show history';
  history.hidden = !autoBackupHistoryExpanded || normalizedHistory.length <= 1;
  renderAutoBackupHistory(history, normalizedHistory);
}

function autoBackupFolderNameText(auto, supported) {
  if (!supported) return 'Folder backup unavailable';
  return auto.folderName || 'No folder selected';
}

function autoBackupFolderStateText(auto, supported, folderReady) {
  if (!supported) return 'Chrome or Edge desktop file access unavailable.';
  if (!auto.folderName) return 'Not selected';
  if (auto.needsReconnect) return 'Reconnect required';
  if (folderReady) return 'Connected';
  return 'Checking permission';
}

function updateAutoBackupHealthUi(health) {
  const banner = document.getElementById('backup-health-banner');
  const title = document.getElementById('backup-health-title');
  const detail = document.getElementById('backup-health-detail');
  const action = document.getElementById('backup-health-action');
  const settingsBtn = document.getElementById('btn-settings');
  const backupTab = document.getElementById('settings-tab-backup');
  const backupPanel = document.getElementById('settings-panel-backup');
  const folderState = document.getElementById('settings-auto-backup-folder-state');
  const dataSafetyState = document.getElementById('settings-data-safety-state');
  const dataSafetyDetail = document.getElementById('settings-data-safety-detail');
  const dataSafetyPill = document.getElementById('settings-data-safety-pill');
  const backupVerifyState = document.getElementById('settings-backup-verify-state');
  const backupVerifyDetail = document.getElementById('settings-backup-verify-detail');
  const backupVerifyPill = document.getElementById('settings-backup-verify-pill');
  const auto = getAutoBackupSettings();
  const dataSafety = getDataSafetyReport();

  const hasIssue = !health.ok;
  document.body.classList.toggle('backup-health-open', hasIssue);
  if (banner && title && detail && action) {
    banner.hidden = !hasIssue;
    title.textContent = health.title;
    detail.textContent = health.detail;
    action.textContent = health.action || 'Open backup';
  }

  if (settingsBtn) {
    settingsBtn.classList.toggle('has-backup-issue', hasIssue);
    settingsBtn.title = hasIssue ? `Settings - ${health.title}` : 'Settings';
    settingsBtn.setAttribute('aria-label', hasIssue ? `Settings. ${health.title}.` : 'Settings');
  }

  if (backupTab) {
    backupTab.classList.toggle('has-backup-issue', hasIssue);
    backupTab.title = hasIssue ? health.title : '';
    backupTab.setAttribute('aria-label', hasIssue ? `Backup. ${health.title}.` : 'Backup');
  }

  if (backupPanel) backupPanel.classList.toggle('has-backup-issue', hasIssue);
  if (folderState) folderState.classList.toggle('is-backup-issue', hasIssue);
  if (dataSafetyState && dataSafetyDetail) {
    dataSafetyState.textContent = dataSafety.ok ? 'Saved data is readable' : 'Saved data needs attention';
    dataSafetyDetail.textContent = dataSafety.ok
      ? dataSafetyReceiptText(dataSafety)
      : dataSafety.issues.slice(0, 3).join(' ');
    dataSafetyState.classList.toggle('is-backup-issue', !dataSafety.ok);
  }
  setStatusPill(dataSafetyPill, dataSafety.ok ? 'OK' : 'Review', {
    issue: !dataSafety.ok,
  });
  if (backupVerifyState) {
    backupVerifyState.textContent = auto.lastVerifiedAt
      ? 'Latest folder backup verified'
      : 'Latest folder backup not verified';
  }
  if (backupVerifyDetail) {
    backupVerifyDetail.textContent = auto.lastVerifiedAt
      ? verifiedBackupReceiptText(auto)
      : 'Run Backup now, or wait for the next automatic folder backup.';
  }
  setStatusPill(backupVerifyPill, auto.lastVerifiedAt ? 'Verified' : 'Not checked', {
    muted: !auto.lastVerifiedAt,
  });
}

function setStatusPill(pill, text, options = {}) {
  if (!pill) return;
  pill.textContent = text;
  pill.classList.toggle('is-muted', Boolean(options.muted));
  pill.classList.toggle('is-backup-issue', Boolean(options.issue));
}

function toggleAutoBackupHistory() {
  autoBackupHistoryExpanded = !autoBackupHistoryExpanded;
  renderAutoBackupSettings();
}

function normalizeAutoBackupHistory(history) {
  const output = [];
  const manualSuccessByDate = new Map();

  history.forEach(raw => {
    const item = normalizeAutoBackupHistoryEntry(raw);
    if (!item) return;

    const dateKey = autoBackupHistoryDateKey(item.at);
    if (item.type === 'manual' && item.status === 'success' && dateKey) {
      const existing = manualSuccessByDate.get(dateKey);
      if (existing) {
        existing.count += item.count || 1;
        if (new Date(item.at).getTime() > new Date(existing.at).getTime()) {
          existing.at = item.at;
          existing.id = item.id;
        }
        return;
      }
      const grouped = { ...item, count: item.count || 1 };
      manualSuccessByDate.set(dateKey, grouped);
      output.push(grouped);
      return;
    }

    output.push(item);
  });

  return output
    .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
    .slice(0, AUTO_BACKUP_HISTORY_LIMIT);
}

function normalizeAutoBackupHistoryEntry(entry) {
  if (!entry || typeof entry !== 'object') return null;
  const at = typeof entry.at === 'string' && !Number.isNaN(new Date(entry.at).getTime())
    ? entry.at
    : new Date().toISOString();
  return {
    id: entry.id || `${new Date(at).getTime()}-${entry.type || 'backup'}`,
    type: entry.type === 'auto' ? 'auto' : 'manual',
    status: ['error', 'missed'].includes(entry.status) ? entry.status : 'success',
    at,
    count: Math.max(1, Number(entry.count) || 1),
    message: typeof entry.message === 'string' ? entry.message : '',
  };
}

function autoBackupHistoryDateKey(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return toDateStr(date);
}

function renderAutoBackupSummary(root, history) {
  root.innerHTML = '';
  const latest = history[0];
  if (!latest) {
    root.appendChild(elText('div', 'auto-backup-history-empty', 'No folder backups yet.'));
    return;
  }
  root.appendChild(buildAutoBackupHistoryItem(latest));
}

function renderAutoBackupHistory(root, history) {
  root.innerHTML = '';
  const items = history.slice(1, 6);
  if (!items.length) {
    root.appendChild(elText('div', 'auto-backup-history-empty', 'No older backup history yet.'));
    return;
  }

  items.forEach(item => {
    root.appendChild(buildAutoBackupHistoryItem(item));
  });
}

function buildAutoBackupHistoryItem(item) {
  const row = el('div', `auto-backup-history-item ${item.status === 'success' ? 'is-success' : 'is-error'}`);
  row.appendChild(elText('div', 'auto-backup-history-main', autoBackupHistoryTitle(item)));
  const detail = autoBackupHistoryDetail(item);
  if (detail) row.appendChild(elText('div', 'auto-backup-history-detail', detail));
  return row;
}

function autoBackupHistoryTitle(item) {
  if (item.status === 'missed') {
    return `Backup missed - ${formatAutoBackupDateTime(item.at)}`;
  }
  if (item.status === 'error') {
    return `Backup failed - ${formatAutoBackupDateTime(item.at)}`;
  }
  const label = item.type === 'auto' ? 'Auto backup saved' : 'Manual backup saved';
  return `${label} - ${formatAutoBackupDateTime(item.at)}`;
}

function autoBackupHistoryDetail(item) {
  if (item.status === 'error' || item.status === 'missed') return item.message || 'Backup did not complete.';
  if (item.type === 'manual' && item.count > 1) {
    return `${formatNumber(item.count)} manual runs today`;
  }
  return '';
}

function nextAutoBackupDueText(auto, now = new Date()) {
  if (!auto.folderName) return 'Choose a folder';
  if (auto.needsReconnect) return 'Reconnect folder';

  const today = toDateStr(now);
  const due = dateFromStr(today);
  const [hour, minute] = auto.time.split(':').map(Number);
  due.setHours(hour, minute, 0, 0);

  if (auto.lastScheduledBackupDate !== today && now >= due) {
    return 'Due now';
  }

  if (auto.lastScheduledBackupDate === today || now >= due) {
    due.setDate(due.getDate() + 1);
  }

  return formatAutoBackupDateTime(due.toISOString());
}

function formatAutoBackupDateTime(value) {
  if (!value) return 'Never';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return 'Unknown';
  return date.toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function dataSafetyReceiptText(report) {
  const summary = report.summary || {};
  return [
    `Checked ${formatAutoBackupDateTime(report.checkedAt)}.`,
    `Saved in this browser: ${backupSummaryText(summary)}.`,
  ].join(' ');
}

function verifiedBackupReceiptText(auto) {
  const summary = auto.lastVerifiedSummary || {};
  return [
    `Verified ${formatAutoBackupDateTime(auto.lastVerifiedAt)} by reading back the latest JSON backup.`,
    `Backup contains ${backupSummaryText(summary)}.`,
  ].join(' ');
}

function backupSummaryText(summary) {
  return `${formatNumber(summary.exerciseCount || 0)} exercises, ${formatNumber(summary.sessionDateCount || 0)} session days, ${formatNumber(summary.timelineEventCount || 0)} timeline items`;
}

function autoBackupErrorMessage(err) {
  if (!err) return 'Unknown error.';
  if (err.name === 'NotAllowedError') return 'Folder permission was not granted.';
  if (err.name === 'NotFoundError') return 'The backup folder or file was not found.';
  return err.message || String(err);
}

function isAutoBackupPermissionError(err) {
  return err?.name === 'NotAllowedError' || /permission|granted|reconnect/i.test(autoBackupErrorMessage(err));
}

async function hasAutoBackupPermission(handle) {
  if (!handle?.queryPermission) return true;
  return (await handle.queryPermission({ mode: 'readwrite' })) === 'granted';
}

async function requestAutoBackupPermission(handle) {
  if (await hasAutoBackupPermission(handle)) return true;
  if (!handle?.requestPermission) return false;
  return (await handle.requestPermission({ mode: 'readwrite' })) === 'granted';
}

function openAutoBackupDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(AUTO_BACKUP_DB_NAME, AUTO_BACKUP_DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(AUTO_BACKUP_STORE)) {
        db.createObjectStore(AUTO_BACKUP_STORE);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function readAutoBackupDirectoryHandle() {
  const db = await openAutoBackupDb();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(AUTO_BACKUP_STORE, 'readonly');
    const request = transaction.objectStore(AUTO_BACKUP_STORE).get(AUTO_BACKUP_DIR_KEY);
    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error);
    transaction.oncomplete = () => db.close();
    transaction.onabort = () => {
      db.close();
      reject(transaction.error);
    };
  });
}

async function writeAutoBackupDirectoryHandle(handle) {
  const db = await openAutoBackupDb();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(AUTO_BACKUP_STORE, 'readwrite');
    const request = transaction.objectStore(AUTO_BACKUP_STORE).put(handle, AUTO_BACKUP_DIR_KEY);
    request.onerror = () => reject(request.error);
    transaction.oncomplete = () => {
      db.close();
      resolve();
    };
    transaction.onabort = () => {
      db.close();
      reject(transaction.error);
    };
  });
}
