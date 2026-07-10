// Settings modal, review markers, cue settings, group settings, and block settings UI.

const SETTINGS_TABS = ['general', 'dashboard', 'groups-blocks', 'backup', 'activitywatch', 'data-health'];
const SETTINGS_TAB_ALIASES = {
  blocks: 'groups-blocks',
  groups: 'groups-blocks',
};

function openSettingsModal() {
  ensureBlockSettings();
  settingsActiveTab = 'general';
  beginBlockDraft();
  syncSettingsControls();
  renderHiddenExerciseSettings();
  renderGroupBlockSettings();
  hydrateSettingsFolderIcon();
  hydrateSettingsIconButtons(document.getElementById('settings-modal'));
  renderAutoBackupSettings();
  if (typeof renderActivityWatchSettings === 'function') renderActivityWatchSettings();
  updateClearReviewButton();
  setSettingsTab(settingsActiveTab, false);
  document.getElementById('settings-modal').classList.remove('hidden');
}

function hydrateSettingsFolderIcon() {
  const icon = document.querySelector('#settings-modal .settings-folder-icon');
  if (!icon || icon.childElementCount) return;
  icon.appendChild(buildAppIconSvg('folder', 'settings-folder-svg'));
}

function closeSettingsModal() {
  const modal = document.getElementById('settings-modal');
  if (!modal || modal.classList.contains('hidden')) return;
  if (hasPendingBlockDraft() && !confirm('Discard unapplied block changes?')) return;
  settingsBlockDraft = null;
  modal.classList.add('hidden');
}

function handleSettingsKeydown(e) {
  const modal = document.getElementById('settings-modal');
  if (!modal || modal.classList.contains('hidden')) return;
  if (e.key !== 'Escape') return;
  e.preventDefault();
  closeSettingsModal();
}

function setSettingsTab(tabName, focusTab = false) {
  const requestedTab = SETTINGS_TAB_ALIASES[tabName] || tabName;
  const nextTab = SETTINGS_TABS.includes(requestedTab) ? requestedTab : 'general';
  settingsActiveTab = nextTab;

  document.querySelectorAll('#settings-modal [data-settings-tab]').forEach(tab => {
    const active = tab.dataset.settingsTab === nextTab;
    tab.classList.toggle('is-active', active);
    tab.setAttribute('aria-selected', active ? 'true' : 'false');
    tab.tabIndex = active ? 0 : -1;
    if (active && focusTab) tab.focus();
  });

  document.querySelectorAll('#settings-modal [data-settings-panel]').forEach(panel => {
    const active = panel.dataset.settingsPanel === nextTab;
    panel.classList.toggle('is-active', active);
    panel.hidden = !active;
  });

  const content = document.querySelector('#settings-modal .settings-content');
  if (content) content.scrollTop = 0;
}

function handleSettingsTabKeydown(e) {
  if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(e.key)) return;
  e.preventDefault();

  const tabs = Array.from(document.querySelectorAll('#settings-modal [data-settings-tab]'));
  const index = tabs.indexOf(e.currentTarget);
  if (index === -1) return;

  let nextIndex = index;
  if (e.key === 'Home') nextIndex = 0;
  if (e.key === 'End') nextIndex = tabs.length - 1;
  if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') nextIndex = (index - 1 + tabs.length) % tabs.length;
  if (e.key === 'ArrowRight' || e.key === 'ArrowDown') nextIndex = (index + 1) % tabs.length;

  setSettingsTab(tabs[nextIndex].dataset.settingsTab, true);
}

function syncSettingsControls() {
  document.getElementById('setting-personal-day-start').value = getPersonalDayStartTime();
  const armRotation = document.getElementById('setting-arm-rotation-enabled');
  if (armRotation) armRotation.checked = isArmRotationEnabled();
  document.getElementById('setting-cue-sound').checked = settings.setCueSound !== false;
  document.getElementById('setting-cue-vibrate').checked = settings.setCueVibrate !== false;
  document.getElementById('setting-cue-speech').checked = Boolean(settings.setCueSpeech);
  document.getElementById('setting-auto-backup-time').value = getAutoBackupSettings().time;
  if (typeof syncWeatherSettingsControls === 'function') syncWeatherSettingsControls();
  if (typeof activityWatchMiniSettings === 'function') {
    const input = document.getElementById('setting-aw-mini-refresh-minutes');
    if (input) input.value = String(activityWatchMiniSettings().refreshMinutes);
  }
  if (typeof syncWorkloadSettingsControls === 'function') syncWorkloadSettingsControls();
  if (typeof syncActivityWatchSettingsControls === 'function') syncActivityWatchSettingsControls();
  syncSpeechVolumeControl();
}

