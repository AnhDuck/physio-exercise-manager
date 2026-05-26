// ActivityWatch Settings tab rendering and controls.

const ACTIVITYWATCH_PEM_PRODUCTION_ORIGIN = 'http://127.0.0.1:8891';
const ACTIVITYWATCH_PEM_DEV_ORIGIN = 'http://127.0.0.1:8895';
const ACTIVITYWATCH_PEM_PRODUCTION_URL = `${ACTIVITYWATCH_PEM_PRODUCTION_ORIGIN}/index.html`;
const ACTIVITYWATCH_DISABLED_CORS_LINE = '#cors_origins = ""';
const ACTIVITYWATCH_PRIMARY_CORS_LINE = `cors_origins = "${ACTIVITYWATCH_PEM_PRODUCTION_ORIGIN}"`;
const ACTIVITYWATCH_RUST_CORS_LINE = `cors = ["${ACTIVITYWATCH_PEM_PRODUCTION_ORIGIN}"]`;
const ACTIVITYWATCH_PRIMARY_TOML_EXAMPLE = [
  '[server]',
  '#host = "localhost"',
  '#port = "5600"',
  '#storage = "peewee"',
  ACTIVITYWATCH_PRIMARY_CORS_LINE,
  '',
  '[server.custom_static]',
  '',
  '[server-testing]',
  '#host = "localhost"',
  '#port = "5666"',
  '#storage = "peewee"',
  '#cors_origins = ""',
  '',
  '[server-testing.custom_static]',
].join('\n');

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
  bindActivityWatchSettingsEvents(panel);
  syncActivityWatchSettingsControls();
  renderActivityWatchSetupSettings();
  renderActivityWatchConnectionSettings();
  renderActivityWatchBucketSettings();
}

function bindActivityWatchSettingsEvents(panel) {
  if (!panel || panel.dataset.activitywatchEventsBound === 'true') return;
  panel.dataset.activitywatchEventsBound = 'true';
  panel.addEventListener('click', handleActivityWatchSettingsClick);
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
  const advancedSummary = document.getElementById('settings-activitywatch-advanced-summary');

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
  if (advancedSummary) {
    advancedSummary.textContent = activityWatchData.lastSyncAt
      ? `Last sync ${formatAutoBackupDateTime(activityWatchData.lastSyncAt)}.`
      : 'Buckets, sync metadata, and rust-server fallback.';
  }
}

function renderActivityWatchSetupSettings() {
  renderActivityWatchOriginNote();
  const origin = document.getElementById('settings-activitywatch-origin');
  const disabledConfig = document.getElementById('settings-activitywatch-cors-disabled');
  const primaryConfig = document.getElementById('settings-activitywatch-cors-primary');
  const tomlExample = document.getElementById('settings-activitywatch-toml-example');
  const rustConfig = document.getElementById('settings-activitywatch-cors-rust');
  if (origin) origin.textContent = activityWatchCurrentPemOriginLabel();
  if (disabledConfig) disabledConfig.textContent = ACTIVITYWATCH_DISABLED_CORS_LINE;
  if (primaryConfig) primaryConfig.textContent = ACTIVITYWATCH_PRIMARY_CORS_LINE;
  if (tomlExample) tomlExample.textContent = ACTIVITYWATCH_PRIMARY_TOML_EXAMPLE;
  if (rustConfig) rustConfig.textContent = ACTIVITYWATCH_RUST_CORS_LINE;
}

function renderActivityWatchOriginNote() {
  const note = document.getElementById('settings-activitywatch-origin-note');
  const title = document.getElementById('settings-activitywatch-origin-note-title');
  const detail = document.getElementById('settings-activitywatch-origin-note-detail');
  if (!note || !title || !detail) return;

  const info = activityWatchOriginInfo();
  note.classList.toggle('is-ok', info.level === 'ok');
  note.classList.toggle('is-warning', info.level === 'warning');
  note.classList.toggle('is-issue', info.level === 'issue');
  title.textContent = info.title;
  detail.textContent = info.detail;
}

