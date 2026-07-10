// ActivityWatch aggregate storage model and public data accessors.

const ACTIVITYWATCH_STORE_VERSION = 1;
const ACTIVITYWATCH_DEFAULT_SERVER_URL = 'http://127.0.0.1:5600';
const ACTIVITYWATCH_RECENT_SYNC_DAYS = 3;
const ACTIVITYWATCH_QUERY_VERSION = 2;
const ACTIVITYWATCH_CATEGORY_JOINER = ' > ';

let activityWatchData = defaultActivityWatchData();

function defaultActivityWatchData() {
  return {
    version: ACTIVITYWATCH_STORE_VERSION,
    serverUrl: ACTIVITYWATCH_DEFAULT_SERVER_URL,
    host: '',
    activityWatchVersion: '',
    startOfDay: '',
    categoryColors: {},
    buckets: {
      window: '',
      afk: '',
      browsers: [],
    },
    daysByDate: {},
    status: {
      code: 'idle',
      message: 'ActivityWatch has not synced yet.',
      checkedAt: '',
      warnings: [],
    },
    lastSyncAt: '',
    lastSyncTrigger: '',
    lastErrorAt: '',
    lastError: '',
  };
}

function loadActivityWatchData() {
  const raw = safeGetLocalStorageItem(KEYS.ACTIVITYWATCH);
  activityWatchData = normalizeActivityWatchDataForStorage(safeParseStorageJson(KEYS.ACTIVITYWATCH, raw, null));
  return activityWatchData;
}

function getActivityWatchBackupData() {
  return normalizeActivityWatchDataForStorage(activityWatchData);
}

function saveActivityWatchData() {
  activityWatchData = normalizeActivityWatchDataForStorage(activityWatchData);
  safeSetLocalStorageItem(KEYS.ACTIVITYWATCH, JSON.stringify(activityWatchData), STORAGE_LABELS[KEYS.ACTIVITYWATCH]);
}

function normalizeActivityWatchDataForStorage(value) {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const defaults = defaultActivityWatchData();
  const daysByDate = {};
  Object.entries(source.daysByDate || {}).forEach(([dateStr, day]) => {
    if (!activityWatchIsValidDate(dateStr)) return;
    const normalized = normalizeActivityWatchDay(dateStr, day);
    if (normalized) daysByDate[dateStr] = normalized;
  });

  return {
    ...defaults,
    ...source,
    version: ACTIVITYWATCH_STORE_VERSION,
    serverUrl: normalizeActivityWatchServerUrl(source.serverUrl) || defaults.serverUrl,
    host: typeof source.host === 'string' ? source.host : defaults.host,
    activityWatchVersion: typeof source.activityWatchVersion === 'string' ? source.activityWatchVersion : defaults.activityWatchVersion,
    startOfDay: normalizeTimeStr(source.startOfDay) || defaults.startOfDay,
    categoryColors: normalizeStringMap(source.categoryColors),
    buckets: normalizeActivityWatchBuckets(source.buckets),
    daysByDate,
    status: normalizeActivityWatchStatus(source.status),
    lastSyncAt: typeof source.lastSyncAt === 'string' ? source.lastSyncAt : defaults.lastSyncAt,
    lastSyncTrigger: typeof source.lastSyncTrigger === 'string' ? source.lastSyncTrigger : defaults.lastSyncTrigger,
    lastErrorAt: typeof source.lastErrorAt === 'string' ? source.lastErrorAt : defaults.lastErrorAt,
    lastError: typeof source.lastError === 'string' ? source.lastError : defaults.lastError,
  };
}

function normalizeActivityWatchDay(dateStr, value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return {
    date: dateStr,
    periodStart: typeof value.periodStart === 'string' ? value.periodStart : '',
    periodEnd: typeof value.periodEnd === 'string' ? value.periodEnd : '',
    totalActiveSeconds: Math.max(0, Number(value.totalActiveSeconds) || 0),
    categoryTotals: normalizeNumberMap(value.categoryTotals),
    appTotals: normalizeNumberMap(value.appTotals),
    syncedAt: typeof value.syncedAt === 'string' ? value.syncedAt : '',
    queryVersion: Number(value.queryVersion) || ACTIVITYWATCH_QUERY_VERSION,
  };
}

function normalizeActivityWatchBuckets(value) {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  return {
    window: typeof source.window === 'string' ? source.window : '',
    afk: typeof source.afk === 'string' ? source.afk : '',
    browsers: Array.isArray(source.browsers) ? source.browsers.filter(item => typeof item === 'string') : [],
  };
}

function normalizeActivityWatchStatus(value) {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  return {
    code: typeof source.code === 'string' ? source.code : 'idle',
    message: typeof source.message === 'string' ? source.message : 'ActivityWatch has not synced yet.',
    checkedAt: typeof source.checkedAt === 'string' ? source.checkedAt : '',
    warnings: Array.isArray(source.warnings) ? source.warnings.filter(item => typeof item === 'string') : [],
  };
}

function normalizeStringMap(value) {
  const output = {};
  if (!value || typeof value !== 'object' || Array.isArray(value)) return output;
  Object.entries(value).forEach(([key, raw]) => {
    if (typeof raw === 'string') output[String(key)] = raw;
  });
  return output;
}

function normalizeNumberMap(value) {
  const output = {};
  if (!value || typeof value !== 'object' || Array.isArray(value)) return output;
  Object.entries(value).forEach(([key, raw]) => {
    const number = Number(raw);
    if (Number.isFinite(number) && number > 0) output[String(key)] = number;
  });
  return output;
}

function normalizeActivityWatchServerUrl(value) {
  const text = String(value || '').trim().replace(/\/+$/, '');
  if (!text) return '';
  try {
    const url = new URL(text);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return '';
    return url.href.replace(/\/+$/, '');
  } catch (_) {
    return '';
  }
}

function setActivityWatchServerUrl(value) {
  activityWatchData.serverUrl = normalizeActivityWatchServerUrl(value) || ACTIVITYWATCH_DEFAULT_SERVER_URL;
  saveActivityWatchData();
  renderActivityWatchSurfaces();
}

function getActivityWatchServerUrl() {
  return normalizeActivityWatchServerUrl(activityWatchData.serverUrl) || ACTIVITYWATCH_DEFAULT_SERVER_URL;
}

function getActivityWatchStatus() {
  return normalizeActivityWatchStatus(activityWatchData.status);
}

function getActivityWatchDay(dateStr) {
  return activityWatchData.daysByDate?.[dateStr] || null;
}

function buildEmptyActivityWatchDay(dateStr) {
  return {
    date: dateStr,
    periodStart: '',
    periodEnd: '',
    totalActiveSeconds: 0,
    categoryTotals: {},
    appTotals: {},
    syncedAt: '',
    queryVersion: ACTIVITYWATCH_QUERY_VERSION,
  };
}