function autosaveGeneralSettings() {
  const personalDayStartTime = document.getElementById('setting-personal-day-start').value;
  settings.personalDayStartTime = normalizeTimeStr(personalDayStartTime) || DEFAULT_PERSONAL_DAY_START_TIME;
  settings.armRotationEnabled = Boolean(document.getElementById('setting-arm-rotation-enabled')?.checked);
  settings.setCueSound = document.getElementById('setting-cue-sound').checked;
  settings.setCueVibrate = document.getElementById('setting-cue-vibrate').checked;
  settings.setCueSpeech = document.getElementById('setting-cue-speech').checked;
  settings.setCueSpeechVolume = readSpeechVolumeSlider();

  saveSettings(settings);
  syncSpeechVolumeControl();
  render();
  renderNotesPanel();
}

function autosaveAutoBackupTime() {
  const auto = getAutoBackupSettings();
  const input = document.getElementById('setting-auto-backup-time');
  auto.time = normalizeTimeStr(input.value) || defaultAutoBackupSettings().time;
  input.value = auto.time;
  saveSettings(settings);
  renderAutoBackupSettings();
  scheduleAutoBackupChecks();
  maybeRunAutoBackup('settings');
}

function updateClearReviewButton() {
  const btn = document.getElementById('settings-clear-review');
  if (!btn) return;
  btn.disabled = !exercises.some(ex => ex.changedSinceLastPhysioVisit);
}

function renderHiddenExerciseSettings() {
  const root = document.getElementById('settings-hidden-exercises');
  if (!root) return;
  root.innerHTML = '';

  const group = el('div', 'settings-row-group');
  root.appendChild(group);

  const hiddenExercises = exercises
    .filter(isExerciseHidden)
    .sort((a, b) => groupOrder().indexOf(a.group) - groupOrder().indexOf(b.group) || a.order - b.order);

  if (!hiddenExercises.length) {
    group.appendChild(buildHiddenExerciseEmptyRow());
    return;
  }

  hiddenExercises.forEach(ex => group.appendChild(buildHiddenExerciseRow(ex)));
}

function buildHiddenExerciseRow(ex) {
  const row = el('div', 'settings-action-row hidden-exercise-row');
  const content = el('div', 'hidden-exercise-content');
  content.appendChild(buildHiddenExerciseImage(ex));

  const info = el('div', 'settings-action-label hidden-exercise-label');
  info.appendChild(elText('strong', '', ex.name));
  info.appendChild(elText('span', '', hiddenExerciseMeta(ex)));
  content.appendChild(info);
  row.appendChild(content);

  const restore = el('button', 'settings-clear-review hidden-exercise-restore');
  restore.type = 'button';
  restore.appendChild(buildAppIconSvg('restore'));
  restore.appendChild(elText('span', 'ui-button-text', 'Restore'));
  restore.addEventListener('click', () => restoreExercise(ex.id));
  row.appendChild(restore);
  return row;
}

function buildHiddenExerciseImage(ex) {
  const frame = el('div', 'hidden-exercise-image');
  if (ex.image) {
    const img = document.createElement('img');
    img.src = ex.image;
    img.alt = ex.name;
    frame.appendChild(img);
  } else {
    frame.appendChild(buildAppIconSvg('file', 'hidden-exercise-image-placeholder'));
  }
  return frame;
}

function buildHiddenExerciseEmptyRow() {
  const row = el('div', 'settings-action-row hidden-exercise-row hidden-exercise-empty-row');
  const info = el('div', 'settings-action-label');
  info.appendChild(elText('strong', '', 'No hidden exercises'));
  info.appendChild(elText('span', '', 'Hidden exercises will appear here so they can be restored.'));
  row.appendChild(info);
  return row;
}

