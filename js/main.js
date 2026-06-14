// App bootstrap and static event bindings.

document.addEventListener('DOMContentLoaded', () => {
  exercises = loadExercises();
  sessions  = loadSessions();
  settings  = loadSettings();
  events    = loadEvents();
  if (typeof loadActivityWatchData === 'function') loadActivityWatchData();
  if (typeof ensureVerificationSampleData === 'function') ensureVerificationSampleData();
  runMigrations();
  currentWeekStart = getMonday(new Date());
  lastTodayStr = todayStr();
  try {
    restoreActiveTracker();
  } catch (err) {
    console.error('Could not restore active tracker state.', err);
  }
  setHeaderQuote();
  render();
  bindStaticEvents();
  renderNotesPanel();
  startRealtimeUpdates();
  initializeAutoBackup();
  if (typeof startHomeCards === 'function') startHomeCards();
  if (typeof maybeSyncActivityWatchRecent === 'function') maybeSyncActivityWatchRecent('startup');
  markStorageTestsReadyForUserActions();
});
function bindStaticEvents() {
  hydrateIconButtons(document);
  document.querySelectorAll('.notes-toggle').forEach(btn => {
    btn.addEventListener('click', toggleNotesPanel);
  });
  const timelineSearchInput = document.getElementById('timeline-search-input');
  const timelineFilterReset = document.getElementById('timeline-filter-reset');
  const timelineTools = document.querySelector('.timeline-tools');
  const timelineSearchDone = document.getElementById('timeline-search-done');
  document.getElementById('timeline-copy').addEventListener('click', () => copyTimelineMarkdown('matching'));
  timelineTools?.addEventListener('click', (e) => e.stopPropagation());
  timelineSearchInput?.addEventListener('focus', () => setTimelineControlsExpanded(true));
  timelineSearchInput?.addEventListener('click', () => setTimelineControlsExpanded(true));
  timelineSearchInput?.addEventListener('input', (e) => setTimelineSearchText(e.target.value));
  timelineSearchInput?.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    setTimelineControlsExpanded(false);
  });
  document.getElementById('timeline-range').addEventListener('change', (e) => setTimelineRange(e.target.value));
  timelineSearchDone?.addEventListener('click', () => setTimelineControlsExpanded(false));
  timelineFilterReset?.addEventListener('click', (e) => {
    e.stopPropagation();
    resetTimelineFilters();
  });
  document.getElementById('timeline-type-filters').addEventListener('click', (e) => {
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
  document.getElementById('timeline-list').addEventListener('click', (e) => {
    if (e.target.closest('#timeline-load-older')) {
      loadOlderTimelineItems();
    }
  });
  document.getElementById('quick-note-save').addEventListener('click', addQuickNote);
  document.getElementById('quick-note-manual-toggle').addEventListener('click', toggleQuickNoteManualDateTime);
  document.getElementById('quick-note-date').addEventListener('input', renderQuickNoteManualDateTime);
  document.getElementById('quick-note-time').addEventListener('input', renderQuickNoteManualDateTime);
  document.getElementById('quick-note-text').addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      addQuickNote();
    }
  });
  document.addEventListener('keydown', handleSetTrackerKeydown);
  if (typeof closeCompletedActionMenu === 'function') {
    document.addEventListener('click', () => closeCompletedActionMenu());
  }
  window.addEventListener('scroll', updateCompactHeader, { passive: true });

  document.getElementById('modal-cancel').addEventListener('click', closeModal);
  document.getElementById('exercise-modal-close').addEventListener('click', closeModal);
  document.getElementById('modal-save').addEventListener('click', saveExerciseModal);
  document.getElementById('hide-btn').addEventListener('click', hideExercise);

  document.getElementById('exercise-modal').addEventListener('click', (e) => {
    if (e.target === document.getElementById('exercise-modal')) closeModal();
  });

  document.getElementById('image-upload-input').addEventListener('change', (e) => {
    handleImageUpload(e.target.files[0]);
    e.target.value = ''; // reset so same file can be re-selected
  });

  document.getElementById('image-file-btn').addEventListener('click', openImageUpload);
  document.getElementById('image-cancel').addEventListener('click', closeImageModal);
  document.getElementById('image-modal-close').addEventListener('click', closeImageModal);
  document.getElementById('image-import-btn').addEventListener('click', importImageFromUrl);
  document.getElementById('image-remove-btn').addEventListener('click', removeExerciseImage);
  document.getElementById('field-image-url').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      importImageFromUrl();
    }
  });
  document.getElementById('image-modal').addEventListener('click', (e) => {
    if (e.target === document.getElementById('image-modal')) closeImageModal();
  });

  document.getElementById('btn-settings').addEventListener('click', openSettingsModal);
  document.getElementById('btn-activitywatch')?.addEventListener('click', openActivityWatchDashboard);
  document.getElementById('settings-close').addEventListener('click', closeSettingsModal);
  document.querySelectorAll('#settings-modal [data-settings-tab]').forEach(tab => {
    tab.addEventListener('click', () => setSettingsTab(tab.dataset.settingsTab, true));
    tab.addEventListener('keydown', handleSettingsTabKeydown);
  });
  document.getElementById('settings-clear-review').addEventListener('click', clearChangedSincePhysioMarkers);
  document.getElementById('settings-export-json').addEventListener('click', exportFullBackup);
  document.getElementById('settings-import-json').addEventListener('click', openBackupImportPicker);
  document.getElementById('settings-test-save-warning').addEventListener('click', simulateStorageFailureWarning);
  document.getElementById('settings-dismiss-save-warning-test').addEventListener('click', dismissSimulatedStorageFailureWarning);
  document.querySelectorAll('[data-pem-test-mode]').forEach(btn => {
    btn.addEventListener('click', () => activatePemStorageTestMode(btn.dataset.pemTestMode));
  });
  document.getElementById('settings-clear-test-mode').addEventListener('click', clearPemStorageTestMode);
  document.getElementById('backup-health-action').addEventListener('click', handleBackupHealthAction);
  document.getElementById('settings-auto-backup-folder').addEventListener('click', chooseAutoBackupFolder);
  document.getElementById('settings-auto-backup-now').addEventListener('click', runManualFolderBackup);
  document.getElementById('settings-auto-backup-history-toggle').addEventListener('click', toggleAutoBackupHistory);
  document.getElementById('settings-blocks-apply').addEventListener('click', applyBlockDraft);
  document.getElementById('settings-blocks-discard').addEventListener('click', discardBlockDraft);
  document.getElementById('settings-import-file').addEventListener('change', (e) => {
    handleBackupImportFile(e.target.files[0]);
    e.target.value = '';
  });
  document.getElementById('setting-personal-day-start').addEventListener('change', autosaveGeneralSettings);
  document.getElementById('setting-cue-sound').addEventListener('change', autosaveGeneralSettings);
  document.getElementById('setting-cue-vibrate').addEventListener('change', autosaveGeneralSettings);
  document.getElementById('setting-cue-speech-volume').addEventListener('input', handleSpeechVolumeInput);
  document.getElementById('setting-cue-speech').addEventListener('change', autosaveGeneralSettings);
  document.getElementById('setting-auto-backup-time').addEventListener('change', autosaveAutoBackupTime);
  document.getElementById('setting-weather-location-search')?.addEventListener('input', scheduleWeatherLocationLiveSearch);
  document.getElementById('setting-weather-location-search')?.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    searchWeatherLocationsFromSettings();
  });
  document.getElementById('setting-weather-location-search-btn')?.addEventListener('click', searchWeatherLocationsFromSettings);
  document.getElementById('setting-weather-location-clear-btn')?.addEventListener('click', clearWeatherLocationFromSettings);
  document.getElementById('setting-weather-location-results')?.addEventListener('click', (e) => {
    const result = e.target.closest('[data-weather-location-index]');
    if (!result) return;
    applySelectedWeatherLocation(result.dataset.weatherLocationIndex);
  });
  document.getElementById('setting-weather-refresh-minutes')?.addEventListener('change', autosaveWeatherRefreshMinutes);
  document.getElementById('setting-weather-air-quality-enabled')?.addEventListener('change', autosaveWeatherFeatureSettings);
  document.getElementById('setting-weather-alerts-enabled')?.addEventListener('change', autosaveWeatherFeatureSettings);
  document.getElementById('setting-weather-preview-mode')?.addEventListener('change', autosaveWeatherPreviewMode);
  document.getElementById('setting-weather-preview-random-btn')?.addEventListener('click', randomizeWeatherPreviewMode);
  document.getElementById('setting-aw-mini-refresh-minutes')?.addEventListener('change', autosaveActivityWatchMiniRefreshMinutes);
  document.getElementById('setting-activitywatch-server-url')?.addEventListener('change', saveActivityWatchServerUrlSetting);
  document.getElementById('settings-activitywatch-refresh')?.addEventListener('click', refreshActivityWatchFromSettings);
  document.addEventListener('keydown', handleSettingsKeydown);
  document.getElementById('settings-modal').addEventListener('click', (e) => {
    if (e.target === document.getElementById('settings-modal')) closeSettingsModal();
  });

  document.getElementById('event-cancel').addEventListener('click', closeEventModal);
  document.getElementById('event-modal-close').addEventListener('click', closeEventModal);
  document.getElementById('event-save').addEventListener('click', saveEventModal);
  document.getElementById('event-delete-btn').addEventListener('click', deleteEventModal);
  document.getElementById('event-modal').addEventListener('click', (e) => {
    if (e.target === document.getElementById('event-modal')) closeEventModal();
  });
}

