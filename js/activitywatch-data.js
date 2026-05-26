// ActivityWatch local API, aggregate storage, and sync orchestration.

const ACTIVITYWATCH_STORE_VERSION = 1;
const ACTIVITYWATCH_DEFAULT_SERVER_URL = 'http://127.0.0.1:5600';
const ACTIVITYWATCH_SYNC_THROTTLE_MS = 60 * 1000;
const ACTIVITYWATCH_RECENT_SYNC_DAYS = 3;
const ACTIVITYWATCH_DASHBOARD_DAYS = 30;
const ACTIVITYWATCH_QUERY_VERSION = 2;
const ACTIVITYWATCH_QUERY_CHUNK_DAYS = 14;
const ACTIVITYWATCH_FETCH_TIMEOUT_MS = 16000;
const ACTIVITYWATCH_CATEGORY_JOINER = ' > ';
const ACTIVITYWATCH_FALLBACK_COLORS = [
  '#63b3ff',
  '#f5c45a',
  '#79d6bd',
  '#c9a7ff',
  '#f87171',
  '#9ad66f',
  '#f59e0b',
  '#7dd3fc',
  '#f0abfc',
  '#a3e635',
];
const ACTIVITYWATCH_BROWSER_APPNAMES = {
  chrome: [
    'Google Chrome',
    'Google-chrome',
    'chrome.exe',
    'google-chrome-stable',
    'Chromium',
    'Chromium-browser',
    'Chromium-browser-chromium',
    'chromium.exe',
    'Google-chrome-beta',
    'Google-chrome-unstable',
    'Brave-browser',
  ],
  firefox: [
    'Firefox',
    'Firefox.exe',
    'firefox',
    'firefox.exe',
    'Firefox Developer Edition',
    'firefoxdeveloperedition',
    'Firefox-esr',
    'Firefox Beta',
    'Nightly',
    'org.mozilla.firefox',
  ],
  opera: ['opera.exe', 'Opera'],
  brave: ['brave.exe'],
  edge: ['msedge.exe', 'Microsoft Edge'],
  vivaldi: ['Vivaldi-stable', 'Vivaldi-snapshot', 'vivaldi.exe'],
};
const ACTIVITYWATCH_BROWSER_APPNAME_REGEX = {
  chrome: '(?i)^(google[-_ ]?chrome|chrome|chromium)',
  firefox: '(?i)(firefox|librewolf|waterfox|nightly)',
  opera: '(?i)(opera)',
  brave: '(?i)(brave)',
  edge: '(?i)^(microsoft[-_ ]?edge|msedge)',
  vivaldi: '(?i)(vivaldi)',
};

let activityWatchData = defaultActivityWatchData();
let activityWatchSyncPromise = null;
let activityWatchSyncProgress = defaultActivityWatchSyncProgress();

