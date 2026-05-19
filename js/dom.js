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

function buildDoseMetaChip(className, label, value, normalText) {
  if (!isDenseMode) {
    return elText('span', `ex-meta-item ex-meta-chip ${className}`, normalText);
  }

  const chip = el('span', `ex-meta-item ex-meta-chip ${className}`);
  chip.appendChild(elText('span', 'ex-meta-chip-label', label));
  chip.appendChild(elText('span', 'ex-meta-chip-value', String(value)));
  return chip;
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
  if (iconName) button.appendChild(buildSettingsIconSvg(iconName));
  button.appendChild(elText('span', 'settings-button-text', cleanLabel));
}

function buildSettingsIconSvg(iconName) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('class', 'settings-button-icon');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');

  const paths = {
    'backup-download': [
      'M6 3.5h7l5 5v12H6z',
      'M13 3.5V9h5',
      'M12 10.5v5',
      'M9.5 13l2.5 2.5 2.5-2.5',
    ],
    'backup-now': [
      'M5 6h14v12.5H5z',
      'M8 6V3.5h8V6',
      'M8.5 12.4l2.1 2.1 4.9-5',
    ],
    'backup-import': [
      'M6 3.5h7l5 5v12H6z',
      'M13 3.5V9h5',
      'M12 16v-5',
      'M9.5 13.5L12 11l2.5 2.5',
    ],
    folder: [
      'M3.5 7h6l1.6 2H20.5v9.5h-17z',
      'M3.5 7v11.5',
    ],
    reconnect: [
      'M7 8.5a6 6 0 0 1 9.6-1.6L18.5 9',
      'M18.5 5.5V9h-3.5',
      'M17 15.5a6 6 0 0 1-9.6 1.6L5.5 15',
      'M5.5 18.5V15H9',
    ],
  };

  (paths[iconName] || paths.folder).forEach(d => {
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', d);
    svg.appendChild(path);
  });
  return svg;
}
