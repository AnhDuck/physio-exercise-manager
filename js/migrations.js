// Versioned, transactional application-data migrations.

const CURRENT_DATA_SCHEMA_VERSION = 1;

const DATA_MIGRATIONS = [
  {
    from: 0,
    to: 1,
    migrate(draft) {
      migrateLegacyDraftToV1(draft);
      return draft;
    },
  },
];

function migrationClone(value) {
  return JSON.parse(JSON.stringify(value ?? null));
}

function migrationIsPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function storedDataSchemaVersion(value) {
  if (!Object.prototype.hasOwnProperty.call(value || {}, 'dataSchemaVersion')) return 0;
  return Number.isInteger(value.dataSchemaVersion) && value.dataSchemaVersion >= 0
    ? value.dataSchemaVersion
    : 0;
}

function buildMigrationDraft() {
  const activityWatch = typeof getActivityWatchBackupData === 'function'
    ? getActivityWatchBackupData()
    : (typeof activityWatchData !== 'undefined' ? activityWatchData : {});
  const workload = typeof getWorkloadBackupData === 'function'
    ? getWorkloadBackupData()
    : (typeof workloadData !== 'undefined' ? workloadData : {});

  return {
    exercises: migrationClone(Array.isArray(exercises) ? exercises : []),
    sessions: migrationClone(migrationIsPlainObject(sessions) ? sessions : {}),
    settings: migrationClone(migrationIsPlainObject(settings) ? settings : {}),
    events: migrationClone(Array.isArray(events) ? events : []),
    activityWatch: migrationClone(activityWatch || {}),
    workload: migrationClone(workload || {}),
  };
}

