const fileCamera  = document.getElementById('fileCamera');
const fileGallery = document.getElementById('fileGallery');
const uploadArea  = document.getElementById('uploadArea');
const previewWrap = document.getElementById('previewWrap');
const preview     = document.getElementById('preview');
const readBtn     = document.getElementById('readBtn');
const btnText     = readBtn.querySelector('.btn-text');
const spinner     = document.getElementById('spinner');
const resultWrap  = document.getElementById('resultWrap');
const resultValue = document.getElementById('resultValue');
const resultRaw   = document.getElementById('resultRaw');
const errorWrap   = document.getElementById('errorWrap');
const errorMsg    = document.getElementById('errorMsg');
const addToListBtn = document.getElementById('addToListBtn');
const saveStatus  = document.getElementById('saveStatus');
const batchWrap   = document.getElementById('batchWrap');
const batchBody   = document.getElementById('batchBody');
const sendAllBtn  = document.getElementById('sendAllBtn');
const batchStatus = document.getElementById('batchStatus');

let currentReading = null; // { value, type }
let currentFile    = null; // most recently selected file
let batchReadings  = [];   // [{ value, type, timestamp }]

// ---- File selection ----

fileCamera.addEventListener('change', () => {
  const file = fileCamera.files[0];
  if (!file) return;
  loadFile(file);
});

fileGallery.addEventListener('change', () => {
  const file = fileGallery.files[0];
  if (!file) return;
  loadFile(file);
});

// Drag & drop
uploadArea.addEventListener('dragover', (e) => {
  e.preventDefault();
  uploadArea.classList.add('drag-over');
});
uploadArea.addEventListener('dragleave', () => uploadArea.classList.remove('drag-over'));
uploadArea.addEventListener('drop', (e) => {
  e.preventDefault();
  uploadArea.classList.remove('drag-over');
  const file = e.dataTransfer.files[0];
  if (file && file.type.startsWith('image/')) loadFile(file);
});

function loadFile(file) {
  hideResult();
  hideError();
  currentFile = file;
  const url = URL.createObjectURL(file);
  preview.src = url;
  previewWrap.classList.remove('hidden');
  readBtn.classList.remove('hidden');
  readBtn.disabled = false;
  currentReading = null;
}

// ---- Read meter ----

readBtn.addEventListener('click', async () => {
  const file = currentFile;
  if (!file) return;

  setLoading(true);
  hideResult();
  hideError();

  try {
    const base64 = await compressAndEncode(file);
    const mimeType = 'image/jpeg'; // always JPEG after compression

    const res = await fetch('/api/read', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image: base64, mimeType }),
    });

    const data = await res.json();

    if (!res.ok) {
      showError(data.error || 'Neznámá chyba serveru.');
      return;
    }

    currentReading = { value: data.value, type: data.type };
    showResult(data.value, data.type, data.raw);
  } catch (err) {
    showError('Nelze se připojit k serveru: ' + err.message);
  } finally {
    setLoading(false);
  }
});

// ---- Add to batch list ----

addToListBtn.addEventListener('click', () => {
  if (!currentReading) return;

  batchReadings.push({
    value: currentReading.value,
    type: currentReading.type,
    timestamp: new Date().toISOString(),
  });

  renderBatchTable();

  saveStatus.textContent = '✓ Přidáno do seznamu';
  saveStatus.className = 'save-status';
  saveStatus.classList.remove('hidden');

  setTimeout(() => {
    hideResult();
    saveStatus.classList.add('hidden');
  }, 1200);
});

// ---- Render batch table ----

function renderBatchTable() {
  batchBody.innerHTML = '';

  batchReadings.forEach((r, i) => {
    const tr = document.createElement('tr');
    const time = new Date(r.timestamp).toLocaleTimeString('cs-CZ', { hour: '2-digit', minute: '2-digit' });
    tr.innerHTML = `
      <td>${r.type || '—'}</td>
      <td>${Number(r.value).toLocaleString('cs-CZ')}</td>
      <td>${time}</td>
      <td><button class="btn-remove" data-index="${i}" title="Odebrat">✕</button></td>
    `;
    batchBody.appendChild(tr);
  });

  batchWrap.classList.toggle('hidden', batchReadings.length === 0);
}

