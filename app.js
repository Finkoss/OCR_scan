const fileInput = document.getElementById('fileInput');
const previewImg = document.getElementById('previewImg');
const status = document.getElementById('status');
const result = document.getElementById('result');

fileInput.addEventListener('change', async () => {
  const file = fileInput.files[0];
  if (!file) return;

  // Náhled
  previewImg.src = URL.createObjectURL(file);
  previewImg.style.display = 'block';

  // Reset
  result.textContent = '';
  status.textContent = 'Zpracovávám… 0%';
  status.className = '';

  try {
    const { data } = await Tesseract.recognize(file, 'ces+eng', {
      logger: (m) => {
        if (m.status === 'recognizing text') {
          status.textContent = `Zpracovávám… ${Math.round(m.progress * 100)}%`;
        }
      },
    });

    status.textContent = '';
    result.textContent = data.text;
  } catch (err) {
    status.textContent = `Chyba: ${err.message}`;
    status.className = 'error';
  }
});
