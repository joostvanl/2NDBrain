# Omgeving starten en stoppen (development)

> Volledige technische context (API-lijst, data, agent, Docker): [TECHNICAL_GUIDE.md](./TECHNICAL_GUIDE.md).

De markdown-viewer bestaat uit een **Node/Express API** (Markdown, reviews, agent, Word-export) en een **Vite frontend**. Tijdens development moeten beide bereikbaar zijn, anders krijg je 404 op `/api` of een verouderde API.

## Aanbevolen: twee processen (`npm run dev`)

Eén commando start parallel:

1. **API** — standaard `http://127.0.0.1:8787` (`API_PORT`, default **8787**).
2. **Vite** — standaard `http://localhost:5173` (proxy naar de API voor paden onder `/api`).

```bash
cd markdown-viewer
npm run dev
```

- **Open in de browser:** http://localhost:5173  
- **API direct:** http://127.0.0.1:8787 (o.a. `/api/health`)

De API draait met **`node --watch`**: na wijzigingen in `server/*.mjs` herstart het API-proces zelf; je hoeft daarvoor niet handmatig te stoppen. De Vite-kant houdt HMR voor `src/*`.

### Windows: dubbelklikbaar starten na reboot

In de repo-root staan twee startbestanden:

- `Start-iOMS.cmd` — dubbelklikbare wrapper voor Windows.
- `Start-iOMS.ps1` — PowerShell-script met poort-cleanup, dependency-check en browserstart.

Gebruik:

```powershell
.\Start-iOMS.cmd
```

Het script:

1. stopt oude listeners op de gebruikelijke poorten (`8787`, `5173`, `5174`, `5175`);
2. controleert of Node.js en npm beschikbaar zijn;
3. draait `npm install` als `node_modules` ontbreekt;
4. start `npm run dev`;
5. opent automatisch `http://localhost:5173`.

Wil je automatisch starten na Windows-login, maak dan een snelkoppeling naar `Start-iOMS.cmd` en zet die in de Startup-map:

```text
shell:startup
```

Optionele PowerShell-flags:

```powershell
.\Start-iOMS.ps1 -NoPortCleanup
.\Start-iOMS.ps1 -NoBrowser
.\Start-iOMS.ps1 -ApiPort 8788
```

### Alternatief: één proces (`npm run dev:unified`)

API en Vite lopen in **één** Node-proces op één poort:

```bash
cd markdown-viewer
npm run dev:unified
```

- **Poort:** `PORT` uit de omgeving, anders **5173** (zie `server/index.mjs`).
- **Open:** `http://127.0.0.1:<PORT>/` (dezelfde URL voor UI én `/api`).

Handig als je geen proxy tusschensituatie wilt; minder geschikt als je Vite en API bewust wilt scheiden.

---

## Stoppen (development)

### Netjes: via het terminalvenster

Ga naar het venster waar `npm run dev` of `npm run dev:unified` draait en druk **Ctrl+C** (eventueel twee keer). Daarmee stoppen de child-processen die `concurrently` of Node zijn gestart.

### Poort nog bezet / oude Node vast

Als je daarna nog meldingen ziet als *“API-poort 8787 is al in gebruik”* of Vite kiest een andere poort omdat **5173** bezet is, staat er nog een oud Node-proces te luisteren.

**Windows (PowerShell)** — listeners op de gebruikelijke poorten stoppen:

```powershell
8787, 5173, 5174, 5175 | ForEach-Object {
  Get-NetTCPConnection -LocalPort $_ -State Listen -ErrorAction SilentlyContinue |
    ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }
}
```

Daarna opnieuw `npm run dev` starten.

---

## Omgevingsvariabelen (kort)

| Variabele | Gebruik |
|-----------|---------|
| `API_PORT` | API-luisterpoort bij **split** setup (`npm run dev`). Moet gelijk zijn aan wat `vite.config.ts` proxiet (zelfde default **8787**). |
| `PORT` | Luisterpoort bij **`dev:unified`** (default **5173** tenzij je iets anders zet). |
| `VITE_API_ORIGIN` | Optioneel: directe API-URL voor o.a. Word-export (`viewerApiUrl` in `src/api.ts`). Bij alleen unified op één poort: meestal niet nodig voor gewone viewer-calls. |

`.env` in `markdown-viewer` wordt bij serverstart geladen (`server/load-env.mjs`).

---

## Productie en Docker

- **Lokaal productie-achtig:** `npm run build && npm run start` — serveert gebouwde assets op **8787** (tenzij `PORT` anders is).
- **Docker:** vanuit `markdown-viewer` o.a. `npm run docker:up` — zie `docker-compose.yml` en poort `APP_PORT` (default **8787**).

---

## Veelvoorkomende problemen

| Symptoom | Oorzaak / actie |
|----------|------------------|
| 404 op `/api` in de browser op :5173 | Alleen Vite gestart (`npx vite`), geen API. Gebruik **`npm run dev`**. |
| *API-poort … al in gebruik* | Oud proces; zie **Poort nog bezet** hierboven. |
| Vite op :5174 i.p.v. :5173 | 5173 bezet; vrijmaken of andere Vite-instelling accepteren. Let op: `vite.config.ts` proxy is op **8787** geconfigureerd, niet automatisch op de Vite-poort. |
| API wijzigingen niet zichtbaar | Bij `npm run dev` hoort `--watch` de API te herstarten. Controleer of je geen tweede, vastgelopen proces op 8787 hebt. |

---

## Samenvatting

| Actie | Commando / gedrag |
|-------|-------------------|
| **Start development (aanbevolen)** | `cd markdown-viewer && npm run dev` → browser http://localhost:5173 |
| **Start unified** | `npm run dev:unified` → één URL, poort uit `PORT` |
| **Stop** | Ctrl+C in het dev-terminalvenster |
| **Poorten forceren vrij (Windows)** | Zie PowerShell-blok hierboven |
