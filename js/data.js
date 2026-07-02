const DEFAULT_EXERCISES = [
  // ── Arm Day 1 ──────────────────────────────────────────────────────────────
  {
    id: 'a1-1',
    name: 'Wrist flexion',
    group: 'arm-day1',
    sets: 1,
    reps: '15',
    resistance: '5 lbs',
    frequency: '3x/week',
    instructions: 'Place your forearm along an armrest or table with wrist hanging over the edge and palm facing up. With a weight in your hand, lift the hand towards the ceiling. Lower slowly and repeat.',
    image: null,
    order: 1,
  },
  {
    id: 'a1-2',
    name: 'Wrist flexion (progressive)',
    group: 'arm-day1',
    sets: 4,
    reps: '15',
    resistance: '7.5 lbs',
    frequency: '3x/week',
    instructions: 'Place your forearm along an armrest or table with wrist hanging over the edge and palm facing up. With a weight in your hand, lift the hand towards the ceiling. Lower slowly and repeat.',
    image: null,
    order: 2,
  },
  {
    id: 'a1-3',
    name: 'Wrist extension',
    group: 'arm-day1',
    sets: 1,
    reps: '10',
    resistance: '5 lbs',
    frequency: '3x/week',
    instructions: 'Place your forearm along an armrest or table with your wrist hanging over the edge and palm facing down. With a weight in your hand, lift the hand towards the ceiling. Lower slowly and repeat.',
    image: null,
    order: 3,
  },
  {
    id: 'a1-4',
    name: 'Eccentric wrist extension',
    group: 'arm-day1',
    sets: 4,
    reps: '5–10',
    resistance: '7.5 lbs',
    frequency: '3x/week',
    instructions: 'Hold a weight in your hand and rest your forearm on a table with your elbow straight, so your wrist is over the edge — palm facing down. Lift the weight using the opposite hand as high as possible. Then slowly lower the weight completely. The purpose is to strengthen the lowering portion of the movement only.',
    image: null,
    order: 4,
  },
  {
    id: 'a1-5',
    name: '1-arm horizontal row',
    group: 'arm-day1',
    sets: 3,
    reps: '20',
    resistance: 'tubing',
    frequency: '3x/week',
    instructions: 'Stand and face a closed door. Attach a piece of tubing to the handle of the door and hold it in your hand. Bend your elbow at 90° and pull back as far as possible. Hold briefly, then relax and return to starting position.',
    image: null,
    order: 5,
  },
  {
    id: 'a1-6',
    name: 'DB biceps curl (standing)',
    group: 'arm-day1',
    sets: 2,
    reps: '10–15',
    resistance: '10 lbs',
    frequency: '3x/week',
    instructions: 'Keep your palms facing forward and curl the dumbbells up at the same time. Do not swing your arms. Keep your shoulders and shoulder blades neutral. Extend your elbows completely at the bottom.',
    image: null,
    order: 6,
  },
  {
    id: 'a1-7',
    name: 'Rubber Band Thumbs',
    group: 'arm-day1',
    sets: 3,
    reps: '15',
    resistance: '2 bands',
    frequency: '3x/week',
    instructions: 'Use rubber bands around your thumbs and perform the prescribed reps.',
    image: null,
    order: 7,
  },

  // ── Arm Day 2 ──────────────────────────────────────────────────────────────
  {
    id: 'a2-1',
    name: 'Hand gripper – upside down',
    group: 'arm-day2',
    sets: 4,
    reps: '10',
    resistance: 'gripper',
    frequency: '3x/week',
    instructions: 'Hold a hand gripper upside down in your hand and close both ends together. Release and repeat.',
    image: null,
    order: 1,
  },
  {
    id: 'a2-2',
    name: 'Hand gripper',
    group: 'arm-day2',
    sets: 4,
    reps: '10',
    resistance: 'gripper',
    frequency: '3x/week',
    instructions: 'Hold a hand gripper in your hand and close both ends together. Release and repeat.',
    image: null,
    order: 2,
  },
  {
    id: 'a2-3',
    name: 'Wrist ulnar deviation, forearm in pronation',
    group: 'arm-day2',
    sets: 3,
    reps: '20',
    resistance: 'band',
    frequency: '3x/week',
    instructions: 'Anchor a band to a solid object next to you. Grab the band with an overhand grip with your elbow bent. Keeping the forearm still, pull the band by bending the wrist sideways away from you. Return under control and repeat.',
    image: null,
    order: 3,
  },
  {
    id: 'a2-4',
    name: 'Tricep pressdown',
    group: 'arm-day2',
    sets: 2,
    reps: '10–15',
    resistance: 'elastic',
    frequency: '3x/week',
    instructions: 'Stand in front of a high pulley with a rope attached. With an overhand grip, press down the rope, keeping your elbows next to you. Only your forearms should move.',
    image: null,
    order: 4,
  },
  {
    id: 'a2-5',
    name: 'Rubber Band Pinky & Ring Finger',
    group: 'arm-day2',
    sets: 3,
    reps: '15',
    resistance: '1 band',
    frequency: '3x/week',
    instructions: 'Use a rubber band around your pinky and ring finger and perform the prescribed reps.',
    image: null,
    order: 5,
  },

  // ── Legs ───────────────────────────────────────────────────────────────────
  {
    id: 'lg-1',
    name: 'DB goblet squat',
    group: 'legs',
    sets: 3,
    reps: '10',
    resistance: '10 lbs+',
    frequency: '3x/week',
    instructions: 'Hold a dumbbell on your chest close to your chin. Feet shoulder-width apart. Lower until thighs are parallel to the ground, pushing hips back and flexing the knees. Keep chest up, back neutral, heels planted, and knees aligned with ankles.',
    image: null,
    order: 1,
  },
  {
    id: 'lg-2',
    name: 'Sidestep with band',
    group: 'legs',
    sets: 3,
    reps: '15/side',
    resistance: 'band',
    frequency: '3x/week',
    instructions: 'Start in a squat position with a band around your ankles. Keeping the band taut at all times, step to the side. Push the knees out while taking the steps so they don\'t cave in. Each step is about 50% of the starting stance width.',
    image: null,
    order: 2,
  },
  {
    id: 'lg-3',
    name: 'One leg toe touch',
    group: 'legs',
    sets: 3,
    reps: '10',
    resistance: 'bodyweight',
    frequency: '3x/week',
    instructions: 'Stand upright on one leg, tip the body forward hinging at the hips with back straight. Touch or try to touch the floor. Use your hamstring to lift back to starting position. Keep knee aligned with foot and hips level.',
    image: null,
    order: 3,
  },
  {
    id: 'lg-4',
    name: 'Hip and knee flexors stretch',
    group: 'legs',
    sets: 3,
    reps: '30 sec',
    resistance: 'bodyweight',
    frequency: 'daily',
    instructions: 'Kneel in front of a chair or box, then place one foot onto the box. Keep spine and hips neutral — adjust knee distance from the box accordingly. You will feel a stretch in the front of your thigh. Hold for the prescribed time.',
    image: null,
    order: 4,
  },
];

