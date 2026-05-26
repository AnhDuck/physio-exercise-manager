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
  const isFileOrigin = window.location.protocol === 'file:';
  const recommendedOrigin = 'http://127.0.0.1:8891';
  const currentOrigin = isFileOrigin ? 'file:// (not supported for ActivityWatch sync)' : window.location.origin;
  const configOrigin = isFileOrigin ? recommendedOrigin : window.location.origin;
  if (origin) origin.textContent = currentOrigin;
  if (rustConfig) rustConfig.textContent = `cors = ["${configOrigin}"]`;
  if (pythonConfig) pythonConfig.textContent = `cors_origins = "${configOrigin}"`;
  if (note) {
    note.textContent = isFileOrigin
      ? `ActivityWatch sync cannot use file://. Double-click Start PEM Localhost.bat, open ${recommendedOrigin}/index.html?v=${window.PEM_APP_VERSION}, add ${recommendedOrigin} to ActivityWatch CORS, restart ActivityWatch, then refresh here.`
      : `If refresh says CORS is blocked: right-click ActivityWatch in the tray, open the config folder, edit aw-server-rust/config.toml so it includes ${window.location.origin}, save, fully restart ActivityWatch, then press Refresh now.`;
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
