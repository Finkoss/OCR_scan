# Plán: Web OCR čtečka elektroměru (GPT-4o Vision)

## Cíl
Jednoduchá webová aplikace, která umožní:
1. Nahrát / vyfotit elektroměr
2. Odeslat fotku na GPT-4o Vision API
3. Zobrazit extrahovanou hodnotu v kWh
4. Volitelně uložit historii odečtů

---

## Stack

- **Frontend:** Vanilla HTML + CSS + JS (single file, žádný build step)
- **Backend:** Node.js + Express (nebo Bun)
- **API:** OpenAI GPT-4o mini Vision
- **Uložení dat:** JSON soubor na serveru (nebo SQLite)
- **Hosting:** Lokálně (Node), nebo Cloudflare Workers / Vercel (free tier)

---

## Adresářová struktura

```
meter-reader/
├── server.js          # Express backend + proxy pro OpenAI API
├── public/
│   ├── index.html     # UI (upload + výsledek + historie)
│   ├── style.css
│   └── app.js         # fetch volání na backend
├── data/
│   └── readings.json  # uložené odečty
├── .env               # OPENAI_API_KEY
├── package.json
└── README.md
```

---

## Fáze vývoje

### Fáze 1 – Základ (MVP)
- [ ] `server.js` – Express server s endpointem `POST /api/read`
  - Přijme base64 obrázek
  - Zavolá OpenAI API s Vision promptem
  - Vrátí JSON `{ value: 6218, unit: "kWh", raw: "..." }`
- [ ] `index.html` – jednoduchý UI
  - Input pro nahrání souboru
  - Preview nahraného obrázku
  - Tlačítko "Přečíst"
  - Zobrazení výsledku

### Fáze 2 – Kamera na mobilu
- [ ] Přidat `<input type="file" accept="image/*" capture="environment">`
  - Na mobilu automaticky otevře fotoaparát
- [ ] Komprese obrázku před odesláním (Canvas API, snížit na max 1MB)

### Fáze 3 – Historie odečtů
- [ ] `POST /api/save` – uloží hodnotu + timestamp do `readings.json`
- [ ] `GET /api/readings` – vrátí historii
- [ ] Jednoduchá tabulka / graf v UI (Chart.js)

### Fáze 4 – Volitelné vylepšení
- [ ] PWA manifest – přidat na plochu telefonu
- [ ] Export do CSV
- [ ] Notifikace při neobvyklé spotřebě

---

## OpenAI API volání

### Endpoint
```
POST https://api.openai.com/v1/chat/completions
```

### Payload
```json
{
  "model": "gpt-4o-mini",
  "max_tokens": 100,
  "messages": [
    {
      "role": "user",
      "content": [
        {
          "type": "image_url",
          "image_url": {
            "url": "data:image/jpeg;base64,{BASE64_IMAGE}",
            "detail": "high"
          }
        },
        {
          "type": "text",
          "text": "This is an electricity meter display. Extract ONLY the main kWh reading shown on the large digits. Return ONLY a JSON object in this format: {\"kwh\": 6218}. No explanation, no markdown."
        }
      ]
    }
  ]
}
```

### Očekávaná response
```json
{ "kwh": 6218 }
```

---

## Prostředí a konfigurace

### `.env`
```env
OPENAI_API_KEY=sk-...
PORT=3000
```

### `package.json` závislosti
```json
{
  "dependencies": {
    "express": "^4.18.0",
    "dotenv": "^16.0.0",
    "multer": "^1.4.5"
  }
}
```

---

## Bezpečnost

- API klíč **nikdy** do frontendu – vždy přes backend proxy
- Volitelně: basic auth heslo na `/` pro ochranu přístupu
- Rate limiting na `/api/read` (max 10 req/hod)

---

## Odhadované náklady

| Scénář | Počet fotek | Cena/rok |
|---|---|---|
| 1x denně | 365 | ~$0.05 |
| 1x týdně | 52 | ~$0.01 |
| Manuálně | ~20 | <$0.01 |

Model: `gpt-4o-mini`, ~1000 tokenů/request, $0.15/1M input + $0.60/1M output

---

## Spuštění (pro Claude Code)

```bash
# 1. Inicializace projektu
npm init -y
npm install express dotenv multer

# 2. Vytvoření souborů dle struktury výše

# 3. Spuštění
node server.js

# 4. Otevřít http://localhost:3000
```

---

## Poznámky k promptu

- Specifikovat typ měřidla v promptu → lepší přesnost
- Přidat `"detail": "high"` pro lepší rozlišení LCD displeje
- Při chybě parsování zkusit fallback prompt: `"What number is shown on the meter display? Reply with just the number."`
- Zvážit pre-processing obrázku (zvýšení kontrastu) pro spolehlivější výsledky
