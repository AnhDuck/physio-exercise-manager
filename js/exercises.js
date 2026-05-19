// Exercise ordering, blocks, drag/drop, and exercise editing.

// ── Exercise row ──────────────────────────────────────────────────
function sortedExercisesInGroup(group) {
  return exercises
    .filter(e => e.group === group && isExerciseActive(e))
    .sort((a, b) => a.order - b.order);
}

function isExerciseActive(ex) {
  return ex && !ex.deletedAt;
}

function groupedExercisesForRender(exs) {
  const group = exs[0]?.group;
  const blockDefs = group ? blockDefinitionsForGroup(group) : [];
  const blocks = new Map();
  const unblocked = [];

  blockDefs.forEach(block => {
    blocks.set(block.id, {
      block: blockMetaFromDefinition(group, block),
      exercises: [],
      firstOrder: Number.POSITIVE_INFINITY,
      order: block.order,
    });
  });

  exs.forEach(ex => {
    const blockId = normalizedBlockId(ex);
    if (!blockId || !blocks.has(blockId)) {
      unblocked.push(ex);
      return;
    }
    const section = blocks.get(blockId);
    section.exercises.push(ex);
    section.firstOrder = Math.min(section.firstOrder, ex.order);
  });

  const sections = Array.from(blocks.values())
    .filter(section => section.exercises.length)
    .sort((a, b) => a.order - b.order)
    .map(section => ({
      block: section.block,
      exercises: section.exercises.sort((a, b) => a.order - b.order),
    }));

  if (unblocked.length) {
    sections.push({ block: null, exercises: unblocked.sort((a, b) => a.order - b.order) });
  }
  return sections;
}

function exerciseSectionsForGroup(group) {
  return groupedExercisesForRender(sortedExercisesInGroup(group));
}

function displayOrderedExercisesInGroup(group) {
  return exerciseSectionsForGroup(group).flatMap(section => section.exercises);
}

function applyGroupDisplayOrder(group, sections) {
  sections.flatMap(section => section.exercises).forEach((ex, i) => {
    ex.order = i + 1;
  });
}

function normalizedBlockId(ex) {
  return String(ex?.blockId || '').trim();
}

function blockMetaFromDefinition(group, block) {
  return {
    group,
    id: block.id,
    title: blockTitleFor(group, block.id),
  };
}

function blockTitleFor(group, blockId) {
  const block = blockDefinitionsForGroup(group).find(item => item.id === blockId);
  const title = block?.title;
  return title && String(title).trim() ? title : blockTitleFromId(blockId);
}

function ensureBlockSettings() {
  if (!settings.blocks || typeof settings.blocks !== 'object') settings.blocks = {};
  GROUP_ORDER.forEach(group => {
    if (!Array.isArray(settings.blocks[group])) settings.blocks[group] = [];
  });

  if (settings.blockTitles && typeof settings.blockTitles === 'object') {
    Object.entries(settings.blockTitles).forEach(([key, title]) => {
      const [group, blockId] = key.split(':');
      if (GROUP_ORDER.includes(group) && blockId) ensureBlockDefinition(group, blockId, title);
    });
    delete settings.blockTitles;
  }

  exercises.forEach(ex => {
    const blockId = normalizedBlockId(ex);
    if (!blockId) return;
    ensureBlockDefinition(ex.group, blockId, ex.blockTitle);
  });

  GROUP_ORDER.forEach(group => normalizeBlockDefinitionOrders(group));
}

function blockDefinitionsForGroup(group) {
  ensureBlocksContainer(group);
  return settings.blocks[group].sort((a, b) => a.order - b.order);
}

function ensureBlocksContainer(group) {
  if (!settings.blocks || typeof settings.blocks !== 'object') settings.blocks = {};
  if (!Array.isArray(settings.blocks[group])) settings.blocks[group] = [];
}

