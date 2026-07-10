// Auto-backup settings, Data Health, status, and history rendering.

function handleBackupHealthAction() {
  const health = getAutoBackupHealth();
  if (DATA_HEALTH_ISSUE_CODES.includes(health.code)) {
    openSettingsModal();
    setSettingsTab('data-health', true);
    return;
  }
  openSettingsModal();
  setSettingsTab('backup', true);
}

function renderAutoBackupSettings() {
  const folderBtn = document.getElementById('settings-auto-backup-folder');
  const backupNowBtn = document.getElementById('settings-auto-backup-now');
  const folderName = document.getElementById('settings-auto-backup-folder-name');
  const folderState = document.getElementById('settings-auto-backup-folder-state');
  const last = document.getElementById('settings-auto-backup-last');
  const next = document.getElementById('settings-auto-backup-next');
  const issue = document.getElementById('settings-auto-backup-issue');
  const issueText = document.getElementById('settings-auto-backup-issue-text');
  const summary = document.getElementById('settings-auto-backup-summary');
  const toggle = document.getElementById('settings-auto-backup-history-toggle');
  const history = document.getElementById('settings-auto-backup-history');
  if (!folderBtn || !backupNowBtn || !folderName || !folderState || !last || !next || !issue || !issueText || !summary || !toggle || !history) return;

  const auto = getAutoBackupSettings();
  const supported = isFolderAutoBackupSupported();
  const folderReady = supported && Boolean(auto.folderName) && !auto.needsReconnect && Boolean(autoBackupDirectoryHandle);
  const health = getAutoBackupHealth();
  const normalizedHistory = normalizeAutoBackupHistory(auto.history || []);

  folderBtn.disabled = !supported || autoBackupRunning;
  const folderButtonLabel = auto.needsReconnect
    ? 'Reconnect'
    : auto.folderName
      ? 'Change'
      : 'Browse';
  setSettingsButtonContent(folderBtn, folderButtonLabel, auto.needsReconnect ? 'reconnect' : 'folder');
  backupNowBtn.disabled = !folderReady || autoBackupRunning;
  setSettingsButtonContent(backupNowBtn, autoBackupRunning ? 'Backing up...' : 'Backup now', 'backup-now');

  folderName.textContent = autoBackupFolderNameText(auto, supported);
  folderState.textContent = autoBackupFolderStateText(auto, supported, folderReady);
  last.textContent = auto.lastSuccessAt ? formatAutoBackupDateTime(auto.lastSuccessAt) : 'Never';
  next.textContent = supported ? nextAutoBackupDueText(auto) : 'Unavailable';
  issue.hidden = !auto.folderName || !auto.lastError;
  issueText.textContent = auto.folderName ? (auto.lastError || '') : '';
  updateAutoBackupHealthUi(health);
  renderStorageSettings(health);
  renderBrowserStorageEstimate();
  renderAutoBackupSummary(summary, normalizedHistory);
  toggle.hidden = normalizedHistory.length <= 1;
  setIconButtonContent(toggle, autoBackupHistoryExpanded ? 'Hide history' : 'Show history', autoBackupHistoryExpanded ? 'chevron-up' : 'search');
  history.hidden = !autoBackupHistoryExpanded || normalizedHistory.length <= 1;
  renderAutoBackupHistory(history, normalizedHistory);
}

function autoBackupFolderNameText(auto, supported) {
  if (!supported) return 'Folder backup unavailable';
  return auto.folderName || 'No folder selected';
}

function autoBackupFolderStateText(auto, supported, folderReady) {
  if (!supported) return 'Chrome or Edge desktop file access unavailable.';
  if (!auto.folderName) return 'Not selected';
  if (auto.needsReconnect) return 'Reconnect required';
  if (folderReady) return 'Connected';
  return 'Checking permission';
}

