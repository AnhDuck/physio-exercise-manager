// Pure auto-backup policy, naming, retention, and history rules.

const AUTO_BACKUP_DB_NAME = 'pem_auto_backup';
const AUTO_BACKUP_DB_VERSION = 1;
const AUTO_BACKUP_STORE = 'handles';
const AUTO_BACKUP_DIR_KEY = 'backup-directory';
const AUTO_BACKUP_PICKER_ID = 'pem-auto-backup-folder';
const AUTO_BACKUP_DATED_PREFIX = 'physio-exercise-auto-backup-';
const AUTO_BACKUP_HOURLY_PREFIX = 'physio-exercise-auto-backup-hourly-';
const AUTO_BACKUP_LATEST_FILE = 'physio-exercise-auto-backup-latest.json';
const AUTO_BACKUP_KEEP_DAYS = 31;
const AUTO_BACKUP_HOURLY_KEEP_HOURS = 48;
const AUTO_BACKUP_HISTORY_LIMIT = 20;
const AUTO_BACKUP_TIMER_MS = 60 * 1000;
const AUTO_BACKUP_LIVE_MIRROR_DEBOUNCE_MS = 1200;
const AUTO_BACKUP_DATED_FILE_RE = /^physio-exercise-auto-backup-(\d{4}-\d{2}-\d{2})\.json$/;
const AUTO_BACKUP_HOURLY_FILE_RE = /^physio-exercise-auto-backup-hourly-(\d{4}-\d{2}-\d{2})-(\d{2})00\.json$/;
const DATA_HEALTH_ISSUE_CODES = ['storage-failure', 'storage-read-failure', 'storage-test', 'storage-test-mode', 'storage-unavailable', 'data-safety'];

function normalizeAutoBackupTime(timeStr) {
  return normalizeTimeStr(timeStr);
}

function isAutoBackupPickerPermissionNoise(item) {
  return item?.status === 'error' &&
    item.type === 'manual' &&
    !item.folderName &&
    (!Array.isArray(item.files) || !item.files.length) &&
    /folder permission was not granted/i.test(item.message || '');
}