function ensureBlockDefinition(group, blockId, title = '') {
  ensureBlocksContainer(group);
  const id = normalizeBlockInput(blockId);
  if (!id) return null;
  let block = settings.blocks[group].find(item => item.id === id);
  if (!block) {
    const maxOrder = settings.blocks[group].reduce((max, item) => Math.max(max, Number(item.order) || 0), 0);
    block = { id, title: '', order: maxOrder + 1 };
    settings.blocks[group].push(block);
  }
  if (title && !block.title) block.title = String(title).trim();
  return block;
}

function normalizeBlockDefinitionOrders(group) {
  ensureBlocksContainer(group);
  settings.blocks[group]
    .sort((a, b) => (Number(a.order) || 0) - (Number(b.order) || 0))
    .forEach((block, i) => {
      block.id = normalizeBlockInput(block.id);
      block.order = i + 1;
      block.title = String(block.title || '').trim();
    });
  settings.blocks[group] = settings.blocks[group].filter(block => block.id);
}

function blockTitleFromId(blockId) {
  const suffix = String(blockId || '')
    .replace(/^block[-_ ]*/i, '')
    .replace(/[-_]+/g, ' ')
    .trim();
  if (!suffix) return 'Block';
  return `Block ${suffix.toUpperCase()}`;
}

function blockPositionClass(index, count) {
  if (count === 1) return ' single';
  if (index === 0) return ' first';
  if (index === count - 1) return ' last';
  return ' middle';
}

function normalizeGroupOrders(groups = GROUP_ORDER) {
  groups.forEach(group => {
    sortedExercisesInGroup(group).forEach((ex, i) => { ex.order = i + 1; });
  });
}

function moveExercise(dragId, targetGroup, targetId = null, position = 'after') {
  const dragged = exercises.find(ex => ex.id === dragId);
  if (!dragged || !targetGroup) return;
  if (targetId === dragId) return;
  const draggedBlockId = normalizedBlockId(dragged);

  if (draggedBlockId) {
    const target = exercises.find(ex => ex.id === targetId);
    if (!target || target.group !== targetGroup || normalizedBlockId(target) !== draggedBlockId) {
      showBlockDropWarning(dragged, target);
      return;
    }

    const sections = exerciseSectionsForGroup(targetGroup);
    const section = sections.find(item => item.block?.id === draggedBlockId);
    if (!section) return;
    const targetItems = section.exercises.filter(ex => ex.id !== dragId);
    let insertAt = targetItems.findIndex(ex => ex.id === targetId);
    if (insertAt === -1) return;
    if (position === 'after') insertAt += 1;
    targetItems.splice(insertAt, 0, dragged);
    section.exercises = targetItems;
    applyGroupDisplayOrder(targetGroup, sections);

    saveExercises(exercises);
    render();
    refreshOpenBlockSettings();
    return;
  }

  const oldGroup = dragged.group;
  const targetItems = sortedExercisesInGroup(targetGroup).filter(ex => ex.id !== dragId);
  let insertAt = targetItems.length;

  if (targetId) {
    const targetIndex = targetItems.findIndex(ex => ex.id === targetId);
    if (targetIndex !== -1) insertAt = targetIndex + (position === 'after' ? 1 : 0);
  }

  dragged.group = targetGroup;
  if (oldGroup !== targetGroup) dragged.blockId = '';
  targetItems.splice(insertAt, 0, dragged);
  targetItems.forEach((ex, i) => { ex.order = i + 1; });
  if (oldGroup !== targetGroup) normalizeGroupOrders([oldGroup]);

  saveExercises(exercises);
  render();
  refreshOpenBlockSettings();
}

function handleExerciseDragStart(e) {
  draggedExerciseId = e.currentTarget.dataset.exId;
  e.currentTarget.classList.add('dragging');
  e.dataTransfer.effectAllowed = 'move';
  e.dataTransfer.setData('text/plain', draggedExerciseId);
}

