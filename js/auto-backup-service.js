// Rolling folder backups via the browser File System Access API.

function getAutoBackupSettings() {
  settings.autoBackup = normalizeAutoBackupSettings(settings.autoBackup);
  // Permission-noise filtering belongs in normalizeAutoBackupHistory while
  // the raw folder/file context is still available. Filtering again here
  // would incorrectly discard meaningful permission failures.
  settings.autoBackup.history = normalizeAutoBackupHistory(settings.autoBackup.history);
  return settings.autoBackup;
}

function autoBackupFolderConnectErrorMessage(err) {
  if (err?.name === 'NotAllowedError') {
    return 'The browser blocked folder access before the app received a folder. Try a normal Chrome or Edge tab, or select a regular subfolder that is not protected by the browser.';
  }
  return autoBackupErrorMessage(err);
}

function recordAutoBackupFolderConnectFailure(err) {
  const auto = getAutoBackupSettings();
  const message = autoBackupFolderConnectErrorMessage(err);
  if (auto.folderName) {
    auto.needsReconnect = true;
    auto.lastError = message;
    auto.lastErrorAt = new Date().toISOString();
    saveSettings(settings);
  }
  renderAutoBackupSettings();
  showToast(`Folder access failed: ${message}`);
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

  autoBackupRecoveryCheckActive = true;
  try {
    autoBackupDirectoryHandle = await readAutoBackupDirectoryHandle();
    autoBackupDirectoryHandleFresh = false;
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
    autoBackupDirectoryHandleFresh = false;
    const auto = getAutoBackupSettings();
    if (auto.folderName) {
      auto.needsReconnect = true;
      auto.lastError = autoBackupErrorMessage(err);
      auto.lastErrorAt = new Date().toISOString();
      saveSettings(settings);
    }
  }

  renderAutoBackupSettings();
  const recoveryOffered = await maybeOfferAutoBackupRecovery('startup');
  autoBackupRecoveryCheckActive = false;
  document.addEventListener('visibilitychange', handleAutoBackupVisibilityChange);
  window.addEventListener('focus', handleAutoBackupFocus);
  scheduleAutoBackupChecks();
  if (!recoveryOffered || !autoBackupRecoveryHold) {
    maybeRunAutoBackup('startup');
  }
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
  if (autoBackupRecoveryHold) {
    if (currentAppDataLooksFreshOrEmpty()) return;
    autoBackupRecoveryHold = false;
  }

  const auto = getAutoBackupSettings();
  const now = new Date();
  const pending = pendingAutoBackup(auto, now);
  if (!pending) return;
  if (!auto.folderName) return;
  if (!isFolderAutoBackupSupported()) {
    recordAutoBackupMissed(pending, 'Folder backup is unavailable in this browser. Download a JSON backup or open the app in Chrome or Edge desktop.');
    return;
  }
  if (auto.needsReconnect) {
    recordAutoBackupMissed(pending, auto.lastError || 'Reconnect the backup folder to resume automatic backups.');
    return;
  }

  await runFolderBackup('auto', { promptPermission: false, trigger, schedule: pending.type });
}

async function chooseAutoBackupFolder() {
  if (!isFolderAutoBackupSupported()) {
    showToast('Folder backups need Chrome or Edge desktop with file access enabled.');
    renderAutoBackupSettings();
    return;
  }

  try {
    const handle = await pickAutoBackupDirectory();
    autoBackupDirectoryHandle = handle;
    autoBackupDirectoryHandleFresh = true;
    autoBackupHandleLoaded = true;
    autoBackupRecoveryCheckActive = true;

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
    const offeredRecovery = await maybeOfferAutoBackupRecovery('folder-connect', { force: true });
    autoBackupRecoveryCheckActive = false;
    showToast(offeredRecovery
      ? `Backup folder connected: ${auto.folderName}.`
      : `Backup folder connected: ${auto.folderName}. Use Backup now to test writing files.`);
  } catch (err) {
    autoBackupRecoveryCheckActive = false;
    if (err?.name === 'AbortError') return;
    recordAutoBackupFolderConnectFailure(err);
  }
}

