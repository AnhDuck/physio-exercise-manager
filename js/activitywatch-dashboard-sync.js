// ActivityWatch dashboard advanced sync controls and progress UI.

function buildActivityWatchAdvancedSyncPanel(days, isSyncing, status = getActivityWatchStatus(), progress = { active: false }) {
  ensureActivityWatchAdvancedSyncDefaults(days);
  const panel = el('section', 'activitywatch-advanced-sync-panel');
  const header = el('div', 'activitywatch-advanced-sync-header');
  const copy = el('div', '');
  copy.appendChild(elText('strong', '', 'Advanced sync'));
  copy.appendChild(elText('span', '', 'Use this after ActivityWatch category rules change. Choose the dates first; routine dashboard updates should use Refresh.'));
  header.appendChild(copy);
  const close = el('button', 'activitywatch-advanced-sync-close');
  close.type = 'button';
  close.title = 'Close advanced sync';
  close.setAttribute('aria-label', 'Close advanced sync');
  close.appendChild(buildAppIconSvg('x'));
  close.addEventListener('click', () => {
    activityWatchDashboardState.advancedSyncOpen = false;
    renderActivityWatchDashboard();
  });
  header.appendChild(close);
  panel.appendChild(header);

  const form = el('div', 'activitywatch-advanced-sync-form');
  const modeLabel = el('label', 'activitywatch-advanced-sync-field');
  modeLabel.appendChild(elText('span', '', 'Dates'));
  const mode = el('select', '');
  mode.id = 'activitywatch-advanced-sync-mode';
  activityWatchAdvancedSyncOptions(days).forEach(option => {
    const item = document.createElement('option');
    item.value = option.value;
    item.textContent = option.label;
    mode.appendChild(item);
  });
  mode.value = activityWatchDashboardState.advancedSyncMode;
  mode.addEventListener('change', () => {
    activityWatchDashboardState.advancedSyncMode = mode.value;
    renderActivityWatchDashboard();
  });
  modeLabel.appendChild(mode);
  form.appendChild(modeLabel);

  if (activityWatchDashboardState.advancedSyncMode === 'custom') {
    form.appendChild(buildActivityWatchAdvancedSyncDateInput('Start', 'activitywatch-advanced-sync-start', 'advancedSyncCustomStart'));
    form.appendChild(buildActivityWatchAdvancedSyncDateInput('End', 'activitywatch-advanced-sync-end', 'advancedSyncCustomEnd'));
  }

  const syncDates = activityWatchAdvancedSyncDateStrings(days);
  const count = syncDates.length;
  const summary = el('div', 'activitywatch-advanced-sync-summary');
  summary.appendChild(elText('strong', '', count ? `${formatNumber(count)} waking days` : 'No dates selected'));
  summary.appendChild(elText('span', '', activityWatchAdvancedSyncSummary(syncDates)));
  form.appendChild(summary);

  const run = el('button', 'settings-backup-btn activitywatch-advanced-sync-run');
  run.type = 'button';
  run.dataset.settingsIcon = 'restore';
  run.disabled = isSyncing || !count;
  run.title = count ? `Resync ${formatNumber(count)} selected waking days` : 'Choose dates before resyncing';
  run.addEventListener('click', () => {
    maybeSyncActivityWatchDateStrings('dashboard-advanced-manual', syncDates, { force: true });
  });
  setSettingsButtonContent(run, isSyncing ? 'Syncing...' : 'Resync selected', 'restore');
  form.appendChild(run);
  panel.appendChild(form);

  if (count > 90) {
    panel.appendChild(elText('div', 'activitywatch-advanced-sync-warning', 'Large resyncs can take a while. Last 30 days or the visible range is usually enough after small category edits.'));
  }
  panel.appendChild(buildActivityWatchAdvancedMetadata(status, progress));
  return panel;
}

function buildActivityWatchAdvancedMetadata(status, progress) {
  const metadata = el('div', 'activitywatch-advanced-metadata');
  metadata.appendChild(buildActivityWatchMetadataItem('Status', activityWatchDashboardStatusTitle(status, progress)));
  metadata.appendChild(buildActivityWatchMetadataItem('Detail', activityWatchDashboardStatusDetail(status, progress)));
  metadata.appendChild(buildActivityWatchMetadataItem('Desktop', activityWatchData.host || 'Not detected'));
  metadata.appendChild(buildActivityWatchMetadataItem('ActivityWatch version', activityWatchData.activityWatchVersion || 'Unknown'));
  metadata.appendChild(buildActivityWatchMetadataItem('Server URL', getActivityWatchServerUrl()));
  metadata.appendChild(buildActivityWatchMetadataItem('Window bucket', activityWatchData.buckets?.window || 'Not detected'));
  metadata.appendChild(buildActivityWatchMetadataItem('AFK bucket', activityWatchData.buckets?.afk || 'Not detected'));
  metadata.appendChild(buildActivityWatchMetadataItem('Cached days', formatNumber(activityWatchStoredDateStrings().length)));
  metadata.appendChild(buildActivityWatchMetadataItem('Day start', activityWatchData.startOfDay || 'Unknown'));
  metadata.appendChild(buildActivityWatchMetadataItem('Last sync', activityWatchData.lastSyncAt ? formatAutoBackupDateTime(activityWatchData.lastSyncAt) : 'Never'));
  return metadata;
}

function buildActivityWatchMetadataItem(label, value) {
  const item = el('div', 'activitywatch-advanced-metadata-item');
  item.appendChild(elText('span', '', label));
  item.appendChild(elText('strong', '', value));
  return item;
}

