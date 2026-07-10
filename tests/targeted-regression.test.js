const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

process.env.TZ = 'America/Vancouver';

const root = path.resolve(__dirname, '..');

function loadContext(files, extras = {}) {
  const context = vm.createContext({
    console,
    Date,
    JSON,
    Math,
    Number,
    Object,
    Array,
    Boolean,
    String,
    Map,
    Set,
    URL,
    URLSearchParams,
    TextEncoder,
    Blob,
    ...extras,
  });
  files.forEach(file => {
    vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), context, { filename: file });
  });
  return context;
}

function testDateEngine() {
  const context = loadContext(['js/dates.js'], {
    DEFAULT_PERSONAL_DAY_START_TIME: '07:00',
    ARM_ANCHOR_DATE: '2026-05-01',
    ARM_ANCHOR_DAY: 'arm-day1',
  });

  assert.equal(context.normalizeTimeStr('6:00'), '06:00');
  assert.equal(context.normalizeTimeStr('24:00'), '');
  assert.equal(context.normalizeTimeStr('12:60'), '');
  assert.equal(context.timeToMinutes('07:00'), 420);
  assert.equal(context.timeToMinutes('7:0'), null);
  assert.equal(context.isValidDateStr('2026-02-29'), false);
  assert.equal(context.isValidDateStr('2026-02-28'), true);

  const boundary = new Date(2026, 6, 9, 7, 0, 0);
  assert.equal(context.personalDayDateStr(new Date(2026, 6, 9, 6, 59), '07:00'), '2026-07-08');
  assert.equal(context.personalDayDateStr(boundary, '07:00'), '2026-07-09');
  assert.equal(context.personalDayDateStr(new Date(2026, 6, 9, 7, 1), '07:00'), '2026-07-09');
  assert.equal(context.personalDayDateStr(new Date(2026, 6, 9, 23, 29), '23:30'), '2026-07-08');
  assert.equal(context.personalDayDateStr(new Date(2026, 6, 9, 23, 30), '23:30'), '2026-07-09');
  assert.equal(context.personalDayDateStr(new Date(2026, 6, 10, 0, 1), '23:30'), '2026-07-09');
  assert.equal(context.personalDayDateStr(new Date(2026, 1, 1, 6, 0), '07:00'), '2026-01-31');
  assert.equal(context.personalDayDateStr(new Date(2026, 2, 8, 6, 59), '07:00'), '2026-03-07');
  assert.equal(context.personalDayDateStr(new Date(2026, 10, 1, 6, 59), '07:00'), '2026-10-31');
  assert.match(context.localDateTimeIso(new Date(2026, 6, 9, 12, 34, 56)), /^2026-07-09T12:34:56[+-]\d{2}:\d{2}$/);
  assert.equal(context.getArmDayForDate('2026-05-01'), 'arm-day1');
}

function testWeatherUvSourcePrecedence() {
  const context = loadContext(['js/weather-normalize.js', 'js/weather-api.js']);
  const canada = { uvIndex: 4, uvSource: 'Environment Canada' };
  const openMeteoCurrent = { value: 6.3, hasValue: true };
  const openMeteoNearest = { uvIndex: 7.2, uvSource: 'Open-Meteo' };

  const preferredCanada = context.weatherPreferredUvValue({ useCanadaWeather: true, canadaNearest: canada, openMeteoCurrent, openMeteoNearest });
  assert.equal(preferredCanada.value, 4);
  assert.equal(preferredCanada.source, 'Environment Canada');

  const preferredOpenMeteo = context.weatherPreferredUvValue({ useCanadaWeather: false, canadaNearest: canada, openMeteoCurrent, openMeteoNearest });
  assert.equal(preferredOpenMeteo.value, 6.3);
  assert.equal(preferredOpenMeteo.source, 'Open-Meteo');

  const realZero = context.weatherPreferredUvValue({ useCanadaWeather: true, canadaNearest: { uvIndex: 0, uvSource: 'Environment Canada' }, openMeteoCurrent, openMeteoNearest });
  assert.equal(realZero.value, 0);
  assert.equal(realZero.source, 'Environment Canada');
}

