const KEYS = {
  EXERCISES: 'pem_exercises',
  SESSIONS:  'pem_sessions',
  SETTINGS:  'pem_settings',
  EVENTS:    'pem_events',
  ACTIVITYWATCH: 'pem_activitywatch',
};

const STORAGE_LABELS = {
  [KEYS.EXERCISES]: 'Exercises',
  [KEYS.SESSIONS]: 'Session logs',
  [KEYS.SETTINGS]: 'Settings',
  [KEYS.EVENTS]: 'Timeline',
  [KEYS.ACTIVITYWATCH]: 'ActivityWatch',
};
const APP_STORAGE_KEYS = Object.values(KEYS);
const STORAGE_TIER_GROWING_BYTES = 2 * 1024 * 1024;
const STORAGE_TIER_WATCH_BYTES = 4 * 1024 * 1024;
const PEM_STORAGE_TEST_LABELS = {
  quota: 'Quota failure',
  quota_once: 'Quota once',
  unavailable: 'Storage unavailable',
  import_fail: 'Import rollback',
  image_quota: 'Image quota',
};
const PEM_STORAGE_TEST_DETAILS = {
  quota: {
    title: 'All saves fail test active',
    detail: 'Every app-data save is intentionally blocked. Change a setting; the app should warn you and the change should not stick after reload.',
    summary: 'All saves fail',
  },
  quota_once: {
    title: 'Next save fails once test active',
    detail: 'The next app-data save is intentionally blocked once. Try changing a setting; the app should warn you, then later saves should work again.',
    summary: 'Next save fails once',
  },
  unavailable: {
    title: 'Browser storage blocked test active',
    detail: 'The app is acting like browser storage is unavailable. It should show a strong warning and point you toward downloading a JSON backup.',
    summary: 'Browser storage blocked',
  },
  import_fail: {
    title: 'Import rollback test active',
    detail: 'Now import a valid JSON backup. The app should fail partway through and restore your previous data.',
    summary: 'Import rollback',
  },
  image_quota: {
    title: 'Image storage full test active',
    detail: 'Now add or import an exercise image. The app should show a storage-full message and not save the image.',
    summary: 'Image storage full',
  },
};
const pemStorageTest = initializePemStorageTestMode();
const localStorageAvailability = probeLocalStorageAvailability();
let storageWriteContext = '';

function initializePemStorageTestMode() {
  const mode = new URLSearchParams(window.location.search).get('pem_test') || '';
  const allowedModes = new Set(Object.keys(PEM_STORAGE_TEST_LABELS));
  const test = {
    mode: allowedModes.has(mode) ? mode : '',
    quotaOnceUsed: false,
    quotaOnceReady: false,
    importActive: false,
    importWriteCount: 0,
  };
  if (test.mode) {
    console.warn(`[PEM test mode] ${test.mode} is active. Storage behavior is being simulated for testing.`);
  }
  return test;
}

function getActivePemStorageTestMode() {
  return pemStorageTest.mode;
}

function pemStorageTestModeLabel(mode = pemStorageTest.mode) {
  return PEM_STORAGE_TEST_LABELS[mode] || '';
}

function pemStorageTestModeInfo(mode = pemStorageTest.mode) {
  if (!mode || !PEM_STORAGE_TEST_LABELS[mode]) return null;
  return {
    mode,
    label: PEM_STORAGE_TEST_LABELS[mode],
    ...(PEM_STORAGE_TEST_DETAILS[mode] || {}),
  };
}

function activatePemStorageTestMode(mode) {
  if (!PEM_STORAGE_TEST_LABELS[mode]) return;
  const info = pemStorageTestModeInfo(mode);
  if (!confirm(`Reload this app in the current tab with the "${info.label}" storage test mode?\n\n${info.detail}\n\nThis keeps the same browser origin and saved app data, but adds pem_test=${mode} to the URL until you return to normal mode.`)) return;
  const url = new URL(window.location.href);
  url.searchParams.set('pem_test', mode);
  window.location.href = url.href;
}

function clearPemStorageTestMode() {
  const url = new URL(window.location.href);
  if (!url.searchParams.has('pem_test')) return;
  if (!confirm('Reload this app in normal mode?\n\nThis removes pem_test from the current URL.')) return;
  url.searchParams.delete('pem_test');
  window.location.href = url.href;
}