function handleExerciseDragEnd(e) {
  e.currentTarget.draggable = false;
  e.currentTarget.classList.remove('dragging');
  document.querySelectorAll('.drop-before, .drop-after, .drop-end, .drop-denied').forEach(elm => {
    elm.classList.remove('drop-before', 'drop-after', 'drop-end', 'drop-denied');
  });
  draggedExerciseId = null;
}

function handleExerciseDragOver(e) {
  if (!draggedExerciseId) return;
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';

  const target = e.currentTarget;
  clearDropPosition({ currentTarget: target });

  if (isBlockedGridDrop(draggedExerciseId, target)) {
    e.dataTransfer.dropEffect = 'none';
    target.classList.add('drop-denied');
    showBlockDropWarningThrottled(exercises.find(ex => ex.id === draggedExerciseId), target);
    return;
  }

  if (target.classList.contains('exercise-row')) {
    const rect = target.getBoundingClientRect();
    const isAfter = e.clientY > rect.top + rect.height / 2;
    target.classList.add(isAfter ? 'drop-after' : 'drop-before');
  } else {
    target.classList.add('drop-end');
  }
}

function clearDropPosition(e) {
  e.currentTarget.classList.remove('drop-before', 'drop-after', 'drop-end', 'drop-denied');
}

function handleExerciseDropOnRow(e) {
  if (!draggedExerciseId) return;
  e.preventDefault();
  e.stopPropagation();
  const target = e.currentTarget;
  if (isBlockedGridDrop(draggedExerciseId, target)) {
    showBlockDropWarning(exercises.find(ex => ex.id === draggedExerciseId), target);
    clearDropPosition({ currentTarget: target });
    return;
  }
  const position = target.classList.contains('drop-before') ? 'before' : 'after';
  moveExercise(draggedExerciseId, target.dataset.group, target.dataset.exId, position);
}

function handleExerciseDropAtEnd(e) {
  if (!draggedExerciseId) return;
  e.preventDefault();
  e.stopPropagation();
  const target = e.currentTarget;
  if (isBlockedGridDrop(draggedExerciseId, target)) {
    showBlockDropWarning(exercises.find(ex => ex.id === draggedExerciseId), target);
    clearDropPosition({ currentTarget: target });
    return;
  }
  moveExercise(draggedExerciseId, e.currentTarget.dataset.group);
}

function isBlockedGridDrop(dragId, target) {
  const dragged = exercises.find(ex => ex.id === dragId);
  if (!dragged) return true;
  const targetId = target.dataset.exId;
  const draggedBlockId = normalizedBlockId(dragged);

  if (draggedBlockId) {
    if (!target.classList.contains('exercise-row') || !targetId) return true;
    const targetExercise = exercises.find(ex => ex.id === targetId);
    return !targetExercise
      || targetExercise.group !== dragged.group
      || normalizedBlockId(targetExercise) !== draggedBlockId;
  }

  return target.classList.contains('block-row');
}

function showBlockDropWarning(dragged = null, target = null) {
  if (dragged && normalizedBlockId(dragged)) {
    showToast('Exercises inside a block can only be reordered within that block. Move blocks in Settings.');
    return;
  }
  if (target && target.classList?.contains('block-row')) {
    showToast('Unblocked exercises must stay below blocks. Assign blocks in Settings.');
    return;
  }
  showToast('Blocks are managed in Settings. Unblocked exercises must stay below blocks.');
}

function showBlockDropWarningThrottled(dragged = null, target = null) {
  const now = Date.now();
  if (now - lastBlockDropWarningAt < 1800) return;
  lastBlockDropWarningAt = now;
  showBlockDropWarning(dragged, target);
}
function openEditModal(exId) {
  editingExId = exId;
  const ex = exercises.find(e => e.id === exId);
  if (!ex || ex.deletedAt) return;

  document.getElementById('modal-title').textContent = 'Edit Exercise';
  document.getElementById('field-name').value = ex.name;
  document.getElementById('field-sets').value = ex.sets;
  document.getElementById('field-reps').value = ex.reps;
  document.getElementById('field-resistance').value = ex.resistance || '';
  document.getElementById('field-frequency').value = ex.frequency || '';
  document.getElementById('field-instructions').value = ex.instructions || '';
  document.getElementById('field-group').value = ex.group;
  document.getElementById('field-changed-since-physio').checked = Boolean(ex.changedSinceLastPhysioVisit);

  document.getElementById('delete-btn').style.display = 'inline-block';
  showModal();
}