function testAutoBackupPolicy() {
  const context = loadContext(['js/dates.js', 'js/auto-backup-policy.js'], {
    DEFAULT_PERSONAL_DAY_START_TIME: '07:00',
    formatNumber: value => String(value),
  });
  const permissionNoise = {
    id: 'noise',
    type: 'manual',
    status: 'error',
    at: '2026-07-09T10:00:00-07:00',
    folderName: '',
    files: [],
    message: 'Folder permission was not granted.',
  };
  const meaningfulPermissionError = {
    id: 'meaningful',
    type: 'manual',
    status: 'error',
    at: '2026-07-09T10:01:00-07:00',
    folderName: 'PEM backups',
    files: ['physio-exercise-auto-backup-latest.json'],
    message: 'Folder permission was not granted.',
  };

  const history = context.normalizeAutoBackupHistory([permissionNoise, meaningfulPermissionError]);
  assert.equal(history.length, 1);
  assert.equal(history[0].id, 'meaningful');
  assert.equal(context.normalizeAutoBackupTime('6:00'), '06:00');

  const now = new Date(2026, 6, 9, 8, 0, 0);
  const health = context.evaluateAutoBackupHealth({
    folderName: 'PEM backups',
    time: '06:00',
    lastScheduledBackupDate: '2026-07-09',
    lastHourlyBackupHour: '2026-07-09-08',
    lastMissedBackupDate: '',
    lastMissedHourlyBackupHour: '',
    needsReconnect: false,
    lastError: '',
  }, now, {
    supported: true,
    storageIssue: null,
    dataSafety: { ok: true, issues: [] },
    handleLoaded: true,
    hasHandle: true,
  });
  assert.equal(health.code, 'ok');
}

function testAutoBackupServiceHistory() {
  const meaningfulPermissionError = {
    id: 'meaningful',
    type: 'manual',
    status: 'error',
    at: '2026-07-09T10:01:00-07:00',
    folderName: 'PEM backups',
    files: ['physio-exercise-auto-backup-latest.json'],
    message: 'Folder permission was not granted.',
  };
  const context = loadContext([
    'js/dates.js',
    'js/auto-backup-policy.js',
    'js/auto-backup-service.js',
  ], {
    DEFAULT_PERSONAL_DAY_START_TIME: '07:00',
    formatNumber: value => String(value),
    normalizeAutoBackupSettings: value => ({ ...(value || {}) }),
    settings: { autoBackup: { history: [meaningfulPermissionError] } },
  });

  assert.equal(context.getAutoBackupSettings().history.length, 1);
  assert.equal(context.getAutoBackupSettings().history[0].id, 'meaningful');
}

function testLegacyMigrationTransform() {
  const context = loadContext(['js/migrations.js'], {
    DEFAULT_PERSONAL_DAY_START_TIME: '07:00',
    normalizeTimeStr: value => /^\d{1,2}:\d{2}$/.test(String(value || '')) ? String(value).padStart(5, '0') : '',
    normalizeExerciseGroupSettings: value => {
      const source = value && typeof value === 'object' ? value : {};
      const order = Array.isArray(source.order) ? source.order.slice() : ['arm-day1', 'arm-day2', 'legs'];
      const items = { ...(source.items || {}) };
      order.forEach(id => { items[id] ||= { label: id, color: '#4a90d9', hidden: false }; });
      return { order, items };
    },
    sanitizeLegacySettings: value => ({ ...value }),
    normalizeAutoBackupSettings: value => value || {},
    normalizeHomeCardsSettings: value => value || {},
    normalizeActivityWatchDataForStorage: value => value || {},
    normalizeWorkloadDataForStorage: value => value || {},
    getDataSafetyReport: () => ({ ok: true, issues: [] }),
  });

  const original = {
    exercises: [
      { id: 'a1-8', name: 'Pinky', group: 'arm-day1', order: 8, blockId: 'Grip', blockTitle: 'Grip work' },
      { id: 'hidden-1', name: 'Old', group: 'legs', hidden: true },
    ],
    sessions: {
      '2026-07-09': {
        setProgress: {
          'a1-8': { completedSets: 1 },
          'hidden-1': { exerciseSnapshot: { id: 'preserved', name: 'Snapshot' } },
        },
      },
    },
    settings: {
      exerciseGroups: { order: ['arm-day1', 'arm-day2', 'legs'], items: {} },
      blocks: {},
      activityWatchGroupsDefaultApplied: false,
    },
    events: [],
    activityWatch: {},
    workload: {},
  };

  const first = JSON.parse(JSON.stringify(original));
  context.migrationDraft = first;
  vm.runInContext('DATA_MIGRATIONS[0].migrate(migrationDraft);', context);
  assert.equal(first.exercises.find(ex => ex.id === 'a1-8').group, 'arm-day2');
  assert.equal(first.exercises.find(ex => ex.id === 'a1-8').order, 5);
  assert.equal(first.exercises.find(ex => ex.id === 'hidden-1').hidden, true);
  assert.equal(first.settings.dataSchemaVersion, 1);
  assert.equal(first.settings.homeCards.activityWatchMini.categoryMode, 'top');
  assert.equal(first.settings.blocks['arm-day2'][0].id, 'grip');
  assert.equal(first.settings.blocks['arm-day2'][0].title, 'Grip work');
  assert.deepEqual(first.sessions['2026-07-09'].setProgress['hidden-1'].exerciseSnapshot, { id: 'preserved', name: 'Snapshot' });
  assert.ok(Array.isArray(first.sessions['2026-07-09'].completedExercises));
  assert.ok(Array.isArray(first.sessions['2026-07-09'].setProgress['a1-8'].setCompletedAt));

  const second = JSON.parse(JSON.stringify(first));
  context.migrationDraft = second;
  vm.runInContext('DATA_MIGRATIONS[0].migrate(migrationDraft);', context);
  assert.equal(JSON.stringify(second), JSON.stringify(first));
}