function updateAutoBackupHealthUi(health) {
  const banner = document.getElementById('backup-health-banner');
  const title = document.getElementById('backup-health-title');
  const detail = document.getElementById('backup-health-detail');
  const action = document.getElementById('backup-health-action');
  const settingsBtn = document.getElementById('btn-settings');
  const backupTab = document.getElementById('settings-tab-backup');
  const backupPanel = document.getElementById('settings-panel-backup');
  const dataHealthTab = document.getElementById('settings-tab-data-health');
  const dataHealthPanel = document.getElementById('settings-panel-data-health');
  const folderState = document.getElementById('settings-auto-backup-folder-state');
  const dataSafetyState = document.getElementById('settings-data-safety-state');
  const dataSafetyDetail = document.getElementById('settings-data-safety-detail');
  const dataSafetyPill = document.getElementById('settings-data-safety-pill');
  const backupVerifyState = document.getElementById('settings-backup-verify-state');
  const backupVerifyDetail = document.getElementById('settings-backup-verify-detail');
  const backupVerifyPill = document.getElementById('settings-backup-verify-pill');
  const currentFolderState = document.getElementById('settings-current-folder-state');
  const currentFolderDetail = document.getElementById('settings-current-folder-detail');
  const currentFolderPill = document.getElementById('settings-current-folder-pill');
  const auto = getAutoBackupSettings();
  const dataSafety = getDataSafetyReport();
  const folderIssueCodes = ['unsupported', 'missing-folder', 'reconnect', 'checking', 'due', 'error'];
  const folderHasIssue = folderIssueCodes.includes(health.code);
  const dataHealthHasIssue = DATA_HEALTH_ISSUE_CODES.includes(health.code);

  const hasIssue = !health.ok;
  document.body.classList.toggle('backup-health-open', hasIssue);
  if (banner && title && detail && action) {
    banner.hidden = !hasIssue;
    title.textContent = health.title;
    detail.textContent = health.detail;
    action.textContent = health.action || 'Open backup';
  }

  if (settingsBtn) {
    settingsBtn.classList.toggle('has-backup-issue', hasIssue);
    settingsBtn.title = hasIssue ? `Settings - ${health.title}` : 'Settings';
    settingsBtn.setAttribute('aria-label', hasIssue ? `Settings. ${health.title}.` : 'Settings');
  }
  if (backupTab) {
    backupTab.classList.toggle('has-backup-issue', hasIssue && folderHasIssue);
    backupTab.title = hasIssue && folderHasIssue ? health.title : '';
    backupTab.setAttribute('aria-label', hasIssue && folderHasIssue ? `Backup. ${health.title}.` : 'Backup');
  }
  if (dataHealthTab) {
    dataHealthTab.classList.toggle('has-backup-issue', hasIssue && dataHealthHasIssue);
    dataHealthTab.title = hasIssue && dataHealthHasIssue ? health.title : '';
    dataHealthTab.setAttribute('aria-label', hasIssue && dataHealthHasIssue ? `Data Health. ${health.title}.` : 'Data Health');
  }
  if (backupPanel) backupPanel.classList.toggle('has-backup-issue', hasIssue && folderHasIssue);
  if (dataHealthPanel) dataHealthPanel.classList.toggle('has-backup-issue', hasIssue && dataHealthHasIssue);
  if (folderState) folderState.classList.toggle('is-backup-issue', folderIssueCodes.includes(health.code));
  if (dataSafetyState && dataSafetyDetail) {
    dataSafetyState.textContent = dataSafety.ok ? 'Saved data is readable' : 'Saved data needs attention';
    dataSafetyDetail.textContent = dataSafety.ok
      ? dataSafetyReceiptText(dataSafety)
      : dataSafety.issues.slice(0, 3).join(' ');
    dataSafetyState.classList.toggle('is-backup-issue', !dataSafety.ok);
  }
  setStatusPill(dataSafetyPill, dataSafety.ok ? 'OK' : 'Review', { issue: !dataSafety.ok });
  if (backupVerifyState) {
    backupVerifyState.textContent = auto.lastVerifiedAt ? 'Latest folder backup verified' : 'Latest folder backup not verified';
  }
  if (backupVerifyDetail) {
    backupVerifyDetail.textContent = auto.lastVerifiedAt
      ? `${verifiedBackupReceiptText(auto)} Latest is also refreshed after normal app saves while the folder is connected.`
      : 'Run Backup now, reconnect the folder, or wait for the next automatic folder backup.';
  }
  setStatusPill(backupVerifyPill, auto.lastVerifiedAt ? 'Verified' : 'Not checked', { muted: !auto.lastVerifiedAt });
  if (currentFolderState && currentFolderDetail) {
    const supported = isFolderAutoBackupSupported();
    const folderReady = supported && Boolean(auto.folderName) && !auto.needsReconnect && Boolean(autoBackupDirectoryHandle);
    currentFolderState.textContent = autoBackupFolderStateText(auto, supported, folderReady);
    currentFolderDetail.textContent = auto.folderName
      ? `${autoBackupFolderNameText(auto, supported)}. ${auto.lastSuccessAt ? `Latest mirror ${formatAutoBackupDateTime(auto.lastSuccessAt)}.` : 'No folder backup has completed yet.'} Browser data is origin/profile-scoped; folder access is separate.`
      : 'Choose a backup folder to enable automatic latest-file mirroring and daily backups.';
    currentFolderState.classList.toggle('is-backup-issue', folderIssueCodes.includes(health.code));
  }
  setStatusPill(currentFolderPill, auto.folderName && !auto.needsReconnect ? 'Connected' : 'Review', {
    muted: !auto.folderName,
    issue: folderIssueCodes.includes(health.code),
  });
}