function markStorageTestsReadyForUserActions() {
  pemStorageTest.quotaOnceReady = true;
}

function probeLocalStorageAvailability() {
  if (pemStorageTest.mode === 'unavailable') {
    return {
      available: false,
      error: 'Simulated unavailable browser storage.',
    };
  }
  try {
    const probeKey = 'pem_storage_probe';
    localStorage.setItem(probeKey, '1');
    localStorage.removeItem(probeKey);
    return { available: true, error: '' };
  } catch (err) {
    return {
      available: false,
      error: storageErrorMessage(err),
    };
  }
}

function safeGetLocalStorageItem(key) {
  try {
    return localStorage.getItem(key);
  } catch (err) {
    recordStorageFailure({
      key,
      label: STORAGE_LABELS[key] || key,
      size: 0,
      error: err,
    });
    scheduleStorageHealthRender();
    return null;
  }
}

function safeSetLocalStorageItem(key, jsonString, label = STORAGE_LABELS[key] || key) {
  if (typeof jsonString !== 'string') {
    throw new TypeError('safeSetLocalStorageItem expects an already-stringified string.');
  }

  const size = byteLength(jsonString);
  recordStorageAttempt({ key, label, size });

  try {
    const testError = storageTestErrorForWrite(key);
    if (testError) throw testError;
    if (!localStorageAvailability.available) {
      const err = new Error(localStorageAvailability.error || 'Browser storage is unavailable.');
      err.name = 'SecurityError';
      throw err;
    }
    localStorage.setItem(key, jsonString);
    recordStorageSuccess({ key, label, size });
    scheduleStorageHealthRender();
  } catch (err) {
    recordStorageFailure({ key, label, size, error: err });
    scheduleStorageHealthRender();
    throw err;
  }
}

function storageTestErrorForWrite(key) {
  if (pemStorageTest.mode === 'quota') return createQuotaExceededError();
  if (pemStorageTest.mode === 'quota_once' && pemStorageTest.quotaOnceReady && !pemStorageTest.quotaOnceUsed) {
    pemStorageTest.quotaOnceUsed = true;
    return createQuotaExceededError();
  }
  if (pemStorageTest.mode === 'import_fail' && pemStorageTest.importActive) {
    pemStorageTest.importWriteCount += 1;
    if (pemStorageTest.importWriteCount === 3) return createQuotaExceededError();
  }
  if (pemStorageTest.mode === 'image_quota' && storageWriteContext === 'image' && key === KEYS.EXERCISES) {
    return createQuotaExceededError();
  }
  return null;
}

function createQuotaExceededError() {
  try {
    return new DOMException('Simulated storage quota exceeded.', 'QuotaExceededError');
  } catch (_) {
    const err = new Error('Simulated storage quota exceeded.');
    err.name = 'QuotaExceededError';
    return err;
  }
}

function withStorageWriteContext(context, callback) {
  const previous = storageWriteContext;
  storageWriteContext = context;
  try {
    return callback();
  } finally {
    storageWriteContext = previous;
  }
}

function beginImportStorageTest() {
  pemStorageTest.importActive = true;
  pemStorageTest.importWriteCount = 0;
}

function endImportStorageTest() {
  pemStorageTest.importActive = false;
}

function getOriginalAppStorageValues() {
  return APP_STORAGE_KEYS.reduce((values, key) => {
    values[key] = safeGetLocalStorageItem(key);
    return values;
  }, {});
}

function restoreAppStorageValues(originalValues) {
  APP_STORAGE_KEYS.forEach(key => {
    try {
      if (originalValues[key] === null || originalValues[key] === undefined) {
        localStorage.removeItem(key);
      } else {
        localStorage.setItem(key, originalValues[key]);
      }
    } catch (err) {
      recordStorageFailure({
        key,
        label: STORAGE_LABELS[key] || key,
        size: byteLength(originalValues[key] || ''),
        error: err,
      });
    }
  });
  scheduleStorageHealthRender();
}

function recordStorageAttempt(attempt) {
  if (typeof storageHealth !== 'object' || !storageHealth) return;
  storageHealth.lastAttempt = {
    at: new Date().toISOString(),
    key: attempt.key,
    label: attempt.label,
    size: attempt.size,
  };
}

