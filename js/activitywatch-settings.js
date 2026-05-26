// ActivityWatch Settings tab rendering and controls.

function syncActivityWatchSettingsControls() {
  const input = document.getElementById('setting-activitywatch-server-url');
  if (input) input.value = getActivityWatchServerUrl();
}

function saveActivityWatchServerUrlSetting() {
  const input = document.getElementById('setting-activitywatch-server-url');
  if (!input) return;
  setActivityWatchServerUrl(input.value);
  syncActivityWatchSettingsControls();
  renderActivityWatchSettings();
}

function refreshActivityWatchFromSettings() {
  maybeSyncActivityWatchRecent('settings-manual', { force: true });
}

function renderActivityWatchSettings() {
  const panel = document.getElementById('settings-panel-activitywatch');
  if (!panel) return;
  syncActivityWatchSettingsControls();
  renderActivityWatchConnectionSettings();
  renderActivityWatchCorsSettings();
  renderActivityWatchBucketSettings();
}

function renderActivityWatchConnectionSettings() {
  const status = getActivityWatchStatus();
  const state = document.getElementById('settings-activitywatch-state');
  const detail = document.getElementById('settings-activitywatch-detail');
  const pill = document.getElementById('settings-activitywatch-pill');
  const host = document.getElementById('settings-activitywatch-host');
  const version = document.getElementById('settings-activitywatch-version');
  const lastSync = document.getElementById('settings-activitywatch-last-sync');
  const dayStart = document.getElementById('settings-activitywatch-day-start');
  const dayStartPill = document.getElementById('settings-activitywatch-day-start-pill');
  const refreshBtn = document.getElementById('settings-activitywatch-refresh');

  if (state) {
    state.textContent = activityWatchStatusTitle(status);
    state.classList.toggle('is-backup-issue', activityWatchStatusIsIssue(status));
  }
  if (detail) {
    const warnings = (status.warnings || []).join(' ');
    detail.textContent = [activityWatchStatusDetail(status), warnings].filter(Boolean).join(' ');
  }
  setStatusPill(pill, activityWatchStatusPill(status), {
    muted: ['idle', 'syncing'].includes(status.code),
    issue: activityWatchStatusIsIssue(status),
  });
  if (host) host.textContent = activityWatchData.host || 'Unknown';
  if (version) version.textContent = activityWatchData.activityWatchVersion || 'Unknown';
  if (lastSync) lastSync.textContent = activityWatchData.lastSyncAt ? formatAutoBackupDateTime(activityWatchData.lastSyncAt) : 'Never';
  if (dayStart) {
    const pem = activityWatchPersonalDayStartTime();
    const aw = activityWatchData.startOfDay || 'Unknown';
    dayStart.textContent = `PEM ${pem} / ActivityWatch ${aw}`;
  }
  setStatusPill(dayStartPill, activityWatchData.startOfDay && activityWatchData.startOfDay !== activityWatchPersonalDayStartTime() ? 'Mismatch' : 'OK', {
    muted: !activityWatchData.startOfDay,
    issue: Boolean(activityWatchData.startOfDay && activityWatchData.startOfDay !== activityWatchPersonalDayStartTime()),
  });
  if (refreshBtn) {
    refreshBtn.disabled = status.code === 'syncing';
    setSettingsButtonContent(refreshBtn, status.code === 'syncing' ? 'Syncing...' : 'Refresh now', 'reconnect');
  }
}

function renderActivityWatchCorsSettings() {
  const origin = document.getElementById('settings-activitywatch-origin');
  const rustConfig = document.getElementById('settings-activitywatch-cors-rust');
  const pythonConfig = document.getElementById('settings-activitywatch-cors-python');
  const note = document.getElementById('settings-activitywatch-cors-note');
  const currentOrigin = window.location.origin === 'null' ? 'file://' : window.location.origin;
  const configOrigin = window.location.origin === 'null' ? 'http://127.0.0.1:8891' : window.location.origin;
  if (origin) origin.textContent = currentOrigin;
  if (rustConfig) rustConfig.textContent = `cors = ["${configOrigin}"]`;
  if (pythonConfig) pythonConfig.textContent = `cors_origins = "${configOrigin}"`;
  if (note) {
    note.textContent = window.location.protocol === 'file:'
      ? 'This feature cannot use file:// reliably. Serve PEM from a local static server, then add that http://127.0.0.1 origin to ActivityWatch CORS.'
      : 'After changing ActivityWatch CORS, restart ActivityWatch or aw-server-rust, then refresh here.';
  }
}

function renderActivityWatchBucketSettings() {
  const windowBucket = document.getElementById('settings-activitywatch-window-bucket');
  const afkBucket = document.getElementById('settings-activitywatch-afk-bucket');
  const browserBuckets = document.getElementById('settings-activitywatch-browser-buckets');
  const storageDays = document.getElementById('settings-activitywatch-storage-days');
  if (windowBucket) windowBucket.textContent = activityWatchData.buckets.window || 'Not found';
  if (afkBucket) afkBucket.textContent = activityWatchData.buckets.afk || 'Not found';
  if (browserBuckets) {
    browserBuckets.textContent = activityWatchData.buckets.browsers.length
      ? activityWatchData.buckets.browsers.join(', ')
      : 'Not found';
  }
  if (storageDays) storageDays.textContent = formatNumber(Object.keys(activityWatchData.daysByDate || {}).length);
}
