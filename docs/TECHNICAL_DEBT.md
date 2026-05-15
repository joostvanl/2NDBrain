# Technical debt & risico’s — iOMS / markdown-viewer

Samenvatting van bewuste compromissen en verbeterkansen. Geen harde prioriteiten; gebruik dit als backlog-hint.

## Architectuur & onderhoudbaarheid

1. **Monoliete frontend (`main.ts` ~2500+ regels)**  
   UI-logica, state, export, filemanager en agent-hooks zitten in één module. Dat verhoogt de kosten van wijzigingen en review.  
   *Richting:* splitsen in feature-modules (viewer, sidebar/filemanager, docx-flow, agent/review), eventueel lichte state-laag.

2. **Express-server (`server/index.mjs` ~1500+ regels)**  
   API-routes, DOCX-proxy (minimal vs portal), agent-run en file-IO in één bestand.  
   *Richting:* routers per domein (`markdown`, `docx`, `agent`, `review`); gedeelde helpers los trekken.

3. **Dubbele Word-export-paden**  
   Lokale Python-bridge, minimale HTTP-API (`/api/export`) en portaal-API (`/api/documents/generate`) vergelen complexiteit (`DOCX_EXPORT_STYLE`, tokens, CORS).  
   *Richting:* één abstractie “docx backend” met duidelijke adapter per modus; integratietests per adapter.

## Configuratie & developer experience

4. **Veel omgevingsvariabelen**  
   `DOCX_EXPORT_URL`, `DOCX_EXPORT_STYLE`, `DOCX_EXPORT_TOKEN`, `VITE_API_ORIGIN`, `API_PORT`, paden naar `Files`/`LLM2DOCX` — foutgevoelig voor nieuwe developers.  
   *Richting:* één “setup”-sectie in README of `npm run doctor` die env + poorten valideert.

5. **`VITE_API_ORIGIN` workaround**  
   Bestond om Vite-proxy / grote payloads te omzeilen. Functioneel, maar verduistert het mentale model (twee origins).  
   *Richting:* root cause in proxy (limits, body) vastleggen en waar mogelijk fixen zodat de workaround optioneel wordt.

## Kwaliteit & veiligheid

6. **Geen geautomatiseerde tests in `markdown-viewer`**  
   Geen unit/integration tests gevonden; regressies op DOCX, file-routes en sanitization zijn handwerk.  
   *Richting:* Vitest voor pure helpers; supertest of fetch-mocks voor kritieke API-paden; smoke-script voor export.

7. **Geheimen in lokale bestanden**  
   `agent.config.json` en `.env` horen niet in Git (staan in `.gitignore`). Bij eerdere commits elders: keys roteren.  
   *Richting:* voorbeelden alleen (`agent.config.example.json`, `.env.example`); in CI geen echte secrets.

8. **`Files/` naast applicatiecode**  
   Zakelijke Markdown staat in dezelfde tree als de viewer. Handig lokaal; voor een **publieke** repo kan dat onbedoeld gevoelige inhoud blootleggen.  
   *Richting:* bewuste keuze: private repo, of `Files/` uit Git houden en alleen samples committen.

## Integratie met LLM2DOCX

9. **Twee Docker/HTTP-stacks**  
   Portaal (`:8080`) vs dedicated `docx-export` (`:8790`) — documentatie verspreid over LLM2DOCX README en deze repo.  
   *Richting:* korte “decision table” in README (wanneer welke modus).

10. **Rol- en auth-fouten bij portaal**  
    401/403 door vergeten token of verkeerde rol is niet altijd in de UI te onderscheiden van exportfouten.  
    *Richting:* server-side foutteksten of codes mappen naar actionable UI-berichten.

## Operations

11. **Geen CI-pipeline in repo**  
    Build, `tsc`, lint worden nu lokaal gedaan.  
    *Richting:* eenvoudige GitHub Action: `npm ci`, `npm run build` op push naar `main`.

12. **Windows-specifieke scripts**  
    `kill-dev-ports.ps1` etc. — prima op jouw OS; andere developers missen equivalent.  
    *Richting:* waar mogelijk cross-platform npm-scripts of `npx` tools.

---

*Laatste update: samenhangend met codebase-staat Markdown-viewer + iOMS-root; herzien na grotere refactors.*