function scheduleAutoBackupLiveMirror(trigger = 'save') {
  if (autoBackupMirrorSettingsSave || autoBackupRunning || autoBackupMirrorRunning || autoBackupRecoveryCheckActive || autoBackupStorageReplaceActive) return;
  if (autoBackupRecoveryHold) {
    if (currentAppDataLooksFreshOrEmpty()) return;
    autoBackupRecoveryHold = false;
  }
  if (!autoBackupHandleLoaded || !autoBackupDirectoryHandle) return;
  const auto = getAutoBackupSettings();
  if (!auto.folderName || auto.needsReconnect || !isFolderAutoBackupSupported()) return;

  window.clearTimeout(autoBackupMirrorTimer);
  autoBackupMirrorTimer = window.setTimeout(() => {
    autoBackupMirrorTimer = null;
    runAutoBackupLiveMirror(trigger);
  }, AUTO_BACKUP_LIVE_MIRROR_DEBOUNCE_MS);
}

async function runAutoBackupLiveMirror(trigger = 'save') {
  if (autoBackupRunning || autoBackupMirrorRunning) return;
  if (autoBackupRecoveryCheckActive || autoBackupStorageReplaceActive) return;
  if (autoBackupRecoveryHold) {
    if (currentAppDataLooksFreshOrEmpty()) return;
    autoBackupRecoveryHold = false;
  }
  autoBackupMirrorRunning = true;

  try {
    const handle = await getReadyAutoBackupDirectoryHandle(false);
    if (!handle) return;

    const backup = buildFullBackup();
    const json = JSON.stringify(backup, null, 2);
    await writeAutoBackupFile(handle, AUTO_BACKUP_LATEST_FILE, json);
    const verified = await verifyAutoBackupFile(handle, AUTO_BACKUP_LATEST_FILE);
    recordAutoBackupMirrorSuccess({
      at: new Date(),
      folderName: handle.name || getAutoBackupSettings().folderName,
      verified,
      trigger,
    });
  } catch (err) {
    recordAutoBackupMirrorFailure(err);
  } finally {
    autoBackupMirrorRunning = false;
    renderAutoBackupSettings();
  }
}

function recordAutoBackupMirrorSuccess(result) {
  const auto = getAutoBackupSettings();
  const at = result.at || new Date();
  auto.folderName = result.folderName || auto.folderName;
  auto.needsReconnect = false;
  auto.lastSuccessAt = at.toISOString();
  auto.lastError = '';
  auto.lastErrorAt = '';
  if (result.verified) {
    auto.lastVerifiedAt = result.verified.at || at.toISOString();
    auto.lastVerifiedFile = result.verified.file || AUTO_BACKUP_LATEST_FILE;
    auto.lastVerifiedSummary = result.verified.summary || null;
  }
  autoBackupMirrorSettingsSave = true;
  try {
    saveSettings(settings);
  } finally {
    autoBackupMirrorSettingsSave = false;
  }
}

function recordAutoBackupMirrorFailure(err) {
  const auto = getAutoBackupSettings();
  const message = autoBackupErrorMessage(err);
  auto.lastError = `Live backup mirror failed: ${message}`;
  auto.lastErrorAt = new Date().toISOString();
  if (isAutoBackupPermissionError(err)) {
    autoBackupDirectoryHandleFresh = false;
    auto.needsReconnect = Boolean(auto.folderName);
  }
  autoBackupMirrorSettingsSave = true;
  try {
    saveSettings(settings);
  } finally {
    autoBackupMirrorSettingsSave = false;
  }
}

async function maybeOfferAutoBackupRecovery(trigger = 'startup', options = {}) {
  if (!options.force && autoBackupRecoveryChecked) return false;
  autoBackupRecoveryChecked = true;
  if (!currentAppDataLooksFreshOrEmpty()) return false;
  if (!isFolderAutoBackupSupported()) return false;

  const handle = await getReadyAutoBackupDirectoryHandle(trigger === 'folder-connect');
  if (!handle) return false;

  let prepared;
  try {
    prepared = prepareBackupFromJson(await readAutoBackupFile(handle, AUTO_BACKUP_LATEST_FILE));
  } catch (err) {
    return false;
  }
  if (!prepared.ok || !backupContainsMeaningfulData(prepared.backup)) return false;
  autoBackupRecoveryHold = true;

  const backup = prepared.backup;
  const summary = backup.summary || buildBackupSummary(backup.data);
  const folderName = handle.name || getAutoBackupSettings().folderName || 'selected folder';
  const promptText = [
    `This browser looks empty, but the backup folder "${folderName}" has a latest backup.`,
    '',
    `Backup exported: ${backup.exportedAt || 'Unknown'}`,
    `Backup contains ${backupSummaryText(summary)}.`,
    '',
    'Restore this folder backup into this browser now?'
  ].join('\n');

  if (!confirm(promptText)) return true;
  if (confirm('Download an emergency JSON backup of the current browser data before restoring?')) {
    exportFullBackup();
  }
  if (!confirm(`Restore from ${AUTO_BACKUP_LATEST_FILE} and replace this browser's saved app data?\n\n${backupSummaryPromptText(backup)}`)) {
    return true;
  }
  if (applyBackupToBrowserStorage(backup, 'Folder restore failed')) {
    autoBackupRecoveryHold = false;
    window.location.reload();
  }
  return true;
}