function normalizeAutoBackupHistory(history) {
  const output = [];
  const manualSuccessByDate = new Map();
  (Array.isArray(history) ? history : []).forEach(raw => {
    if (isAutoBackupPickerPermissionNoise(raw)) return;
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
    schedule: entry.schedule === 'hourly' ? 'hourly' : 'daily',
    message: typeof entry.message === 'string' ? entry.message : '',
    // Keep this context so a meaningful permission failure stays meaningful
    // when history is normalized again later.
    folderName: typeof entry.folderName === 'string' ? entry.folderName : '',
    files: Array.isArray(entry.files)
      ? entry.files.filter(file => typeof file === 'string')
      : [],
  };
}

function autoBackupHistoryDateKey(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : toDateStr(date);
}

function isAtOrAfterAutoBackupTime(date, timeStr) {
  const target = timeToMinutes(timeStr);
  if (target === null) return false;
  return (date.getHours() * 60 + date.getMinutes()) >= target;
}

function scheduledAutoBackupDueAtDate(dateStr, timeStr) {
  const due = dateFromStr(dateStr);
  const normalized = normalizeAutoBackupTime(timeStr) || '06:00';
  const [hour, minute] = normalized.split(':').map(Number);
  due.setHours(hour, minute, 0, 0);
  return due;
}

function pendingAutoBackup(auto, now = new Date()) {
  return pendingScheduledAutoBackup(auto, now) || pendingHourlyAutoBackup(auto, now);
}

function pendingScheduledAutoBackup(auto, now = new Date()) {
  const today = toDateStr(now);
  let pendingDate = today;
  const lastRecorded = latestAutoBackupScheduleDate([
    auto?.lastScheduledBackupDate,
    auto?.lastMissedBackupDate,
  ]);

  if (lastRecorded) {
    const next = dateFromStr(lastRecorded);
    next.setDate(next.getDate() + 1);
    pendingDate = toDateStr(next);
  }
  if (pendingDate > today) return null;
  const dueAt = scheduledAutoBackupDueAtDate(pendingDate, auto?.time);
  if (now < dueAt) return null;
  return { type: 'daily', dateStr: pendingDate, dueAt };
}

function pendingHourlyAutoBackup(auto, now = new Date()) {
  const currentHour = autoBackupHourKey(now);
  if (!currentHour || auto?.lastHourlyBackupHour === currentHour || auto?.lastMissedHourlyBackupHour === currentHour) return null;
  const dueAt = new Date(now);
  dueAt.setMinutes(0, 0, 0);
  return { type: 'hourly', hourKey: currentHour, dueAt };
}

function autoBackupHourKey(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return '';
  return `${toDateStr(date)}-${String(date.getHours()).padStart(2, '0')}`;
}

function hourlyAutoBackupFileName(date) {
  return `${AUTO_BACKUP_HOURLY_PREFIX}${autoBackupHourKey(date)}00.json`;
}

function autoBackupHourlyFileDate(match) {
  const hour = Number(match?.[2]);
  if (hour < 0 || hour > 23 || !isValidDateStr(match?.[1])) return new Date(NaN);
  const date = dateFromStr(match[1]);
  date.setHours(hour, 0, 0, 0);
  return date;
}

function latestAutoBackupScheduleDate(values) {
  return (Array.isArray(values) ? values : [])
    .filter(value => isValidDateStr(value))
    .sort()
    .pop() || '';
}

function nextScheduledAutoBackupDueAt(auto, now = new Date()) {
  const today = toDateStr(now);
  const due = scheduledAutoBackupDueAtDate(today, auto?.time);
  if (auto?.lastScheduledBackupDate === today || now >= due) due.setDate(due.getDate() + 1);
  return due;
}

function nextHourlyAutoBackupDueAt(now = new Date()) {
  const due = new Date(now);
  due.setMinutes(0, 0, 0);
  due.setHours(due.getHours() + 1);
  return due;
}

function nextAutoBackupDueText(auto, now = new Date()) {
  if (!auto?.folderName) return 'Choose a folder';
  if (auto.needsReconnect) return 'Reconnect folder';

  const pending = pendingAutoBackup(auto, now);
  if (pending?.type === 'hourly') return 'Hourly recovery due now';
  if (pending?.type === 'daily') return 'Daily backup due now';

  const dailyDue = nextScheduledAutoBackupDueAt(auto, now);
  const hourlyDue = nextHourlyAutoBackupDueAt(now);
  if (dailyDue && dailyDue <= hourlyDue) return `Daily ${formatAutoBackupDateTime(dailyDue.toISOString())}`;
  return `Hourly ${formatAutoBackupDateTime(hourlyDue.toISOString())}`;
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

function backupSummaryText(summary) {
  const activityWatchText = summary?.activityWatchDayCount
    ? `, ${formatNumber(summary.activityWatchDayCount)} ActivityWatch days`
    : '';
  const workloadText = summary?.workloadDayCount
    ? `, ${formatNumber(summary.workloadDayCount)} workload days`
    : '';
  return `${formatNumber(summary?.exerciseCount || 0)} exercises, ${formatNumber(summary?.sessionDateCount || 0)} session days, ${formatNumber(summary?.timelineEventCount || 0)} timeline items${activityWatchText}${workloadText}`;
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

function evaluateAutoBackupHealth(auto, now = new Date(), context = {}) {
  const pending = pendingAutoBackup(auto, now);
  const storageIssue = context.storageIssue || null;
  const dataSafety = context.dataSafety && typeof context.dataSafety === 'object'
    ? context.dataSafety
    : { ok: true, issues: [] };
  const supported = Boolean(context.supported);
  const handleLoaded = Boolean(context.handleLoaded);
  const hasHandle = Boolean(context.hasHandle);

  if (storageIssue) return storageIssue;

  if (!dataSafety.ok) {
    return {
      ok: false,
      code: 'data-safety',
      title: 'Saved data needs attention',
      detail: dataSafety.issues?.[0] || 'The app found a saved data issue.',
      action: 'Open Data Health',
    };
  }

  if (!supported) {
    return {
      ok: false,
      code: 'unsupported',
      title: 'Folder backup is unavailable',
      detail: 'Automatic folder backups cannot run here. Download a JSON backup now, or open the app in Chrome or Edge desktop.',
      action: 'Open Backup',
    };
  }

  if (!auto?.folderName) {
    return {
      ok: false,
      code: 'missing-folder',
      title: 'Backups are not connected',
      detail: 'Choose a backup folder so this app can save automatic daily backups.',
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

  if (!hasHandle && !handleLoaded) {
    return {
      ok: true,
      code: 'checking',
      title: 'Checking backup folder',
      detail: 'The app is checking whether the saved backup folder can still be used.',
      action: 'Reconnect',
    };
  }

  if (!hasHandle) {
    return {
      ok: false,
      code: 'reconnect',
      title: 'Backup folder needs reconnect',
      detail: 'Reconnect the backup folder so automatic backups can resume.',
      action: 'Reconnect',
    };
  }

  if (pending) {
    return {
      ok: false,
      code: 'due',
      title: 'Backup is due now',
      detail: pending.type === 'hourly'
        ? 'The hourly recovery backup has not completed yet. Keep this page open or run a backup now.'
        : 'The scheduled daily backup has not completed yet. Keep this page open or run a backup now.',
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

  return {
    ok: true,
    code: 'ok',
    title: 'Backups connected',
    detail: 'Folder backup is connected.',
    action: '',
  };
}
