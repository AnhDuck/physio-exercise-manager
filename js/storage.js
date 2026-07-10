const KEYS = {
  EXERCISES: 'pem_exercises',
  SESSIONS:  'pem_sessions',
  SETTINGS:  'pem_settings',
  EVENTS:    'pem_events',
  ACTIVITYWATCH: 'pem_activitywatch',
  WORKLOAD: 'pem_workload',
};

const STORAGE_LABELS = {
  [KEYS.EXERCISES]: 'Exercises',
  [KEYS.SESSIONS]: 'Session logs',
  [KEYS.SETTINGS]: 'Settings',
  [KEYS.EVENTS]: 'Timeline',
  [KEYS.ACTIVITYWATCH]: 'ActivityWatch',
  [KEYS.WORKLOAD]: 'Timed work',
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
const initialAppStoragePresence = captureInitialAppStoragePresence();
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

function captureInitialAppStoragePresence() {
  return APP_STORAGE_KEYS.reduce((presence, key) => {
    try {
      presence[key] = localStorage.getItem(key) !== null;
    } catch (_) {
      presence[key] = false;
    }
    return presence;
  }, {});
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

function safeParseStorageJson(key, raw, fallback, label = STORAGE_LABELS[key] || key) {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw);
  } catch (err) {
    recordStorageReadFailure({
      key,
      label,
      size: byteLength(raw),
      error: err,
    });
    scheduleStorageHealthRender();
    console.error(`Could not read ${label} from browser storage. The stored value was left untouched.`, err);
    return fallback;
  }
}

function safeSetLocalStorageItem(key, jsonString, label = STORAGE_LABELS[key] || key, options = {}) {
  if (typeof jsonString !== 'string') {
    throw new TypeError('safeSetLocalStorageItem expects an already-stringified string.');
  }

  const size = byteLength(jsonString);
  recordStorageAttempt({ key, label, size });

  try {
    if (storageKeyHasReadFailure(key) && !options.allowCorruptOverwrite) {
      throw createCorruptStorageOverwriteError(label);
    }
    const testError = storageTestErrorForWrite(key);
    if (testError) throw testError;
    if (!localStorageAvailability.available) {
      const err = new Error(localStorageAvailability.error || 'Browser storage is unavailable.');
      err.name = 'SecurityError';
      throw err;
    }
    localStorage.setItem(key, jsonString);
    clearStorageReadFailure(key);
    recordStorageSuccess({ key, label, size });
    scheduleStorageHealthRender();
    if (options.mirror !== false && typeof scheduleAutoBackupLiveMirror === 'function') {
      scheduleAutoBackupLiveMirror(`save:${key}`);
    }
  } catch (err) {
    recordStorageFailure({ key, label, size, error: err });
    scheduleStorageHealthRender();
    throw err;
  }
}

