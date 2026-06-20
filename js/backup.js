// JSON backup export/import helpers.

const CURRENT_BACKUP_VERSION = 1;

function exportFullBackup() {
  const backup = buildFullBackup();
  const json = JSON.stringify(backup, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');

  link.href = url;
  link.download = backupFilename(new Date());
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
  showToast(`Downloaded JSON with ${formatNumber(backup.summary.exerciseCount)} exercises, ${formatNumber(backup.summary.sessionDateCount)} session days, ${formatNumber(backup.summary.timelineEventCount)} timeline items, ${formatNumber(backup.summary.activityWatchDayCount)} ActivityWatch days, and ${formatNumber(backup.summary.workloadDayCount)} workload days.`);
}

function buildFullBackup() {
  const data = {
    exercises: deepClone(exercises),
    sessions: deepClone(sessions),
    settings: deepClone(sanitizeLegacySettings(settings)),
    events: deepClone(events),
    activityWatch: typeof getActivityWatchBackupData === 'function'
      ? deepClone(getActivityWatchBackupData())
      : deepClone(typeof defaultActivityWatchData === 'function' ? defaultActivityWatchData() : {}),
    workload: typeof getWorkloadBackupData === 'function'
      ? deepClone(getWorkloadBackupData())
      : deepClone(typeof defaultWorkloadData === 'function' ? defaultWorkloadData() : {}),
  };

  return {
    app: 'physio-exercise-manager',
    format: 'pem-backup',
    version: CURRENT_BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    summary: buildBackupSummary(data),
    data,
  };
}

function deepClone(value) {
  return JSON.parse(JSON.stringify(value ?? null));
}

function buildBackupSummary(data) {
  const sessionDates = Object.keys(data.sessions || {}).filter(Boolean).sort();
  const firstSessionDate = sessionDates[0];
  const lastSessionDate = sessionDates[sessionDates.length - 1];
  const sessionDateRange = !sessionDates.length
    ? 'No session dates'
    : firstSessionDate === lastSessionDate
      ? firstSessionDate
      : `${firstSessionDate} - ${lastSessionDate}`;

  return {
    exerciseCount: Array.isArray(data.exercises) ? data.exercises.length : 0,
    sessionDateCount: sessionDates.length,
    timelineEventCount: Array.isArray(data.events) ? data.events.length : 0,
    activityWatchDayCount: data.activityWatch?.daysByDate && typeof data.activityWatch.daysByDate === 'object'
      ? Object.keys(data.activityWatch.daysByDate).length
      : 0,
    workloadDayCount: data.workload?.daysByDate && typeof data.workload.daysByDate === 'object'
      ? Object.keys(data.workload.daysByDate).length
      : 0,
    customImageCount: Array.isArray(data.exercises) ? data.exercises.filter(ex => Boolean(ex.image)).length : 0,
    sessionDateRange,
  };
}

function backupFilename(date) {
  const datePart = toDateStr(date);
  const timePart = `${String(date.getHours()).padStart(2, '0')}${String(date.getMinutes()).padStart(2, '0')}`;
  return `physio-exercise-backup-${datePart}-${timePart}.json`;
}

function openBackupImportPicker() {
  const input = document.getElementById('settings-import-file');
  if (!input) return;
  input.value = '';
  input.click();
}

function handleBackupImportFile(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => importBackupJson(String(reader.result || ''));
  reader.onerror = () => alert('Import failed:\n\n- Could not read the selected file.');
  reader.readAsText(file);
}

function importBackupJson(jsonText) {
  let backup;
  try {
    backup = JSON.parse(jsonText);
  } catch (err) {
    alert('Import failed:\n\n- The selected file is not valid JSON.');
    return;
  }

  const migration = migrateBackupToCurrent(backup);
  if (migration.errors.length) {
    alert(`Import failed:\n\n${migration.errors.map(error => `- ${error}`).join('\n')}`);
    return;
  }

  backup = migration.backup;
  const errors = validateBackup(backup);
  if (errors.length) {
    alert(`Import failed:\n\n${errors.map(error => `- ${error}`).join('\n')}`);
    return;
  }

  const summary = backup.summary && typeof backup.summary === 'object'
    ? backup.summary
    : buildBackupSummary(backup.data);
  const summaryText = [
    `Exported: ${backup.exportedAt || 'Unknown'}`,
    `Exercises: ${formatNumber(summary.exerciseCount || 0)}`,
    `Session days: ${formatNumber(summary.sessionDateCount || 0)}`,
    `Timeline items: ${formatNumber(summary.timelineEventCount || 0)}`,
    `ActivityWatch days: ${formatNumber(summary.activityWatchDayCount || 0)}`,
    `Workload days: ${formatNumber(summary.workloadDayCount || 0)}`,
  ].join('\n');

  if (confirm('Download current data before replacing it?')) {
    exportFullBackup();
  }

  if (!confirm(`Import this backup and replace all current browser data?\n\n${summaryText}\n\nThis cannot be undone unless you have an export of the current data.`)) {
    return;
  }

  const originalValues = getOriginalAppStorageValues();
  beginImportStorageTest();
  try {
    safeSetLocalStorageItem(KEYS.EXERCISES, JSON.stringify(backup.data.exercises), STORAGE_LABELS[KEYS.EXERCISES]);
    safeSetLocalStorageItem(KEYS.SESSIONS, JSON.stringify(backup.data.sessions), STORAGE_LABELS[KEYS.SESSIONS]);
    safeSetLocalStorageItem(KEYS.SETTINGS, JSON.stringify(sanitizeLegacySettings(backup.data.settings)), STORAGE_LABELS[KEYS.SETTINGS]);
    safeSetLocalStorageItem(KEYS.EVENTS, JSON.stringify(backup.data.events), STORAGE_LABELS[KEYS.EVENTS]);
    safeSetLocalStorageItem(KEYS.ACTIVITYWATCH, JSON.stringify(normalizeActivityWatchDataForStorage(backup.data.activityWatch)), STORAGE_LABELS[KEYS.ACTIVITYWATCH]);
    safeSetLocalStorageItem(KEYS.WORKLOAD, JSON.stringify(normalizeWorkloadDataForStorage(backup.data.workload)), STORAGE_LABELS[KEYS.WORKLOAD]);
  } catch (err) {
    restoreAppStorageValues(originalValues);
    alert(`Import failed:\n\n- The backup was valid, but browser storage could not save it.\n- Your previous browser data was restored.\n- ${storageErrorMessage(err)}`);
    return;
  } finally {
    endImportStorageTest();
  }
  window.location.reload();
}

function validateBackup(backup) {
  const errors = [];
  if (!backup || typeof backup !== 'object' || Array.isArray(backup)) {
    return ['Backup must be a JSON object.'];
  }
  if (backup.app !== 'physio-exercise-manager') errors.push('Missing or invalid app value.');
  if (backup.format !== 'pem-backup') errors.push('Missing or invalid backup format.');
  if (backup.version !== CURRENT_BACKUP_VERSION) errors.push('Unsupported backup version.');
  if (!backup.data || typeof backup.data !== 'object' || Array.isArray(backup.data)) {
    errors.push('Missing or invalid data object.');
    return errors;
  }
  if (!Array.isArray(backup.data.exercises)) errors.push('data.exercises must be an array.');
  if (!isPlainObject(backup.data.sessions)) errors.push('data.sessions must be an object.');
  if (!isPlainObject(backup.data.settings)) errors.push('data.settings must be an object.');
  if (!Array.isArray(backup.data.events)) errors.push('data.events must be an array.');
  if (backup.data.activityWatch !== undefined && !isPlainObject(backup.data.activityWatch)) {
    errors.push('data.activityWatch must be an object when present.');
  }
  if (backup.data.workload !== undefined && !isPlainObject(backup.data.workload)) {
    errors.push('data.workload must be an object when present.');
  }
  return errors;
}

function migrateBackupToCurrent(backup) {
  if (!backup || typeof backup !== 'object' || Array.isArray(backup)) {
    return { backup: null, errors: ['Backup must be a JSON object.'] };
  }
  if (backup.app !== 'physio-exercise-manager') {
    return { backup: null, errors: ['Missing or invalid app value.'] };
  }
  if (backup.format !== 'pem-backup') {
    return { backup: null, errors: ['Missing or invalid backup format.'] };
  }
  if (!Number.isInteger(backup.version)) {
    return { backup: null, errors: ['Missing or invalid backup version.'] };
  }
  if (backup.version > CURRENT_BACKUP_VERSION) {
    return { backup: null, errors: [`Backup version ${backup.version} is newer than this app supports.`] };
  }

  if (backup.version === 1) {
    return { backup, errors: [] };
  }

  return { backup: null, errors: [`Backup version ${backup.version} is too old to import.`] };
}

function getDataSafetyReport(data = {}) {
  const dataExercises = data.exercises ?? exercises;
  const dataSessions = data.sessions ?? sessions;
  const dataSettings = data.settings ?? settings;
  const dataEvents = data.events ?? events;
  const dataActivityWatch = data.activityWatch ?? (typeof getActivityWatchBackupData === 'function' ? getActivityWatchBackupData() : {});
  const dataWorkload = data.workload ?? (typeof getWorkloadBackupData === 'function' ? getWorkloadBackupData() : {});
  const issues = [];
  const checkedAt = new Date().toISOString();

  if (!Array.isArray(dataExercises)) issues.push('Exercises are not saved as a list.');
  if (!isPlainObject(dataSessions)) issues.push('Sessions are not saved as an object.');
  if (!isPlainObject(dataSettings)) issues.push('Settings are not saved as an object.');
  if (!Array.isArray(dataEvents)) issues.push('Timeline items are not saved as a list.');
  if (!isPlainObject(dataActivityWatch)) issues.push('ActivityWatch summaries are not saved as an object.');
  if (!isPlainObject(dataWorkload)) issues.push('Workload data is not saved as an object.');
  if (issues.length) return { ok: false, issues, checkedAt, summary: null };

  const exerciseIds = new Set();
  dataExercises.forEach((ex, index) => {
    if (!ex || typeof ex !== 'object' || Array.isArray(ex)) {
      issues.push(`Exercise ${index + 1} is not a valid object.`);
      return;
    }
    if (typeof ex.id !== 'string' || !ex.id.trim()) {
      issues.push(`Exercise ${index + 1} is missing an ID.`);
      return;
    }
    if (exerciseIds.has(ex.id)) issues.push(`Exercise ID "${ex.id}" is duplicated.`);
    exerciseIds.add(ex.id);
  });

  Object.entries(dataSessions).forEach(([dateStr, session]) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
      issues.push(`Session date "${dateStr}" is not YYYY-MM-DD.`);
    }
    if (!isPlainObject(session)) {
      issues.push(`Session "${dateStr}" is not a valid object.`);
      return;
    }
    if (session.completedExercises && !Array.isArray(session.completedExercises)) {
      issues.push(`Completed exercises for "${dateStr}" are not saved as a list.`);
    }
    if (session.setProgress && !isPlainObject(session.setProgress)) {
      issues.push(`Set progress for "${dateStr}" is not saved as an object.`);
      return;
    }
    Object.entries(session.setProgress || {}).forEach(([exerciseId, progress]) => {
      if (!exerciseId) issues.push(`Set progress for "${dateStr}" has a blank exercise ID.`);
      if (!isPlainObject(progress)) {
        issues.push(`Set progress for "${dateStr}" / "${exerciseId}" is not a valid object.`);
        return;
      }
      ['completedSets', 'targetSets'].forEach(key => {
        if (progress[key] !== undefined && (!Number.isFinite(Number(progress[key])) || Number(progress[key]) < 0)) {
          issues.push(`${key} for "${dateStr}" / "${exerciseId}" is not a usable number.`);
        }
      });
    });
  });

  return {
    ok: !issues.length,
    issues,
    checkedAt,
    summary: buildBackupSummary({
      exercises: dataExercises,
      sessions: dataSessions,
      settings: dataSettings,
      events: dataEvents,
      activityWatch: dataActivityWatch,
      workload: dataWorkload,
    }),
  };
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