function recordStorageSuccess(success) {
  if (typeof storageHealth !== 'object' || !storageHealth) return;
  storageHealth.lastSuccess = {
    at: new Date().toISOString(),
    key: success.key,
    label: success.label,
    size: success.size,
  };
  storageHealth.lastFailure = null;
  storageHealth.simulatedFailure = false;
}

function recordStorageFailure(failure) {
  if (typeof storageHealth !== 'object' || !storageHealth) return;
  storageHealth.lastAttempt = {
    at: new Date().toISOString(),
    key: failure.key,
    label: failure.label,
    size: failure.size,
  };
  storageHealth.lastFailure = {
    at: new Date().toISOString(),
    key: failure.key,
    label: failure.label,
    size: failure.size,
    error: storageErrorMessage(failure.error),
    errorName: failure.error?.name || '',
    quota: isStorageQuotaError(failure.error),
  };
}

function scheduleStorageHealthRender() {
  window.setTimeout(() => {
    if (typeof renderAutoBackupSettings === 'function') {
      renderAutoBackupSettings();
    }
  }, 0);
}

function getStorageHealthIssue() {
  if (typeof storageHealth !== 'object' || !storageHealth) return null;
  const activeTest = pemStorageTestModeInfo();
  if (!localStorageAvailability.available) {
    return {
      ok: false,
      code: 'storage-unavailable',
      title: activeTest?.mode === 'unavailable' ? activeTest.title : 'Browser storage is unavailable',
      detail: activeTest?.mode === 'unavailable'
        ? activeTest.detail
        : localStorageAvailability.error || 'This browser is not allowing saved app data right now. Download JSON now to protect the current data.',
      action: 'Open Data Health',
    };
  }
  if (storageHealth.lastFailure) {
    const failure = storageHealth.lastFailure;
    return {
      ok: false,
      code: 'storage-failure',
      title: 'Save failed',
      detail: activeTest
        ? `${activeTest.title}. ${failure.label || 'App data'} did not save (${formatBytes(failure.size)}), which may be the expected test result. ${activeTest.detail}`
        : `${failure.label || 'App data'} did not save (${formatBytes(failure.size)}). ${failure.error || 'Download JSON now to protect the current data.'}`,
      action: 'Open Data Health',
    };
  }
  if (storageHealth.simulatedFailure) {
    return {
      ok: false,
      code: 'storage-test',
      title: 'Test save warning',
      detail: 'This is a non-destructive simulated save warning. Use Download JSON to test the emergency export action, or dismiss it in Data Health settings.',
      action: 'Open Data Health',
    };
  }
  if (activeTest) {
    return {
      ok: false,
      code: 'storage-test-mode',
      title: activeTest.title,
      detail: activeTest.detail,
      action: 'Open Data Health',
    };
  }
  return null;
}

function simulateStorageFailureWarning() {
  if (typeof storageHealth !== 'object' || !storageHealth) return;
  storageHealth.simulatedFailure = true;
  if (typeof renderAutoBackupSettings === 'function') renderAutoBackupSettings();
}

function dismissSimulatedStorageFailureWarning() {
  if (typeof storageHealth !== 'object' || !storageHealth) return;
  storageHealth.simulatedFailure = false;
  if (typeof renderAutoBackupSettings === 'function') renderAutoBackupSettings();
}

function isStorageQuotaError(err) {
  return err?.name === 'QuotaExceededError' ||
    err?.name === 'NS_ERROR_DOM_QUOTA_REACHED' ||
    err?.code === 22 ||
    err?.code === 1014 ||
    /quota/i.test(storageErrorMessage(err));
}

function storageErrorMessage(err) {
  if (!err) return 'Unknown storage error.';
  return err.message || String(err);
}

function byteLength(value) {
  const stringValue = String(value ?? '');
  if (window.TextEncoder) return new TextEncoder().encode(stringValue).length;
  return new Blob([stringValue]).size;
}

function formatBytes(bytes) {
  const size = Math.max(0, Number(bytes) || 0);
  if (size < 1024) return `${formatNumber(size)} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(size < 10 * 1024 ? 1 : 0)} KB`;
  return `${(size / (1024 * 1024)).toFixed(2)} MB`;
}

