// Timeline item editing.

function openEventModal(eventId) {
  const ev = events.find(item => item.id === eventId);
  if (!ev) return;
  editingEventId = eventId;
  const isDoseChange = ev.type === 'dose-change';
  document.getElementById('event-modal-title').textContent = ev.type === 'note' ? 'Edit note' : 'Edit history item';
  document.getElementById('event-field-date').value = ev.date || todayStr();
  document.getElementById('event-field-time').value = ev.time || currentTimeStr();
  document.getElementById('event-field-text').value = ev.type === 'note' ? (ev.text || '') : (ev.annotation || '');
  document.getElementById('event-field-text').placeholder = ev.type === 'note'
    ? 'Timeline note'
    : 'Optional annotation for this history item';
  renderEventDoseFields(ev);
  document.getElementById('event-detail').textContent = ev.type === 'note' || isDoseChange ? '' : eventText(ev);
  document.getElementById('event-delete-btn').style.display = 'inline-block';
  document.getElementById('event-modal').classList.remove('hidden');
}

function closeEventModal() {
  document.getElementById('event-modal').classList.add('hidden');
  renderEventDoseFields(null);
  editingEventId = null;
}

function renderEventDoseFields(ev) {
  const wrap = document.getElementById('event-dose-fields');
  wrap.innerHTML = '';
  if (!ev || ev.type !== 'dose-change') {
    wrap.classList.add('hidden');
    return;
  }

  const changes = ev.changes || {};
  const fields = ['sets', 'reps', 'resistance', 'frequency'].filter(field => changes[field]);
  if (!fields.length) {
    wrap.classList.add('hidden');
    return;
  }

  wrap.classList.remove('hidden');
  wrap.appendChild(elText('div', 'event-dose-heading', 'Dose change'));
  fields.forEach(field => {
    const change = changes[field] || {};
    const row = el('div', 'event-dose-row');
    row.appendChild(elText('div', 'event-dose-label', doseFieldLabel(field)));

    const fromField = buildDoseChangeInput(field, 'from', change.from);
    const toField = buildDoseChangeInput(field, 'to', change.to);
    row.appendChild(fromField);
    row.appendChild(toField);
    wrap.appendChild(row);
  });
}

function buildDoseChangeInput(field, direction, value) {
  const control = el('label', 'event-dose-control');
  control.appendChild(elText('span', '', direction === 'from' ? 'From' : 'To'));
  const input = document.createElement('input');
  input.type = 'text';
  input.value = value ?? '';
  input.dataset.changeField = field;
  input.dataset.changeDirection = direction;
  control.appendChild(input);
  return control;
}

function doseFieldLabel(field) {
  return {
    sets: 'Sets',
    reps: 'Reps',
    resistance: 'Resistance',
    frequency: 'Frequency',
  }[field] || field;
}

function readEventDoseChanges(existingChanges = {}) {
  const changes = {};
  Object.keys(existingChanges).forEach(field => {
    changes[field] = { ...existingChanges[field] };
  });
  document.querySelectorAll('#event-dose-fields input[data-change-field]').forEach(input => {
    const field = input.dataset.changeField;
    const direction = input.dataset.changeDirection;
    if (!changes[field]) changes[field] = { from: '', to: '' };
    changes[field][direction] = input.value.trim();
  });
  return changes;
}

function saveEventModal() {
  const ev = events.find(item => item.id === editingEventId);
  if (!ev) return;
  ev.date = document.getElementById('event-field-date').value || todayStr();
  ev.time = document.getElementById('event-field-time').value || currentTimeStr();
  if (ev.type === 'note') {
    delete ev.exerciseId;
    delete ev.exerciseName;
    ev.text = document.getElementById('event-field-text').value.trim();
  } else {
    ev.annotation = document.getElementById('event-field-text').value.trim();
    if (ev.type === 'dose-change') {
      ev.changes = readEventDoseChanges(ev.changes || {});
    }
  }
  ev.updatedAt = new Date().toISOString();
  saveEvents(events);
  closeEventModal();
  render();
}

function deleteEventModal() {
  const ev = events.find(item => item.id === editingEventId);
  if (!ev) return;
  if (!confirm('Delete this timeline item? This cannot be undone.')) return;
  events = events.filter(item => item.id !== editingEventId);
  saveEvents(events);
  closeEventModal();
  renderNotesPanel();
}
