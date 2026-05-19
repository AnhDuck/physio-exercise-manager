// Settings modal, review markers, cue settings, and block settings UI.

function openSettingsModal() {
  ensureBlockSettings();
  settingsModalSnapshot = {
    settings: JSON.parse(JSON.stringify(settings)),
    exerciseBlocks: exercises.map(ex => ({ id: ex.id, blockId: ex.blockId || '' })),
  };
  const legsDays = settings.legsDays !== undefined ? settings.legsDays : [1, 3, 5];
  document.querySelectorAll('#settings-modal input[data-dow]').forEach(cb => {
    cb.checked = legsDays.includes(Number(cb.dataset.dow));
  });
  document.getElementById('setting-personal-day-start').value = getPersonalDayStartTime();
  document.getElementById('setting-cue-sound').checked = settings.setCueSound !== false;
  document.getElementById('setting-cue-vibrate').checked = settings.setCueVibrate !== false;
  document.getElementById('setting-cue-speech').checked = Boolean(settings.setCueSpeech);
  document.getElementById('setting-auto-backup-time').value = getAutoBackupSettings().time;
  syncSpeechVolumeControl();
  renderBlockSettings();
  renderAutoBackupSettings();
  updateClearReviewButton();
  document.getElementById('settings-modal').classList.remove('hidden');
}

function closeSettingsModal(restore = true) {
  if (restore && settingsModalSnapshot) {
    const savedSpeechVolume = settings.setCueSpeechVolume;
    const currentAutoBackup = JSON.parse(JSON.stringify(getAutoBackupSettings()));
    settings = JSON.parse(JSON.stringify(settingsModalSnapshot.settings));
    settings.setCueSpeechVolume = clampSetCueSpeechVolume(savedSpeechVolume);
    settings.autoBackup = normalizeAutoBackupSettings({
      ...settings.autoBackup,
      folderName: currentAutoBackup.folderName,
      lastScheduledBackupDate: currentAutoBackup.lastScheduledBackupDate,
      lastSuccessAt: currentAutoBackup.lastSuccessAt,
      lastErrorAt: currentAutoBackup.lastErrorAt,
      lastError: currentAutoBackup.lastError,
      needsReconnect: currentAutoBackup.needsReconnect,
      history: currentAutoBackup.history,
    });
    settingsModalSnapshot.exerciseBlocks.forEach(saved => {
      const ex = exercises.find(item => item.id === saved.id);
      if (ex) ex.blockId = saved.blockId;
    });
  }
  settingsModalSnapshot = null;
  document.getElementById('settings-modal').classList.add('hidden');
}

function saveSettingsModal() {
  const legsDays = [];
  document.querySelectorAll('#settings-modal input[data-dow]:checked').forEach(cb => {
    legsDays.push(Number(cb.dataset.dow));
  });
  settings.legsDays = legsDays;
  const personalDayStartTime = document.getElementById('setting-personal-day-start').value;
  settings.personalDayStartTime = isValidTime(personalDayStartTime)
    ? personalDayStartTime
    : DEFAULT_PERSONAL_DAY_START_TIME;
  settings.setCueSound = document.getElementById('setting-cue-sound').checked;
  settings.setCueVibrate = document.getElementById('setting-cue-vibrate').checked;
  settings.setCueSpeech = document.getElementById('setting-cue-speech').checked;
  settings.setCueSpeechVolume = readSpeechVolumeSlider();
  settings.autoBackup = normalizeAutoBackupSettings(settings.autoBackup);
  const autoBackupTime = document.getElementById('setting-auto-backup-time').value;
  settings.autoBackup.time = isValidTime(autoBackupTime)
    ? autoBackupTime
    : defaultAutoBackupSettings().time;
  readBlockSettingsForm();
  saveSettings(settings);
  saveExercises(exercises);
  closeSettingsModal(false);
  scheduleAutoBackupChecks();
  maybeRunAutoBackup('settings');
  render();
}

function updateClearReviewButton() {
  const btn = document.getElementById('settings-clear-review');
  if (!btn) return;
  btn.disabled = !exercises.some(ex => ex.changedSinceLastPhysioVisit);
}

