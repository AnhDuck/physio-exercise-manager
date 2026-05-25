// DOM construction and feedback helpers.

function el(tag, className) {
  const e = document.createElement(tag);
  if (className) e.className = className;
  return e;
}

function elText(tag, className, text) {
  const e = el(tag, className);
  e.textContent = text;
  return e;
}

function buildDoseMetaChip(className, label, value) {
  const chip = el('span', `ex-meta-item ex-meta-chip ${className}`);
  chip.appendChild(elText('span', 'ex-meta-chip-label', label));
  chip.appendChild(elText('span', 'ex-meta-chip-value', String(value)));
  return chip;
}

function buildAppIconSvg(iconName, className = 'ui-button-icon') {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('class', className);
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');

  const paths = {
    add: ['M12 5v14', 'M5 12h14'],
    'backup-download': [
      'M6 3.5h7l5 5v12H6z',
      'M13 3.5V9h5',
      'M12 10.5v5',
      'M9.5 13l2.5 2.5 2.5-2.5',
    ],
    'backup-import': [
      'M6 3.5h7l5 5v12H6z',
      'M13 3.5V9h5',
      'M12 16v-5',
      'M9.5 13.5L12 11l2.5 2.5',
    ],
    'backup-now': [
      'M5 6h14v12.5H5z',
      'M8 6V3.5h8V6',
      'M8.5 12.4l2.1 2.1 4.9-5',
    ],
    check: ['M5 12.5l4.2 4.2L19 7'],
    'check-circle': ['M20 11.1V12a8 8 0 1 1-4.7-7.3', 'M7.8 11.7l2.7 2.7L20 5'],
    'chevron-down': ['M7 10l5 5 5-5'],
    'chevron-up': ['M7 14l5-5 5 5'],
    copy: [
      'M8 8h11v11H8z',
      'M5 15H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v1',
    ],
    file: ['M6 3.5h7l5 5v12H6z', 'M13 3.5V9h5'],
    folder: ['M3.5 7h6l1.6 2H20.5v9.5h-17z', 'M3.5 7v11.5'],
    gear: [
      'M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z',
      'M19 12a7 7 0 0 0-.1-1.1l2-1.5-2-3.4-2.4 1a7 7 0 0 0-1.9-1.1L14.3 3h-4.6l-.4 2.9A7 7 0 0 0 7.5 7l-2.4-1-2 3.4 2 1.5A7 7 0 0 0 5 12c0 .4 0 .8.1 1.1l-2 1.5 2 3.4 2.4-1a7 7 0 0 0 1.9 1.1l.4 2.9h4.6l.4-2.9a7 7 0 0 0 1.9-1.1l2.4 1 2-3.4-2-1.5c.1-.3.1-.7.1-1.1z',
    ],
    import: ['M12 5v10', 'M8.5 11.5L12 15l3.5-3.5', 'M5 19h14'],
    pencil: ['M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z', 'M12 20h9'],
    reconnect: [
      'M7 8.5a6 6 0 0 1 9.6-1.6L18.5 9',
      'M18.5 5.5V9h-3.5',
      'M17 15.5a6 6 0 0 1-9.6 1.6L5.5 15',
      'M5.5 18.5V15H9',
    ],
    restore: ['M8 7H5v-3', 'M5 7a7 7 0 1 1 1.9 4.8'],
    search: ['M11 18a7 7 0 1 1 0-14 7 7 0 0 1 0 14z', 'm16.5 16.5 4 4'],
    trash: ['M4 7h16', 'M9 7V5h6v2', 'M7 7l1 13h8l1-13', 'M10 11v5', 'M14 11v5'],
    upload: ['M12 19V8', 'M8.5 11.5L12 8l3.5 3.5', 'M5 19h14'],
    wrench: ['M14.7 6.3a4 4 0 0 0-5 5L4.5 16.5a2.1 2.1 0 0 0 3 3l5.2-5.2a4 4 0 0 0 5-5l-2.6 2.6-3-3 2.6-2.6z'],
    x: ['M6 6l12 12', 'M18 6L6 18'],
  };

  (paths[iconName] || paths.x).forEach(d => {
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', d);
    svg.appendChild(path);
  });
  return svg;
}

function hydrateIconButtons(root = document) {
  if (!root) return;
  root.querySelectorAll('[data-ui-icon]').forEach(button => {
    setIconButtonContent(button, button.dataset.uiLabel ?? button.textContent, button.dataset.uiIcon);
  });
}

function setIconButtonContent(button, label, iconName = button?.dataset?.uiIcon) {
  if (!button) return;
  const cleanLabel = String(label || '').trim();
  button.dataset.uiLabel = cleanLabel;
  button.textContent = '';
  if (iconName) {
    button.dataset.uiIcon = iconName;
    button.appendChild(buildAppIconSvg(iconName));
  }
  if (cleanLabel) button.appendChild(elText('span', 'ui-button-text', cleanLabel));
}

function showToast(message) {
  let toast = document.getElementById('app-toast');
  if (!toast) {
    toast = el('div', 'app-toast');
    toast.id = 'app-toast';
    toast.setAttribute('role', 'status');
    toast.setAttribute('aria-live', 'polite');
    document.body.appendChild(toast);
  }
  toast.textContent = message;
  toast.classList.add('show');
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => {
    toast.classList.remove('show');
  }, 3200);
}

function hydrateSettingsIconButtons(root = document) {
  if (!root) return;
  root.querySelectorAll('[data-settings-icon]').forEach(button => {
    setSettingsButtonContent(button, button.dataset.settingsLabel || button.textContent, button.dataset.settingsIcon);
  });
}

function setSettingsButtonContent(button, label, iconName = button?.dataset?.settingsIcon) {
  if (!button) return;
  const cleanLabel = String(label || '').trim();
  button.dataset.settingsLabel = cleanLabel;
  button.textContent = '';
  if (iconName) button.appendChild(buildAppIconSvg(iconName, 'settings-button-icon'));
  button.appendChild(elText('span', 'settings-button-text', cleanLabel));
}
