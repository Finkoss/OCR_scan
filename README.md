# Čtečka měřičů

Webová aplikace pro automatické čtení hodnot z měřičů pomocí **GPT-4o mini Vision API**.

Podporuje:
- Elektroměry (LCD 7-segmentový displej) → kWh
- Plynoměry a vodoměry (mechanický bubnový displej) → m³
- Meteostanice a jiné LCD displeje → °C, %, atd.

## Ukázky

| Typ měřiče | Displej | Výsledek |
|---|---|---|
| Elektroměr Landis+Gyr | LCD 7-segment | `6218 kWh` |
| Plynoměr Apator G4 | Mechanický roller | `1736.90 m³` |
| Vodoměr Itron | Mechanický buben | `93.722 m³` |
| Meteostanice | LCD | `21 °C` |

## Funkce

- Nahrání nebo vyfocení měřiče (na mobilu otevře přímo fotoaparát)
- Automatické rozpoznání typu měřiče a přečtení hodnoty
- Uložení odečtu do historie
- Komprese obrázku před odesláním (max 1 MB)
- Rate limiting (max 20 požadavků za hodinu)

## Spuštění

### 1. Instalace závislostí

```bash
npm install
```

### 2. Nastavení API klíče

Otevřete soubor `.env` a doplňte svůj OpenAI API klíč:

```env
OPENAI_API_KEY=sk-...
PORT=3000
```

Klíč získáte na [platform.openai.com/api-keys](https://platform.openai.com/api-keys).

### 3. Spuštění serveru

```bash
node server.js
```

### 4. Otevřít v prohlížeči

```
http://localhost:3000
```

Na mobilu přes lokální IP (např. `http://192.168.1.x:3000`) se automaticky otevře fotoaparát.

## Struktura projektu

```
ocr_scan-web/
├── server.js              # Express backend + OpenAI proxy
├── public/
│   ├── index.html         # UI
│   ├── style.css
│   └── app.js             # Frontend logika (komprese, fetch, historie)
├── data/
│   └── readings.json      # Historie odečtů (není v gitu)
├── example/               # Ukázkové fotky měřičů
├── .env                   # OPENAI_API_KEY + PORT (není v gitu)
├── package.json
└── README.md
```

## API endpointy

| Metoda | Endpoint | Popis |
|--------|----------|-------|
| `POST` | `/api/read` | Přečte hodnotu z obrázku — tělo: `{ image: base64, mimeType }` |
| `POST` | `/api/save` | Uloží odečet — tělo: `{ value, unit }` |
| `GET` | `/api/readings` | Vrátí historii odečtů (nejnovější první) |

### Příklad odpovědi `/api/read`

```json
{ "value": 1736.9, "unit": "m³", "raw": "{\"value\": 1736.9, \"unit\": \"m³\"}" }
```

## Odhadované náklady

Model `gpt-4o-mini`, ~1000 tokenů/request:

| Frekvence | Počet/rok | Cena/rok |
|-----------|-----------|----------|
| 1× denně | 365 | ~$0.05 |
| 1× týdně | 52 | ~$0.01 |
| Manuálně | ~20 | <$0.01 |

## Bezpečnost

- API klíč je pouze na serveru (`.env`), nikdy se neposílá do frontendu
- `.env` a `data/readings.json` jsou v `.gitignore`