function defaultActivityWatchSyncProgress() {
  return {
    active: false,
    trigger: '',
    totalDays: 0,
    completedDays: 0,
    currentDate: '',
    currentEndDate: '',
    mode: '',
    fallbackReason: '',
    startedAt: '',
  };
}

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
  activityWatchData = normalizeActivityWatchDataForStorage(raw ? JSON.parse(raw) : null);
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
    startOfDay: activityWatchIsValidTime(source.startOfDay) ? source.startOfDay : defaults.startOfDay,
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
  const hourly = Array.from({ length: 24 }, (_, index) => normalizeNumberMap(value.hourlyCategoryTotals?.[index]));
  return {
    date: dateStr,
    periodStart: typeof value.periodStart === 'string' ? value.periodStart : '',
    periodEnd: typeof value.periodEnd === 'string' ? value.periodEnd : '',
    totalActiveSeconds: Math.max(0, Number(value.totalActiveSeconds) || 0),
    categoryTotals: normalizeNumberMap(value.categoryTotals),
    appTotals: normalizeNumberMap(value.appTotals),
    hourlyCategoryTotals: hourly,
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

function getActivityWatchRecentDays(count = ACTIVITYWATCH_DASHBOARD_DAYS) {
  const current = activityWatchCurrentWakingDateStr();
  return Array.from({ length: count }, (_, index) => {
    const date = dateFromStr(current);
    date.setDate(date.getDate() - index);
    const dateStr = toDateStr(date);
    return activityWatchData.daysByDate[dateStr] || {
      date: dateStr,
      periodStart: '',
      periodEnd: '',
      totalActiveSeconds: 0,
      categoryTotals: {},
      appTotals: {},
      hourlyCategoryTotals: Array.from({ length: 24 }, () => ({})),
      syncedAt: '',
      queryVersion: ACTIVITYWATCH_QUERY_VERSION,
    };
  }).reverse();
}

function getActivityWatchTimelineSummary(dateStr) {
  const day = getActivityWatchDay(dateStr);
  if (!day || !day.totalActiveSeconds) return '';
  return `Active ${formatActivityWatchDuration(day.totalActiveSeconds)}`;
}

function activityWatchCategoryColor(categoryName) {
  const color = activityWatchData.categoryColors?.[categoryName];
  if (color) return color;
  const topLevel = String(categoryName || '').split(ACTIVITYWATCH_CATEGORY_JOINER)[0];
  if (activityWatchData.categoryColors?.[topLevel]) return activityWatchData.categoryColors[topLevel];
  let hash = 0;
  String(categoryName || '').split('').forEach(char => {
    hash = ((hash << 5) - hash + char.charCodeAt(0)) | 0;
  });
  return ACTIVITYWATCH_FALLBACK_COLORS[Math.abs(hash) % ACTIVITYWATCH_FALLBACK_COLORS.length];
}

function formatActivityWatchDuration(seconds) {
  const total = Math.max(0, Math.round(Number(seconds) || 0));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  if (hours && minutes) return `${hours}h ${minutes}m`;
  if (hours) return `${hours}h`;
  if (minutes) return `${minutes}m`;
  return total ? '<1m' : '0m';
}

function getActivityWatchSyncProgress() {
  return {
    ...activityWatchSyncProgress,
  };
}

function updateActivityWatchSyncProgress(update = {}) {
  activityWatchSyncProgress = {
    ...activityWatchSyncProgress,
    ...update,
  };
}

function clearActivityWatchSyncProgress() {
  activityWatchSyncProgress = defaultActivityWatchSyncProgress();
}

function maybeSyncActivityWatchRecent(trigger = 'auto', options = {}) {
  return maybeSyncActivityWatchRange(trigger, ACTIVITYWATCH_RECENT_SYNC_DAYS, options);
}

function maybeSyncActivityWatchRange(trigger = 'manual', count = ACTIVITYWATCH_RECENT_SYNC_DAYS, options = {}) {
  if (!activityWatchData || !activityWatchData.version) loadActivityWatchData();
  const dayCount = Math.max(1, Math.min(90, Number.parseInt(count, 10) || ACTIVITYWATCH_RECENT_SYNC_DAYS));
  const force = Boolean(options.force);
  const lastSyncMs = activityWatchData.lastSyncAt ? new Date(activityWatchData.lastSyncAt).getTime() : 0;
  const requestedDates = activityWatchRecentDateStrings(dayCount);
  const hasStaleQueryData = requestedDates.some(dateStr => {
    const day = activityWatchData.daysByDate?.[dateStr];
    return day?.syncedAt && day.queryVersion !== ACTIVITYWATCH_QUERY_VERSION;
  });
  if (!force && !hasStaleQueryData && dayCount === ACTIVITYWATCH_RECENT_SYNC_DAYS && lastSyncMs && Date.now() - lastSyncMs < ACTIVITYWATCH_SYNC_THROTTLE_MS) {
    return Promise.resolve(activityWatchData);
  }
  if (activityWatchSyncPromise) return activityWatchSyncPromise;

  const syncDates = activityWatchDatesNeedingSync(requestedDates, { force });
  if (!syncDates.length) return Promise.resolve(activityWatchData);
  activityWatchSyncPromise = Promise.resolve().then(() => runActivityWatchDateSync(trigger, syncDates, { force }))
    .catch(err => {
      clearActivityWatchSyncProgress();
      recordActivityWatchStatus('query-error', activityWatchErrorMessage(err), []);
      try {
        saveActivityWatchData();
      } catch (saveErr) {
        console.error('Could not save ActivityWatch sync error.', saveErr);
      }
      renderActivityWatchSurfaces();
      return activityWatchData;
    })
    .finally(() => {
      activityWatchSyncPromise = null;
    });
  return activityWatchSyncPromise;
}

async function runActivityWatchDateSync(trigger, dateStrings, options = {}) {
  const syncDates = Array.from(new Set((Array.isArray(dateStrings) ? dateStrings : [])
    .filter(activityWatchIsValidDate)));
  if (!syncDates.length) return activityWatchData;

  if (window.location.protocol === 'file:') {
    clearActivityWatchSyncProgress();
    recordActivityWatchStatus('file-origin', 'ActivityWatch sync needs PEM served from a local http://127.0.0.1 origin. file:// cannot be configured for CORS.', []);
    saveActivityWatchData();
    renderActivityWatchSurfaces();
    return activityWatchData;
  }

  updateActivityWatchSyncProgress({
    active: true,
    trigger,
    totalDays: syncDates.length,
    completedDays: 0,
    currentDate: '',
    currentEndDate: '',
    mode: 'single',
    fallbackReason: '',
    startedAt: new Date().toISOString(),
  });
  recordActivityWatchStatus('syncing', `Syncing ${formatNumber(syncDates.length)} ActivityWatch days in one request...`, []);
  renderActivityWatchSurfaces();

  const serverUrl = getActivityWatchServerUrl();
  let info;
  let awSettings;
  let buckets;
  try {
    [info, awSettings, buckets] = await Promise.all([
      activityWatchFetchJson(`${serverUrl}/api/0/info`),
      activityWatchFetchJson(`${serverUrl}/api/0/settings`),
      activityWatchFetchJson(`${serverUrl}/api/0/buckets/`),
    ]);
  } catch (err) {
    const diagnosis = await diagnoseActivityWatchFetchFailure(serverUrl);
    clearActivityWatchSyncProgress();
    recordActivityWatchStatus(diagnosis.code, diagnosis.message, []);
    activityWatchData.lastError = diagnosis.message;
    activityWatchData.lastErrorAt = new Date().toISOString();
    saveActivityWatchData();
    renderActivityWatchSurfaces();
    return activityWatchData;
  }

  const discovered = discoverActivityWatchBuckets(buckets, info?.hostname || '');
  const warnings = [];
  if (!discovered.window) {
    clearActivityWatchSyncProgress();
    recordActivityWatchStatus('missing-window', 'ActivityWatch window watcher bucket was not found.', []);
    activityWatchData.lastError = activityWatchData.status.message;
    activityWatchData.lastErrorAt = new Date().toISOString();
    saveActivityWatchData();
    renderActivityWatchSurfaces();
    return activityWatchData;
  }
  if (!discovered.afk) {
    clearActivityWatchSyncProgress();
    recordActivityWatchStatus('missing-afk', 'ActivityWatch AFK watcher bucket was not found.', []);
    activityWatchData.lastError = activityWatchData.status.message;
    activityWatchData.lastErrorAt = new Date().toISOString();
    saveActivityWatchData();
    renderActivityWatchSurfaces();
    return activityWatchData;
  }
  if (!discovered.browsers.length) {
    warnings.push('No browser watcher bucket found. Browser-based categories may be less accurate.');
  }

  const awStartOfDay = activityWatchNormalizeTime(awSettings?.startOfDay || '');
  const pemStart = activityWatchPersonalDayStartTime();
  if (awStartOfDay && awStartOfDay !== pemStart) {
    warnings.push(`ActivityWatch starts days at ${awStartOfDay}; PEM starts days at ${pemStart}. PEM query periods are used for sync.`);
  }

  const periods = buildActivityWatchSyncPeriods(syncDates);
  const query = buildActivityWatchQuery({
    windowBucket: discovered.window,
    afkBucket: discovered.afk,
    browserBuckets: discovered.browsers,
    classes: activityWatchClassesForQuery(awSettings?.classes || []),
  });

  let rawResults;
  try {
    rawResults = await activityWatchPostQueryForPeriods(serverUrl, query, periods, (progress) => {
      updateActivityWatchSyncProgress({
        active: true,
        trigger,
        ...progress,
      });
      recordActivityWatchStatus('syncing', activityWatchSyncProgressMessage(progress), warnings);
      renderActivityWatchSurfaces();
    });
  } catch (err) {
    clearActivityWatchSyncProgress();
    recordActivityWatchStatus('query-error', `ActivityWatch query failed: ${activityWatchErrorMessage(err)}`, warnings);
    activityWatchData.lastError = activityWatchData.status.message;
    activityWatchData.lastErrorAt = new Date().toISOString();
    saveActivityWatchData();
    renderActivityWatchSurfaces();
    return activityWatchData;
  }

  const results = normalizeActivityWatchQueryResults(rawResults);
  const syncedAt = new Date().toISOString();
  const dayDrafts = {};
  periods.forEach((period, index) => {
    const result = results[index] || {};
    if (!dayDrafts[period.date]) {
      dayDrafts[period.date] = {
        date: period.date,
        periodStart: period.dayStartIso,
        periodEnd: period.dayEndIso,
        totalActiveSeconds: 0,
        categoryTotals: {},
        appTotals: {},
        hourlyCategoryTotals: Array.from({ length: 24 }, () => ({})),
        syncedAt,
        queryVersion: ACTIVITYWATCH_QUERY_VERSION,
      };
    }
    const draft = dayDrafts[period.date];
    if (period.type === 'day') {
      draft.totalActiveSeconds = normalizeActivityWatchSeconds(result.duration);
      draft.categoryTotals = activityWatchEventsToTotals(result.cat_events, '$category');
      draft.appTotals = activityWatchEventsToTotals(result.app_events, 'app', 20);
    } else if (period.type === 'hour') {
      draft.hourlyCategoryTotals[period.hourIndex] = activityWatchEventsToTotals(result.cat_events, '$category');
    }
  });

  Object.entries(dayDrafts).forEach(([dateStr, day]) => {
    activityWatchData.daysByDate[dateStr] = normalizeActivityWatchDay(dateStr, day);
  });

  activityWatchData.serverUrl = serverUrl;
  activityWatchData.host = typeof info?.hostname === 'string' ? info.hostname : '';
  activityWatchData.activityWatchVersion = typeof info?.version === 'string' ? info.version : '';
  activityWatchData.startOfDay = awStartOfDay;
  activityWatchData.categoryColors = extractActivityWatchCategoryColors(awSettings?.classes || []);
  activityWatchData.buckets = discovered;
  activityWatchData.lastSyncAt = syncedAt;
  activityWatchData.lastSyncTrigger = trigger;
  activityWatchData.lastError = '';
  activityWatchData.lastErrorAt = '';
  clearActivityWatchSyncProgress();
  recordActivityWatchStatus(warnings.length ? 'warning' : 'ok', `Synced ${formatNumber(syncDates.length)} ActivityWatch days.`, warnings);
  saveActivityWatchData();
  renderActivityWatchSurfaces();
  return activityWatchData;
}

function recordActivityWatchStatus(code, message, warnings = []) {
  activityWatchData.status = {
    code,
    message,
    checkedAt: new Date().toISOString(),
    warnings: Array.isArray(warnings) ? warnings : [],
  };
}

async function activityWatchFetchJson(url, options = {}) {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), ACTIVITYWATCH_FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.json();
  } finally {
    window.clearTimeout(timeout);
  }
}

