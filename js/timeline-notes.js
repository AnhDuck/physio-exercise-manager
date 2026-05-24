// Quick note composer behavior.

let quickNoteManualDateTimeOpen = false;

function initializeQuickNoteFields() {
  const dateField = document.getElementById('quick-note-date');
  const timeField = document.getElementById('quick-note-time');
  if (!dateField || !timeField) return;
  if (!dateField.value) dateField.value = todayStr();
  if (!timeField.value) timeField.value = currentTimeStr();
  syncQuickNoteDateTime();
  renderQuickNoteManualDateTime();
}

function setQuickNoteManualDateTimeOpen(open) {
  quickNoteManualDateTimeOpen = Boolean(open);
  renderQuickNoteManualDateTime();
}

function toggleQuickNoteManualDateTime() {
  setQuickNoteManualDateTimeOpen(!quickNoteManualDateTimeOpen);
}

function renderQuickNoteManualDateTime() {
  const toggle = document.getElementById('quick-note-manual-toggle');
  const fields = document.getElementById('quick-note-manual-fields');
  const summary = document.getElementById('quick-note-manual-summary');
  const dateField = document.getElementById('quick-note-date');
  const timeField = document.getElementById('quick-note-time');
  if (!toggle || !fields || !summary || !dateField || !timeField) return;

  toggle.setAttribute('aria-expanded', String(quickNoteManualDateTimeOpen));
  toggle.classList.toggle('open', quickNoteManualDateTimeOpen);
  fields.hidden = !quickNoteManualDateTimeOpen;
  summary.textContent = quickNoteDateTimeSummary(dateField.value, timeField.value);
}

function quickNoteDateTimeSummary(dateStr, timeStr) {
  const date = dateStr === todayStr() ? 'Today' : formatEventDateShort(dateStr);
  const time = formatEventTime(timeStr || currentTimeStr());
  return `${date} ${time}`.trim();
}

function addQuickNote() {
  const textField = document.getElementById('quick-note-text');
  const text = textField.value.trim();
  if (!text) { alert('Note text is required.'); return; }

  events.push({
    id: makeId('event'),
    type: 'note',
    date: document.getElementById('quick-note-date').value || todayStr(),
    time: document.getElementById('quick-note-time').value || currentTimeStr(),
    text,
    createdAt: new Date().toISOString(),
  });
  saveEvents(events);
  textField.value = '';
  document.getElementById('quick-note-date').value = todayStr();
  document.getElementById('quick-note-time').value = currentTimeStr();
  renderNotesPanel();
  textField.focus();
}