// Remove row via event delegation
batchBody.addEventListener('click', (e) => {
  const btn = e.target.closest('.btn-remove');
  if (!btn) return;
  const idx = Number(btn.dataset.index);
  batchReadings.splice(idx, 1);
  renderBatchTable();
});

// ---- Send all ----

sendAllBtn.addEventListener('click', async () => {
  if (batchReadings.length === 0) return;
  sendAllBtn.disabled = true;
  batchStatus.classList.add('hidden');

  try {
    const res = await fetch('/api/save-all', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ readings: batchReadings }),
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Chyba při odesílání.');

    if (data.paOk === true) {
      batchStatus.textContent = `✓ ${data.count} odečtů úspěšně odesláno do Power Automate.`;
      batchStatus.className = 'save-status';
    } else if (data.paOk === false) {
      batchStatus.textContent = `⚠ ${data.count} odečtů uloženo lokálně, ale Power Automate hlásí chybu.`;
      batchStatus.className = 'save-status error';
    } else {
      batchStatus.textContent = `✓ ${data.count} odečtů uloženo.`;
      batchStatus.className = 'save-status';
    }
    batchStatus.classList.remove('hidden');

    batchReadings = [];
    renderBatchTable();
  } catch (err) {
    batchStatus.textContent = 'Chyba: ' + err.message;
    batchStatus.className = 'save-status error';
    batchStatus.classList.remove('hidden');
  } finally {
    sendAllBtn.disabled = false;
  }
});


// ---- Image compression ----

function compressAndEncode(file) {
  return new Promise((resolve, reject) => {
    const MAX_BYTES = 1024 * 1024; // 1 MB
    const QUALITY = 0.85;
    const MAX_DIM = 1920;

    const img = new Image();
    const url = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(url);

      let { width, height } = img;
      if (width > MAX_DIM || height > MAX_DIM) {
        const ratio = Math.min(MAX_DIM / width, MAX_DIM / height);
        width = Math.round(width * ratio);
        height = Math.round(height * ratio);
      }

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      canvas.getContext('2d').drawImage(img, 0, 0, width, height);

      // Try progressively lower quality until under MAX_BYTES
      let quality = QUALITY;
      let dataUrl;
      do {
        dataUrl = canvas.toDataURL('image/jpeg', quality);
        quality -= 0.1;
      } while (dataUrl.length * 0.75 > MAX_BYTES && quality > 0.1);

      // Strip "data:image/jpeg;base64," prefix
      resolve(dataUrl.split(',')[1]);
    };

    img.onerror = () => reject(new Error('Nepodařilo se načíst obrázek.'));
    img.src = url;
  });
}

// ---- UI helpers ----

function setLoading(loading) {
  readBtn.disabled = loading;
  btnText.textContent = loading ? 'Čtu...' : 'Přečíst měřič';
  spinner.classList.toggle('hidden', !loading);
}

function showResult(value, type, raw) {
  const display = Number(value).toLocaleString('cs-CZ');
  resultValue.textContent = display;
  resultRaw.textContent = raw ? `Odpověď API: ${raw}` : '';
  saveStatus.classList.add('hidden');
  addToListBtn.disabled = false;
  resultWrap.classList.remove('hidden');
}

function hideResult() {
  resultWrap.classList.add('hidden');
  currentReading = null;
  currentFile = null;
  fileCamera.value = '';
  fileGallery.value = '';
  readBtn.classList.add('hidden');
  readBtn.disabled = true;
}

function showError(msg) {
  errorMsg.textContent = msg;
  errorWrap.classList.remove('hidden');
}

function hideError() {
  errorWrap.classList.add('hidden');
}