function buildActivityWatchAdvancedSyncDateInput(label, id, stateKey) {
  const field = el('label', 'activitywatch-advanced-sync-field');
  field.appendChild(elText('span', '', label));
  const input = el('input', '');
  input.type = 'date';
  input.id = id;
  input.max = activityWatchCurrentWakingDateStr();
  input.value = activityWatchDashboardState[stateKey];
  input.addEventListener('change', () => {
    activityWatchDashboardState[stateKey] = input.value;
    renderActivityWatchDashboard();
  });
  field.appendChild(input);
  return field;
}

function ensureActivityWatchAdvancedSyncDefaults(days) {
  const current = activityWatchCurrentWakingDateStr();
  if (!activityWatchDashboardState.advancedSyncMode) {
    activityWatchDashboardState.advancedSyncMode = activityWatchStoredDateStrings().length ? 'visible' : 'last30';
  }
  if (!activityWatchDashboardState.advancedSyncCustomEnd) {
    activityWatchDashboardState.advancedSyncCustomEnd = days[days.length - 1]?.date || current;
  }
  if (!activityWatchDashboardState.advancedSyncCustomStart) {
    const start = dateFromStr(activityWatchDashboardState.advancedSyncCustomEnd);
    start.setDate(start.getDate() - 29);
    activityWatchDashboardState.advancedSyncCustomStart = toDateStr(start);
  }
}

function activityWatchAdvancedSyncOptions(days) {
  const options = [
    { value: 'visible', label: `Visible range (${formatNumber(days.length)} days)` },
    { value: 'last30', label: 'Last 30 days' },
    { value: 'last90', label: 'Last 90 days' },
  ];
  const stored = activityWatchStoredDateStrings();
  if (stored.length) {
    options.push({ value: 'stored', label: `Stored days (${formatNumber(stored.length)} days)` });
  }
  options.push({ value: 'custom', label: 'Custom dates' });
  if (!options.some(option => option.value === activityWatchDashboardState.advancedSyncMode)) {
    activityWatchDashboardState.advancedSyncMode = options[0].value;
  }
  return options;
}

function activityWatchAdvancedSyncDateStrings(days) {
  const mode = activityWatchDashboardState.advancedSyncMode;
  if (mode === 'visible') return days.map(day => day.date).filter(activityWatchIsValidDate);
  if (mode === 'last30') return activityWatchRecentDateStrings(30);
  if (mode === 'last90') return activityWatchRecentDateStrings(90);
  if (mode === 'stored') return activityWatchStoredDateStrings();
  if (mode === 'custom') return activityWatchDateStringsBetween(activityWatchDashboardState.advancedSyncCustomStart, activityWatchDashboardState.advancedSyncCustomEnd);
  return [];
}

function activityWatchAdvancedSyncSummary(dateStrings) {
  if (!dateStrings.length) return 'Choose a valid start and end date.';
  const first = dateStrings[0];
  const last = dateStrings[dateStrings.length - 1];
  return first === last
    ? formatEventDate(first)
    : `${formatEventDate(first)} to ${formatEventDate(last)}`;
}

function activityWatchStoredDateStrings() {
  return Object.keys(activityWatchData.daysByDate || {})
    .filter(activityWatchIsValidDate)
    .sort();
}

function activityWatchDateStringsBetween(startDate, endDate) {
  if (!activityWatchIsValidDate(startDate) || !activityWatchIsValidDate(endDate)) return [];
  const current = activityWatchCurrentWakingDateStr();
  const start = startDate <= endDate ? startDate : endDate;
  let end = startDate <= endDate ? endDate : startDate;
  if (start > current) return [];
  if (end > current) end = current;
  const dates = [];
  const cursor = dateFromStr(start);
  const endObj = dateFromStr(end);
  while (cursor <= endObj) {
    dates.push(toDateStr(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return dates;
}

function buildActivityWatchSyncProgress(progress) {
  const total = Math.max(1, Number(progress.totalDays) || 1);
  const completed = Math.min(total, Math.max(0, Number(progress.completedDays) || 0));
  const wrap = el('div', 'activitywatch-sync-progress');
  const range = activityWatchProgressDateRange(progress);
  const label = progress.mode === 'fallback'
    ? activityWatchFallbackProgressLabel(progress, completed, total, range)
    : `Requesting ${formatNumber(total)} days at once${range ? ` - ${range}` : ''}`;
  wrap.appendChild(elText('span', '', label));
  const track = el('div', 'activitywatch-sync-progress-track');
  const fill = el('span', '');
  if (progress.mode === 'fallback') {
    fill.style.width = `${Math.max(3, (completed / total) * 100)}%`;
  } else {
    track.classList.add('is-indeterminate');
  }
  track.appendChild(fill);
  wrap.appendChild(track);
  return wrap;
}

function activityWatchFallbackProgressLabel(progress, completed, total, range) {
  if (completed <= 0) {
    return `Full request did not finish; retrying 14-day batches${range ? ` - ${range}` : ''}`;
  }
  return `Retrying in 14-day batches - ${formatNumber(completed)} of ${formatNumber(total)} days synced${range ? ` - latest batch ${range}` : ''}`;
}

function activityWatchProgressDateRange(progress) {
  if (!progress.currentDate) return '';
  if (!progress.currentEndDate || progress.currentEndDate === progress.currentDate) {
    return formatEventDate(progress.currentDate);
  }
  return `${formatEventDate(progress.currentDate)} to ${formatEventDate(progress.currentEndDate)}`;
}