function createCorruptStorageOverwriteError(label) {
  const err = new Error(`${label || 'App data'} could not be read from browser storage, so PEM blocked this save to avoid overwriting the corrupt value. Open Data Health, download JSON, then import a known-good backup or inspect browser localStorage.`);
  err.name = 'CorruptStorageOverwriteBlocked';
  return err;
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

function recordStorageReadFailure(failure) {
  if (typeof storageHealth !== 'object' || !storageHealth) return;
  if (!storageHealth.readFailures || typeof storageHealth.readFailures !== 'object') {
    storageHealth.readFailures = {};
  }
  storageHealth.readFailures[failure.key] = {
    at: new Date().toISOString(),
    key: failure.key,
    label: failure.label,
    size: failure.size,
    error: storageErrorMessage(failure.error),
    errorName: failure.error?.name || '',
  };
}

function storageKeyHasReadFailure(key) {
  return Boolean(storageHealth?.readFailures?.[key]);
}

function storageReadFailureList() {
  if (!storageHealth?.readFailures || typeof storageHealth.readFailures !== 'object') return [];
  return Object.values(storageHealth.readFailures);
}

function firstStorageReadFailure() {
  return storageReadFailureList()
    .sort((a, b) => String(a.at || '').localeCompare(String(b.at || '')))[0] || null;
}

function clearStorageReadFailure(key) {
  if (!storageHealth?.readFailures || typeof storageHealth.readFailures !== 'object') return;
  delete storageHealth.readFailures[key];
}

function snapshotStorageReadFailures() {
  return storageHealth?.readFailures && typeof storageHealth.readFailures === 'object'
    ? JSON.parse(JSON.stringify(storageHealth.readFailures))
    : {};
}

function restoreStorageReadFailures(readFailures) {
  if (typeof storageHealth !== 'object' || !storageHealth) return;
  storageHealth.readFailures = readFailures && typeof readFailures === 'object' && !Array.isArray(readFailures)
    ? JSON.parse(JSON.stringify(readFailures))
    : {};
}

function createStorageTransactionError(message, cause, rollbackErrors = []) {
  const error = new Error(message);
  error.name = 'StorageTransactionError';
  error.code = 'storage-transaction-failed';
  error.cause = cause || null;
  error.rollbackErrors = rollbackErrors;
  return error;
}

function snapshotRawAppStorageValues(keys) {
  const values = {};
  for (const key of keys) {
    try {
      const raw = localStorage.getItem(key);
      values[key] = { present: raw !== null, raw };
    } catch (err) {
      throw createStorageTransactionError(
        `Could not read ${STORAGE_LABELS[key] || key} before replacing app data.`,
        err
      );
    }
  }
  return values;
}

function restoreRawAppStorageValues(values) {
  const rollbackErrors = [];
  Object.entries(values || {}).forEach(([key, snapshot]) => {
    try {
      if (snapshot?.present) {
        localStorage.setItem(key, snapshot.raw);
      } else {
        localStorage.removeItem(key);
      }
    } catch (err) {
      rollbackErrors.push({
        key,
        label: STORAGE_LABELS[key] || key,
        error: err,
      });
      recordStorageFailure({
        key,
        label: STORAGE_LABELS[key] || key,
        size: byteLength(snapshot?.raw || ''),
        error: err,
      });
    }
  });
  return rollbackErrors;
}

function replaceAppStorageValuesAtomically(valuesByKey, options = {}) {
  const values = valuesByKey && typeof valuesByKey === 'object' && !Array.isArray(valuesByKey)
    ? valuesByKey
    : {};
  const keys = Object.keys(values).filter(key => APP_STORAGE_KEYS.includes(key));
  if (!keys.length) {
    return { ok: true, keys: [] };
  }

  const originalReadFailures = snapshotStorageReadFailures();
  let originalValues;
  try {
    originalValues = snapshotRawAppStorageValues(keys);
  } catch (err) {
    restoreStorageReadFailures(originalReadFailures);
    throw err;
  }

  const previousReplaceState = autoBackupStorageReplaceActive;
  autoBackupStorageReplaceActive = true;
  try {
    keys.forEach(key => {
      const raw = values[key];
      if (typeof raw !== 'string') {
        throw new TypeError(`Storage transaction value for ${key} must be a string.`);
      }
      safeSetLocalStorageItem(
        key,
        raw,
        STORAGE_LABELS[key] || key,
        {
          ...(options.safeSetOptions || {}),
          mirror: false,
        }
      );
    });
  } catch (err) {
    const rollbackErrors = restoreRawAppStorageValues(originalValues);
    restoreStorageReadFailures(originalReadFailures);
    autoBackupStorageReplaceActive = previousReplaceState;
    throw createStorageTransactionError(
      'The browser storage transaction failed and the previous app data was restored.',
      err,
      rollbackErrors
    );
  }

  autoBackupStorageReplaceActive = previousReplaceState;
  if (options.mirror !== false && typeof scheduleAutoBackupLiveMirror === 'function') {
    scheduleAutoBackupLiveMirror(options.mirrorTrigger || 'storage-transaction');
  }
  scheduleStorageHealthRender();
  return { ok: true, keys };
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
  const readFailure = firstStorageReadFailure();
  if (readFailure) {
    const readFailureCount = storageReadFailureList().length;
    const more = readFailureCount > 1 ? ` and ${formatNumber(readFailureCount - 1)} other storage key${readFailureCount === 2 ? '' : 's'}` : '';
    return {
      ok: false,
      code: 'storage-read-failure',
      title: 'Saved data could not be read',
      detail: `${readFailure.label || 'App data'}${more} contains malformed JSON. PEM is using safe fallback data for this page load and has blocked saves to that key so the corrupt value is not overwritten. Download JSON, then import a known-good backup or inspect browser localStorage.`,
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
    lastHourlyBackupHour: '',
    lastSuccessAt: '',
    lastErrorAt: '',
    lastError: '',
    needsReconnect: false,
    lastMissedBackupDate: '',
    lastMissedHourlyBackupHour: '',
    lastVerifiedAt: '',
    lastVerifiedFile: '',
    lastVerifiedSummary: null,
    history: [],
  };
}

function normalizeAutoBackupSettings(value = {}) {
  const defaults = defaultAutoBackupSettings();
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const time = normalizeTimeStr(source.time) || defaults.time;
  const history = Array.isArray(source.history)
    ? source.history.filter(item => item && typeof item === 'object').slice(0, 20)
    : defaults.history;

  return {
    ...defaults,
    ...source,
    time,
    folderName: typeof source.folderName === 'string' ? source.folderName : defaults.folderName,
    lastScheduledBackupDate: typeof source.lastScheduledBackupDate === 'string' ? source.lastScheduledBackupDate : defaults.lastScheduledBackupDate,
    lastHourlyBackupHour: typeof source.lastHourlyBackupHour === 'string' ? source.lastHourlyBackupHour : defaults.lastHourlyBackupHour,
    lastSuccessAt: typeof source.lastSuccessAt === 'string' ? source.lastSuccessAt : defaults.lastSuccessAt,
    lastErrorAt: typeof source.lastErrorAt === 'string' ? source.lastErrorAt : defaults.lastErrorAt,
    lastError: typeof source.lastError === 'string' ? source.lastError : defaults.lastError,
    needsReconnect: Boolean(source.needsReconnect),
    lastMissedBackupDate: typeof source.lastMissedBackupDate === 'string' ? source.lastMissedBackupDate : defaults.lastMissedBackupDate,
    lastMissedHourlyBackupHour: typeof source.lastMissedHourlyBackupHour === 'string' ? source.lastMissedHourlyBackupHour : defaults.lastMissedHourlyBackupHour,
    lastVerifiedAt: typeof source.lastVerifiedAt === 'string' ? source.lastVerifiedAt : defaults.lastVerifiedAt,
    lastVerifiedFile: typeof source.lastVerifiedFile === 'string' ? source.lastVerifiedFile : defaults.lastVerifiedFile,
    lastVerifiedSummary: source.lastVerifiedSummary && typeof source.lastVerifiedSummary === 'object' && !Array.isArray(source.lastVerifiedSummary)
      ? source.lastVerifiedSummary
      : defaults.lastVerifiedSummary,
    history,
  };
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
  return safeParseStorageJson(KEYS.EXERCISES, raw, DEFAULT_EXERCISES.map(e => ({ ...e })));
}

function saveExercises(exercises) {
  safeSetLocalStorageItem(KEYS.EXERCISES, JSON.stringify(exercises), STORAGE_LABELS[KEYS.EXERCISES]);
}

function loadSessions() {
  const raw = safeGetLocalStorageItem(KEYS.SESSIONS);
  return safeParseStorageJson(KEYS.SESSIONS, raw, {});
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
      armRotationEnabled: false,
      exerciseGroups: defaultExerciseGroupSettings(),
      timelineRange: 'past-30-days',
      homeCards: defaultHomeCardsSettings(),
      autoBackup: defaultAutoBackupSettings(),
      dataSchemaVersion: typeof CURRENT_DATA_SCHEMA_VERSION === 'number' ? CURRENT_DATA_SCHEMA_VERSION : 0,
    };
    try {
      saveSettings(defaults);
    } catch (err) {
      console.error('Could not seed default settings.', err);
    }
    return defaults;
  }
  const stored = safeParseStorageJson(KEYS.SETTINGS, raw, {});
  const loaded = sanitizeLegacySettings({
    setCueSound: true,
    setCueVibrate: true,
    setCueSpeech: false,
    setCueSpeechVolume: 1,
    personalDayStartTime: '07:00',
    armRotationEnabled: false,
    exerciseGroups: defaultExerciseGroupSettings(),
    timelineRange: 'past-30-days',
    homeCards: defaultHomeCardsSettings(),
    autoBackup: defaultAutoBackupSettings(),
    ...stored,
  });
  if (Object.prototype.hasOwnProperty.call(stored, 'dataSchemaVersion')) {
    loaded.dataSchemaVersion = Number.isInteger(stored.dataSchemaVersion) && stored.dataSchemaVersion >= 0
      ? stored.dataSchemaVersion
      : 0;
  } else {
    delete loaded.dataSchemaVersion;
  }
  loaded.personalDayStartTime = normalizeTimeStr(loaded.personalDayStartTime) || DEFAULT_PERSONAL_DAY_START_TIME;
  loaded.setCueSpeechVolume = clampSetCueSpeechVolume(loaded.setCueSpeechVolume);
  loaded.homeCards = normalizeHomeCardsSettings(loaded.homeCards);
  loaded.autoBackup = normalizeAutoBackupSettings(loaded.autoBackup);
  return loaded;
}

