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

function getAutoBackupSettings() {
  settings.autoBackup = normalizeAutoBackupSettings(settings.autoBackup);
  return settings.autoBackup;
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
  if (!isFolderAutoBackupSupported()) return;
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
  if (!isFolderAutoBackupSupported() || autoBackupRunning) return;

  const auto = getAutoBackupSettings();
  if (!auto.folderName || auto.needsReconnect) return;

  const now = new Date();
  const today = toDateStr(now);
  if (!isAtOrAfterAutoBackupTime(now, auto.time)) return;
  if (auto.lastScheduledBackupDate === today) return;

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

    await writeAutoBackupDirectoryHandle(handle);
    autoBackupDirectoryHandle = handle;
    autoBackupHandleLoaded = true;

    const auto = getAutoBackupSettings();
    auto.folderName = handle.name || 'Selected folder';
    auto.needsReconnect = false;
    auto.lastError = '';
    auto.lastErrorAt = '';
    saveSettings(settings);
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

function pushAutoBackupHistory(entry) {
  const auto = getAutoBackupSettings();
  auto.history = [entry, ...(auto.history || [])].slice(0, AUTO_BACKUP_HISTORY_LIMIT);
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

function renderAutoBackupSettings() {
  const folderBtn = document.getElementById('settings-auto-backup-folder');
  const backupNowBtn = document.getElementById('settings-auto-backup-now');
  const status = document.getElementById('settings-auto-backup-status');
  const history = document.getElementById('settings-auto-backup-history');
  if (!folderBtn || !backupNowBtn || !status || !history) return;

  const auto = getAutoBackupSettings();
  const supported = isFolderAutoBackupSupported();
  const folderReady = supported && Boolean(auto.folderName) && !auto.needsReconnect && Boolean(autoBackupDirectoryHandle);

  folderBtn.disabled = !supported || autoBackupRunning;
  folderBtn.textContent = auto.needsReconnect
    ? 'Reconnect folder'
    : auto.folderName
      ? 'Change folder'
      : 'Choose folder';
  backupNowBtn.disabled = !folderReady || autoBackupRunning;
  backupNowBtn.textContent = autoBackupRunning ? 'Backing up...' : 'Backup now';

  status.textContent = autoBackupStatusText(auto, supported);
  renderAutoBackupHistory(history, auto.history || []);
}

function renderAutoBackupHistory(root, history) {
  root.innerHTML = '';
  const items = history.slice(0, 5);
  if (!items.length) {
    root.appendChild(elText('div', 'auto-backup-history-empty', 'No folder backups yet.'));
    return;
  }

  items.forEach(item => {
    const row = el('div', `auto-backup-history-item ${item.status === 'error' ? 'is-error' : 'is-success'}`);
    const main = elText(
      'div',
      'auto-backup-history-main',
      `${item.type === 'auto' ? 'Auto' : 'Manual'} ${item.status === 'error' ? 'failed' : 'saved'} - ${formatAutoBackupDateTime(item.at)}`
    );
    const files = Array.isArray(item.files) && item.files.length
      ? `${item.folderName || 'Backup folder'}: ${item.files.join(', ')}`
      : item.message || '';
    row.appendChild(main);
    row.appendChild(elText('div', 'auto-backup-history-files', files));
    if (item.message && item.status === 'error') {
      row.appendChild(elText('div', 'auto-backup-history-message', item.message));
    }
    root.appendChild(row);
  });
}

function autoBackupStatusText(auto, supported) {
  if (!supported) {
    return 'Folder backup unavailable in this browser. Download JSON still works.';
  }

  const folder = auto.folderName || 'Not selected';
  const last = auto.lastSuccessAt ? formatAutoBackupDateTime(auto.lastSuccessAt) : 'Never';
  const next = nextAutoBackupDueText(auto);
  const error = auto.lastError ? ` Last issue: ${auto.lastError}` : '';
  return `Folder: ${folder} | Last: ${last} | Next: ${next}.${error}`;
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