const GROUPS = {
  'arm-day1': { label: 'Arm Day 1', color: '#4a90d9', pill: 'D1' },
  'arm-day2': { label: 'Arm Day 2', color: '#5ab89e', pill: 'D2' },
  'legs':     { label: 'Legs',      color: '#e8974a', pill: 'LEG' },
};

function defaultExerciseGroupSettings() {
  return {
    order: Object.keys(GROUPS),
    items: Object.fromEntries(
      Object.entries(GROUPS).map(([id, cfg]) => [
        id,
        {
          label: cfg.label,
          color: cfg.color,
          hidden: false,
        },
      ])
    ),
  };
}

function normalizeGroupId(value) {
  return String(value || '').trim();
}

function fallbackGroupLabel(groupId) {
  const text = normalizeGroupId(groupId)
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return text
    ? text.replace(/\b\w/g, letter => letter.toUpperCase())
    : 'Exercise Group';
}

function normalizeGroupColor(value, fallback = '#4a90d9') {
  const color = String(value || '').trim();
  return /^#[0-9a-f]{6}$/i.test(color) ? color : fallback;
}

function normalizeExerciseGroupSettings(value = {}) {
  const defaults = defaultExerciseGroupSettings();
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const sourceItems = source.items && typeof source.items === 'object' && !Array.isArray(source.items)
    ? source.items
    : {};
  const order = [];
  const addId = (id) => {
    const cleanId = normalizeGroupId(id);
    if (cleanId && !order.includes(cleanId)) order.push(cleanId);
  };

  if (Array.isArray(source.order)) source.order.forEach(addId);
  defaults.order.forEach(addId);
  Object.keys(sourceItems).forEach(addId);

  const items = {};
  order.forEach(id => {
    const fallback = defaults.items[id] || {
      label: fallbackGroupLabel(id),
      color: '#4a90d9',
      hidden: false,
    };
    const item = sourceItems[id] && typeof sourceItems[id] === 'object' && !Array.isArray(sourceItems[id])
      ? sourceItems[id]
      : {};
    const label = String(item.label || fallback.label || fallbackGroupLabel(id)).trim();
    items[id] = {
      label: label || fallback.label || fallbackGroupLabel(id),
      color: normalizeGroupColor(item.color, fallback.color),
      hidden: Boolean(item.hidden),
    };
  });

  return { order, items };
}