function hiddenExerciseMeta(ex) {
  const group = groupConfig(ex.group).label || 'Exercise';
  const dose = `${targetSetsForExercise(ex)} sets / ${ex.reps || '?'} reps${ex.resistance ? ` / ${ex.resistance}` : ''}`;
  const hiddenDate = formatHiddenExerciseDate(ex.hiddenAt);
  const details = hiddenDate ? `${dose} | Hidden ${hiddenDate}` : dose;
  return `${group} | ${details}`;
}

function formatHiddenExerciseDate(iso) {
  const date = dateFromIso(iso);
  return date ? formatEventDate(toDateStr(date)) : '';
}

function renderGroupBlockSettings() {
  const root = document.getElementById('settings-groups-blocks');
  if (!root) return;
  ensureExerciseGroupSettings();
  if (!settingsBlockDraft) beginBlockDraft();
  root.innerHTML = '';
  const groups = groupOrder();
  groups.forEach((groupId, index) => {
    root.appendChild(buildGroupBlockSettingsCard(groupId, index, groups.length));
  });
  updateBlockDraftActions();
}

function renderGroupSettings() {
  renderGroupBlockSettings();
}

function buildGroupBlockSettingsCard(groupId, index, count) {
  const cfg = groupConfig(groupId);
  const card = el('section', 'group-block-settings-card');
  card.dataset.groupId = groupId;
  card.style.setProperty('--exercise-group-color', cfg.color);
  card.appendChild(buildGroupSettingsRow(groupId, index, count));
  card.appendChild(buildBlockSettingsGroup(groupId, { embedded: true }));
  return card;
}

function buildGroupSettingsRow(groupId, index, count) {
  const cfg = groupConfig(groupId);
  const activeCount = activeExerciseCountForGroup(groupId);
  const hidden = Boolean(cfg.hidden);
  const canHide = canHideGroup(groupId);
  const row = el('div', 'group-settings-row');
  row.style.setProperty('--exercise-group-color', cfg.color);

  const identity = el('div', 'group-settings-identity');
  const nameWrap = el('div', 'group-settings-name-wrap');
  const nameButton = el('button', 'group-settings-name-button');
  nameButton.type = 'button';
  nameButton.dataset.groupEdit = groupId;
  nameButton.setAttribute('aria-label', `Rename ${cfg.label}`);
  nameButton.appendChild(elText('span', '', cfg.label));
  nameButton.appendChild(buildAppIconSvg('pencil'));
  nameWrap.appendChild(nameButton);

  const name = document.createElement('input');
  name.type = 'text';
  name.className = 'group-settings-name';
  name.value = cfg.label;
  name.dataset.groupLabel = groupId;
  name.setAttribute('aria-label', `Label for ${cfg.label}`);
  name.hidden = true;
  name.addEventListener('keydown', e => {
    if (e.key === 'Enter') {
      e.preventDefault();
      name.blur();
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      name.value = cfg.label;
      name.hidden = true;
      nameButton.hidden = false;
      nameButton.focus();
    }
  });
  nameWrap.appendChild(name);
  identity.appendChild(nameWrap);
  identity.appendChild(elText(
    'span',
    'group-settings-meta',
    activeCount
      ? `${formatNumber(activeCount)} active exercise${activeCount === 1 ? '' : 's'}`
      : hidden ? 'Hidden from normal tracking because the group is empty.' : 'Empty group.'
  ));
  row.appendChild(identity);

  const controls = el('div', 'group-settings-controls');

  const orderControls = el('div', 'group-order-controls');
  orderControls.setAttribute('aria-label', `Order ${cfg.label}`);
  const up = el('button', 'settings-icon-btn group-order-btn');
  up.type = 'button';
  up.disabled = index === 0;
  up.dataset.groupMove = groupId;
  up.dataset.direction = '-1';
  up.setAttribute('aria-label', `Move ${cfg.label} up`);
  up.appendChild(buildAppIconSvg('chevron-up'));
  orderControls.appendChild(up);
  const down = el('button', 'settings-icon-btn group-order-btn');
  down.type = 'button';
  down.disabled = index === count - 1;
  down.dataset.groupMove = groupId;
  down.dataset.direction = '1';
  down.setAttribute('aria-label', `Move ${cfg.label} down`);
  down.appendChild(buildAppIconSvg('chevron-down'));
  orderControls.appendChild(down);
  controls.appendChild(orderControls);

  const colorLabel = el('label', 'group-settings-color-label');
  colorLabel.appendChild(elText('span', '', 'Colour'));
  const color = document.createElement('input');
  color.type = 'color';
  color.className = 'group-settings-color';
  color.value = cfg.color;
  color.dataset.groupColor = groupId;
  color.setAttribute('aria-label', `Color for ${cfg.label}`);
  colorLabel.appendChild(color);
  controls.appendChild(colorLabel);

  const hideLabel = el('label', 'settings-check-label group-settings-hidden');
  const hide = document.createElement('input');
  hide.type = 'checkbox';
  hide.dataset.groupHidden = groupId;
  hide.checked = hidden;
  hide.disabled = !hidden && !canHide;
  hideLabel.appendChild(hide);
  hideLabel.appendChild(elText('strong', '', 'Hide'));
  if (hide.disabled) {
    hideLabel.title = 'Only empty groups can be hidden.';
  }
  controls.appendChild(hideLabel);

  row.appendChild(controls);
  return row;
}