function clearChangedSincePhysioMarkers() {
  if (!exercises.some(ex => ex.changedSinceLastPhysioVisit)) {
    updateClearReviewButton();
    return;
  }
  if (!confirm('Clear changed markers from all exercises?')) return;
  exercises.forEach(ex => {
    ex.changedSinceLastPhysioVisit = false;
  });
  saveExercises(exercises);
  updateClearReviewButton();
  render();
}

function syncSpeechVolumeControl() {
  const input = document.getElementById('setting-cue-speech-volume');
  const speechToggle = document.getElementById('setting-cue-speech');
  if (!input || !speechToggle) return;
  const percent = Math.round(clampSetCueSpeechVolume(settings.setCueSpeechVolume) * 100);
  input.value = String(percent);
  updateSpeechVolumeLabel(percent);
  input.disabled = !speechToggle.checked;
  input.closest('.cue-volume-label')?.classList.toggle('is-disabled', input.disabled);
}

function updateSpeechVolumeLabel(percent = readSpeechVolumeSlider() * 100) {
  const label = document.getElementById('setting-cue-speech-volume-label');
  if (!label) return;
  label.textContent = `Speech volume: ${Math.round(percent)}%`;
}

function readSpeechVolumeSlider() {
  const input = document.getElementById('setting-cue-speech-volume');
  return clampSetCueSpeechVolume(input ? Number(input.value) / 100 : settings.setCueSpeechVolume);
}

function handleSpeechVolumeInput() {
  settings.setCueSpeechVolume = readSpeechVolumeSlider();
  updateSpeechVolumeLabel(settings.setCueSpeechVolume * 100);
  saveSettings(settings);
}
function renderBlockSettings() {
  const root = document.getElementById('settings-blocks');
  if (!root) return;
  root.innerHTML = '';
  GROUP_ORDER.forEach(group => root.appendChild(buildBlockSettingsGroup(group)));
}

function refreshOpenBlockSettings() {
  const modal = document.getElementById('settings-modal');
  if (!modal || modal.classList.contains('hidden')) return;
  readBlockSettingsForm();
  renderBlockSettings();
}

