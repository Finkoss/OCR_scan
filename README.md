# OCR Scanner

Jednoduchá webová aplikace pro extrakci textu z obrázků pomocí [Tesseract.js](https://github.com/naptha/tesseract.js). Podporuje češtinu a angličtinu.

## Použití

1. Nahraj obrázek kliknutím na tlačítko pro výběr souboru
2. Aplikace zobrazí náhled a začne zpracovávat text
3. Extrahovaný text se zobrazí pod obrázkem

## Spuštění na localhostu

> **Důležité:** Aplikaci nelze otevřít přímo jako soubor (`file://`). Tesseract.js stahuje jazykové balíčky přes HTTP, takže je nutný lokální HTTP server.

### Python (doporučeno – bez instalace)

```bash
python -m http.server 8080
```

Pak otevřít: [http://localhost:8080](http://localhost:8080)

### Node.js

```bash
npx serve .
```

nebo

```bash
npx http-server
```

### VS Code

Nainstalovat rozšíření **Live Server** a kliknout na `Go Live` v pravém dolním rohu.

## Technologie

- Vanilla HTML/CSS/JS
- [Tesseract.js v5](https://github.com/naptha/tesseract.js) (načítáno z CDN)
- Žádný backend, žádné závislosti k instalaci