function saveSettings(settings) {
  const cleanSettings = sanitizeLegacySettings(settings);
  const nextSettings = {
    ...cleanSettings,
    setCueSpeechVolume: clampSetCueSpeechVolume(cleanSettings.setCueSpeechVolume),
    armRotationEnabled: Boolean(cleanSettings.armRotationEnabled),
    exerciseGroups: normalizeExerciseGroupSettings(cleanSettings.exerciseGroups),
    timelineRange: normalizeStoredTimelineRange(cleanSettings.timelineRange),
    homeCards: normalizeHomeCardsSettings(cleanSettings.homeCards),
    autoBackup: normalizeAutoBackupSettings(cleanSettings.autoBackup),
  };
  if (Object.prototype.hasOwnProperty.call(cleanSettings, 'dataSchemaVersion')) {
    nextSettings.dataSchemaVersion = Number.isInteger(cleanSettings.dataSchemaVersion) && cleanSettings.dataSchemaVersion >= 0
      ? cleanSettings.dataSchemaVersion
      : 0;
  }
  safeSetLocalStorageItem(KEYS.SETTINGS, JSON.stringify(nextSettings), STORAGE_LABELS[KEYS.SETTINGS]);
}

function sanitizeLegacySettings(value) {
  const settings = { ...(value || {}) };
  delete settings.legsDays;
  delete settings.denseMode;
  delete settings.collapsedGroups;
  settings.armRotationEnabled = Boolean(settings.armRotationEnabled);
  settings.exerciseGroups = normalizeExerciseGroupSettings(settings.exerciseGroups);
  settings.timelineRange = normalizeStoredTimelineRange(settings.timelineRange);
  settings.personalDayStartTime = normalizeTimeStr(settings.personalDayStartTime) || DEFAULT_PERSONAL_DAY_START_TIME;
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

function defaultHomeCardsSettings() {
  return {
    weather: {
      enabled: true,
      refreshMinutes: 5,
      location: null,
      searchText: '',
      lastResult: null,
      lastError: '',
      lastErrorAt: '',
      lastRequestAt: '',
      rateLimitUntil: '',
      airQualityEnabled: true,
      alertsEnabled: true,
      previewMode: 'live',
    },
    activityWatchMini: {
      enabled: true,
      refreshMinutes: 5,
      categoryMode: 'top',
    },
    workload: {
      enabled: true,
      runningBorderEnabled: true,
      reminderMinutes: 15,
      reminderSound: 'soft-chime',
    },
  };
}

function normalizeHomeCardsSettings(value = {}) {
  const defaults = defaultHomeCardsSettings();
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  return {
    weather: normalizeWeatherCardSettings(source.weather, defaults.weather),
    activityWatchMini: normalizeActivityWatchMiniSettings(source.activityWatchMini, defaults.activityWatchMini),
    workload: normalizeWorkloadCardSettings(source.workload, defaults.workload),
  };
}

function normalizeWeatherCardSettings(value = {}, defaults = defaultHomeCardsSettings().weather) {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  return {
    ...defaults,
    ...source,
    enabled: source.enabled !== false,
    refreshMinutes: clampRefreshMinutes(source.refreshMinutes, defaults.refreshMinutes, 5, 60),
    location: normalizeWeatherLocation(source.location),
    searchText: typeof source.searchText === 'string' ? source.searchText : defaults.searchText,
    lastResult: normalizeWeatherLastResult(source.lastResult),
    lastError: typeof source.lastError === 'string' ? source.lastError : defaults.lastError,
    lastErrorAt: typeof source.lastErrorAt === 'string' ? source.lastErrorAt : defaults.lastErrorAt,
    lastRequestAt: typeof source.lastRequestAt === 'string' ? source.lastRequestAt : defaults.lastRequestAt,
    rateLimitUntil: typeof source.rateLimitUntil === 'string' ? source.rateLimitUntil : defaults.rateLimitUntil,
    airQualityEnabled: source.airQualityEnabled !== false,
    alertsEnabled: source.alertsEnabled !== false,
    previewMode: typeof source.previewMode === 'string' ? source.previewMode : defaults.previewMode,
  };
}

function normalizeActivityWatchMiniSettings(value = {}, defaults = defaultHomeCardsSettings().activityWatchMini) {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  return {
    ...defaults,
    ...source,
    enabled: source.enabled !== false,
    refreshMinutes: clampRefreshMinutes(source.refreshMinutes, defaults.refreshMinutes, 1, 30),
    categoryMode: normalizeActivityWatchMiniCategoryMode(source.categoryMode),
  };
}

function normalizeWorkloadCardSettings(value = {}, defaults = defaultHomeCardsSettings().workload) {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  return {
    ...defaults,
    ...source,
    enabled: source.enabled !== false,
    runningBorderEnabled: source.runningBorderEnabled !== false,
    reminderMinutes: normalizeWorkloadReminderMinutes(source.reminderMinutes, defaults.reminderMinutes),
    reminderSound: normalizeWorkloadReminderSound(source.reminderSound, defaults.reminderSound),
  };
}

function normalizeWorkloadReminderMinutes(value, fallback = 15) {
  const minutes = Number(value);
  return [0, 15, 20, 30].includes(minutes) ? minutes : fallback;
}

function normalizeWorkloadReminderSound(value, fallback = 'soft-chime') {
  return ['soft-chime', 'beep', 'double-tap'].includes(value) ? value : fallback;
}

function normalizeActivityWatchMiniCategoryMode(value) {
  return value === 'top' ? 'top' : 'exact';
}

function defaultWorkloadData() {
  return {
    version: 1,
    daysByDate: {},
    timer: {
      running: false,
      date: '',
      startedAt: '',
      updatedAt: '',
      elapsedSeconds: 0,
    },
  };
}

function loadWorkloadData() {
  const raw = safeGetLocalStorageItem(KEYS.WORKLOAD);
  workloadData = normalizeWorkloadDataForStorage(safeParseStorageJson(KEYS.WORKLOAD, raw, null));
  return workloadData;
}

function saveWorkloadData(options = {}) {
  workloadData = normalizeWorkloadDataForStorage(workloadData);
  safeSetLocalStorageItem(KEYS.WORKLOAD, JSON.stringify(workloadData), STORAGE_LABELS[KEYS.WORKLOAD], options);
}

function getWorkloadBackupData() {
  return normalizeWorkloadDataForStorage(workloadData);
}

function normalizeWorkloadDataForStorage(value) {
  const defaults = defaultWorkloadData();
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const daysByDate = {};
  Object.entries(source.daysByDate || {}).forEach(([dateStr, day]) => {
    if (!isValidWorkloadDate(dateStr)) return;
    const normalized = normalizeWorkloadDay(dateStr, day);
    if (normalized.totalSeconds || normalized.needsReview || normalized.reviewNote) {
      daysByDate[dateStr] = normalized;
    }
  });

  return {
    ...defaults,
    ...source,
    version: 1,
    daysByDate,
    timer: normalizeWorkloadTimer(source.timer),
  };
}

function normalizeWorkloadDay(dateStr, value = {}) {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  return {
    date: dateStr,
    totalSeconds: Math.max(0, Math.round(Number(source.totalSeconds) || 0)),
    needsReview: Boolean(source.needsReview),
    reviewNote: typeof source.reviewNote === 'string' ? source.reviewNote : '',
    updatedAt: typeof source.updatedAt === 'string' ? source.updatedAt : '',
  };
}

function normalizeWorkloadTimer(value = {}) {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const startedAt = typeof source.startedAt === 'string' && !Number.isNaN(new Date(source.startedAt).getTime())
    ? source.startedAt
    : '';
  const elapsedSeconds = Math.max(0, Math.round(Number(source.elapsedSeconds) || 0));
  return {
    running: Boolean(source.running && (startedAt || elapsedSeconds)),
    date: isValidWorkloadDate(source.date) ? source.date : '',
    startedAt,
    updatedAt: typeof source.updatedAt === 'string' ? source.updatedAt : '',
    elapsedSeconds,
  };
}

function isValidWorkloadDate(value) {
  return isValidDateStr(value);
}

function normalizeWeatherLocation(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const latitude = Number(value.latitude);
  const longitude = Number(value.longitude);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) return null;
  const name = typeof value.name === 'string' ? value.name.trim() : '';
  return {
    name: name || 'Selected location',
    admin1: typeof value.admin1 === 'string' ? value.admin1.trim() : '',
    country: typeof value.country === 'string' ? value.country.trim() : '',
    countryCode: typeof value.countryCode === 'string' ? value.countryCode.trim() : '',
    timezone: typeof value.timezone === 'string' ? value.timezone.trim() : '',
    latitude,
    longitude,
  };
}

