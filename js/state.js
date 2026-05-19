// Shared mutable app state and startup helpers.

// ── State ─────────────────────────────────────────────────────────
let exercises = [];
let sessions  = {};
let settings  = {};
let events    = [];
let currentWeekStart = null; // Monday of displayed week (Date)
let editingExId = null;      // exercise id being edited in modal
let uploadTargetId = null;   // exercise id awaiting image upload
let isDenseMode = false;     // compact scan view, persisted in settings
let imageImportPending = false;
let editingEventId = null;
let lastTodayStr = null;
let activeTracker = null;    // { exerciseId, dateStr }
let completedActionMenu = null; // { exerciseId, dateStr }
let lastSetLogAt = 0;
let cueAudioContext = null;
let settingsModalSnapshot = null;
let toastTimer = null;
let lastBlockDropWarningAt = 0;
let draggedExerciseId = null;
let autoBackupDirectoryHandle = null;
let autoBackupHandleLoaded = false;
let autoBackupTimer = null;
let autoBackupRunning = false;
let autoBackupHistoryExpanded = false;
function setHeaderQuote() {
  const quote = document.getElementById('header-quote');
  if (!quote) return;

  const index = Math.floor(Math.random() * PHYSIO_HEADER_QUOTES.length);
  quote.textContent = PHYSIO_HEADER_QUOTES[index];
}

// One-shot data migrations for existing localStorage installs
function runMigrations() {
  let exercisesChanged = false;
  // Move "Rubber Band Pinky & Ring Finger" from Arm Day 1 → Arm Day 2
  const pinky = exercises.find(e => e.id === 'a1-8');
  if (pinky && pinky.group === 'arm-day1') {
    pinky.group = 'arm-day2';
    pinky.order = 5;
    exercisesChanged = true;
  }

  if (!settings.defaultBlocksApplied) {
    settings.defaultBlocksApplied = true;
    saveSettings(settings);
  }

  ensureBlockSettings();
  migrateSetProgressSnapshots();

  exercises.forEach(ex => {
    if (!('changedSinceLastPhysioVisit' in ex)) {
      ex.changedSinceLastPhysioVisit = false;
      exercisesChanged = true;
    }
    if (ex.blockTitle && normalizedBlockId(ex)) {
      ensureBlockDefinition(ex.group, normalizedBlockId(ex), ex.blockTitle);
      delete ex.blockTitle;
      exercisesChanged = true;
    }
    if ('blockMinGapHours' in ex) {
      delete ex.blockMinGapHours;
      exercisesChanged = true;
    }
    if ('blockPreferredGapHours' in ex) {
      delete ex.blockPreferredGapHours;
      exercisesChanged = true;
    }
  });

  if (exercisesChanged) {
    saveExercises(exercises);
  }
  saveSettings(settings);
}
