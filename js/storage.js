const KEYS = {
  EXERCISES: 'pem_exercises',
  SESSIONS:  'pem_sessions',
  SETTINGS:  'pem_settings',
  SYMPTOMS:  'pem_symptoms',
  EVENTS:    'pem_events',
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
    const defaults = {
      armSessionCount: 0,
      createdAt: toDateStr(new Date()),
      setCueSound: true,
      setCueVibrate: true,
      setCueSpeech: false,
    };
    saveSettings(defaults);
    return defaults;
  }
  return {
    setCueSound: true,
    setCueVibrate: true,
    setCueSpeech: false,
    ...JSON.parse(raw),
  };
}

function saveSettings(settings) {
  localStorage.setItem(KEYS.SETTINGS, JSON.stringify(settings));
}

function loadSymptoms() {
  const raw = localStorage.getItem(KEYS.SYMPTOMS);
  return raw ? JSON.parse(raw) : [];
}

function saveSymptoms(symptoms) {
  localStorage.setItem(KEYS.SYMPTOMS, JSON.stringify(symptoms));
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
