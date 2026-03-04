require('dotenv').config();
const express = require('express');
const rateLimit = require('express-rate-limit');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const READINGS_FILE = path.join(__dirname, 'data', 'readings.json');

app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

const readLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 20,
  message: { error: 'Příliš mnoho požadavků. Zkuste to za hodinu.' },
});

// POST /api/read — send base64 image to GPT-4o mini Vision
app.post('/api/read', readLimiter, async (req, res) => {
  const { image, mimeType = 'image/jpeg' } = req.body;

  if (!image) {
    return res.status(400).json({ error: 'Chybí obrázek (pole image).' });
  }

  if (!process.env.OPENAI_API_KEY || process.env.OPENAI_API_KEY.startsWith('sk-your')) {
    return res.status(500).json({ error: 'OPENAI_API_KEY není nastaven v souboru .env.' });
  }

  try {
    const result = await callGPT4oVision(image, mimeType);
    res.json(result);
  } catch (err) {
    console.error('GPT-4o error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

async function callGPT4oVision(base64Image, mimeType) {
  const primaryPrompt =
    'This is a meter or measurement display (electricity, gas, water, weather station, or similar). ' +
    'Identify the type and extract the PRIMARY main reading value shown on the display. ' +
    'Rules:\n' +
    '- Electricity meter: total consumption in kWh (the largest number on the LCD)\n' +
    '- Gas/water meter: total consumption in m³ (include decimal digits if shown, e.g. 93.722)\n' +
    '- Weather station: the indoor temperature in °C (largest temperature value)\n' +
    '- Other: the most prominent numeric value and its unit\n' +
    'Return ONLY a JSON object: {"value": 93.722, "unit": "m³"}. ' +
    'No explanation, no markdown, no code block.';

  const payload = {
    model: 'gpt-4o-mini',
    max_tokens: 100,
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'image_url',
            image_url: {
              url: `data:${mimeType};base64,${base64Image}`,
              detail: 'high',
            },
          },
          { type: 'text', text: primaryPrompt },
        ],
      },
    ],
  };

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errBody = await response.text();
    throw new Error(`OpenAI API chyba ${response.status}: ${errBody}`);
  }

  const data = await response.json();
  const raw = data.choices[0].message.content.trim();

  // Parse JSON from response
  let parsed;
  try {
    const clean = raw.replace(/```json?\s*/gi, '').replace(/```/g, '').trim();
    parsed = JSON.parse(clean);
  } catch {
    // Fallback: extract first number from the text
    const match = raw.match(/[\d]+([.,]\d+)?/);
    if (match) {
      const num = parseFloat(match[0].replace(',', '.'));
      return { value: num, unit: '', raw };
    }
    throw new Error(`Nepodařilo se přečíst hodnotu z odpovědi: "${raw}"`);
  }

  if (parsed.value === undefined) {
    throw new Error(`Odpověď neobsahuje pole value: "${raw}"`);
  }

  return { value: parsed.value, unit: parsed.unit || '', raw };
}

// POST /api/save — save reading to readings.json
app.post('/api/save', (req, res) => {
  const { value, unit } = req.body;

  if (value === undefined || value === null) {
    return res.status(400).json({ error: 'Chybí hodnota value.' });
  }

  const readings = loadReadings();
  const entry = { value: Number(value), unit: unit || '', timestamp: new Date().toISOString() };
  readings.push(entry);
  saveReadings(readings);

  res.json({ ok: true, entry });
});

// GET /api/readings — return saved readings (newest first)
app.get('/api/readings', (req, res) => {
  const readings = loadReadings();
  res.json(readings.slice().reverse());
});

function loadReadings() {
  try {
    const content = fs.readFileSync(READINGS_FILE, 'utf8');
    return JSON.parse(content);
  } catch {
    return [];
  }
}

function saveReadings(readings) {
  fs.writeFileSync(READINGS_FILE, JSON.stringify(readings, null, 2), 'utf8');
}

app.listen(PORT, () => {
  console.log(`Čtečka měřičů běží na http://localhost:${PORT}`);
});