function migrationNormalizeBlockId(value) {
  if (typeof normalizeBlockInput === 'function') return normalizeBlockInput(value);
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function migrationBlockTitleFromId(blockId) {
  if (typeof blockTitleFromId === 'function') return blockTitleFromId(blockId);
  const suffix = String(blockId || '')
    .replace(/^block[-_ ]*/i, '')
    .replace(/[-_]+/g, ' ')
    .trim();
  return suffix ? `Block ${suffix.toUpperCase()}` : 'Block';
}

function migrationEnsureBlockDefinition(settingsTarget, group, blockId, title = '') {
  if (!settingsTarget.blocks || typeof settingsTarget.blocks !== 'object' || Array.isArray(settingsTarget.blocks)) {
    settingsTarget.blocks = {};
  }
  if (!Array.isArray(settingsTarget.blocks[group])) settingsTarget.blocks[group] = [];
  const id = migrationNormalizeBlockId(blockId);
  if (!id) return null;

  let block = settingsTarget.blocks[group].find(item => item && item.id === id);
  if (!block) {
    const maxOrder = settingsTarget.blocks[group]
      .reduce((max, item) => Math.max(max, Number(item?.order) || 0), 0);
    block = { id, title: '', order: maxOrder + 1 };
    settingsTarget.blocks[group].push(block);
  }
  if (title && !block.title) block.title = String(title).trim();
  return block;
}

function normalizeMigrationGroupSettings(draft) {
  const source = draft.settings.exerciseGroups;
  const registry = typeof normalizeExerciseGroupSettings === 'function'
    ? normalizeExerciseGroupSettings(source)
    : migrationIsPlainObject(source)
      ? migrationClone(source)
      : { order: [], items: {} };
  const addId = (id) => {
    const cleanId = String(id || '').trim();
    if (!cleanId || registry.order.includes(cleanId)) return;
    registry.order.push(cleanId);
    registry.items[cleanId] = {
      label: typeof fallbackGroupLabel === 'function' ? fallbackGroupLabel(cleanId) : cleanId,
      color: '#4a90d9',
      hidden: false,
    };
  };

  (draft.exercises || []).forEach(ex => addId(ex?.group));
  Object.keys(draft.settings.blocks || {}).forEach(addId);
  draft.settings.exerciseGroups = registry;
}

function normalizeMigrationBlockSettings(draft) {
  const target = draft.settings;
  if (!target.blocks || typeof target.blocks !== 'object' || Array.isArray(target.blocks)) target.blocks = {};
  const groups = Array.isArray(target.exerciseGroups?.order) ? target.exerciseGroups.order : [];
  groups.forEach(group => {
    if (!Array.isArray(target.blocks[group])) target.blocks[group] = [];
  });

  if (target.blockTitles && typeof target.blockTitles === 'object' && !Array.isArray(target.blockTitles)) {
    Object.entries(target.blockTitles).forEach(([key, title]) => {
      const separator = key.indexOf(':');
      if (separator === -1) return;
      const group = key.slice(0, separator);
      const blockId = key.slice(separator + 1);
      if (groups.includes(group) && blockId) migrationEnsureBlockDefinition(target, group, blockId, title);
    });
    delete target.blockTitles;
  }

  (draft.exercises || []).forEach(ex => {
    const blockId = migrationNormalizeBlockId(ex?.blockId);
    if (!blockId || !ex?.group) return;
    migrationEnsureBlockDefinition(target, ex.group, blockId, ex.blockTitle);
  });

  Object.keys(target.blocks).forEach(group => {
    const blocks = Array.isArray(target.blocks[group]) ? target.blocks[group] : [];
    blocks
      .sort((a, b) => (Number(a?.order) || 0) - (Number(b?.order) || 0))
      .forEach((block, index) => {
        block.id = migrationNormalizeBlockId(block.id);
        block.order = index + 1;
        block.title = String(block.title || '').trim();
      });
    target.blocks[group] = blocks.filter(block => block.id);
  });
}

function migrationExerciseSnapshot(exercise) {
  return {
    id: exercise?.id || '',
    name: exercise?.name || '',
    group: exercise?.group || '',
    sets: exercise?.sets || 1,
    reps: exercise?.reps || '',
    resistance: exercise?.resistance || '',
    frequency: exercise?.frequency || '',
  };
}

function migrateDraftSetProgressSnapshots(draft) {
  const exercisesById = new Map((draft.exercises || []).map(ex => [ex?.id, ex]));
  Object.entries(draft.sessions || {}).forEach(([dateStr, session]) => {
    if (!migrationIsPlainObject(session)) return;
    if (!Array.isArray(session.completedExercises)) session.completedExercises = [];
    if (!migrationIsPlainObject(session.setProgress)) return;

    Object.entries(session.setProgress).forEach(([exId, progress]) => {
      if (!migrationIsPlainObject(progress)) return;
      const exercise = exercisesById.get(exId);
      if (!progress.exerciseSnapshot && exercise) {
        progress.exerciseSnapshot = migrationExerciseSnapshot(exercise);
      }
      if (!Array.isArray(progress.setCompletedAt)) progress.setCompletedAt = [];
    });
  });
}

function migrateLegacyDraftToV1(draft) {
  const pinky = draft.exercises.find(ex => ex?.id === 'a1-8');
  if (pinky && pinky.group === 'arm-day1') {
    pinky.group = 'arm-day2';
    pinky.order = 5;
  }

  if (!draft.settings.defaultBlocksApplied) draft.settings.defaultBlocksApplied = true;
  if (!draft.settings.homeCards || typeof draft.settings.homeCards !== 'object') draft.settings.homeCards = {};
  if (!draft.settings.homeCards.activityWatchMini || typeof draft.settings.homeCards.activityWatchMini !== 'object') {
    draft.settings.homeCards.activityWatchMini = {};
  }
  if (!draft.settings.activityWatchGroupsDefaultApplied) {
    draft.settings.homeCards.activityWatchMini.categoryMode = 'top';
    draft.settings.activityWatchGroupsDefaultApplied = true;
  }

  normalizeMigrationGroupSettings(draft);
  normalizeMigrationBlockSettings(draft);

  draft.exercises.forEach(ex => {
    if (!Object.prototype.hasOwnProperty.call(ex, 'changedSinceLastPhysioVisit')) {
      ex.changedSinceLastPhysioVisit = false;
    }
    if (ex.blockTitle && migrationNormalizeBlockId(ex.blockId)) {
      migrationEnsureBlockDefinition(draft.settings, ex.group, ex.blockId, ex.blockTitle);
      delete ex.blockTitle;
    }
    delete ex.blockMinGapHours;
    delete ex.blockPreferredGapHours;
  });

  normalizeMigrationBlockSettings(draft);
  migrateDraftSetProgressSnapshots(draft);
  draft.settings.dataSchemaVersion = 1;
}

function normalizeMigrationDraft(draft) {
  draft.exercises = Array.isArray(draft.exercises) ? draft.exercises : [];
  draft.sessions = migrationIsPlainObject(draft.sessions) ? draft.sessions : {};
  draft.settings = migrationIsPlainObject(draft.settings) ? draft.settings : {};
  draft.events = Array.isArray(draft.events) ? draft.events : [];

  if (typeof sanitizeLegacySettings === 'function') {
    draft.settings = sanitizeLegacySettings(draft.settings);
  }
  draft.settings.personalDayStartTime = normalizeTimeStr(draft.settings.personalDayStartTime) || DEFAULT_PERSONAL_DAY_START_TIME;
  draft.settings.autoBackup = typeof normalizeAutoBackupSettings === 'function'
    ? normalizeAutoBackupSettings(draft.settings.autoBackup)
    : (draft.settings.autoBackup || {});
  if (typeof normalizeHomeCardsSettings === 'function') {
    draft.settings.homeCards = normalizeHomeCardsSettings(draft.settings.homeCards);
  }
  normalizeMigrationGroupSettings(draft);
  normalizeMigrationBlockSettings(draft);
  if (typeof normalizeActivityWatchDataForStorage === 'function') {
    draft.activityWatch = normalizeActivityWatchDataForStorage(draft.activityWatch);
  }
  if (typeof normalizeWorkloadDataForStorage === 'function') {
    draft.workload = normalizeWorkloadDataForStorage(draft.workload);
  }
  draft.settings.dataSchemaVersion = CURRENT_DATA_SCHEMA_VERSION;
}

function migrationIdSet(value) {
  return new Set((Array.isArray(value) ? value : []).map(item => item?.id).filter(Boolean));
}

function migrationGroupIdSet(data) {
  const ids = new Set();
  (data.settings?.exerciseGroups?.order || []).forEach(id => ids.add(id));
  Object.keys(data.settings?.exerciseGroups?.items || {}).forEach(id => ids.add(id));
  Object.keys(data.settings?.blocks || {}).forEach(id => ids.add(id));
  (data.exercises || []).forEach(ex => { if (ex?.group) ids.add(ex.group); });
  return ids;
}

function migrationBlockIdMap(data) {
  const map = new Map();
  Object.entries(data.settings?.blocks || {}).forEach(([group, blocks]) => {
    map.set(group, new Set((Array.isArray(blocks) ? blocks : []).map(block => block?.id).filter(Boolean)));
  });
  return map;
}

function validateMigrationDraft(draft, original) {
  const issues = [];
  if (!Array.isArray(draft.exercises)) issues.push('Exercises are not an array.');
  if (!migrationIsPlainObject(draft.sessions)) issues.push('Sessions are not an object.');
  if (!migrationIsPlainObject(draft.settings)) issues.push('Settings are not an object.');
  if (!Array.isArray(draft.events)) issues.push('Timeline events are not an array.');
  if (!migrationIsPlainObject(draft.activityWatch)) issues.push('ActivityWatch data is not an object.');
  if (!migrationIsPlainObject(draft.workload)) issues.push('Timed work data is not an object.');
  if (storedDataSchemaVersion(draft.settings) !== CURRENT_DATA_SCHEMA_VERSION) {
    issues.push('The migrated settings schema version is not current.');
  }

  const ids = new Set();
  (draft.exercises || []).forEach(ex => {
    if (!ex?.id) return;
    if (ids.has(ex.id)) issues.push(`Exercise ID "${ex.id}" is duplicated.`);
    ids.add(ex.id);
  });
  migrationIdSet(original.exercises).forEach(id => {
    if (!ids.has(id)) issues.push(`Exercise ID "${id}" was not preserved.`);
  });

  Object.keys(draft.sessions || {}).forEach(dateStr => {
    if (!isValidDateStr(dateStr)) issues.push(`Session date "${dateStr}" is invalid.`);
  });

  migrationGroupIdSet(original).forEach(id => {
    if (!migrationGroupIdSet(draft).has(id)) issues.push(`Exercise group ID "${id}" was not preserved.`);
  });
  const originalBlocks = migrationBlockIdMap(original);
  const draftBlocks = migrationBlockIdMap(draft);
  originalBlocks.forEach((blockIds, group) => {
    const next = draftBlocks.get(group) || new Set();
    blockIds.forEach(id => {
      if (!next.has(id)) issues.push(`Block ID "${group}:${id}" was not preserved.`);
    });
  });

  Object.entries(original.sessions || {}).forEach(([dateStr, session]) => {
    Object.entries(session?.setProgress || {}).forEach(([exId, progress]) => {
      const before = progress?.exerciseSnapshot;
      const after = draft.sessions?.[dateStr]?.setProgress?.[exId]?.exerciseSnapshot;
      if (before && JSON.stringify(before) !== JSON.stringify(after)) {
        issues.push(`Session snapshot for "${dateStr}" / "${exId}" changed.`);
      }
    });
  });

  if (typeof getDataSafetyReport === 'function') {
    const safety = getDataSafetyReport(draft);
    if (!safety.ok) issues.push(...safety.issues);
  }
  return issues;
}

function migrationStorageValues(draft) {
  return {
    [KEYS.EXERCISES]: JSON.stringify(draft.exercises),
    [KEYS.SESSIONS]: JSON.stringify(draft.sessions),
    [KEYS.SETTINGS]: JSON.stringify(draft.settings),
    [KEYS.EVENTS]: JSON.stringify(draft.events),
    [KEYS.ACTIVITYWATCH]: JSON.stringify(draft.activityWatch),
    [KEYS.WORKLOAD]: JSON.stringify(draft.workload),
  };
}

function recordDataMigrationFailure(error) {
  if (typeof recordStorageFailure !== 'function') return;
  recordStorageFailure({
    key: KEYS.SETTINGS,
    label: 'Data migration',
    size: 0,
    error,
  });
  if (typeof scheduleStorageHealthRender === 'function') scheduleStorageHealthRender();
}

function runVersionedDataMigrations() {
  const startingVersion = storedDataSchemaVersion(settings);
  if (startingVersion === CURRENT_DATA_SCHEMA_VERSION) {
    return { status: 'current', version: startingVersion };
  }
  if (startingVersion > CURRENT_DATA_SCHEMA_VERSION) {
    console.warn(`Saved data schema ${startingVersion} is newer than this app supports; no migration was applied.`);
    return { status: 'future', version: startingVersion };
  }

  const original = buildMigrationDraft();
  let draft = migrationClone(original);
  let version = startingVersion;

  try {
    while (version < CURRENT_DATA_SCHEMA_VERSION) {
      const migration = DATA_MIGRATIONS.find(item => item.from === version);
      if (!migration || migration.to !== version + 1) {
        throw new Error(`No ordered data migration is registered from schema ${version}.`);
      }
      const migrated = migration.migrate(draft);
      draft = migrated || draft;
      version = migration.to;
      draft.settings.dataSchemaVersion = version;
    }

    normalizeMigrationDraft(draft);
    const validationIssues = validateMigrationDraft(draft, original);
    if (validationIssues.length) {
      const error = new Error(`Data migration validation failed: ${validationIssues.join(' ')}`);
      error.code = 'data-migration-validation';
      throw error;
    }

    replaceAppStorageValuesAtomically(migrationStorageValues(draft), {
      mirror: false,
      safeSetOptions: { allowCorruptOverwrite: false },
    });

    exercises = draft.exercises;
    sessions = draft.sessions;
    settings = draft.settings;
    events = draft.events;
    if (typeof activityWatchData !== 'undefined') activityWatchData = draft.activityWatch;
    workloadData = draft.workload;
    return { status: 'migrated', version: CURRENT_DATA_SCHEMA_VERSION };
  } catch (err) {
    recordDataMigrationFailure(err);
    console.error('Could not complete data migration. Live application state was left unchanged.', err);
    throw err;
  }
}