async function activityWatchPostQuery(serverUrl, query, timeperiods) {
  return activityWatchFetchJson(`${serverUrl}/api/0/query/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      timeperiods,
      query: query.split('\n').filter(line => line.trim()),
    }),
  });
}

async function activityWatchPostQueryForPeriods(serverUrl, query, periods, onDayComplete) {
  const totalDays = new Set(periods.map(period => period.date)).size;
  if (!periods.length) return [];

  if (typeof onDayComplete === 'function') {
    onDayComplete({
      mode: 'single',
      totalDays,
      completedDays: 0,
      currentDate: periods[0]?.date || '',
      currentEndDate: periods[periods.length - 1]?.date || '',
      fallbackReason: '',
    });
  }

  try {
    return normalizeActivityWatchQueryResults(await activityWatchPostQuery(
      serverUrl,
      query,
      periods.map(period => period.timeperiod),
    ));
  } catch (err) {
    if (periods.length <= ACTIVITYWATCH_QUERY_CHUNK_DAYS) throw err;
    if (typeof onDayComplete === 'function') {
      onDayComplete({
        mode: 'fallback',
        totalDays,
        completedDays: 0,
        currentDate: periods[0]?.date || '',
        currentEndDate: periods[Math.min(ACTIVITYWATCH_QUERY_CHUNK_DAYS, periods.length) - 1]?.date || '',
        fallbackReason: activityWatchErrorMessage(err),
      });
    }
  }

  const results = [];
  let completedDays = 0;
  for (let start = 0; start < periods.length; start += ACTIVITYWATCH_QUERY_CHUNK_DAYS) {
    const chunk = periods.slice(start, start + ACTIVITYWATCH_QUERY_CHUNK_DAYS);
    if (typeof onDayComplete === 'function') {
      onDayComplete({
        mode: 'fallback',
        totalDays,
        completedDays,
        currentDate: chunk[0]?.date || '',
        currentEndDate: chunk[chunk.length - 1]?.date || '',
      });
    }
    const chunkResults = normalizeActivityWatchQueryResults(await activityWatchPostQuery(
      serverUrl,
      query,
      chunk.map(period => period.timeperiod),
    ));
    chunk.forEach((period, chunkIndex) => {
      results[start + chunkIndex] = chunkResults[chunkIndex] || {};
    });
    completedDays = Math.min(totalDays, completedDays + new Set(chunk.map(period => period.date)).size);
    if (typeof onDayComplete === 'function') {
      onDayComplete({
        mode: 'fallback',
        totalDays,
        completedDays,
        currentDate: chunk[0]?.date || '',
        currentEndDate: chunk[chunk.length - 1]?.date || '',
      });
    }
  }
  return results;
}

function activityWatchSyncProgressMessage(progress = {}) {
  const total = Math.max(0, Number(progress.totalDays) || 0);
  const completed = Math.max(0, Number(progress.completedDays) || 0);
  if (progress.mode === 'fallback') {
    if (!completed) return 'Full sync did not finish; retrying in 14-day batches...';
    return `Synced ${formatNumber(completed)} of ${formatNumber(total)} ActivityWatch days in fallback batches...`;
  }
  return `Syncing ${formatNumber(total)} ActivityWatch days in one request...`;
}

async function diagnoseActivityWatchFetchFailure(serverUrl) {
  try {
    await fetch(`${serverUrl}/api/0/info`, {
      mode: 'no-cors',
      cache: 'no-store',
    });
    return {
      code: 'cors-blocked',
      message: 'ActivityWatch is reachable, but PEM is not allowed yet. In aw-server/aw-server.toml, make sure the [server] line says exactly cors_origins = "http://127.0.0.1:8891" with no #, then restart ActivityWatch.',
    };
  } catch (_) {
    return {
      code: 'offline',
      message: 'ActivityWatch is not reachable at the configured local server URL.',
    };
  }
}

function discoverActivityWatchBuckets(buckets, hostname = '') {
  const bucketList = Object.values(buckets || {}).filter(bucket => bucket && typeof bucket === 'object');
  const windowBucket = bestActivityWatchBucket(bucketList, bucket =>
    bucket.type === 'currentwindow' || bucket.client === 'aw-watcher-window' || String(bucket.id || '').startsWith('aw-watcher-window_'),
  hostname);
  const afkBucket = bestActivityWatchBucket(bucketList, bucket =>
    bucket.type === 'afkstatus' || bucket.client === 'aw-watcher-afk' || String(bucket.id || '').startsWith('aw-watcher-afk_'),
  hostname);
  const browserBuckets = bestActivityWatchBrowserBuckets(bucketList, hostname);
  return {
    window: windowBucket?.id || '',
    afk: afkBucket?.id || '',
    browsers: browserBuckets.map(bucket => bucket.id).filter(Boolean),
  };
}

function bestActivityWatchBucket(bucketList, predicate, hostname) {
  return bucketList
    .filter(predicate)
    .sort((a, b) => activityWatchBucketScore(b, hostname) - activityWatchBucketScore(a, hostname))[0] || null;
}

function activityWatchBucketScore(bucket, hostname) {
  const id = String(bucket.id || '');
  let score = 0;
  if (hostname && bucket.hostname === hostname) score += 100;
  if (hostname && id.includes(hostname)) score += 50;
  if (bucket.last_updated) score += 20;
  if (bucket.hostname && bucket.hostname !== 'unknown') score += 10;
  return score;
}

function bestActivityWatchBrowserBuckets(bucketList, hostname) {
  const candidates = bucketList
    .filter(bucket => bucket.type === 'web.tab.current' || String(bucket.id || '').startsWith('aw-watcher-web-'))
    .sort((a, b) => activityWatchBucketScore(b, hostname) - activityWatchBucketScore(a, hostname));
  const byBrowser = new Map();
  candidates.forEach(bucket => {
    const browser = activityWatchBrowserNameForBucket(bucket.id || '');
    if (!browser || byBrowser.has(browser)) return;
    byBrowser.set(browser, bucket);
  });
  return Array.from(byBrowser.values());
}

function activityWatchBrowserNameForBucket(bucketId) {
  const id = String(bucketId || '').toLowerCase();
  return Object.keys(ACTIVITYWATCH_BROWSER_APPNAMES).find(name => id.includes(name)) || '';
}

function activityWatchClassesForQuery(classes) {
  return Array.isArray(classes)
    ? classes
        .filter(cls => cls && Array.isArray(cls.name) && cls.rule && typeof cls.rule === 'object')
        .map(cls => [cls.name, cls.rule])
    : [];
}

function extractActivityWatchCategoryColors(classes) {
  const colors = {};
  if (!Array.isArray(classes)) return colors;
  classes.forEach(cls => {
    if (!Array.isArray(cls?.name)) return;
    const color = cls.data?.color;
    if (typeof color !== 'string' || !color.trim()) return;
    const full = cls.name.join(ACTIVITYWATCH_CATEGORY_JOINER);
    colors[full] = color;
    if (cls.name.length === 1) colors[cls.name[0]] = color;
  });
  return colors;
}

function buildActivityWatchQuery(options) {
  const classesJson = JSON.stringify(options.classes || []);
  const lines = [
    `events = flood(${activityWatchQueryBucketExpression(options.windowBucket)});`,
    `not_afk = flood(${activityWatchQueryBucketExpression(options.afkBucket)});`,
    'not_afk = filter_keyvals(not_afk, "status", ["not-afk"]);',
    'browser_events = [];',
  ];

  (options.browserBuckets || []).forEach((bucketId, index) => {
    const browser = activityWatchBrowserNameForBucket(bucketId);
    const appNames = ACTIVITYWATCH_BROWSER_APPNAMES[browser];
    if (!appNames) return;
    const suffix = `${browser}_${index}`;
    const regex = ACTIVITYWATCH_BROWSER_APPNAME_REGEX[browser];
    lines.push(
      `events_${suffix} = flood(query_bucket(${activityWatchQueryString(bucketId)}));`,
      `window_${suffix} = filter_keyvals(events, "app", ${JSON.stringify(appNames)});`,
      ...(regex ? [
        `window_${suffix}_re = filter_keyvals_regex(events, "app", ${activityWatchQueryString(regex)});`,
        `window_${suffix} = sort_by_timestamp(concat(window_${suffix}, window_${suffix}_re));`,
      ] : []),
      `events_${suffix} = filter_period_intersect(events_${suffix}, window_${suffix});`,
      `events_${suffix} = split_url_events(events_${suffix});`,
      `browser_events = concat(browser_events, events_${suffix});`,
      'browser_events = sort_by_timestamp(browser_events);',
    );
  });

  if ((options.browserBuckets || []).length) {
    lines.push(
      'audible_events = filter_keyvals(browser_events, "audible", [true]);',
      'not_afk = period_union(not_afk, audible_events);',
    );
  }

  lines.push(
    'events = filter_period_intersect(events, not_afk);',
    `events = categorize(events, ${classesJson});`,
    'cat_events = sort_by_duration(merge_events_by_keys(events, ["$category"]));',
    'app_events = sort_by_duration(merge_events_by_keys(events, ["app"]));',
    'duration = sum_durations(events);',
    'RETURN = {"duration": duration, "cat_events": cat_events, "app_events": app_events};',
  );
  return lines.join('\n');
}

function activityWatchQueryBucketExpression(bucketId) {
  const value = String(bucketId || '');
  return value.endsWith('_')
    ? `query_bucket(find_bucket(${activityWatchQueryString(value)}))`
    : `query_bucket(${activityWatchQueryString(value)})`;
}

function activityWatchQueryString(value) {
  return JSON.stringify(String(value || ''));
}

function buildActivityWatchSyncPeriods(dateStrings) {
  return dateStrings.map(buildActivityWatchSyncPeriod);
}

function buildActivityWatchSyncPeriod(dateStr) {
  const dayStart = activityWatchWakingDayStart(dateStr);
  const dayEnd = new Date(dayStart);
  dayEnd.setDate(dayEnd.getDate() + 1);
  const dayStartIso = activityWatchLocalIso(dayStart);
  const dayEndIso = activityWatchLocalIso(dayEnd);
  return {
    type: 'day',
    date: dateStr,
    hourIndex: null,
    dayStartIso,
    dayEndIso,
    timeperiod: `${dayStartIso}/${dayEndIso}`,
  };
}

function activityWatchDatesNeedingSync(dateStrings, options = {}) {
  const dates = Array.from(new Set((Array.isArray(dateStrings) ? dateStrings : [])
    .filter(activityWatchIsValidDate)));
  if (options.force) return dates;

  const current = activityWatchCurrentWakingDateStr();
  return dates.filter(dateStr => {
    if (dateStr === current) return true;
    const existing = activityWatchData.daysByDate?.[dateStr];
    if (!existing || !existing.syncedAt || existing.queryVersion !== ACTIVITYWATCH_QUERY_VERSION) return true;

    const period = buildActivityWatchSyncPeriod(dateStr);
    return existing.periodStart !== period.dayStartIso || existing.periodEnd !== period.dayEndIso;
  });
}

function activityWatchRecentDateStrings(count) {
  const current = activityWatchCurrentWakingDateStr();
  const dates = [];
  for (let offset = count - 1; offset >= 0; offset--) {
    const date = dateFromStr(current);
    date.setDate(date.getDate() - offset);
    dates.push(toDateStr(date));
  }
  return dates;
}

function activityWatchCurrentWakingDateStr(now = new Date()) {
  const start = activityWatchWakingDayStart(toDateStr(now));
  if (now < start) {
    start.setDate(start.getDate() - 1);
  }
  return toDateStr(start);
}

function activityWatchWakingDayStart(dateStr) {
  const date = dateFromStr(dateStr);
  const minutes = activityWatchTimeToMinutes(activityWatchPersonalDayStartTime()) || 0;
  date.setHours(Math.floor(minutes / 60), minutes % 60, 0, 0);
  return date;
}

function activityWatchPersonalDayStartTime() {
  return activityWatchIsValidTime(settings?.personalDayStartTime)
    ? settings.personalDayStartTime
    : DEFAULT_PERSONAL_DAY_START_TIME;
}

function activityWatchLocalIso(date) {
  const offset = -date.getTimezoneOffset();
  const sign = offset >= 0 ? '+' : '-';
  const abs = Math.abs(offset);
  return `${date.getFullYear()}-${activityWatchPad(date.getMonth() + 1)}-${activityWatchPad(date.getDate())}T${activityWatchPad(date.getHours())}:${activityWatchPad(date.getMinutes())}:${activityWatchPad(date.getSeconds())}${sign}${activityWatchPad(Math.floor(abs / 60))}:${activityWatchPad(abs % 60)}`;
}

function activityWatchPad(value) {
  return String(value).padStart(2, '0');
}

function activityWatchNormalizeTime(value) {
  const text = String(value || '').trim();
  const match = /^(\d{1,2}):(\d{2})$/.exec(text);
  if (!match) return '';
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return '';
  return `${activityWatchPad(hour)}:${activityWatchPad(minute)}`;
}

function activityWatchIsValidTime(value) {
  return Boolean(activityWatchNormalizeTime(value));
}

function activityWatchTimeToMinutes(value) {
  const normalized = activityWatchNormalizeTime(value);
  if (!normalized) return null;
  const [hour, minute] = normalized.split(':').map(Number);
  return hour * 60 + minute;
}

function activityWatchIsValidDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ''))) return false;
  const date = dateFromStr(value);
  return toDateStr(date) === value;
}

function normalizeActivityWatchQueryResults(raw) {
  if (Array.isArray(raw)) return raw;
  if (Array.isArray(raw?.value)) return raw.value;
  return [];
}

function activityWatchEventsToTotals(events, key, limit = Infinity) {
  const totals = {};
  const list = Array.isArray(events) ? events : [];
  list.slice(0, limit).forEach(event => {
    const value = event?.data?.[key];
    const name = Array.isArray(value)
      ? value.join(ACTIVITYWATCH_CATEGORY_JOINER)
      : String(value || 'Uncategorized');
    const seconds = normalizeActivityWatchSeconds(event?.duration);
    if (!seconds) return;
    totals[name] = (totals[name] || 0) + seconds;
  });
  return totals;
}

function normalizeActivityWatchSeconds(value) {
  const seconds = Number(value);
  return Number.isFinite(seconds) && seconds > 0 ? seconds : 0;
}

function activityWatchErrorMessage(err) {
  if (!err) return 'Unknown error.';
  if (err.name === 'AbortError') return 'Request timed out.';
  return err.message || String(err);
}

function renderActivityWatchSurfaces() {
  if (typeof renderActivityWatchSettings === 'function') renderActivityWatchSettings();
  if (typeof renderActivityWatchDashboard === 'function') renderActivityWatchDashboard();
  if (typeof renderNotesPanel === 'function' && settings?.notesOpen) renderNotesPanel();
}
