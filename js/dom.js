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
