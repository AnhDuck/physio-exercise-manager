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
});
function bindStaticEvents() {
  document.querySelectorAll('.notes-toggle').forEach(btn => {
    btn.addEventListener('click', toggleNotesPanel);
  });
  document.getElementById('timeline-copy').addEventListener('click', copyTimelineMarkdown);
  document.getElementById('quick-note-save').addEventListener('click', addQuickNote);
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