function renderStorageSettings(health) {
  const saveState = document.getElementById('settings-storage-save-state');
  const saveDetail = document.getElementById('settings-storage-save-detail');
  const savePill = document.getElementById('settings-storage-save-pill');
  const totalState = document.getElementById('settings-storage-total-state');
  const totalDetail = document.getElementById('settings-storage-total-detail');
  const totalPill = document.getElementById('settings-storage-total-pill');
  const usageReport = getAppStorageUsageReport();
  const readFailures = typeof storageReadFailureList === 'function' ? storageReadFailureList() : [];
  const keyIds = {
    [KEYS.EXERCISES]: 'settings-storage-exercises',
    [KEYS.SESSIONS]: 'settings-storage-sessions',
    [KEYS.SETTINGS]: 'settings-storage-settings',
    [KEYS.EVENTS]: 'settings-storage-events',
    [KEYS.ACTIVITYWATCH]: 'settings-storage-activitywatch',
    [KEYS.WORKLOAD]: 'settings-storage-workload',
  };

  if (saveState && saveDetail) {
    if (readFailures.length) {
      const firstReadFailure = readFailures[0];
      const more = readFailures.length > 1 ? ` ${formatNumber(readFailures.length - 1)} more key${readFailures.length === 2 ? '' : 's'} also failed to load.` : '';
      saveState.textContent = 'Saved data could not be read';
      saveDetail.textContent = `${firstReadFailure.label} contains malformed JSON and was left untouched. Saves to affected keys are blocked until a backup import or deliberate restore replaces them.${more}`;
    } else if (storageHealth.lastFailure) {
      saveState.textContent = 'Last save failed';
      saveDetail.textContent = `${storageHealth.lastFailure.label} did not save ${formatBytes(storageHealth.lastFailure.size)} at ${formatAutoBackupDateTime(storageHealth.lastFailure.at)}.`;
    } else if (storageHealth.lastSuccess) {
      saveState.textContent = 'Last save succeeded';
      saveDetail.textContent = `${storageHealth.lastSuccess.label} saved ${formatBytes(storageHealth.lastSuccess.size)} at ${formatAutoBackupDateTime(storageHealth.lastSuccess.at)}.`;
    } else {
      saveState.textContent = 'No save yet this page load';
      saveDetail.textContent = 'The next app-data save will update this status.';
    }
    saveState.classList.toggle('is-backup-issue', Boolean(readFailures.length) || Boolean(storageHealth.lastFailure) || health.code === 'storage-unavailable');
  }
  setStatusPill(savePill, readFailures.length || storageHealth.lastFailure || health.code === 'storage-unavailable' ? 'Failed' : storageHealth.lastSuccess ? 'Saved' : 'Waiting', {
    muted: !readFailures.length && !storageHealth.lastFailure && !storageHealth.lastSuccess && health.code !== 'storage-unavailable',
    issue: Boolean(readFailures.length) || Boolean(storageHealth.lastFailure) || health.code === 'storage-unavailable',
  });

  if (totalState && totalDetail) {
    totalState.textContent = usageReport.available ? `App storage ${usageReport.tier.label}` : 'App storage unavailable';
    totalDetail.textContent = usageReport.available
      ? `${usageReport.totalText} saved in app localStorage keys. ${usageReport.tier.detail}`
      : usageReport.tier.detail;
  }
  setStatusPill(totalPill, usageReport.tier.label, {
    issue: usageReport.tier.code === 'watch' || usageReport.tier.code === 'unavailable',
    muted: usageReport.tier.code === 'ok',
  });

  usageReport.keys.forEach(item => {
    const node = document.getElementById(keyIds[item.key]);
    if (node) node.textContent = item.text;
  });
  const storageTotal = document.getElementById('settings-storage-total');
  const storageTier = document.getElementById('settings-storage-tier');
  const storageSummaryTotal = document.getElementById('settings-storage-summary-total');
  const storageSummaryTier = document.getElementById('settings-storage-summary-tier');
  if (storageTotal) storageTotal.textContent = usageReport.totalText;
  if (storageTier) storageTier.textContent = `${usageReport.tier.label} - ${usageReport.tier.detail}`;
  if (storageSummaryTotal) storageSummaryTotal.textContent = usageReport.totalText;
  if (storageSummaryTier) storageSummaryTier.textContent = `${usageReport.tier.label} - ${usageReport.tier.detail}`;

  const testState = document.getElementById('settings-storage-test-state');
  const testDetail = document.getElementById('settings-storage-test-detail');
  const dismissBtn = document.getElementById('settings-dismiss-save-warning-test');
  const clearTestModeBtn = document.getElementById('settings-clear-test-mode');
  const testSummary = document.getElementById('settings-storage-test-summary');
  const activeTestMode = getActivePemStorageTestMode();
  const activeTestInfo = pemStorageTestModeInfo(activeTestMode);
  if (testState && testDetail) {
    if (activeTestInfo) {
      testState.textContent = activeTestInfo.title;
      testDetail.textContent = activeTestInfo.detail;
    } else if (storageHealth.simulatedFailure) {
      testState.textContent = 'Test warning is showing';
      testDetail.textContent = 'This simulated warning is non-destructive and can be dismissed here.';
    } else {
      testState.textContent = 'No storage test mode active';
      testDetail.textContent = 'These are debugging checks for after code changes. They intentionally break saving so you or Codex can confirm the warning and recovery paths still work.';
    }
  }
  if (dismissBtn) dismissBtn.disabled = !storageHealth.simulatedFailure;
  if (clearTestModeBtn) clearTestModeBtn.disabled = !activeTestMode;
  if (testSummary) testSummary.textContent = activeTestInfo ? `Active: ${activeTestInfo.summary}` : 'No URL test mode active';
}