function ensureExerciseGroupSettings() {
  if (!settings || typeof settings !== 'object' || Array.isArray(settings)) return defaultExerciseGroupSettings();
  const normalized = normalizeExerciseGroupSettings(settings.exerciseGroups);
  const addId = (id) => {
    const cleanId = normalizeGroupId(id);
    if (!cleanId || normalized.order.includes(cleanId)) return;
    normalized.order.push(cleanId);
    normalized.items[cleanId] = {
      label: GROUPS[cleanId]?.label || fallbackGroupLabel(cleanId),
      color: GROUPS[cleanId]?.color || '#4a90d9',
      hidden: false,
    };
  };

  if (Array.isArray(exercises)) {
    exercises.forEach(ex => addId(ex?.group));
  }
  Object.keys(settings.blocks || {}).forEach(addId);

  settings.exerciseGroups = normalized;
  return normalized;
}

function groupRegistry() {
  return ensureExerciseGroupSettings();
}

function groupOrder() {
  return groupRegistry().order.slice();
}

function groupExists(groupId) {
  return groupOrder().includes(groupId);
}

function groupConfig(groupId) {
  const registry = groupRegistry();
  const fallback = GROUPS[groupId] || {
    label: fallbackGroupLabel(groupId),
    color: '#4a90d9',
    pill: '',
  };
  const item = registry.items[groupId] || {};
  return {
    label: item.label || fallback.label || fallbackGroupLabel(groupId),
    color: normalizeGroupColor(item.color, fallback.color),
    hidden: Boolean(item.hidden),
    pill: fallback.pill || '',
  };
}

function activeExerciseCountForGroup(groupId) {
  return Array.isArray(exercises)
    ? exercises.filter(ex => ex?.group === groupId && isExerciseActive(ex)).length
    : 0;
}

function canHideGroup(groupId) {
  return activeExerciseCountForGroup(groupId) === 0;
}

function visibleGroupOrder() {
  return groupOrder().filter(groupId => !groupConfig(groupId).hidden || !canHideGroup(groupId));
}

function groupOptionsForExerciseModal(selectedGroup = '') {
  const options = visibleGroupOrder();
  if (selectedGroup && !options.includes(selectedGroup) && groupExists(selectedGroup)) {
    options.push(selectedGroup);
  }
  return options;
}

function isArmRotationEnabled() {
  return Boolean(settings?.armRotationEnabled);
}