function appStorageTier(totalBytes) {
  const total = Number(totalBytes) || 0;
  if (total >= STORAGE_TIER_WATCH_BYTES) {
    return {
      code: 'watch',
      label: 'Watch',
      detail: 'Large browser data. Keep folder or JSON backups current, especially before adding images.',
    };
  }
  if (total >= STORAGE_TIER_GROWING_BYTES) {
    return {
      code: 'growing',
      label: 'Growing',
      detail: 'Browser data is growing. Images usually account for most storage usage.',
    };
  }
  return {
    code: 'ok',
    label: 'OK',
    detail: 'Browser data is in the normal range.',
  };
}

function getAppStorageUsageReport() {
  const keys = APP_STORAGE_KEYS.map(key => {
    if (!localStorageAvailability.available) {
      return {
        key,
        label: STORAGE_LABELS[key] || key,
        bytes: 0,
        text: 'Unavailable',
      };
    }
    const value = safeGetLocalStorageItem(key);
    const bytes = value === null ? 0 : byteLength(value);
    return {
      key,
      label: STORAGE_LABELS[key] || key,
      bytes,
      text: formatBytes(bytes),
    };
  });
  const totalBytes = keys.reduce((sum, item) => sum + item.bytes, 0);
  return {
    available: localStorageAvailability.available,
    error: localStorageAvailability.error,
    keys,
    totalBytes,
    totalText: formatBytes(totalBytes),
    tier: localStorageAvailability.available
      ? appStorageTier(totalBytes)
      : {
          code: 'unavailable',
          label: 'Unavailable',
          detail: localStorageAvailability.error || 'Browser storage is unavailable.',
        },
  };
}

async function getBrowserStorageEstimate() {
  if (!navigator.storage || typeof navigator.storage.estimate !== 'function') {
    return { available: false, detail: 'Browser origin estimate unavailable.' };
  }
  try {
    const estimate = await navigator.storage.estimate();
    const usage = Number(estimate.usage) || 0;
    const quota = Number(estimate.quota) || 0;
    return {
      available: true,
      usage,
      quota,
      usageText: formatBytes(usage),
      quotaText: quota ? formatBytes(quota) : 'Unknown',
      detail: quota
        ? `${formatBytes(usage)} used of ${formatBytes(quota)} for this browser origin.`
        : `${formatBytes(usage)} used by this browser origin.`,
    };
  } catch (err) {
    return {
      available: false,
      detail: `Browser origin estimate unavailable: ${storageErrorMessage(err)}`,
    };
  }
}

