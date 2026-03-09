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
    'Extract the PRIMARY main reading value and identify the meter type. ' +
    'Rules:\n' +
    '- Electricity meter: look for kWh value:\n' +
    '  - If labeled 1.8.0 → type = "elektroměr - spotřeba"\n' +
    '  - If labeled 2.8.0 → type = "elektroměr - výroba"\n' +
    '- Gas meter (Apator): total consumption, type = "plynoměr". The last digits shown in red or after a separator are decimal digits — treat them as decimal part, e.g. black "01736" + red "90" = 1736.90\n' +
    '- Water meter(Itron): total consumption, type = "vodoměr". The last digits shown in red or after a separator are decimal digits — treat them as decimal part, e.g. black "01736" + red "90" = 1736.90\n' +
    '- Weather station / thermometer: Extract ONLY the numeric temperature (°C) from the outdoor/OUT section (top of display).\n' +
    '  The IN label marks the INDOOR section — any temperature on the same row as or below the IN label is indoor. STRICTLY IGNORE it.\n' +
    '  Read ALL digits AND decimal separators (. or ,) that appear BEFORE the °C symbol — that is the full temperature value. STOP at °C.\n' +
    '  Any digits that appear AFTER the °C symbol are humidity (%) — completely ignore them.\n' +
    '  Example: "1.1°C05%" → temperature is 1.1. "1°C05%" → temperature is 1. NEVER combine digits across the °C boundary.\n' +
    '  Ignore humidity (%), pressure (hPa/mBar), time values, and any other non-temperature numbers.\n' +
    '  Return only the temperature as a number, e.g. 1 or -3.5.\n' +
    '  IMPORTANT: Scan the ENTIRE display for the text "MIN" or "MAX" (can appear anywhere — above, below, or next to values).\n' +
    '  - If the text "MAX" appears ANYWHERE on the display → type MUST be "meteostanice - max"\n' +
    '  - If the text "MIN" appears ANYWHERE on the display → type MUST be "meteostanice - min"\n' +
    '  - ONLY if neither "MIN" nor "MAX" text is visible anywhere → type = "meteostanice"\n' +
    '- Other: the most prominent numeric value, type = "jiné"\n' +
    'Return ONLY a JSON object: {"value": 93.722, "type": "vodoměr"}. ' +
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

  return { value: parsed.value, type: parsed.type || '', raw };
}

// POST /api/save — save reading to readings.json and forward to Power Automate
app.post('/api/save', async (req, res) => {
  const { value, type } = req.body;

  if (value === undefined || value === null) {
    return res.status(400).json({ error: 'Chybí hodnota value.' });
  }

  const readings = loadReadings();
  const entry = { value: Number(value), type: type || '', timestamp: new Date().toISOString() };
  readings.push(entry);
  saveReadings(readings);

  let paOk = null;
  if (process.env.POWER_AUTOMATE_URL) {
    try {
      const paRes = await fetch(process.env.POWER_AUTOMATE_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ value: entry.value, type: entry.type, timestamp: entry.timestamp.slice(0, 10) }),
      });
      paOk = paRes.ok;
      if (!paRes.ok) console.error('Power Automate HTTP error:', paRes.status);
    } catch (err) {
      console.error('Power Automate error:', err);
      paOk = false;
    }
  }

  res.json({ ok: true, entry, paOk });
});

// POST /api/save-all — save multiple readings and forward to Power Automate as array
app.post('/api/save-all', async (req, res) => {
  const { readings: incoming } = req.body;

  if (!Array.isArray(incoming) || incoming.length === 0) {
    return res.status(400).json({ error: 'Chybí pole readings (musí být neprázdné pole).' });
  }

  const readings = loadReadings();
  const entries = incoming.map(r => ({
    value: Number(r.value),
    type: r.type || '',
    timestamp: r.timestamp || new Date().toISOString(),
  }));
  entries.forEach(e => readings.push(e));
  saveReadings(readings);

  let paOk = null;
  if (process.env.POWER_AUTOMATE_URL) {
    try {
      const paRes = await fetch(process.env.POWER_AUTOMATE_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(entries),
      });
      paOk = paRes.ok;
      if (!paRes.ok) console.error('Power Automate HTTP error:', paRes.status);
    } catch (err) {
      console.error('Power Automate error:', err);
      paOk = false;
    }
  }

  res.json({ ok: true, count: entries.length, paOk });
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
  fs.mkdirSync(path.dirname(READINGS_FILE), { recursive: true });
  fs.writeFileSync(READINGS_FILE, JSON.stringify(readings, null, 2), 'utf8');
}

app.listen(PORT, '0.0.0.0', () => {
  const { networkInterfaces } = require('os');
  const nets = networkInterfaces();
  const ips = Object.values(nets).flat().filter(n => n.family === 'IPv4' && !n.internal);
  console.log(`Čtečka měřičů běží na http://localhost:${PORT}`);
  ips.forEach(n => console.log(`  → v síti: http://${n.address}:${PORT}`));
});
