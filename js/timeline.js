// Timeline coordinator.

function setNotesPanelOpen(open, shouldFocus = false) {
  settings.notesOpen = open;
  saveSettings(settings);
  renderNotesPanel();
  if (open && typeof maybeSyncActivityWatchRecent === 'function') {
    maybeSyncActivityWatchRecent('timeline-open');
  }
  if (shouldFocus && open) {
    window.setTimeout(() => document.getElementById('quick-note-text')?.focus(), 0);
  }
}

function toggleNotesPanel() {
  setNotesPanelOpen(!settings.notesOpen, true);
}

function openNotesModal(dateStr = todayStr()) {
  setNotesPanelOpen(true, true);
  document.getElementById('quick-note-date').value = dateStr;
  renderQuickNoteManualDateTime();
}

function renderNotesPanel() {
  initializeTimelineViewState();
  const panel = document.getElementById('notes-panel');
  const buttons = document.querySelectorAll('.notes-toggle');
  if (!panel || !buttons.length) return;

  const isOpen = Boolean(settings.notesOpen);
  const label = isOpen ? 'Hide notes panel' : 'Show notes panel';
  document.body.classList.toggle('notes-open', isOpen);
  buttons.forEach(btn => {
    btn.classList.toggle('active', isOpen);
    btn.setAttribute('aria-expanded', String(isOpen));
    btn.title = label;
    btn.setAttribute('aria-label', label);
  });

  initializeQuickNoteFields();
  const view = getTimelineVisibleItems();
  renderTimelineSearchControls(view);
  renderTimelineList(view);
  if (isOpen && typeof maybeSyncActivityWatchRecent === 'function') {
    maybeSyncActivityWatchRecent('timeline-render');
  }
}
