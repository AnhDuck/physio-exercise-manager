const KEYS = {
  EXERCISES: 'pem_exercises',
  SESSIONS:  'pem_sessions',
  SETTINGS:  'pem_settings',
};

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
    const defaults = { armSessionCount: 0, createdAt: toDateStr(new Date()) };
    saveSettings(defaults);
    return defaults;
  }
  return JSON.parse(raw);
}

function saveSettings(settings) {
  localStorage.setItem(KEYS.SETTINGS, JSON.stringify(settings));
}

// ISO date string helpers
function toDateStr(date) {
  return date.toISOString().slice(0, 10);
}

function dateFromStr(str) {
  // Parse as local date (not UTC) to avoid off-by-one on midnight
  const [y, m, d] = str.split('-').map(Number);
  return new Date(y, m - 1, d);
}
