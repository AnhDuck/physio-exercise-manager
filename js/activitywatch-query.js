// ActivityWatch REST fetches, bucket discovery, query construction, and result normalization.

const ACTIVITYWATCH_QUERY_CHUNK_DAYS = 14;
const ACTIVITYWATCH_FETCH_TIMEOUT_MS = 16000;
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
    dayStartIso,
    dayEndIso,
    timeperiod: `${dayStartIso}/${dayEndIso}`,
  };
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
