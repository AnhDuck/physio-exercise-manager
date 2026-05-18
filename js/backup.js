// JSON backup export/import helpers.

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
  showToast(`Exported ${formatNumber(backup.summary.exerciseCount)} exercises, ${formatNumber(backup.summary.sessionDateCount)} session days, and ${formatNumber(backup.summary.timelineEventCount)} timeline items.`);
}

function buildFullBackup() {
  const data = {
    exercises: deepClone(exercises),
    sessions: deepClone(sessions),
    settings: deepClone(settings),
    events: deepClone(events),
  };

  return {
    app: 'physio-exercise-manager',
    format: 'pem-backup',
    version: 1,
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
  ].join('\n');

  if (confirm('Export current data before replacing it?')) {
    exportFullBackup();
  }

  if (!confirm(`Import this backup and replace all current browser data?\n\n${summaryText}\n\nThis cannot be undone unless you have an export of the current data.`)) {
    return;
  }

  localStorage.setItem(KEYS.EXERCISES, JSON.stringify(backup.data.exercises));
  localStorage.setItem(KEYS.SESSIONS, JSON.stringify(backup.data.sessions));
  localStorage.setItem(KEYS.SETTINGS, JSON.stringify(backup.data.settings));
  localStorage.setItem(KEYS.EVENTS, JSON.stringify(backup.data.events));
  window.location.reload();
}

function validateBackup(backup) {
  const errors = [];
  if (!backup || typeof backup !== 'object' || Array.isArray(backup)) {
    return ['Backup must be a JSON object.'];
  }
  if (backup.app !== 'physio-exercise-manager') errors.push('Missing or invalid app value.');
  if (backup.format !== 'pem-backup') errors.push('Missing or invalid backup format.');
  if (backup.version !== 1) errors.push('Unsupported backup version.');
  if (!backup.data || typeof backup.data !== 'object' || Array.isArray(backup.data)) {
    errors.push('Missing or invalid data object.');
    return errors;
  }
  if (!Array.isArray(backup.data.exercises)) errors.push('data.exercises must be an array.');
  if (!isPlainObject(backup.data.sessions)) errors.push('data.sessions must be an object.');
  if (!isPlainObject(backup.data.settings)) errors.push('data.settings must be an object.');
  if (!Array.isArray(backup.data.events)) errors.push('data.events must be an array.');
  return errors;
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