function buildSettingsDragHandle(label) {
  const handle = el('button', 'settings-drag-handle');
  handle.type = 'button';
  handle.setAttribute('aria-label', label);
  handle.appendChild(buildAppIconSvg('grip'));
  return handle;
}

function handleSettingsDragEnd(e) {
  e.currentTarget.draggable = false;
  e.currentTarget.classList.remove('is-dragging');
  document.querySelectorAll('.is-drop-target, .is-drop-after').forEach(node => {
    node.classList.remove('is-drop-target', 'is-drop-after');
  });
  settingsDrag = null;
}

function clearSettingsDropTarget(e) {
  e.currentTarget.classList.remove('is-drop-target', 'is-drop-after');
}

function handleGroupSettingsClick(e) {
  const move = e.target.closest('[data-group-move]');
  if (move) {
    moveGroupSetting(move.dataset.groupMove, Number(move.dataset.direction) || 0);
    return;
  }

  const edit = e.target.closest('[data-group-edit]');
  if (!edit) return;
  const row = edit.closest('.group-settings-row');
  const input = row?.querySelector('[data-group-label]');
  if (!input) return;
  edit.hidden = true;
  input.hidden = false;
  input.focus();
  input.select();
}

function moveGroupSetting(groupId, direction) {
  const registry = ensureExerciseGroupSettings();
  const index = registry.order.indexOf(groupId);
  const target = index + direction;
  if (index === -1 || target < 0 || target >= registry.order.length) return;
  [registry.order[index], registry.order[target]] = [registry.order[target], registry.order[index]];
  saveGroupSettings();
}

function handleGroupSettingsChange(e) {
  const labelInput = e.target.closest('[data-group-label]');
  if (labelInput) {
    saveGroupLabelInput(labelInput);
    return;
  }

  const colorInput = e.target.closest('[data-group-color]');
  if (colorInput) {
    saveGroupColorInput(colorInput);
    return;
  }

  const hiddenInput = e.target.closest('[data-group-hidden]');
  if (hiddenInput) {
    updateGroupHidden(hiddenInput.dataset.groupHidden, hiddenInput.checked);
  }
}

function handleGroupSettingsFocusout(e) {
  const labelInput = e.target.closest('[data-group-label]');
  if (labelInput) {
    saveGroupLabelInput(labelInput);
    return;
  }

  const colorInput = e.target.closest('[data-group-color]');
  if (colorInput) saveGroupColorInput(colorInput);
}

function saveGroupLabelInput(input) {
  updateGroupSetting(input.dataset.groupLabel, {
    label: input.value.trim(),
  });
}

function saveGroupColorInput(input) {
  updateGroupSetting(input.dataset.groupColor, {
    color: input.value,
  });
}

function updateGroupSetting(groupId, changes) {
  const registry = ensureExerciseGroupSettings();
  if (!registry.items[groupId]) return;
  registry.items[groupId] = {
    ...registry.items[groupId],
    ...changes,
  };
  saveGroupSettings();
}

function updateGroupHidden(groupId, hidden) {
  const registry = ensureExerciseGroupSettings();
  if (!registry.items[groupId]) return;
  if (hidden && !canHideGroup(groupId)) {
    showToast('Only empty groups can be hidden.');
    renderGroupSettings();
    return;
  }
  registry.items[groupId].hidden = Boolean(hidden);
  saveGroupSettings();
}