function renderBrowserStorageEstimate() {
  const state = document.getElementById('settings-browser-storage-state');
  const detail = document.getElementById('settings-browser-storage-detail');
  const pill = document.getElementById('settings-browser-storage-pill');
  if (!state || !detail) return;
  const requestId = ++browserStorageEstimateRequestId;
  state.textContent = 'Checking browser origin estimate';
  detail.textContent = 'This browser-reported estimate comes from navigator.storage.estimate(). It is not localStorage-specific and may not match the app total.';
  setStatusPill(pill, 'Checking', { muted: true });
  getBrowserStorageEstimate().then(estimate => {
    if (requestId !== browserStorageEstimateRequestId) return;
    if (!estimate.available) {
      state.textContent = 'Origin estimate unavailable';
      detail.textContent = estimate.detail;
      setStatusPill(pill, 'Unavailable', { muted: true });
      return;
    }
    state.textContent = 'Browser origin estimate';
    detail.textContent = `${estimate.detail} Browser-reported estimate from navigator.storage.estimate(); not localStorage-specific, not exact, and may not match Total app data. Recent Chrome may report an artificial quota around 10 GiB for privacy/predictability.`;
    setStatusPill(pill, 'Estimate', { muted: true });
  });
}

function setStatusPill(pill, text, options = {}) {
  if (!pill) return;
  pill.textContent = text;
  pill.classList.toggle('is-muted', Boolean(options.muted));
  pill.classList.toggle('is-backup-issue', Boolean(options.issue));
}

