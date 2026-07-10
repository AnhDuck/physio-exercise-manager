// Browser File System Access and IndexedDB adapters for auto-backup.

function isFolderAutoBackupSupported() {
  return Boolean(
    window.isSecureContext !== false &&
    window.indexedDB &&
    window.showDirectoryPicker
  );
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

async function pickAutoBackupDirectory() {
  return window.showDirectoryPicker({
    id: AUTO_BACKUP_PICKER_ID,
    mode: 'readwrite',
    startIn: 'documents',
  });
}

function openAutoBackupDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(AUTO_BACKUP_DB_NAME, AUTO_BACKUP_DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(AUTO_BACKUP_STORE)) db.createObjectStore(AUTO_BACKUP_STORE);
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
  if (errors.length) throw new Error(`Backup file could not be verified: ${errors[0]}`);
  const safety = getDataSafetyReport(backup.data);
  if (!safety.ok) throw new Error(`Backup file could not be verified: ${safety.issues[0]}`);

  return {
    at: new Date().toISOString(),
    file: fileName,
    summary: safety.summary || buildBackupSummary(backup.data),
  };
}

async function cleanupOldAutoBackupFiles(directoryHandle, now = new Date()) {
  if (typeof directoryHandle.entries !== 'function') return 0;

  const cutoff = new Date(now);
  cutoff.setHours(0, 0, 0, 0);
  cutoff.setDate(cutoff.getDate() - (AUTO_BACKUP_KEEP_DAYS - 1));
  const cutoffDateStr = toDateStr(cutoff);
  const hourlyCutoff = new Date(now);
  hourlyCutoff.setMinutes(0, 0, 0);
  hourlyCutoff.setHours(hourlyCutoff.getHours() - (AUTO_BACKUP_HOURLY_KEEP_HOURS - 1));
  let deletedCount = 0;

  for await (const [name, entry] of directoryHandle.entries()) {
    if (entry.kind !== 'file') continue;
    const datedMatch = AUTO_BACKUP_DATED_FILE_RE.exec(name);
    if (datedMatch && datedMatch[1] < cutoffDateStr) {
      await directoryHandle.removeEntry(name);
      deletedCount++;
      continue;
    }
    const hourlyMatch = AUTO_BACKUP_HOURLY_FILE_RE.exec(name);
    if (hourlyMatch && autoBackupHourlyFileDate(hourlyMatch) < hourlyCutoff) {
      await directoryHandle.removeEntry(name);
      deletedCount++;
    }
  }
  return deletedCount;
}
