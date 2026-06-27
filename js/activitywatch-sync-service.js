// ActivityWatch sync orchestration and render fan-out.

const ACTIVITYWATCH_SYNC_THROTTLE_MS = 60 * 1000;

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
  return maybeSyncActivityWatchDateStrings(trigger, requestedDates, options);
}

function maybeSyncActivityWatchDateStrings(trigger = 'manual', dateStrings = [], options = {}) {
  if (!activityWatchData || !activityWatchData.version) loadActivityWatchData();
  const force = Boolean(options.force);
  const requestedDates = Array.from(new Set((Array.isArray(dateStrings) ? dateStrings : [])
    .filter(activityWatchIsValidDate)));
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
        syncedAt,
        queryVersion: ACTIVITYWATCH_QUERY_VERSION,
      };
    }
    const draft = dayDrafts[period.date];
    draft.totalActiveSeconds = normalizeActivityWatchSeconds(result.duration);
    draft.categoryTotals = activityWatchEventsToTotals(result.cat_events, '$category');
    draft.appTotals = activityWatchEventsToTotals(result.app_events, 'app', 20);
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

function activityWatchSyncProgressMessage(progress = {}) {
  const total = Math.max(0, Number(progress.totalDays) || 0);
  const completed = Math.max(0, Number(progress.completedDays) || 0);
  if (progress.mode === 'fallback') {
    if (!completed) return 'Full sync did not finish; retrying in 14-day batches...';
    return `Synced ${formatNumber(completed)} of ${formatNumber(total)} ActivityWatch days in fallback batches...`;
  }
  return `Syncing ${formatNumber(total)} ActivityWatch days in one request...`;
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

function renderActivityWatchSurfaces() {
  if (typeof renderActivityWatchSettings === 'function') renderActivityWatchSettings();
  if (typeof renderActivityWatchDashboard === 'function') renderActivityWatchDashboard();
  if (typeof renderHomeCards === 'function') renderHomeCards();
  if (typeof renderNotesPanel === 'function' && settings?.notesOpen) renderNotesPanel();
}