async function runManualFolderBackup() {
  if (autoBackupRecoveryHold && currentAppDataLooksFreshOrEmpty()) {
    const proceed = confirm([
      'This browser still looks empty, and PEM has already found a meaningful latest backup in the connected folder.',
      '',
      `Running Backup now will replace ${AUTO_BACKUP_LATEST_FILE} with the current empty/default browser data.`,
      '',
      'Continue only if you are sure this empty browser state is what you want backed up.'
    ].join('\n'));
    if (!proceed) return;
    autoBackupRecoveryHold = false;
  }
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
  const schedule = options.schedule === 'hourly' ? 'hourly' : 'daily';
  const datedFile = `${AUTO_BACKUP_DATED_PREFIX}${today}.json`;
  const hourlyFile = hourlyAutoBackupFileName(startedAt);
  const archiveFile = schedule === 'hourly' ? hourlyFile : datedFile;
  const files = [archiveFile, AUTO_BACKUP_LATEST_FILE];

  try {
    const handle = await getReadyAutoBackupDirectoryHandle(Boolean(options.promptPermission));
    if (!handle) throw new Error('Choose a backup folder before running folder backups.');

    const backup = buildFullBackup();
    const json = JSON.stringify(backup, null, 2);
    await writeAutoBackupFile(handle, archiveFile, json);
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
      schedule,
      countsAsScheduled: schedule === 'daily' && (type === 'auto' || isAtOrAfterAutoBackupTime(startedAt, getAutoBackupSettings().time)),
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
    autoBackupDirectoryHandleFresh = false;
    autoBackupHandleLoaded = true;
  }

  if (!handle) {
    markAutoBackupNeedsReconnect('Backup folder is not connected.');
    return null;
  }

  const granted = autoBackupDirectoryHandleFresh
    ? true
    : promptPermission
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
  auto.lastHourlyBackupHour = autoBackupHourKey(at);
  pushAutoBackupHistory({
    id: `${at.getTime()}-${type}`,
    type,
    status: 'success',
    at: at.toISOString(),
    folderName: auto.folderName,
    files: result.files || [],
    schedule: result.schedule || 'daily',
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
    if (isAutoBackupPermissionError(err)) autoBackupDirectoryHandleFresh = false;
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

function recordAutoBackupMissed(pending, message) {
  const auto = getAutoBackupSettings();
  if (!pending) return;
  if (pending.type === 'daily' && auto.lastMissedBackupDate === pending.dateStr) {
    renderAutoBackupSettings();
    return;
  }
  if (pending.type === 'hourly' && auto.lastMissedHourlyBackupHour === pending.hourKey) {
    renderAutoBackupSettings();
    return;
  }

  if (pending.type === 'daily') auto.lastMissedBackupDate = pending.dateStr;
  if (pending.type === 'hourly') auto.lastMissedHourlyBackupHour = pending.hourKey;
  auto.lastError = message;
  auto.lastErrorAt = pending.dueAt.toISOString();
  if (auto.folderName) auto.needsReconnect = true;
  pushAutoBackupHistory({
    id: `${pending.dueAt.getTime()}-auto-${pending.type}-missed`,
    type: 'auto',
    status: 'missed',
    at: pending.dueAt.toISOString(),
    folderName: auto.folderName,
    files: [],
    schedule: pending.type,
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

function getAutoBackupHealth(now = new Date()) {
  return evaluateAutoBackupHealth(getAutoBackupSettings(), now, {
    supported: isFolderAutoBackupSupported(),
    storageIssue: getStorageHealthIssue(),
    dataSafety: getDataSafetyReport(),
    handleLoaded: autoBackupHandleLoaded,
    hasHandle: Boolean(autoBackupDirectoryHandle),
  });
}
