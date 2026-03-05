# Čtečka měřičů

Webová aplikace pro automatické čtení hodnot z měřičů pomocí **GPT-4o mini Vision API**.
Odečtené hodnoty se odesílají do **Power Automate**, který je zapíše do Excel tabulky na OneDrivu.

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
- Odeslání odečtu do Power Automate → Excel na OneDrivu
- Lokální záloha odečtů v `data/readings.json`
- Komprese obrázku před odesláním (max 1 MB)
- Rate limiting (max 20 požadavků za hodinu)
- Dostupná z mobilu přes Wi-Fi (lokální síť)

---

## Nastavení od nuly

### 1. Naklonuj repozitář a nainstaluj závislosti

```bash
git clone https://github.com/Finkoss/OCR_scan.git
cd OCR_scan
npm install
```

### 2. OpenAI API klíč

Klíč získáš na [platform.openai.com/api-keys](https://platform.openai.com/api-keys).

Vytvoř soubor `.env`:

```env
OPENAI_API_KEY=sk-...
PORT=3000
POWER_AUTOMATE_URL=
```

Pole `POWER_AUTOMATE_URL` vyplníš v kroku 4.

### 3. Excel na OneDrivu

1. Vytvoř nový Excel soubor na OneDrivu
2. Přidej list a v buňkách `A1`, `B1`, `C1` napiš hlavičky: `value`, `unit`, `timestamp`
3. Označ buňky `A1:C1` → **Vložit → Tabulka** → OK

### 4. Power Automate flow

1. Přejdi na [make.powerautomate.com](https://make.powerautomate.com)
2. **Create** → **Instant cloud flow** → trigger: **When an HTTP request is received**
3. Do pole **Request Body JSON Schema** vlož:

```json
{
  "type": "object",
  "properties": {
    "value":     { "type": "number" },
    "unit":      { "type": "string" },
    "timestamp": { "type": "string" }
  }
}
```

4. Přidej akci: **Excel Online (OneDrive)** → **Add a row into a table**
   - Location: `OneDrive for Business`
   - Document Library: `OneDrive`
   - File: vyber svůj `.xlsx` soubor
   - Table: vyber tabulku
   - Mapování sloupců: `value` → value, `unit` → unit, `timestamp` → timestamp

5. **Ulož** flow → zkopíruj vygenerovanou **HTTP POST URL**
6. Vlož URL do `.env`:

```env
POWER_AUTOMATE_URL=https://prod-xx...
```

### 5. Firewall — přístup z mobilu

Aby byla appka dostupná z mobilu ve stejné Wi-Fi síti, povol port 3000 ve Windows Firewallu:

1. Start → **Windows Defender Firewall with Advanced Security**
2. **Inbound Rules** → **New Rule...**
3. Typ: **Port** → TCP, port: `3000`
4. **Allow the connection** → zaškrtni **Private**
5. Název: `Node.js OCR 3000` → Finish

### 6. Spuštění

```bash
node server.js
```

Výstup ukáže adresy pro PC i mobil:

```
Čtečka měřičů běží na http://localhost:3000
  → v síti: http://192.168.1.42:3000
```

Na mobilu otevři adresu `v síti` — automaticky se otevře fotoaparát.

---

## Struktura projektu

```
ocr_scan-web/
├── server.js              # Express backend + OpenAI proxy + Power Automate forwarding
├── public/
│   ├── index.html         # UI
│   ├── style.css
│   └── app.js             # Frontend logika (komprese, fetch)
├── data/
│   └── readings.json      # Lokální záloha odečtů (není v gitu)
├── .env                   # API klíče (není v gitu)
├── package.json
└── README.md
```

## API endpointy

| Metoda | Endpoint | Popis |
|--------|----------|-------|
| `POST` | `/api/read` | Přečte hodnotu z obrázku — tělo: `{ image: base64, mimeType }` |
| `POST` | `/api/save` | Uloží odečet lokálně + odešle do Power Automate — tělo: `{ value, unit }` |
| `GET`  | `/api/readings` | Vrátí lokální historii odečtů |

### Příklad odpovědi `/api/read`

```json
{ "value": 1736.9, "unit": "m³", "raw": "{\"value\": 1736.9, \"unit\": \"m³\"}" }
```

### Příklad odpovědi `/api/save`

```json
{ "ok": true, "entry": { "value": 1736.9, "unit": "m³", "timestamp": "2026-03-05T10:30:00.000Z" }, "paOk": true }
```

`paOk: true` = Power Automate přijal odečet úspěšně.

## Odhadované náklady

Model `gpt-4o-mini`, ~1000 tokenů/request:

| Frekvence | Počet/rok | Cena/rok |
|-----------|-----------|----------|
| 1× denně | 365 | ~$0.05 |
| 1× týdně | 52 | ~$0.01 |
| Manuálně | ~20 | <$0.01 |

## Bezpečnost

- API klíče jsou pouze na serveru (`.env`), nikdy se neposílají do frontendu
- `.env` a `data/readings.json` jsou v `.gitignore`
- Aplikace je dostupná pouze v lokální síti, ne z internetu