function normalizeWeatherLastResult(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return {
    fetchedAt: typeof value.fetchedAt === 'string' ? value.fetchedAt : '',
    locationLabel: typeof value.locationLabel === 'string' ? value.locationLabel : '',
    timezone: typeof value.timezone === 'string' ? value.timezone : '',
    current: value.current && typeof value.current === 'object' && !Array.isArray(value.current)
      ? { ...value.current }
      : null,
    daily: value.daily && typeof value.daily === 'object' && !Array.isArray(value.daily)
      ? { ...value.daily }
      : null,
    airQuality: value.airQuality && typeof value.airQuality === 'object' && !Array.isArray(value.airQuality)
      ? { ...value.airQuality }
      : null,
    alerts: Array.isArray(value.alerts)
      ? value.alerts.filter(item => item && typeof item === 'object').slice(0, 6)
      : [],
    officialCondition: value.officialCondition && typeof value.officialCondition === 'object' && !Array.isArray(value.officialCondition)
      ? { ...value.officialCondition }
      : null,
    sources: value.sources && typeof value.sources === 'object' && !Array.isArray(value.sources)
      ? { ...value.sources }
      : {},
    hourly: Array.isArray(value.hourly)
      ? value.hourly.filter(item => item && typeof item === 'object').slice(0, 12)
      : [],
  };
}

function clampRefreshMinutes(value, fallback, min, max) {
  const number = Number.parseInt(value, 10);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(min, Math.min(max, number));
}

function loadEvents() {
  const raw = safeGetLocalStorageItem(KEYS.EVENTS);
  return safeParseStorageJson(KEYS.EVENTS, raw, []);
}

function saveEvents(events) {
  safeSetLocalStorageItem(KEYS.EVENTS, JSON.stringify(events), STORAGE_LABELS[KEYS.EVENTS]);
}
