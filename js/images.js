// Exercise image upload and URL import.

function openImageModal(exId) {
  uploadTargetId = exId;
  const ex = exercises.find(item => item.id === exId);
  const removeBtn = document.getElementById('image-remove-btn');
  document.getElementById('field-image-url').value = '';
  removeBtn.style.display = ex?.image ? 'inline-block' : 'none';
  setImageImportPending(false);
  document.getElementById('image-modal').classList.remove('hidden');
  window.setTimeout(() => document.getElementById('field-image-url').focus(), 0);
}

function closeImageModal() {
  document.getElementById('image-modal').classList.add('hidden');
  document.getElementById('field-image-url').value = '';
  setImageImportPending(false);
  uploadTargetId = null;
}

function openImageUpload() {
  if (!uploadTargetId || imageImportPending) return;
  document.getElementById('image-upload-input').click();
}

function setImageImportPending(pending) {
  imageImportPending = pending;
  document.getElementById('image-import-btn').disabled = pending;
  document.getElementById('image-file-btn').disabled = pending;
  document.getElementById('image-import-btn').textContent = pending ? 'Importing...' : 'Import URL';
}

function storeExerciseImage(exId, imageData) {
  const idx = exercises.findIndex(ex => ex.id === exId);
  if (idx === -1) return false;
  const previousImage = exercises[idx].image;
  exercises[idx].image = imageData;
  try {
    saveExercises(exercises);
  } catch (err) {
    exercises[idx].image = previousImage;
    const msg = err && err.name === 'QuotaExceededError'
      ? 'That image is too large for browser storage. Try a smaller image.'
      : 'Could not save that image.';
    alert(msg);
    return false;
  }
  render();
  return true;
}

function handleImageUpload(file) {
  if (!file || !uploadTargetId) return;
  const targetId = uploadTargetId;
  const reader = new FileReader();
  reader.onload = (e) => {
    if (storeExerciseImage(targetId, e.target.result)) {
      closeImageModal();
    }
  };
  reader.readAsDataURL(file);
}

function removeExerciseImage() {
  if (!uploadTargetId) return;
  if (storeExerciseImage(uploadTargetId, null)) {
    closeImageModal();
  }
}

async function importImageFromUrl() {
  if (!uploadTargetId || imageImportPending) return;
  const rawUrl = document.getElementById('field-image-url').value.trim();
  if (!rawUrl) {
    alert('Paste an image URL or page URL first.');
    return;
  }

  setImageImportPending(true);
  try {
    const imageDataUrl = await resolveImageImport(rawUrl);
    if (storeExerciseImage(uploadTargetId, imageDataUrl)) {
      closeImageModal();
    }
  } catch (err) {
    alert(err?.message || 'Could not import image from that URL.');
  } finally {
    setImageImportPending(false);
  }
}

function normalizeImportUrl(rawUrl) {
  const trimmed = rawUrl.trim();
  if (!trimmed) throw new Error('Paste a valid URL first.');
  try {
    return new URL(trimmed).href;
  } catch (_) {
    return new URL(`https://${trimmed}`).href;
  }
}

async function resolveImageImport(rawUrl) {
  const normalizedUrl = normalizeImportUrl(rawUrl);
  const directImage = await tryFetchImageAsDataUrl(normalizedUrl);
  if (directImage) return directImage;

  const pageImageUrl = await tryExtractImageUrlFromPage(normalizedUrl);
  if (pageImageUrl) {
    const previewImage = await tryFetchImageAsDataUrl(pageImageUrl);
    if (previewImage) return previewImage;
  }

  throw new Error(
    'Could not import from that URL. Try a direct image URL or use Choose File. Some sites block browser-side downloads.'
  );
}

async function tryFetchImageAsDataUrl(url) {
  let response;
  try {
    response = await fetch(url);
  } catch (_) {
    return null;
  }

  if (!response.ok) return null;
  const type = response.headers.get('content-type') || '';
  if (!type.startsWith('image/')) return null;

  const blob = await response.blob();
  return blobToDataUrl(blob);
}

async function tryExtractImageUrlFromPage(pageUrl) {
  let response;
  try {
    response = await fetch(pageUrl);
  } catch (_) {
    return null;
  }

  if (!response.ok) return null;
  const type = response.headers.get('content-type') || '';
  if (!type.includes('text/html')) return null;

  let html;
  try {
    html = await response.text();
  } catch (_) {
    return null;
  }

  const doc = new DOMParser().parseFromString(html, 'text/html');
  const selectors = [
    'meta[property="og:image:secure_url"]',
    'meta[property="og:image"]',
    'meta[name="twitter:image"]',
    'meta[name="twitter:image:src"]',
    'link[rel="image_src"]',
    'img[src]'
  ];

  for (const selector of selectors) {
    const node = doc.querySelector(selector);
    const candidate = node?.content || node?.href || node?.src || node?.getAttribute('src');
    if (!candidate) continue;
    try {
      return new URL(candidate, pageUrl).href;
    } catch (_) {
      continue;
    }
  }

  return null;
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('Could not read downloaded image.'));
    reader.readAsDataURL(blob);
  });
}