function openAddModal(group) {
  editingExId = null;
  document.getElementById('modal-title').textContent = 'Add Exercise';
  document.getElementById('field-name').value = '';
  document.getElementById('field-sets').value = '3';
  document.getElementById('field-reps').value = '10';
  document.getElementById('field-resistance').value = '';
  document.getElementById('field-frequency').value = '3x/week';
  document.getElementById('field-instructions').value = '';
  document.getElementById('field-group').value = group;
  document.getElementById('field-changed-since-physio').checked = false;
  document.getElementById('delete-btn').style.display = 'none';
  showModal();
}

function showModal() {
  document.getElementById('exercise-modal').classList.remove('hidden');
}

function closeModal() {
  document.getElementById('exercise-modal').classList.add('hidden');
  editingExId = null;
}

function normalizeBlockInput(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function saveExerciseModal() {
  const name = document.getElementById('field-name').value.trim();
  if (!name) { alert('Exercise name is required.'); return; }

  const fields = {
    name,
    sets:         parseInt(document.getElementById('field-sets').value) || 1,
    reps:         document.getElementById('field-reps').value.trim(),
    resistance:   document.getElementById('field-resistance').value.trim(),
    frequency:    document.getElementById('field-frequency').value.trim(),
    instructions: document.getElementById('field-instructions').value.trim(),
    group:        document.getElementById('field-group').value,
    changedSinceLastPhysioVisit: document.getElementById('field-changed-since-physio').checked,
  };

  if (editingExId) {
    const idx = exercises.findIndex(e => e.id === editingExId);
    if (idx !== -1) {
      const previous = { ...exercises[idx] };
      const changes = doseChanges(previous, fields);
      exercises[idx] = { ...exercises[idx], ...fields };
      delete exercises[idx].blockTitle;
      delete exercises[idx].blockMinGapHours;
      delete exercises[idx].blockPreferredGapHours;
      if (Object.keys(changes).length) {
        logDoseChange(exercises[idx], changes);
      }
    }
  } else {
    const maxOrder = exercises.filter(e => e.group === fields.group)
      .reduce((m, e) => Math.max(m, e.order), 0);
    const exercise = {
      id: 'ex-' + Date.now(),
      image: null,
      order: maxOrder + 1,
      ...fields,
    };
    exercises.push(exercise);
    logExerciseAdded(exercise);
  }

  saveExercises(exercises);
  closeModal();
  render();
}

function deleteExercise() {
  if (!editingExId) return;
  const ex = exercises.find(item => item.id === editingExId);
  if (!ex) return;
  const logCount = countExerciseLogs(editingExId);
  const historyText = logCount
    ? ` It has ${logCount} historical ${logCount === 1 ? 'log' : 'logs'} that will stay in the timeline with a deleted marker.`
    : '';
  if (!confirm(`Delete ${ex.name}? This hides it from the active calendar but keeps notes and historical exercise logs.${historyText}`)) return;
  ex.deletedAt = new Date().toISOString();
  if (activeTracker?.exerciseId === editingExId) activeTracker = null;
  saveExercises(exercises);
  closeModal();
  render();
}

function countExerciseLogs(exId) {
  return Object.values(sessions || {}).reduce((count, session) => {
    const progress = session?.setProgress?.[exId];
    return count + (progress && Number(progress.completedSets) > 0 ? 1 : 0);
  }, 0);
}