class FakeStorage {
  constructor(entries = {}) {
    this.values = new Map(Object.entries(entries));
    this.setCount = 0;
    this.failAt = null;
  }

  getItem(key) {
    return this.values.has(key) ? this.values.get(key) : null;
  }

  setItem(key, value) {
    this.setCount += 1;
    if (this.failAt === this.setCount) {
      const error = new Error('simulated quota');
      error.name = 'QuotaExceededError';
      throw error;
    }
    this.values.set(key, String(value));
  }

  removeItem(key) {
    this.values.delete(key);
  }
}

function testAtomicStorageRollback() {
  const initial = {
    pem_exercises: 'old-exercises',
    pem_sessions: 'old-sessions',
    pem_settings: 'old-settings',
    pem_events: 'old-events',
    pem_activitywatch: 'old-activitywatch',
    pem_workload: 'old-workload',
  };
  const replacement = {
    pem_exercises: 'new-exercises',
    pem_sessions: 'new-sessions',
    pem_settings: 'new-settings',
    pem_events: 'new-events',
    pem_activitywatch: 'new-activitywatch',
    pem_workload: 'new-workload',
  };

  [1, 3, 6].forEach(failAt => {
    const storage = new FakeStorage(initial);
    storage.failAt = failAt;
    const context = loadContext(['js/storage.js'], {
      window: {
        location: { search: '' },
        setTimeout: () => 0,
        TextEncoder,
      },
      localStorage: storage,
      navigator: {},
      storageHealth: { lastAttempt: null, lastSuccess: null, lastFailure: null, readFailures: {}, simulatedFailure: false },
      autoBackupStorageReplaceActive: false,
      scheduleAutoBackupLiveMirror: () => { throw new Error('mirror should not run in a failed transaction'); },
      renderAutoBackupSettings: () => {},
      formatNumber: value => String(value),
      CURRENT_DATA_SCHEMA_VERSION: 1,
    });

    assert.throws(
      () => context.replaceAppStorageValuesAtomically(replacement, { mirror: false }),
      error => error.name === 'StorageTransactionError'
    );
    assert.deepEqual(Object.fromEntries(storage.values), initial, `rollback failed at write ${failAt}`);
  });

  const storage = new FakeStorage({ ...initial, pem_workload: undefined });
  storage.values.delete('pem_workload');
  const context = loadContext(['js/storage.js'], {
    window: { location: { search: '' }, setTimeout: () => 0, TextEncoder },
    localStorage: storage,
    navigator: {},
    storageHealth: { lastAttempt: null, lastSuccess: null, lastFailure: null, readFailures: {}, simulatedFailure: false },
    autoBackupStorageReplaceActive: false,
    scheduleAutoBackupLiveMirror: () => {},
    renderAutoBackupSettings: () => {},
    formatNumber: value => String(value),
    CURRENT_DATA_SCHEMA_VERSION: 1,
  });
  context.replaceAppStorageValuesAtomically(replacement, { mirror: false });
  assert.deepEqual(Object.fromEntries(storage.values), replacement);
}

function run() {
  testDateEngine();
  testWeatherUvSourcePrecedence();
  testAutoBackupPolicy();
  testAutoBackupServiceHistory();
  testLegacyMigrationTransform();
  testAtomicStorageRollback();
  console.log('Targeted regression tests passed.');
}

run();
