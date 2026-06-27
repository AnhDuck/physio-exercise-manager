// App bootstrap and static event bindings.

function runStartupStep(label, fn, options = {}) {
  try {
    const result = fn();
    if (result && typeof result.then === 'function') {
      return result.catch(err => handleStartupStepError(label, err, options));
    }
    return result;
  } catch (err) {
    return handleStartupStepError(label, err, options);
  }
}

function handleStartupStepError(label, err, options = {}) {
  console.error(`[Startup] ${label} failed.`, err);
  if (options.toast !== false && typeof showToast === 'function') {
    showToast(`${label} did not start. Other features are still available.`);
  }
  if (typeof options.onError === 'function') {
    try {
      return options.onError(err);
    } catch (fallbackErr) {
      console.error(`[Startup] ${label} fallback failed.`, fallbackErr);
    }
  }
  return options.fallback;
}

function fallbackStartupSettings() {
  return {
    createdAt: typeof todayStr === 'function' ? todayStr() : '',
    setCueSound: true,
    setCueVibrate: true,
    setCueSpeech: false,
    setCueSpeechVolume: 1,
    personalDayStartTime: '07:00',
    timelineRange: 'past-30-days',
    homeCards: typeof defaultHomeCardsSettings === 'function' ? defaultHomeCardsSettings() : {},
    autoBackup: typeof defaultAutoBackupSettings === 'function' ? defaultAutoBackupSettings() : {},
  };
}

function useStartupFallbackData() {
  exercises = Array.isArray(exercises) ? exercises : DEFAULT_EXERCISES.map(e => ({ ...e }));
  sessions = sessions && typeof sessions === 'object' && !Array.isArray(sessions) ? sessions : {};
  settings = settings && typeof settings === 'object' && !Array.isArray(settings) && Object.keys(settings).length
    ? settings
    : fallbackStartupSettings();
  events = Array.isArray(events) ? events : [];
  workloadData = workloadData && typeof workloadData === 'object' && !Array.isArray(workloadData)
    ? workloadData
    : defaultWorkloadData();
}

document.addEventListener('DOMContentLoaded', () => {
  runStartupStep('Load persisted app data', () => {
    exercises = loadExercises();
    sessions = loadSessions();
    settings = loadSettings();
    events = loadEvents();
    loadWorkloadData();
    if (typeof loadActivityWatchData === 'function') loadActivityWatchData();
  }, { onError: useStartupFallbackData });

  runStartupStep('Check browser data freshness', () => {
    if (typeof currentAppDataLooksFreshOrEmpty === 'function') {
      appStartedWithFreshBrowserData = currentAppDataLooksFreshOrEmpty();
    }
  });

  runStartupStep('Seed verification sample data', () => {
    if (typeof ensureVerificationSampleData === 'function') ensureVerificationSampleData();
  });

  runStartupStep('Run startup migrations', runMigrations);
  runStartupStep('Initialize calendar state', () => {
    currentWeekStart = getMonday(new Date());
    lastTodayStr = todayStr();
  });
  runStartupStep('Restore active set tracker', restoreActiveTracker);
  runStartupStep('Set header quote', setHeaderQuote);
  runStartupStep('Initial render', render);
  runStartupStep('Static event binding', bindStaticEvents);
  runStartupStep('Notes panel render', renderNotesPanel);
  runStartupStep('Realtime updates', startRealtimeUpdates);
  runStartupStep('Auto-backup init', initializeAutoBackup);
  runStartupStep('Home cards start', () => {
    if (typeof startHomeCards === 'function') startHomeCards();
  });
  runStartupStep('Restore ActivityWatch dashboard', () => {
    if (typeof restoreActivityWatchDashboardIfNeeded === 'function') restoreActivityWatchDashboardIfNeeded();
  });
  runStartupStep('ActivityWatch startup sync', () => {
    if (typeof maybeSyncActivityWatchRecent === 'function') return maybeSyncActivityWatchRecent('startup');
    return null;
  });
  runStartupStep('Enable storage test controls', markStorageTestsReadyForUserActions, { toast: false });
});

function warnStaticBinding(message) {
  console.warn(`[Static binding] ${message}`);
}

function bindEvent(id, eventName, handler, options = {}) {
  const required = options.required !== false;
  const element = document.getElementById(id);
  if (!element) {
    if (required) warnStaticBinding(`#${id} is missing; ${eventName} handler was not bound.`);
    return null;
  }
  if (typeof handler !== 'function') {
    if (required) warnStaticBinding(`#${id} has no ${eventName} handler function.`);
    return element;
  }
  try {
    element.addEventListener(eventName, handler, options.listenerOptions);
  } catch (err) {
    warnStaticBinding(`#${id} ${eventName} handler could not be bound: ${err.message || err}`);
  }
  return element;
}