function activityWatchOriginInfo() {
  if (window.location.protocol === 'file:') {
    return {
      level: 'issue',
      title: 'ActivityWatch sync is disabled in direct-file mode',
      detail: 'Use Start PEM Localhost.bat, then open http://127.0.0.1:8891/index.html for ActivityWatch sync.',
    };
  }
  if (window.location.origin === ACTIVITYWATCH_PEM_PRODUCTION_ORIGIN) {
    return {
      level: 'ok',
      title: 'Daily PEM address',
      detail: 'This is the real local PEM origin for your daily data and ActivityWatch setup.',
    };
  }
  if (window.location.origin === ACTIVITYWATCH_PEM_DEV_ORIGIN) {
    return {
      level: 'warning',
      title: 'Codex/dev test address',
      detail: 'This browser data is separate from daily 8891 data. Use it for testing only.',
    };
  }
  return {
    level: 'warning',
    title: 'Non-standard PEM address',
    detail: `This origin (${window.location.origin}) has separate browser data. Daily PEM should use ${ACTIVITYWATCH_PEM_PRODUCTION_ORIGIN}.`,
  };
}

function activityWatchCurrentPemOriginLabel() {
  return window.location.protocol === 'file:'
    ? `file:// (use ${ACTIVITYWATCH_PEM_PRODUCTION_ORIGIN} for ActivityWatch)`
    : window.location.origin;
}

async function handleActivityWatchSettingsClick(e) {
  const closeButton = e.target.closest('[data-activitywatch-copy-close]');
  if (closeButton) {
    hideActivityWatchManualCopy();
    return;
  }

  const button = e.target.closest('[data-activitywatch-copy]');
  if (!button) return;
  const text = activityWatchCopyText(button.dataset.activitywatchCopy);
  if (!text) return;
  const copied = typeof writeTextToClipboard === 'function'
    ? await writeTextToClipboard(text)
    : false;
  if (!copied) {
    showActivityWatchManualCopy(text, activityWatchCopyLabel(button.dataset.activitywatchCopy));
    showToast('Clipboard was blocked. Use the manual copy box.');
    return;
  }
  const originalLabel = button.dataset.settingsLabel || button.textContent || 'Copy';
  setSettingsButtonContent(button, 'Copied', button.dataset.settingsIcon || 'copy');
  window.setTimeout(() => {
    setSettingsButtonContent(button, originalLabel, button.dataset.settingsIcon || 'copy');
  }, 1400);
  showToast('Copied ActivityWatch setup text.');
}

function activityWatchCopyText(kind) {
  if (kind === 'production-url') return ACTIVITYWATCH_PEM_PRODUCTION_URL;
  if (kind === 'primary-cors') return ACTIVITYWATCH_PRIMARY_CORS_LINE;
  if (kind === 'primary-toml') return ACTIVITYWATCH_PRIMARY_TOML_EXAMPLE;
  if (kind === 'rust-cors') return ACTIVITYWATCH_RUST_CORS_LINE;
  return '';
}

function activityWatchCopyLabel(kind) {
  if (kind === 'production-url') return 'Manual copy: production URL';
  if (kind === 'primary-cors') return 'Manual copy: replacement line';
  if (kind === 'primary-toml') return 'Manual copy: full aw-server.toml example';
  if (kind === 'rust-cors') return 'Manual copy: rust line';
  return 'Manual copy';
}

function showActivityWatchManualCopy(text, titleText) {
  const box = document.getElementById('settings-activitywatch-manual-copy');
  const title = document.getElementById('settings-activitywatch-manual-copy-title');
  const textarea = document.getElementById('settings-activitywatch-manual-copy-text');
  if (!box || !textarea) return;
  if (title) title.textContent = titleText || 'Manual copy';
  textarea.value = text;
  box.hidden = false;
  window.setTimeout(() => {
    textarea.focus();
    textarea.select();
  }, 0);
}

function hideActivityWatchManualCopy() {
  const box = document.getElementById('settings-activitywatch-manual-copy');
  const textarea = document.getElementById('settings-activitywatch-manual-copy-text');
  if (textarea) textarea.value = '';
  if (box) box.hidden = true;
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