function defaultAutoBackupSettings() {
  return {
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
}

function normalizeAutoBackupSettings(value = {}) {
  const defaults = defaultAutoBackupSettings();
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const time = isValidStoredTime(source.time) ? source.time : defaults.time;
  const history = Array.isArray(source.history)
    ? source.history.filter(item => item && typeof item === 'object').slice(0, 20)
    : defaults.history;

  return {
    ...defaults,
    ...source,
    time,
    folderName: typeof source.folderName === 'string' ? source.folderName : defaults.folderName,
    lastScheduledBackupDate: typeof source.lastScheduledBackupDate === 'string' ? source.lastScheduledBackupDate : defaults.lastScheduledBackupDate,
    lastSuccessAt: typeof source.lastSuccessAt === 'string' ? source.lastSuccessAt : defaults.lastSuccessAt,
    lastErrorAt: typeof source.lastErrorAt === 'string' ? source.lastErrorAt : defaults.lastErrorAt,
    lastError: typeof source.lastError === 'string' ? source.lastError : defaults.lastError,
    needsReconnect: Boolean(source.needsReconnect),
    lastMissedBackupDate: typeof source.lastMissedBackupDate === 'string' ? source.lastMissedBackupDate : defaults.lastMissedBackupDate,
    lastVerifiedAt: typeof source.lastVerifiedAt === 'string' ? source.lastVerifiedAt : defaults.lastVerifiedAt,
    lastVerifiedFile: typeof source.lastVerifiedFile === 'string' ? source.lastVerifiedFile : defaults.lastVerifiedFile,
    lastVerifiedSummary: source.lastVerifiedSummary && typeof source.lastVerifiedSummary === 'object' && !Array.isArray(source.lastVerifiedSummary)
      ? source.lastVerifiedSummary
      : defaults.lastVerifiedSummary,
    history,
  };
}

function isValidStoredTime(timeStr) {
  if (typeof timeStr !== 'string') return false;
  const match = /^(\d{2}):(\d{2})$/.exec(timeStr);
  if (!match) return false;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  return hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59;
}

function loadExercises() {
  const raw = safeGetLocalStorageItem(KEYS.EXERCISES);
  if (!raw) {
    const exercises = DEFAULT_EXERCISES.map(e => ({ ...e }));
    try {
      saveExercises(exercises);
    } catch (err) {
      console.error('Could not seed default exercises.', err);
    }
    return exercises;
  }
  return JSON.parse(raw);
}

function saveExercises(exercises) {
  safeSetLocalStorageItem(KEYS.EXERCISES, JSON.stringify(exercises), STORAGE_LABELS[KEYS.EXERCISES]);
}

function loadSessions() {
  const raw = safeGetLocalStorageItem(KEYS.SESSIONS);
  return raw ? JSON.parse(raw) : {};
}

function saveSession(dateStr, sessionData) {
  const sessions = loadSessions();
  sessions[dateStr] = sessionData;
  safeSetLocalStorageItem(KEYS.SESSIONS, JSON.stringify(sessions), STORAGE_LABELS[KEYS.SESSIONS]);
}

function loadSettings() {
  const raw = safeGetLocalStorageItem(KEYS.SETTINGS);
  if (!raw) {
    const defaults = {
      createdAt: toDateStr(new Date()),
      setCueSound: true,
      setCueVibrate: true,
      setCueSpeech: false,
      setCueSpeechVolume: 1,
      personalDayStartTime: '07:00',
      timelineRange: 'past-30-days',
      autoBackup: defaultAutoBackupSettings(),
    };
    try {
      saveSettings(defaults);
    } catch (err) {
      console.error('Could not seed default settings.', err);
    }
    return defaults;
  }
  const loaded = sanitizeLegacySettings({
    setCueSound: true,
    setCueVibrate: true,
    setCueSpeech: false,
    setCueSpeechVolume: 1,
    personalDayStartTime: '07:00',
    timelineRange: 'past-30-days',
    autoBackup: defaultAutoBackupSettings(),
    ...JSON.parse(raw),
  });
  loaded.setCueSpeechVolume = clampSetCueSpeechVolume(loaded.setCueSpeechVolume);
  loaded.autoBackup = normalizeAutoBackupSettings(loaded.autoBackup);
  return loaded;
}

function saveSettings(settings) {
  const cleanSettings = sanitizeLegacySettings(settings);
  const nextSettings = {
    ...cleanSettings,
    setCueSpeechVolume: clampSetCueSpeechVolume(cleanSettings.setCueSpeechVolume),
    timelineRange: normalizeStoredTimelineRange(cleanSettings.timelineRange),
    autoBackup: normalizeAutoBackupSettings(cleanSettings.autoBackup),
  };
  safeSetLocalStorageItem(KEYS.SETTINGS, JSON.stringify(nextSettings), STORAGE_LABELS[KEYS.SETTINGS]);
}

function sanitizeLegacySettings(value) {
  const settings = { ...(value || {}) };
  delete settings.legsDays;
  delete settings.denseMode;
  delete settings.collapsedGroups;
  settings.timelineRange = normalizeStoredTimelineRange(settings.timelineRange);
  return settings;
}

function normalizeStoredTimelineRange(value) {
  return [
    'past-7-days',
    'past-30-days',
    'past-90-days',
    'past-year',
    'all-time',
  ].includes(value) ? value : 'past-30-days';
}

function clampSetCueSpeechVolume(value) {
  const volume = Number(value);
  if (!Number.isFinite(volume)) return 1;
  return Math.max(0, Math.min(1, volume));
}

function loadEvents() {
  const raw = safeGetLocalStorageItem(KEYS.EVENTS);
  return raw ? JSON.parse(raw) : [];
}

function saveEvents(events) {
  safeSetLocalStorageItem(KEYS.EVENTS, JSON.stringify(events), STORAGE_LABELS[KEYS.EVENTS]);
}

// ISO date string helpers — uses LOCAL time (not UTC) so dates match what the user sees
function toDateStr(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function dateFromStr(str) {
  // Parse as local date (not UTC) to avoid off-by-one on midnight
  const [y, m, d] = str.split('-').map(Number);
  return new Date(y, m - 1, d);
}
