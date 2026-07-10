// Shared mutable app state and startup helpers.

// ── State ─────────────────────────────────────────────────────────
let exercises = [];
let sessions  = {};
let settings  = {};
let events    = [];
let workloadData = defaultWorkloadData();
let currentWeekStart = null; // Monday of displayed week (Date)
let editingExId = null;      // exercise id being edited in modal
let uploadTargetId = null;   // exercise id awaiting image upload
let imageImportPending = false;
let editingEventId = null;
let lastTodayStr = null;
let activeTracker = null;    // { exerciseId, dateStr }
let lastSetLogAt = 0;
let cueAudioContext = null;
let settingsActiveTab = 'general';
let settingsBlockDraft = null;
let settingsDrag = null;
let toastTimer = null;
let lastBlockDropWarningAt = 0;
let draggedExerciseId = null;
let autoBackupDirectoryHandle = null;
let autoBackupDirectoryHandleFresh = false;
let autoBackupHandleLoaded = false;
let autoBackupTimer = null;
let autoBackupRunning = false;
let autoBackupMirrorTimer = null;
let autoBackupMirrorRunning = false;
let autoBackupMirrorSettingsSave = false;
let autoBackupRecoveryChecked = false;
let autoBackupRecoveryCheckActive = false;
let autoBackupRecoveryHold = false;
let autoBackupStorageReplaceActive = false;
let autoBackupHistoryExpanded = false;
let homeCardsTimer = null;
let homeCardsClockTimer = null;
let homeCardsCollapsed = false;
let homeCardsLastScrollY = 0;
let homeCardsDownScrollIntent = 0;
let homeCardsLastWheelAt = 0;
let weatherRefreshPromise = null;
let weatherRefreshStartedAt = 0;
let weatherForecastRequestId = 0;
let weatherForecastRequestTimes = [];
let weatherLocationSearchPromise = null;
let weatherLocationSearchResults = [];
let weatherLocationSearchRequestId = 0;
let weatherLocationSearchLastAt = 0;
let weatherLocationSearchTimer = null;
let browserStorageEstimateRequestId = 0;
let appStartedWithFreshBrowserData = false;
let storageHealth = {
  lastAttempt: null,
  lastSuccess: null,
  lastFailure: null,
  readFailures: {},
  simulatedFailure: false,
};
function setHeaderQuote() {
  const quote = document.getElementById('header-quote');
  if (!quote) return;

  const index = Math.floor(Math.random() * PHYSIO_HEADER_QUOTES.length);
  quote.textContent = PHYSIO_HEADER_QUOTES[index];
}

function runMigrations() {
  if (typeof runVersionedDataMigrations === 'function') return runVersionedDataMigrations();
  console.warn('Versioned data migrations are not available yet.');
  return { status: 'unavailable' };
}
