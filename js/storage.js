const KEYS = {
  EXERCISES: 'pem_exercises',
  SESSIONS:  'pem_sessions',
  SETTINGS:  'pem_settings',
  EVENTS:    'pem_events',
};

function defaultAutoBackupSettings() {
  return {
    time: '06:00',
    folderName: '',
    lastScheduledBackupDate: '',
    lastSuccessAt: '',
    lastErrorAt: '',
    lastError: '',
    needsReconnect: false,
    history: [],
  };
}

function normalizeAutoBackupSettings(value = {}) {
  const defaults = defaultAutoBackupSettings();
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const time = isValidStoredTime(source.time) ? source.time : defaults.time;
  const history = Array.isArray(source.history)
    ? source.history.filter(item => item && typeof item === 'object').slice(0, 20)
    : defaults.history;

  return {
    ...defaults,
    ...source,
    time,
    folderName: typeof source.folderName === 'string' ? source.folderName : defaults.folderName,
    lastScheduledBackupDate: typeof source.lastScheduledBackupDate === 'string' ? source.lastScheduledBackupDate : defaults.lastScheduledBackupDate,
    lastSuccessAt: typeof source.lastSuccessAt === 'string' ? source.lastSuccessAt : defaults.lastSuccessAt,
    lastErrorAt: typeof source.lastErrorAt === 'string' ? source.lastErrorAt : defaults.lastErrorAt,
    lastError: typeof source.lastError === 'string' ? source.lastError : defaults.lastError,
    needsReconnect: Boolean(source.needsReconnect),
    history,
  };
}

function isValidStoredTime(timeStr) {
  if (typeof timeStr !== 'string') return false;
  const match = /^(\d{2}):(\d{2})$/.exec(timeStr);
  if (!match) return false;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  return hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59;
}

function loadExercises() {
  const raw = localStorage.getItem(KEYS.EXERCISES);
  if (!raw) {
    const exercises = DEFAULT_EXERCISES.map(e => ({ ...e }));
    saveExercises(exercises);
    return exercises;
  }
  return JSON.parse(raw);
}

function saveExercises(exercises) {
  localStorage.setItem(KEYS.EXERCISES, JSON.stringify(exercises));
}

function loadSessions() {
  const raw = localStorage.getItem(KEYS.SESSIONS);
  return raw ? JSON.parse(raw) : {};
}

function saveSession(dateStr, sessionData) {
  const sessions = loadSessions();
  sessions[dateStr] = sessionData;
  localStorage.setItem(KEYS.SESSIONS, JSON.stringify(sessions));
}

function loadSettings() {
  const raw = localStorage.getItem(KEYS.SETTINGS);
  if (!raw) {
    const defaults = {
      createdAt: toDateStr(new Date()),
      setCueSound: true,
      setCueVibrate: true,
      setCueSpeech: false,
      setCueSpeechVolume: 1,
      personalDayStartTime: '07:00',
      autoBackup: defaultAutoBackupSettings(),
    };
    saveSettings(defaults);
    return defaults;
  }
  const loaded = sanitizeLegacySettings({
    setCueSound: true,
    setCueVibrate: true,
    setCueSpeech: false,
    setCueSpeechVolume: 1,
    personalDayStartTime: '07:00',
    autoBackup: defaultAutoBackupSettings(),
    ...JSON.parse(raw),
  });
  loaded.setCueSpeechVolume = clampSetCueSpeechVolume(loaded.setCueSpeechVolume);
  loaded.autoBackup = normalizeAutoBackupSettings(loaded.autoBackup);
  return loaded;
}

function saveSettings(settings) {
  const cleanSettings = sanitizeLegacySettings(settings);
  const nextSettings = {
    ...cleanSettings,
    setCueSpeechVolume: clampSetCueSpeechVolume(cleanSettings.setCueSpeechVolume),
    autoBackup: normalizeAutoBackupSettings(cleanSettings.autoBackup),
  };
  localStorage.setItem(KEYS.SETTINGS, JSON.stringify(nextSettings));
}

function sanitizeLegacySettings(value) {
  const settings = { ...(value || {}) };
  delete settings.legsDays;
  delete settings.denseMode;
  delete settings.collapsedGroups;
  return settings;
}

function clampSetCueSpeechVolume(value) {
  const volume = Number(value);
  if (!Number.isFinite(volume)) return 1;
  return Math.max(0, Math.min(1, volume));
}

function loadEvents() {
  const raw = localStorage.getItem(KEYS.EVENTS);
  return raw ? JSON.parse(raw) : [];
}

function saveEvents(events) {
  localStorage.setItem(KEYS.EVENTS, JSON.stringify(events));
}

// ISO date string helpers — uses LOCAL time (not UTC) so dates match what the user sees
function toDateStr(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function dateFromStr(str) {
  // Parse as local date (not UTC) to avoid off-by-one on midnight
  const [y, m, d] = str.split('-').map(Number);
  return new Date(y, m - 1, d);
}