function toggleAutoBackupHistory() {
  autoBackupHistoryExpanded = !autoBackupHistoryExpanded;
  renderAutoBackupSettings();
}

function renderAutoBackupSummary(root, history) {
  root.innerHTML = '';
  const latest = history[0];
  if (!latest) {
    root.appendChild(elText('div', 'auto-backup-history-empty', 'No folder backups yet.'));
    return;
  }
  root.appendChild(buildAutoBackupHistoryItem(latest));
}

function renderAutoBackupHistory(root, history) {
  root.innerHTML = '';
  const items = history.slice(1, 6);
  if (!items.length) {
    root.appendChild(elText('div', 'auto-backup-history-empty', 'No older backup history yet.'));
    return;
  }
  items.forEach(item => root.appendChild(buildAutoBackupHistoryItem(item)));
}

function buildAutoBackupHistoryItem(item) {
  const row = el('div', `auto-backup-history-item ${item.status === 'success' ? 'is-success' : 'is-error'}`);
  row.appendChild(elText('div', 'auto-backup-history-main', autoBackupHistoryTitle(item)));
  const detail = autoBackupHistoryDetail(item);
  if (detail) row.appendChild(elText('div', 'auto-backup-history-detail', detail));
  return row;
}

function autoBackupHistoryTitle(item) {
  if (item.status === 'missed') return `Backup missed - ${formatAutoBackupDateTime(item.at)}`;
  if (item.status === 'error') return `Backup failed - ${formatAutoBackupDateTime(item.at)}`;
  const label = item.type === 'manual'
    ? 'Manual backup saved'
    : item.schedule === 'hourly'
      ? 'Hourly recovery backup saved'
      : 'Daily backup saved';
  return `${label} - ${formatAutoBackupDateTime(item.at)}`;
}

function autoBackupHistoryDetail(item) {
  if (item.status === 'error' || item.status === 'missed') return item.message || 'Backup did not complete.';
  if (item.type === 'manual' && item.count > 1) return `${formatNumber(item.count)} manual runs today`;
  return '';
}

function dataSafetyReceiptText(report) {
  const summary = report.summary || {};
  return [`Checked ${formatAutoBackupDateTime(report.checkedAt)}.`, `Saved in this browser: ${backupSummaryText(summary)}.`].join(' ');
}

function verifiedBackupReceiptText(auto) {
  const summary = auto.lastVerifiedSummary || {};
  return [`Verified ${formatAutoBackupDateTime(auto.lastVerifiedAt)} by reading back the latest JSON backup.`, `Backup contains ${backupSummaryText(summary)}.`].join(' ');
}
