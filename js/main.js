// App bootstrap and static event bindings.

document.addEventListener('DOMContentLoaded', () => {
  exercises = loadExercises();
  sessions  = loadSessions();
  settings  = loadSettings();
  events    = loadEvents();
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
  markStorageTestsReadyForUserActions();
});
function bindStaticEvents() {
  document.querySelectorAll('.notes-toggle').forEach(btn => {
    btn.addEventListener('click', toggleNotesPanel);
  });
  const timelineSearch = document.querySelector('.timeline-search');
  const timelineSearchInput = document.getElementById('timeline-search-input');
  const timelineFilterReset = document.getElementById('timeline-filter-reset');
  document.getElementById('timeline-copy').addEventListener('click', () => copyTimelineMarkdown('shown'));
  timelineSearch?.addEventListener('click', (e) => {
    e.stopPropagation();
    if (!timelineViewState.optionsOpen) setTimelineSearchOptionsOpen(true);
  });
  timelineSearchInput?.addEventListener('focus', () => setTimelineSearchOptionsOpen(true));
  timelineSearchInput?.addEventListener('input', (e) => setTimelineSearchText(e.target.value));
  document.addEventListener('click', () => {
    if (timelineViewState.optionsOpen) setTimelineSearchOptionsOpen(false);
  });
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' || !timelineViewState.optionsOpen) return;
    e.preventDefault();
    setTimelineSearchOptionsOpen(false);
  });
  document.getElementById('timeline-range').addEventListener('change', (e) => setTimelineRange(e.target.value));
  timelineFilterReset?.addEventListener('click', (e) => {
    e.stopPropagation();
    resetTimelineFilters();
  });
  document.getElementById('timeline-type-filters').addEventListener('click', (e) => {
    const button = e.target.closest('[data-timeline-type-filter]');
    if (!button) return;
    toggleTimelineTypeFilter(button.dataset.timelineTypeFilter);
  });
  document.getElementById('timeline-list').addEventListener('click', (e) => {
    if (e.target.closest('#timeline-load-older')) {
      loadOlderTimelineItems();
      return;
    }
    if (e.target.closest('#timeline-copy-matching')) {
      copyTimelineAllMatchingMarkdown();
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
  document.addEventListener('click', () => closeCompletedActionMenu());
  window.addEventListener('scroll', updateCompactHeader, { passive: true });

  document.getElementById('modal-cancel').addEventListener('click', closeModal);
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
  document.addEventListener('keydown', handleSettingsKeydown);
  document.getElementById('settings-modal').addEventListener('click', (e) => {
    if (e.target === document.getElementById('settings-modal')) closeSettingsModal();
  });

  document.getElementById('event-cancel').addEventListener('click', closeEventModal);
  document.getElementById('event-save').addEventListener('click', saveEventModal);
  document.getElementById('event-delete-btn').addEventListener('click', deleteEventModal);
  document.getElementById('event-modal').addEventListener('click', (e) => {
    if (e.target === document.getElementById('event-modal')) closeEventModal();
  });
}