function buildBlockSettingsGroup(group) {
  const cfg = GROUPS[group];
  const panel = el('section', 'block-settings-group');
  panel.style.setProperty('--exercise-group-color', cfg.color);

  const header = el('div', 'block-settings-group-header');
  header.appendChild(elText('h4', '', cfg.label));
  const addBtn = elText('button', 'block-settings-add', '+ Add block');
  addBtn.type = 'button';
  addBtn.addEventListener('click', () => {
    readBlockSettingsForm();
    const block = addBlockDefinition(group);
    renderBlockSettings();
    window.setTimeout(() => {
      const escapeIdent = window.CSS?.escape || ((value) => String(value).replace(/"/g, '\\"'));
      document.querySelector(`#settings-blocks input[data-block-title="${escapeIdent(`${group}:${block.id}`)}"]`)?.focus();
    }, 0);
  });
  header.appendChild(addBtn);
  panel.appendChild(header);

  const blocks = blockDefinitionsForGroup(group);
  const blockList = el('div', 'block-settings-list');
  if (!blocks.length) {
    blockList.appendChild(elText('div', 'block-settings-empty', 'No blocks yet.'));
  } else {
    blocks.forEach((block, index) => blockList.appendChild(buildBlockSettingsRow(group, block, index, blocks.length)));
  }
  panel.appendChild(blockList);

  const exerciseList = el('div', 'block-exercise-list');
  displayOrderedExercisesInGroup(group).forEach(ex => exerciseList.appendChild(buildBlockExerciseAssignment(group, ex)));
  panel.appendChild(exerciseList);

  return panel;
}

function buildBlockSettingsRow(group, block, index, count) {
  const row = el('div', 'block-settings-row');
  const id = elText('div', 'block-settings-id', block.id);
  id.title = 'Block ID';
  row.appendChild(id);

  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'block-settings-title';
  input.value = block.title || '';
  input.placeholder = blockTitleFromId(block.id);
  input.dataset.blockTitle = `${group}:${block.id}`;
  input.setAttribute('aria-label', `Title for ${blockTitleFromId(block.id)}`);
  row.appendChild(input);

  const actions = el('div', 'block-settings-actions');
  const up = elText('button', 'block-settings-move', '↑');
  up.type = 'button';
  up.title = 'Move block up';
  up.disabled = index === 0;
  up.addEventListener('click', () => {
    readBlockSettingsForm();
    moveBlockDefinition(group, block.id, -1);
    renderBlockSettings();
  });
  actions.appendChild(up);

  const down = elText('button', 'block-settings-move', '↓');
  down.type = 'button';
  down.title = 'Move block down';
  down.disabled = index === count - 1;
  down.addEventListener('click', () => {
    readBlockSettingsForm();
    moveBlockDefinition(group, block.id, 1);
    renderBlockSettings();
  });
  actions.appendChild(down);

  const del = elText('button', 'block-settings-delete', 'Delete');
  del.type = 'button';
  del.title = 'Delete block and unassign its exercises';
  del.addEventListener('click', () => {
    if (!confirm(`Delete ${blockTitleFor(group, block.id)} and unassign its exercises?`)) return;
    readBlockSettingsForm();
    deleteBlockDefinition(group, block.id);
    renderBlockSettings();
  });
  actions.appendChild(del);
  row.appendChild(actions);

  return row;
}

function buildBlockExerciseAssignment(group, ex) {
  const row = el('label', 'block-exercise-assignment');
  row.appendChild(elText('span', 'block-exercise-name', ex.name));
  const select = document.createElement('select');
  select.dataset.exerciseBlock = ex.id;
  const none = document.createElement('option');
  none.value = '';
  none.textContent = 'No block';
  select.appendChild(none);
  blockDefinitionsForGroup(group).forEach(block => {
    const option = document.createElement('option');
    option.value = block.id;
    option.textContent = blockTitleFor(group, block.id);
    select.appendChild(option);
  });
  select.value = normalizedBlockId(ex);
  row.appendChild(select);
  return row;
}

function readBlockSettingsForm() {
  ensureBlockSettings();
  document.querySelectorAll('#settings-blocks input[data-block-title]').forEach(input => {
    const [group, blockId] = input.dataset.blockTitle.split(':');
    const block = settings.blocks?.[group]?.find(item => item.id === blockId);
    if (block) block.title = input.value.trim();
  });
  document.querySelectorAll('#settings-blocks select[data-exercise-block]').forEach(select => {
    const ex = exercises.find(item => item.id === select.dataset.exerciseBlock);
    if (ex) ex.blockId = select.value;
  });
}

function addBlockDefinition(group) {
  ensureBlocksContainer(group);
  const id = nextBlockId(group);
  const block = { id, title: '', order: settings.blocks[group].length + 1 };
  settings.blocks[group].push(block);
  normalizeBlockDefinitionOrders(group);
  return block;
}

function nextBlockId(group) {
  ensureBlocksContainer(group);
  const used = new Set(settings.blocks[group].map(block => block.id));
  for (let i = 0; i < 26; i++) {
    const id = `block-${String.fromCharCode(97 + i)}`;
    if (!used.has(id)) return id;
  }
  let n = 27;
  while (used.has(`block-${n}`)) n++;
  return `block-${n}`;
}

function moveBlockDefinition(group, blockId, direction) {
  ensureBlocksContainer(group);
  const blocks = blockDefinitionsForGroup(group);
  const index = blocks.findIndex(block => block.id === blockId);
  const target = index + direction;
  if (index === -1 || target < 0 || target >= blocks.length) return;
  [blocks[index], blocks[target]] = [blocks[target], blocks[index]];
  blocks.forEach((block, i) => { block.order = i + 1; });
}

function deleteBlockDefinition(group, blockId) {
  ensureBlocksContainer(group);
  settings.blocks[group] = settings.blocks[group].filter(block => block.id !== blockId);
  exercises.forEach(ex => {
    if (ex.group === group && normalizedBlockId(ex) === blockId) ex.blockId = '';
  });
  normalizeBlockDefinitionOrders(group);
}