function saveGroupSettings() {
  if (settingsBlockDraft) readBlockSettingsForm({ updateActions: false });
  settings.exerciseGroups = normalizeExerciseGroupSettings(settings.exerciseGroups);
  saveSettings(settings);
  renderHiddenExerciseSettings();
  renderGroupBlockSettings();
  render();
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

function beginBlockDraft() {
  settingsBlockDraft = {
    blocks: cloneBlockSettings(settings.blocks),
    exerciseBlocks: exercises.reduce((map, ex) => {
      map[ex.id] = normalizedBlockId(ex);
      return map;
    }, {}),
    baseline: '',
  };
  settingsBlockDraft.baseline = serializeBlockDraft();
}

function cloneBlockSettings(blocks) {
  const output = {};
  groupOrder().forEach(group => {
    output[group] = Array.isArray(blocks?.[group])
      ? blocks[group].map(block => ({
          id: normalizeBlockInput(block.id),
          title: String(block.title || '').trim(),
          order: Number(block.order) || 0,
        })).filter(block => block.id)
      : [];
    normalizeDraftBlockOrders(group, output);
  });
  return output;
}

function normalizeDraftBlockOrders(group, draftBlocks = settingsBlockDraft?.blocks) {
  if (!draftBlocks) return;
  if (!Array.isArray(draftBlocks[group])) draftBlocks[group] = [];
  draftBlocks[group]
    .sort((a, b) => (Number(a.order) || 0) - (Number(b.order) || 0))
    .forEach((block, index) => {
      block.id = normalizeBlockInput(block.id);
      block.title = String(block.title || '').trim();
      block.order = index + 1;
    });
  draftBlocks[group] = draftBlocks[group].filter(block => block.id);
}

function serializeBlockDraft() {
  if (!settingsBlockDraft) return '';
  const blocks = {};
  groupOrder().forEach(group => {
    blocks[group] = draftBlockDefinitionsForGroup(group).map(block => ({
      id: block.id,
      title: block.title,
      order: block.order,
    }));
  });

  const exerciseBlocks = {};
  exercises.forEach(ex => {
    exerciseBlocks[ex.id] = settingsBlockDraft.exerciseBlocks[ex.id] || '';
  });

  return JSON.stringify({ blocks, exerciseBlocks });
}

function isBlockDraftDirty() {
  return Boolean(settingsBlockDraft && serializeBlockDraft() !== settingsBlockDraft.baseline);
}

function hasPendingBlockDraft() {
  if (!settingsBlockDraft) return false;
  readBlockSettingsForm({ updateActions: false });
  return isBlockDraftDirty();
}

function updateBlockDraftActions() {
  const dirty = isBlockDraftDirty();
  const apply = document.getElementById('settings-blocks-apply');
  const discard = document.getElementById('settings-blocks-discard');
  const actions = document.getElementById('settings-blocks-draft-actions');
  if (actions) actions.hidden = !dirty;
  if (apply) apply.disabled = !dirty;
  if (discard) discard.disabled = !dirty;
}

function applyBlockDraft() {
  if (!settingsBlockDraft) return;
  readBlockSettingsForm({ updateActions: false });

  settings.blocks = cloneBlockSettings(settingsBlockDraft.blocks);
  groupOrder().forEach(group => normalizeBlockDefinitionOrders(group));
  exercises.forEach(ex => {
    ex.blockId = settingsBlockDraft.exerciseBlocks[ex.id] || '';
  });

  saveSettings(settings);
  saveExercises(exercises);
  beginBlockDraft();
  renderGroupBlockSettings();
  render();
  showToast('Block changes applied.');
}

function discardBlockDraft() {
  if (!settingsBlockDraft) return;
  beginBlockDraft();
  renderGroupBlockSettings();
}

function renderBlockSettings() {
  renderGroupBlockSettings();
}

function refreshOpenBlockSettings() {
  const modal = document.getElementById('settings-modal');
  if (!modal || modal.classList.contains('hidden')) return;
  readBlockSettingsForm();
  renderGroupBlockSettings();
}

function buildBlockSettingsGroup(group, options = {}) {
  const cfg = groupConfig(group);
  const panel = el('section', options.embedded ? 'block-settings-group is-embedded' : 'block-settings-group');
  panel.style.setProperty('--exercise-group-color', cfg.color);

  const header = el('div', 'block-settings-group-header');
  const heading = el('div', 'block-settings-heading');
  heading.appendChild(elText('h4', '', options.embedded ? 'Blocks' : cfg.label));
  heading.appendChild(elText('span', '', `${draftBlockDefinitionsForGroup(group).length} block${draftBlockDefinitionsForGroup(group).length === 1 ? '' : 's'}`));
  header.appendChild(heading);
  const addBtn = el('button', 'block-settings-add');
  addBtn.type = 'button';
  addBtn.appendChild(buildAppIconSvg('add'));
  addBtn.appendChild(elText('span', 'ui-button-text', 'Add block'));
  addBtn.addEventListener('click', () => {
    readBlockSettingsForm({ updateActions: false });
    const block = addDraftBlockDefinition(group);
    renderBlockSettings();
    window.setTimeout(() => {
      const escapeIdent = window.CSS?.escape || (value => String(value).replace(/"/g, '\\"'));
      const input = document.querySelector(`#settings-groups-blocks input[data-block-title="${escapeIdent(`${group}:${block.id}`)}"]`);
      const view = input?.closest('.block-drop-lane-title')?.querySelector('[data-block-edit]');
      if (input) {
        if (view) view.hidden = true;
        input.hidden = false;
        input.focus();
        input.select();
      }
    }, 0);
  });
  header.appendChild(addBtn);
  panel.appendChild(header);

  const blocks = draftBlockDefinitionsForGroup(group);
  const lanes = el('div', 'block-drop-lanes');
  lanes.appendChild(buildBlockDropLane(group, null));
  if (!blocks.length) {
    lanes.appendChild(elText('div', 'block-settings-empty', 'Add a block, then drag exercises into it.'));
  } else {
    blocks.forEach((block, index) => lanes.appendChild(buildBlockDropLane(group, block, index, blocks.length)));
  }
  panel.appendChild(lanes);

  return panel;
}

function buildBlockDropLane(group, block, index = 0, count = 0) {
  const isUnassigned = !block;
  const lane = el('section', `block-drop-lane${isUnassigned ? ' is-unassigned' : ''}`);
  lane.dataset.group = group;
  lane.dataset.blockId = block?.id || '';
  lane.addEventListener('dragover', handleBlockLaneDragOver);
  lane.addEventListener('dragleave', clearSettingsDropTarget);
  lane.addEventListener('drop', handleBlockLaneDrop);

  const header = el('div', 'block-drop-lane-header');
  if (isUnassigned) {
    header.appendChild(elText('div', 'block-drop-lane-title', 'Unassigned'));
    header.appendChild(elText('span', 'block-drop-lane-copy', 'Drop an exercise here to remove it from a block.'));
  } else {
    const title = el('div', 'block-drop-lane-title');
    const titleButton = el('button', 'block-settings-name-button');
    titleButton.type = 'button';
    titleButton.dataset.blockEdit = `${group}:${block.id}`;
    titleButton.setAttribute('aria-label', `Rename ${draftBlockTitleFor(group, block.id)}`);
    const titleText = elText('span', '', draftBlockTitleFor(group, block.id));
    titleButton.appendChild(titleText);
    titleButton.appendChild(buildAppIconSvg('pencil'));
    title.appendChild(titleButton);

    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'block-settings-title';
    input.value = block.title || '';
    input.placeholder = blockTitleFromId(block.id);
    input.dataset.blockTitle = `${group}:${block.id}`;
    input.setAttribute('aria-label', `Title for ${blockTitleFromId(block.id)}`);
    input.addEventListener('input', () => readBlockSettingsForm());
    input.addEventListener('keydown', e => {
      if (e.key === 'Enter') {
        e.preventDefault();
        input.blur();
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        input.value = block.title || '';
        input.blur();
      }
    });
    input.addEventListener('blur', () => {
      readBlockSettingsForm();
      titleText.textContent = input.value.trim() || blockTitleFromId(block.id);
      input.hidden = true;
      titleButton.hidden = false;
    });
    input.hidden = true;
    title.appendChild(input);
    titleButton.addEventListener('click', () => {
      titleButton.hidden = true;
      input.hidden = false;
      input.focus();
      input.select();
    });
    header.appendChild(title);

    const actions = el('div', 'block-settings-actions');
    const up = el('button', 'settings-icon-btn block-order-btn');
    up.type = 'button';
    up.disabled = index === 0;
    up.setAttribute('aria-label', `Move ${draftBlockTitleFor(group, block.id)} up`);
    up.appendChild(buildAppIconSvg('chevron-up'));
    up.addEventListener('click', () => {
      readBlockSettingsForm({ updateActions: false });
      moveDraftBlockDefinition(group, block.id, -1);
      renderBlockSettings();
    });
    actions.appendChild(up);
    const down = el('button', 'settings-icon-btn block-order-btn');
    down.type = 'button';
    down.disabled = index === count - 1;
    down.setAttribute('aria-label', `Move ${draftBlockTitleFor(group, block.id)} down`);
    down.appendChild(buildAppIconSvg('chevron-down'));
    down.addEventListener('click', () => {
      readBlockSettingsForm({ updateActions: false });
      moveDraftBlockDefinition(group, block.id, 1);
      renderBlockSettings();
    });
    actions.appendChild(down);

    const del = el('button', 'settings-icon-btn block-settings-delete');
    del.type = 'button';
    del.setAttribute('aria-label', `Delete ${draftBlockTitleFor(group, block.id)}`);
    del.appendChild(buildAppIconSvg('trash'));
    del.addEventListener('click', () => {
      if (!confirm(`Delete ${draftBlockTitleFor(group, block.id)} and unassign its exercises?`)) return;
      readBlockSettingsForm({ updateActions: false });
      deleteDraftBlockDefinition(group, block.id);
      renderBlockSettings();
    });
    actions.appendChild(del);
    header.appendChild(actions);
  }
  lane.appendChild(header);

  const exercisesForLane = draftExercisesForBlock(group, block?.id || '');
  const exerciseList = el('div', 'block-exercise-list');
  if (!exercisesForLane.length) {
    exerciseList.appendChild(elText('div', 'block-exercise-empty', isUnassigned ? 'Everything in this group is assigned to a block.' : 'Drop exercises here.'));
  } else {
    exercisesForLane.forEach(ex => exerciseList.appendChild(buildBlockExerciseAssignment(group, ex)));
  }
  lane.appendChild(exerciseList);
  return lane;
}

function buildBlockExerciseAssignment(group, ex) {
  const row = el('div', 'block-exercise-assignment');
  row.dataset.exerciseId = ex.id;
  row.draggable = false;
  row.addEventListener('dragstart', handleBlockExerciseDragStart);
  row.addEventListener('dragend', handleSettingsDragEnd);

  const handle = buildSettingsDragHandle(`Drag ${ex.name} to assign it to a block`);
  handle.addEventListener('mousedown', () => { row.draggable = true; });
  handle.addEventListener('mouseup', () => { row.draggable = false; });
  row.appendChild(handle);
  row.appendChild(elText('span', 'block-exercise-name', ex.name));
  const select = document.createElement('select');
  select.dataset.exerciseBlock = ex.id;
  select.setAttribute('aria-label', `Move ${ex.name} to a block`);
  const none = document.createElement('option');
  none.value = '';
  none.textContent = 'No block';
  select.appendChild(none);
  draftBlockDefinitionsForGroup(group).forEach(block => {
    const option = document.createElement('option');
    option.value = block.id;
    option.textContent = draftBlockTitleFor(group, block.id);
    select.appendChild(option);
  });
  select.value = settingsBlockDraft.exerciseBlocks[ex.id] || '';
  select.addEventListener('change', () => {
    readBlockSettingsForm();
    renderBlockSettings();
  });
  row.appendChild(select);
  return row;
}

function draftExercisesForBlock(group, blockId) {
  return displayOrderedExercisesInGroup(group).filter(ex => (settingsBlockDraft.exerciseBlocks[ex.id] || '') === blockId);
}

function handleBlockExerciseDragStart(e) {
  if (e.target !== e.currentTarget) return;
  settingsDrag = { type: 'exercise', exerciseId: e.currentTarget.dataset.exerciseId };
  e.currentTarget.classList.add('is-dragging');
  e.dataTransfer.effectAllowed = 'move';
  e.dataTransfer.setData('text/plain', `pem-exercise:${settingsDrag.exerciseId}`);
}

function handleBlockLaneDragOver(e) {
  const target = e.currentTarget;
  if (settingsDrag?.type !== 'exercise') return;
  const exercise = exercises.find(item => item.id === settingsDrag.exerciseId);
  if (!exercise || exercise.group !== target.dataset.group) return;
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';
  target.classList.add('is-drop-target');
}

function handleBlockLaneDrop(e) {
  if (!settingsDrag) return;
  const target = e.currentTarget;
  const drag = settingsDrag;
  if (drag.type !== 'exercise') return;
  const exercise = exercises.find(item => item.id === drag.exerciseId);
  if (!exercise || exercise.group !== target.dataset.group) return;
  e.preventDefault();
  readBlockSettingsForm({ updateActions: false });
  assignDraftExerciseToBlock(exercise.id, target.dataset.group, target.dataset.blockId);
  renderBlockSettings();
}

function readBlockSettingsForm(options = {}) {
  if (!settingsBlockDraft) return;
  const updateActions = options.updateActions !== false;
  document.querySelectorAll('#settings-groups-blocks input[data-block-title]').forEach(input => {
    const [group, blockId] = input.dataset.blockTitle.split(':');
    const block = draftBlockDefinitionsForGroup(group).find(item => item.id === blockId);
    if (block) block.title = input.value.trim();
  });
  document.querySelectorAll('#settings-groups-blocks select[data-exercise-block]').forEach(select => {
    settingsBlockDraft.exerciseBlocks[select.dataset.exerciseBlock] = select.value;
  });
  if (updateActions) updateBlockDraftActions();
}

function draftBlockDefinitionsForGroup(group) {
  if (!settingsBlockDraft) beginBlockDraft();
  if (!Array.isArray(settingsBlockDraft.blocks[group])) settingsBlockDraft.blocks[group] = [];
  normalizeDraftBlockOrders(group);
  return settingsBlockDraft.blocks[group];
}

function addDraftBlockDefinition(group) {
  const id = nextDraftBlockId(group);
  const block = { id, title: '', order: settingsBlockDraft.blocks[group].length + 1 };
  settingsBlockDraft.blocks[group].push(block);
  normalizeDraftBlockOrders(group);
  return block;
}

function nextDraftBlockId(group) {
  const used = new Set(draftBlockDefinitionsForGroup(group).map(block => block.id));
  for (let i = 0; i < 26; i++) {
    const id = `block-${String.fromCharCode(97 + i)}`;
    if (!used.has(id)) return id;
  }
  let n = 27;
  while (used.has(`block-${n}`)) n++;
  return `block-${n}`;
}

function moveDraftBlockDefinition(group, blockId, direction) {
  const blocks = draftBlockDefinitionsForGroup(group);
  const index = blocks.findIndex(block => block.id === blockId);
  const target = index + direction;
  if (index === -1 || target < 0 || target >= blocks.length) return;
  [blocks[index], blocks[target]] = [blocks[target], blocks[index]];
  blocks.forEach((block, i) => { block.order = i + 1; });
}

function assignDraftExerciseToBlock(exerciseId, group, blockId) {
  const exercise = exercises.find(item => item.id === exerciseId);
  const targetIsValid = !blockId || draftBlockDefinitionsForGroup(group).some(block => block.id === blockId);
  if (!exercise || exercise.group !== group || !targetIsValid) return;
  settingsBlockDraft.exerciseBlocks[exerciseId] = blockId;
  updateBlockDraftActions();
}

function deleteDraftBlockDefinition(group, blockId) {
  settingsBlockDraft.blocks[group] = draftBlockDefinitionsForGroup(group).filter(block => block.id !== blockId);
  Object.keys(settingsBlockDraft.exerciseBlocks).forEach(exerciseId => {
    const ex = exercises.find(item => item.id === exerciseId);
    if (ex?.group === group && settingsBlockDraft.exerciseBlocks[exerciseId] === blockId) {
      settingsBlockDraft.exerciseBlocks[exerciseId] = '';
    }
  });
  normalizeDraftBlockOrders(group);
}

function draftBlockTitleFor(group, blockId) {
  const block = draftBlockDefinitionsForGroup(group).find(item => item.id === blockId);
  const title = block?.title;
  return title && String(title).trim() ? title : blockTitleFromId(blockId);
}