function bindClick(id, handler, options) {
  return bindEvent(id, 'click', handler, options);
}

function bindChange(id, handler, options) {
  return bindEvent(id, 'change', handler, options);
}

function bindInput(id, handler, options) {
  return bindEvent(id, 'input', handler, options);
}

function bindKeydown(id, handler, options) {
  return bindEvent(id, 'keydown', handler, options);
}

function bindStaticEvents() {
  hydrateIconButtons(document);
  document.querySelectorAll('.notes-toggle').forEach(btn => {
    btn.addEventListener('click', toggleNotesPanel);
  });
  const timelineSearchInput = document.getElementById('timeline-search-input');
  const timelineFilterReset = document.getElementById('timeline-filter-reset');
  const timelineTools = document.querySelector('.timeline-tools');
  const timelineSearchDone = document.getElementById('timeline-search-done');
  bindClick('timeline-copy', () => copyTimelineMarkdown('matching'));
  timelineTools?.addEventListener('click', (e) => e.stopPropagation());
  timelineSearchInput?.addEventListener('focus', () => setTimelineControlsExpanded(true));
  timelineSearchInput?.addEventListener('click', () => setTimelineControlsExpanded(true));
  timelineSearchInput?.addEventListener('input', (e) => setTimelineSearchText(e.target.value));
  timelineSearchInput?.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    setTimelineControlsExpanded(false);
  });
  bindChange('timeline-range', (e) => setTimelineRange(e.target.value));
  timelineSearchDone?.addEventListener('click', () => setTimelineControlsExpanded(false));
  timelineFilterReset?.addEventListener('click', (e) => {
    e.stopPropagation();
    resetTimelineFilters();
  });
  bindClick('timeline-type-filters', (e) => {
    const button = e.target.closest('[data-timeline-type-filter]');
    if (!button) return;
    toggleTimelineTypeFilter(button.dataset.timelineTypeFilter);
  });
  document.addEventListener('click', (e) => {
    if (!timelineControlsExpanded()) return;
    if (timelineTools?.contains(e.target)) return;
    setTimelineControlsExpanded(false);
  });
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' || !timelineControlsExpanded()) return;
    setTimelineControlsExpanded(false);
  });
  bindClick('timeline-list', (e) => {
    if (e.target.closest('#timeline-load-older')) {
      loadOlderTimelineItems();
    }
  });
  bindClick('quick-note-save', addQuickNote);
  bindClick('quick-note-manual-toggle', toggleQuickNoteManualDateTime);
  bindInput('quick-note-date', renderQuickNoteManualDateTime);
  bindInput('quick-note-time', renderQuickNoteManualDateTime);
  bindKeydown('quick-note-text', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      addQuickNote();
    }
  });
  document.addEventListener('keydown', handleSetTrackerKeydown);
  window.addEventListener('focus', updateSetTrackerFocusIndicator);
  window.addEventListener('blur', updateSetTrackerFocusIndicator);
  if (typeof closeCompletedActionMenu === 'function') {
    document.addEventListener('click', () => closeCompletedActionMenu());
  }

  bindClick('modal-cancel', closeModal);
  bindClick('exercise-modal-close', closeModal);
  bindClick('modal-save', saveExerciseModal);
  bindClick('hide-btn', hideExercise);

  const exerciseModal = bindClick('exercise-modal', (e) => {
    if (e.target === exerciseModal) closeModal();
  });

  bindChange('image-upload-input', (e) => {
    handleImageUpload(e.target.files[0]);
    e.target.value = ''; // reset so same file can be re-selected
  });

  bindClick('image-file-btn', openImageUpload);
  bindClick('image-cancel', closeImageModal);
  bindClick('image-modal-close', closeImageModal);
  bindClick('image-import-btn', importImageFromUrl);
  bindClick('image-remove-btn', removeExerciseImage);
  bindKeydown('field-image-url', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      importImageFromUrl();
    }
  });
  const imageModal = bindClick('image-modal', (e) => {
    if (e.target === imageModal) closeImageModal();
  });

  bindClick('btn-settings', openSettingsModal);
  bindClick('btn-activitywatch', openActivityWatchDashboard, { required: false });
  bindClick('settings-close', closeSettingsModal);
  document.querySelectorAll('#settings-modal [data-settings-tab]').forEach(tab => {
    tab.addEventListener('click', () => setSettingsTab(tab.dataset.settingsTab, true));
    tab.addEventListener('keydown', handleSettingsTabKeydown);
  });
  bindClick('settings-clear-review', clearChangedSincePhysioMarkers);
  bindClick('settings-export-json', exportFullBackup);
  bindClick('settings-import-json', openBackupImportPicker);
  bindClick('settings-test-save-warning', simulateStorageFailureWarning);
  bindClick('settings-dismiss-save-warning-test', dismissSimulatedStorageFailureWarning);
  document.querySelectorAll('[data-pem-test-mode]').forEach(btn => {
    btn.addEventListener('click', () => activatePemStorageTestMode(btn.dataset.pemTestMode));
  });
  bindClick('settings-clear-test-mode', clearPemStorageTestMode);
  bindClick('backup-health-action', handleBackupHealthAction);
  bindClick('settings-auto-backup-folder', chooseAutoBackupFolder);
  bindClick('settings-auto-backup-now', runManualFolderBackup);
  bindClick('settings-auto-backup-history-toggle', toggleAutoBackupHistory);
  bindClick('settings-blocks-apply', applyBlockDraft);
  bindClick('settings-blocks-discard', discardBlockDraft);
  bindChange('settings-import-file', (e) => {
    handleBackupImportFile(e.target.files[0]);
    e.target.value = '';
  });
  bindChange('setting-personal-day-start', autosaveGeneralSettings);
  bindChange('setting-cue-sound', autosaveGeneralSettings);
  bindChange('setting-cue-vibrate', autosaveGeneralSettings);
  bindInput('setting-cue-speech-volume', handleSpeechVolumeInput);
  bindChange('setting-cue-speech', autosaveGeneralSettings);
  bindChange('setting-auto-backup-time', autosaveAutoBackupTime);
  bindInput('setting-weather-location-search', scheduleWeatherLocationLiveSearch, { required: false });
  bindKeydown('setting-weather-location-search', (e) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    searchWeatherLocationsFromSettings();
  }, { required: false });
  bindClick('setting-weather-location-search-btn', searchWeatherLocationsFromSettings, { required: false });
  bindClick('setting-weather-location-clear-btn', clearWeatherLocationFromSettings, { required: false });
  bindClick('setting-weather-location-results', (e) => {
    const result = e.target.closest('[data-weather-location-index]');
    if (!result) return;
    applySelectedWeatherLocation(result.dataset.weatherLocationIndex);
  }, { required: false });
  bindChange('setting-weather-refresh-minutes', autosaveWeatherRefreshMinutes, { required: false });
  bindChange('setting-weather-air-quality-enabled', autosaveWeatherFeatureSettings, { required: false });
  bindChange('setting-weather-alerts-enabled', autosaveWeatherFeatureSettings, { required: false });
  bindChange('setting-weather-preview-mode', autosaveWeatherPreviewMode, { required: false });
  bindClick('setting-weather-preview-random-btn', randomizeWeatherPreviewMode, { required: false });
  bindChange('setting-aw-mini-refresh-minutes', autosaveActivityWatchMiniRefreshMinutes, { required: false });
  bindChange('setting-workload-card-enabled', autosaveWorkloadCardEnabled, { required: false });
  bindChange('setting-workload-running-border-enabled', autosaveWorkloadCueSettings, { required: false });
  bindChange('setting-workload-reminder-minutes', autosaveWorkloadCueSettings, { required: false });
  bindChange('setting-workload-reminder-sound', autosaveWorkloadCueSettings, { required: false });
  bindClick('setting-workload-reminder-test-btn', testWorkloadReminderSound, { required: false });
  bindChange('setting-activitywatch-server-url', saveActivityWatchServerUrlSetting, { required: false });
  bindClick('settings-activitywatch-refresh', refreshActivityWatchFromSettings, { required: false });
  document.addEventListener('keydown', handleSettingsKeydown);
  const settingsModal = bindClick('settings-modal', (e) => {
    if (e.target === settingsModal) closeSettingsModal();
  });

  bindClick('event-cancel', closeEventModal);
  bindClick('event-modal-close', closeEventModal);
  bindClick('event-save', saveEventModal);
  bindClick('event-delete-btn', deleteEventModal);
  const eventModal = bindClick('event-modal', (e) => {
    if (e.target === eventModal) closeEventModal();
  });
}

