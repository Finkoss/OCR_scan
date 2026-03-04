const fileInput   = document.getElementById('fileInput');
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
const saveBtn     = document.getElementById('saveBtn');
const saveStatus  = document.getElementById('saveStatus');
const historyWrap = document.getElementById('historyWrap');
const historyBody = document.getElementById('historyBody');

let currentReading = null; // { value, unit }

// ---- File selection ----

fileInput.addEventListener('change', () => {
  const file = fileInput.files[0];
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
  const url = URL.createObjectURL(file);
  preview.src = url;
  previewWrap.classList.remove('hidden');
  readBtn.classList.remove('hidden');
  readBtn.disabled = false;
  hideResult();
  hideError();
  currentReading = null;
}

// ---- Read meter ----

readBtn.addEventListener('click', async () => {
  const file = fileInput.files[0];
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

    currentReading = { value: data.value, unit: data.unit };
    showResult(data.value, data.unit, data.raw);
  } catch (err) {
    showError('Nelze se připojit k serveru: ' + err.message);
  } finally {
    setLoading(false);
  }
});

// ---- Save reading ----

saveBtn.addEventListener('click', async () => {
  if (!currentReading) return;
  saveBtn.disabled = true;

  try {
    const res = await fetch('/api/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ value: currentReading.value, unit: currentReading.unit }),
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Chyba při ukládání.');

    saveStatus.textContent = 'Odečet byl uložen.';
    saveStatus.className = 'save-status';
    saveStatus.classList.remove('hidden');
    loadHistory();
  } catch (err) {
    saveStatus.textContent = 'Chyba: ' + err.message;
    saveStatus.className = 'save-status error';
    saveStatus.classList.remove('hidden');
  } finally {
    saveBtn.disabled = false;
  }
});

// ---- History ----

async function loadHistory() {
  try {
    const res = await fetch('/api/readings');
    const readings = await res.json();

    if (!Array.isArray(readings) || readings.length === 0) {
      historyWrap.classList.add('hidden');
      return;
    }

    historyBody.innerHTML = readings.map((r) => {
      const date = new Date(r.timestamp).toLocaleString('cs-CZ');
      const val = r.value !== undefined ? r.value : r.kwh; // backwards compat
      const unit = r.unit || 'kWh';
      return `<tr><td>${date}</td><td>${Number(val).toLocaleString('cs-CZ')} ${unit}</td></tr>`;
    }).join('');

    historyWrap.classList.remove('hidden');
  } catch {
    // silently ignore history errors
  }
}

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

function showResult(value, unit, raw) {
  const display = unit ? `${Number(value).toLocaleString('cs-CZ')} ${unit}` : Number(value).toLocaleString('cs-CZ');
  resultValue.textContent = display;
  resultRaw.textContent = raw ? `Odpověď API: ${raw}` : '';
  saveStatus.classList.add('hidden');
  saveBtn.disabled = false;
  resultWrap.classList.remove('hidden');
}

function hideResult() {
  resultWrap.classList.add('hidden');
  currentReading = null;
}

function showError(msg) {
  errorMsg.textContent = msg;
  errorWrap.classList.remove('hidden');
}

function hideError() {
  errorWrap.classList.add('hidden');
}

// Load history on page start
loadHistory();
