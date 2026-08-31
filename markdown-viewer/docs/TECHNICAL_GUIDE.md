# Technische handleiding — Markdown viewer (iOMS)

Dit document is bedoeld voor ontwikkelaars en “agents” die **zonder mondelinge overdracht** kunnen doorontwikkelen: architectuur, paden, API’s, data, omgeving en uitbreidingspunten.

---

## 1. Plaats in de repository

- **Projectroot (deze app):** `iOMS/markdown-viewer/`
- **Standaard bronmap voor Markdown-bestanden:** `iOMS/Files/` (niet onder `markdown-viewer/`). Die map wordt door de server als `MARKDOWN_DIR` gebruikt (tenzij overschreven via env).
- **Review-/agent-metadata per document:** `Files/.reviews/<relatief-pad>.md.json` (JSON met comments + chatgeschiedenis).
- **Werkdocument-index:** `Files/.mv-index/` — indexeert gewone werkdocumenten onder `Files/`, met verborgen mappen uitgesloten.
- **Agent long-term memory:** `Files/.memory/` — agent-owned Markdown-memory met eigen index `Files/.memory/.mv-index/`. Deze map wordt niet in de gewone werkdocumentenboom getoond.
- **Naburige optionele stack:** `LLM2DOCX/` (sibling van `iOMS` op webroot) voor Word-export/templates — zie env `LLM2DOCX_ROOT`.

---

## 2. Architectuur (high level)

| Laag | Technologie | Verantwoordelijkheid |
|------|-------------|----------------------|
| Frontend | **Vite 6**, **TypeScript**, vanilla DOM in `src/main.ts` | UI: editor, ribbon, agent-paneel, dialogs, fetch naar `/api` |
| API | **Node.js**, **Express**, één groot **`server/index.mjs`** (ESM) | Bestanden, reviews, LLM-proxy, Word export/import, templates |
| Opslag | Lokaal **filesystem** | Geen database; state = `.md` + `.reviews/*.json` + `.mv-index/*` + optioneel `agent.config.json` |

**Development (aanbevolen):** twee processen via `npm run dev` (zie [OMGEVING_STARTEN_EN_STOPPEN.md](./OMGEVING_STARTEN_EN_STOPPEN.md)):

- API: `127.0.0.1:8787` (default `API_PORT`)
- Vite: `localhost:5173` met **proxy** van `/api` → `8787`

**Unified:** `npm run dev:unified` — één Node-proces, Vite in middleware-modus, zelfde origin voor UI + API.

**Productie-achtig:** `npm run build` (tsc + vite build) daarna `npm run start` — serveert `dist/` + API op `PORT` (default **8787**).

### 2.1 NPM-scripts

| Script | Doel |
|--------|------|
| `npm run dev` | API (`node --watch` + `--api-only`) en Vite; zie `scripts/run-dev.mjs` |
| `npm run dev:unified` | Eén proces: `node --watch server/index.mjs --dev` |
| `npm run build` | Typecheck + `vite build` → `dist/` |
| `npm run start` | Alleen API + statische `dist/` (geen Vite HMR) |
| `npm run preview` | `build` daarna `start` |
| `npm run docker:up` / `docker:down` | Zie `docker-compose.yml` |

---

## 3. Belangrijkste bestanden en mappen

```
markdown-viewer/
  server/
    index.mjs          # Express-app, alle API-routes, LLM-calls, docx-import
    corpus-index.mjs   # Herbruikbare indexer voor werkdocumenten en Files/.memory/
    nexus/             # Nexus-orkestratie (intent, cache, evidence, patches, templates)
      nexus-intent.mjs
      nexus-run-cache.mjs
      nexus-evidence.mjs
      nexus-source-policy.mjs
      nexus-patch.mjs
      nexus-template-profiles.mjs
      nexus-protected-paths.mjs
      nexus-activity-overview.mjs
      nexus-critical-threads.mjs
      nexus-tool-bridge.mjs
      nexus-voice.mjs
      nexus-viewer-context.mjs
      nexus-protected-paths.json
    load-env.mjs       # Laadt .env / .env.local naar process.env
    docx_export_bridge.py  # Fallback Python-bridge voor export (als HTTP-export niet)
  scripts/
    run-dev.mjs        # concurrently: API --watch + wait-on + vite
  src/
    main.ts            # Enorme bootstrap: toolbar, editor, agent-chat, dialogs
    api.ts             # fetch-wrappers naar /api (en viewerApiUrl voor sommige calls)
    markdown.ts        # Markdown → HTML (marked), TOC
    htmlToMarkdown.ts  # Fragmenten/tabulatie normalisatie richting MD
    reviewComments.ts  # Types/normalisatie reviewcomments
    reviewChangeDom.ts # Diff-markering in DOM
    chartJsBlocks.ts, mermaidDiagrams.ts, visualPages.ts, …
  templates/           # JSON-templates voor viewer (niet per se Word-templates)
  dist/                # Build-output (na npm run build)
  agent.config         # Legacy (JSON) — wordt samengevoegd met agent.config.json
  agent.config.json    # Primaire opslag na “Instellingen opslaan”
  .env, .env.example
  vite.config.ts       # proxy /api → API_PORT
  docker-compose.yml, Dockerfile
docs/
  OMGEVING_STARTEN_EN_STOPPEN.md
  INSTRUCTIE_AGENT_REVIEW_COMMENTAREN.md
  TECHNICAL_GUIDE.md   # Dit bestand
```

---

## 4. Omgevingsvariabelen (referentie)

Geladen via `server/load-env.mjs` vanuit `markdown-viewer/.env` en `.env.local` (shell-waarden hebben voorrang).

| Variabele | Rol |
|-----------|-----|
| `MARKDOWN_DIR` | Absoluut pad naar map met `.md` (default: `markdown-viewer/../Files`) |
| `REVIEWS_DIR` | Default: `MARKDOWN_DIR/.reviews` |
| `API_PORT` | API-poort bij split-dev; moet gelijk zijn aan proxy in `vite.config.ts` |
| `PORT` | Luisterpoort bij productie-start en bij `dev:unified` |
| `VITE_API_ORIGIN` | Optioneel: basis-URL voor calls die de Vite-proxy omzeilen (o.a. grote Word-export blob) — zie `src/api.ts` `viewerApiUrl` |
| `DOCX_EXPORT_URL`, `DOCX_EXPORT_STYLE`, `DOCX_EXPORT_TOKEN` | Word-export naar externe LLM2DOCX / docx-export service |
| `LLM2DOCX_ROOT`, `DOCX_TEMPLATES_DIR`, `DOCX_OUTPUT_DIR`, `DOCX_PYTHON` | Lokale export / paden |
| `AGENT_API_KEY`, `AGENT_ENDPOINT`, `AGENT_MODEL` (+ aliassen `OPENAI_*`) | Vullen lege agentvelden als er geen `agent.config*.json` op de server staat |
| `AGENT_LOG_VERBOSE`, `AGENT_LLM_DEBUG`, `AGENT_LLM_DEBUG=1` | Meer logging / debugpayload naar client |
| `ENABLE_LOCALHOST_CORS` | CORS voor localhost-origins op API |
| `CORPUS_INDEX_AUTO_START` | Zet op `0` om automatische index-rebuild bij serverstart uit te zetten (default: aan) |
| `CORPUS_INDEX_ON_SAVE` | Zet op `0` om debounced rebuild na `POST /api/markdown-file` uit te zetten (default: aan) |
| `CORPUS_INDEX_DEBOUNCE_MS` | Wachttijd vóór rebuild na opslaan (default **5000**) |
| `CORPUS_READ_MAX_CHARS` | Max. tekens per `read_corpus_markdown`-aanroep (truncate + melding; default **480000**) |
| `CORPUS_CREATE_MAX_CHARS` | Max. tekens voor nieuwe inhoud bij `create_corpus_markdown` (default **400000**) |
| `CORPUS_ASK_MAX_ROUNDS` | Max. LLM/tool-rondes per corpus-vraag (default **14**) |
| `TAVILY_API_KEY` | Optioneel: Tavily API-key voor Ask-modus **Internet zoeken (Tavily)**; alleen server-side |
| `WEB_SEARCH_MAX_RESULTS` | Max. Tavily-resultaten per `web_search` toolcall (default **5**, max **10**) |
| `WEB_SEARCH_TIMEOUT_MS` | Timeout voor Tavily-calls (default **15000**) |
| `WEB_SEARCH_RESULT_MAX_CHARS` | Max. tekens per webresultaat/snippet richting LLM (default **4000**) |
| `NEXUS_EXPERIMENT_PATHS` | Komma-gescheiden padsegmenten die uit corpus-BM25 worden gefilterd (default `90-experiments-en-test`) |
| `NEXUS_TOOL_CACHE` | Zet op `0` om per-run toolresultaat-cache uit te zetten (default aan) |
| `NEXUS_STRUCTURED_EVIDENCE` | Zet op `0`/`1` om structured evidence JSON in toolcontext te forceren/uit te zetten |
| `MODEL_ROUTER_EXPLORATION_RATE` | Kans (0–0.25) dat Auto-router het 2e/3e model probeert i.p.v. top-score (default **0.08**) |
| `MODEL_ROUTER_DATA_DIR` | Map voor `model-router-events.jsonl` en `model-router-scores.json` (default `markdown-viewer/data/`) |
| `MODEL_CATALOG_OVERRIDES_PATH` | Pad naar `model-catalog.overrides.json` voor handmatige capability-correcties |

Zie ook `.env.example` voor Word-export-varianten.

### 4.1 Nexus-orkestratie

De server classificeert elke Ask/Agent-vraag (`classifyNexusIntent` in `server/nexus/nexus-intent.mjs`) en past daar retrieval-budget, toolgroepen en experiment-filters op toe. Belangrijkste flows:

- **Auto model-router** — Kies in Instellingen model **Auto (slim routeren)**. De server laadt een modelcatalogus (`GET /api/agent/models/catalog`), kiest per LLM-fase (`strategy`, `retrieval`, `synthesis`, `review`, `simple`, `utility`) het beste model op basis van capabilities + geleerde scores (`nexus-model-router.mjs`, `nexus-model-learning.mjs`). Modelswitches verschijnen in de chat-activitystream als `Model (strategie/ophalen/antwoord): …`. Router-statistieken: `GET /api/agent/models/router-stats`.

- **Heuristische baseline** — `buildNexusHeuristicSnapshot()` prefetcht BM25-routekaart, e-mailmemory, Kanban en secties uit het open document.
- **Toolcontext (agent-modus)** — `callCorpusAskAgentWithTools()` met structured evidence (`evidence[]`, `assumptions[]`) vóór de review-agent.
- **Patches** — `applyPatchesToMarkdown()` ondersteunt optioneel `sectionId`, `beforeSnippet` en `rationale`; beschermde paden via `nexus-protected-paths.json`.
- **Kanban-dedup** — `create_kanban_task` vereist eerst `search_kanban_tasks` in dezelfde run.
- **Stem Nexus** — `nexus-voice.mjs` injecteert persona in alle LLM-system prompts; chat heeft optioneel voorlezen via `src/nexus/speech.ts` (Web Speech API, nl-NL).
- **Viewercontext** — `nexus-viewer-context.mjs` + `openDocumentPath`/`activeView` in chat-request: Nexus weet welk bestand open is (ook vanuit e-mail/Kanban-weergave).

**Handmatige smoke-checklist (agent-modus):**

1. Paragraaf-edit in DAP-template → section-scoped patch zonder cross-section match.
2. SLA-vraag met experiment-notitie vs standaard → hogere bron-tier wint in evidence-block.
3. Planning-vraag “wat moet ik deze week” → activity overview in baseline, geen dubbele toolcalls (debug log).
4. Patch op protected path met `replaceAll` → geweigerd met duidelijke foutmelding.

---

## 5. HTTP API (overzicht)

Alle paden hangen onder **`/api`** (behalve statische assets in productie).

| Methode | Pad | Korte beschrijving |
|---------|-----|-------------------|
| GET | `/api/health` | `{ ok, handlerRev }` — `handlerRev` = string in code; gebruik om te verifiëren welke serverbuild draait |
| GET/POST | `/api/agent-config` | Publieke configuratie (geen apiKey in response); POST slaat `agent.config.json`; ondersteunt `model: "auto"` en `modelRouter` |
| GET | `/api/agent/models/catalog` | Verrijkte modelcatalogus voor Auto-router |
| GET | `/api/agent/models/router-stats` | Geleerde scores per fase/model |
| GET/DELETE | `/api/agent/logs` | Ringbuffer agentlog server-side |
| POST | `/api/agent-models` | Haalt beschikbare OpenAI-compatible modellen op via de geconfigureerde endpoint/API key voor de modeldropdown in instellingen |
| GET | `/api/markdown-files` | Index: `files`, `folders`, `fileDetails`, `directory` |
| GET | `/api/markdown-file?name=` | Inhoud één `.md` |
| POST | `/api/markdown-file` | Body `{ name, content }` — schrijft naar `MARKDOWN_DIR`; maakt `.bak`; plant debounced corpus-index bij |
| POST | `/api/corpus-index/rebuild` | Bouwt zowel `MARKDOWN_DIR/.mv-index/` als `Files/.memory/.mv-index/` opnieuw |
| POST/DELETE | `/api/markdown-folder` | Map aanmaken / lege map verwijderen |
| POST | `/api/markdown-rename`, `/api/markdown-backup-current`, `/api/markdown-revert-last`, … | Bestandsbeheer |
| GET | `/api/templates`, `/api/template?name=` | JSON viewer-templates |
| GET | `/api/docx/templates`, `/api/docx/template-placeholders` | Word-templates (LLM2DOCX / service) |
| POST | `/api/docx/export` | Markdown → .docx download |
| POST | `/api/docx/import` | Body `{ docxBase64, originalName? }` → `{ markdown, suggestedName, mammothMessages? }` (mammoth) |
| GET/POST | `/api/review-comments` | Review JSON per document |
| POST | `/api/agent/chat` | Ask/agent-chat; corpus: `corpusWide`, optioneel `webSearch` (Tavily) en `activityStream`; bij streaming is de body NDJSON (`activity`-events en slotregel `done` met `reply`, optioneel `viewerActions`, `corpusCreatedPaths`, `executedMemoryActions`, `pendingMemoryActions`) |
| GET | `/api/memory/index` | Lijst inspecteerbare long-term-memory-documenten onder `Files/.memory/` |
| GET | `/api/memory/file?name=` | Leest één memory-document, met `name` relatief aan `Files/.memory/` |
| POST | `/api/memory/action` | Voert create/update memory-acties uit onder `Files/.memory/` |
| POST | `/api/memory/consolidate-promotions` | Herverwerkt bestaande `chat-promoties/*.md` bronnotities naar gestructureerde memory-documenten |
| POST | `/api/chats/:id/promote` | Promoveert één chat van short-term memory naar een Markdown-memory-notitie |
| POST | `/api/chats/promote-stale` | Promoveert stale chats batchgewijs naar long-term memory |
| POST | `/api/agent/memory-actions/apply` | Legacy/fallback: past voorgestelde `pendingMemoryActions` toe; vereist `mode:"agent"`, alleen create/update, nooit delete |
| POST | `/api/agent/memory-actions/revert` | Draait direct uitgevoerde `executedMemoryActions` terug via meegestuurde rollback-info; vereist `mode:"agent"` |
| POST | `/api/agent/run` | Review-run over comments |

**Body-limiet:** globaal `express.json({ limit: "20mb" })`, behalve **`POST /api/docx/import`** die **eigen** `express.json({ limit: "48mb" })` heeft (base64-overhead).

**Path safety:** `safeMarkdownPath` en varianten voorkomen `..`, ongeldige tekens en verborgen segmenten; altijd gebruiken bij nieuwe routes die naar schijf schrijven.

---

## 6. Serverlogica — LLM / agent (kern)

**Config:** `readAgentConfig()` merged **legacy** `agent.config` + **`agent.config.json`**, daarna optioneel env-fallback (`AGENT_*` / `OPENAI_*`). Zie `tryReadAgentConfigLayer`, `mergeAgentConfigLayers`, `applyAgentConfigEnvFallback`. De instellingen-UI gebruikt `/api/agent-models` om het vrije modelveld te vervangen door een dropdown; de server leidt hiervoor `/models` af uit de OpenAI-compatible endpoint en gebruikt de opgeslagen of tijdelijk ingevoerde API key.

**Endpoints:** OpenAI-compatibele **`/v1/chat/completions`** (URL wordt afgeleid uit geconfigureerde `endpoint`).

**Review/agent JSON-contract:** het model moet idealiter JSON leveren: `{ "changes": [ { "find", "replace", "replaceAll"? } ], "reply": "..." }`. `parseAgentJsonResponse` probeert: volledige body als JSON, daarna een fenced markdown-blok met label `json`, daarna de substring tussen eerste `{` en laatste `}`.

**Compatibiliteit met “agent”-modellen die platte tekst geven (bijv. Bonzai):**

- `normalizeAssistantContentForParsing` — string vs multimodal `content` array
- Bij parse-fout of lege nuttige `reply` met wél tekst: **prose fallback** → `{ changes: [], reply }` of ask-modus: hele tekst als antwoord
- Bij alleen `tool_calls` zonder tekst: vaste Nederlandse uitleg, geen crash
- **Geen** `contentParseError` in debug als recovery gelukt is

Zie `callReviewAgent`, `callAskAgent`, `buildReviewAgentSystemPrompt` in `server/index.mjs`.

**Drie geheugenlagen:** werkdocumenten blijven user-owned Markdown onder `Files/`; long-term memory staat agent-owned onder `Files/.memory/`; short-term memory is uitsluitend de actieve chat. `server/corpus-index.mjs` bouwt daarom twee indexen: `Files/.mv-index/` voor werkdocumenten en `Files/.memory/.mv-index/` voor memory. Ask met `corpusWide: true` krijgt beide contextblokken gescheiden in de prompt. De tool `read_corpus_markdown` leest werkdocumenten; `read_memory_markdown`, `create_corpus_markdown`, `update_corpus_markdown` en `suggest_corpus_deletion` werken op `Files/.memory/`. Eén promptverwerking mag meerdere memory-mutaties uitvoeren via meerdere toolcalls of meerdere `pendingMemoryActions`, zodat informatie over meerdere personen, klanten, projecten of werkwijzen direct op de juiste plekken kan landen. Chatpromotie schrijft eerst een samenvattende bronnotitie onder `chat-promoties/` en start daarna automatisch een tweede toolronde die de inhoud consolideert naar specifieke structured-memory documenten; de chat krijgt `structuredMemoryStatus` (`processed`, `skipped` of `failed`). Ask-modus blijft nieuwsgierig naar ontbrekende inhoudelijke context en kiest zelf of duurzame kennis in memory hoort. Memory-mutaties worden direct uitgevoerd als interne agent-housekeeping en veroorzaken geen aparte chatmelding, akkoordknop of rollback-prompt meer. Documentverwijdering wordt nooit uitgevoerd. Omgevingsconstanten: `CORPUS_READ_MAX_CHARS`, `CORPUS_CREATE_MAX_CHARS`, `CORPUS_ASK_MAX_ROUNDS`, `WEB_SEARCH_*`.

Dieper functioneel: [INSTRUCTIE_AGENT_REVIEW_COMMENTAREN.md](./INSTRUCTIE_AGENT_REVIEW_COMMENTAREN.md).

---

## 7. Frontend — globale flow

- **`main.ts`** bouwt de hele UI, koppelt events, houdt `currentMd`, dirty state, autosave, reviewcomments, agent-chatgeschiedenis bij. De linker bestandsboom gebruikt **`fetchMarkdownIndex()`** (`files` + **`folders`** van `readDirFolders`), zodat ook **lege mappen** zichtbaar zijn. Het zoekfilter toont een map als de term in het mappad voorkomt of als er een gefilterd `.md` onder die map staat. Verder: bovenaan **+** en **📁** voor nieuw bestand resp. nieuwe map in de **hoofdmap**; bij een **uitgeklapte** map dezelfde knoppen naast de mapnaam (`POST /api/markdown-file`, `POST /api/markdown-folder`). Het **lege gebied rechts** naast die knoppen is een **droppable zone** voor verplaatsen naar de hoofdmap. **Slepen** van een `.md`-rij naar een map (of die zone) roept **`POST /api/markdown-rename`** aan (reviews en `.bak` gaan mee). Nieuw `.md` wordt direct geopend.
- **API-calls:** meeste gaan naar **relatieve** `/api/...` (zelfde origin in dev via proxy). **`viewerApiUrl`** in `api.ts` wordt gebruikt waar cross-origin of grote downloads nodig zijn (DOCX export e.d.).
- **Agent-chat:** `agentChat()` in `api.ts` → `POST /api/agent/chat` met `mode`, `history`, optioneel `debugLlm`; bij Ask met `corpusWide` gebruikt de server tools om werkdocumenten te lezen en memory-documenten te lezen/schrijven. Memory-acties refreshen de index en optionele memory-inspectie, maar worden niet meer als aparte meldingen in het chatpaneel getoond. De chatlijst toont lifecycle-statussen en de UI heeft knoppen om de actieve chat of stale chats naar long-term memory te promoveren. Bij Ask met `webSearch: true` gebruikt de server Tavily (`TAVILY_API_KEY`) voor actuele webresultaten; de key wordt nooit naar de browser gestuurd.

Uitbreidingen: zoek naar `addEventListener`, nieuwe knoppen naast bestaande patterns (bijv. Word-export, docx-import).

---

## 8. Word / DOCX

| Richting | Mechanisme |
|----------|------------|
| Export MD → DOCX | `POST /api/docx/export` — LLM2DOCX HTTP of lokale bridge; templates onder `DOCX_TEMPLATES_DIR` |
| Import DOCX → MD | `POST /api/docx/import` — **mammoth** `convertToMarkdown`; client base64’t bestand |

Oude binary `.doc` wordt niet ondersteund voor import.

---

## 9. Docker

- **`Dockerfile`:** build frontend, productie image met `server/`, `templates/`, `dist/`; **`npm install` zonder dev** — `mammoth` zit in `dependencies`.
- **`docker-compose.yml`:** mount `../Files` → `/data/files`; **geen** automatische mount van `agent.config.json` — zet `AGENT_*` in compose `.env` of bind-mount config.

Na codewijzigingen: **`docker compose up -d --build`**.

---

## 10. Versie / troubleshooting

1. `GET /api/health` → controleer **`handlerRev`** tegen `API_HANDLER_REVISION` in `server/index.mjs`.
2. Bij vreemde LLM-fouten: **Instellingen → LLM-debug** en serverlog `/api/agent/logs`.
3. 404 op `/api` met alleen Vite: gebruik **`npm run dev`**, niet alleen `vite`.

---

## 11. Uitbreidingsrichtingen (checklist)

| Doel | Waar |
|------|------|
| Nieuwe REST-route | `server/index.mjs` na bestaande patterns; path guards zoals `safeMarkdownPath` |
| Nieuwe UI-actie | `src/main.ts` + eventueel `src/api.ts` |
| Nieuwe viewer-dep | `package.json` + import in `src/*` of `server/index.mjs` |
| Agentgedrag / prompts | `buildReviewAgentSystemPrompt`, `callReviewAgent` |
| Docx-kwaliteit | mammoth-opties of alternatief (HTML-tussenstap + turndown) in server |

---

## 12. Gerelateerde documenten

- [SOLUTION_ONBOARDING.md](./SOLUTION_ONBOARDING.md) — leesroute en functioneel/technisch solution-overzicht voor junior agents
- [OMGEVING_STARTEN_EN_STOPPEN.md](./OMGEVING_STARTEN_EN_STOPPEN.md) — start/stop, poorten, veelvoorkomende fouten  
- [INSTRUCTIE_AGENT_REVIEW_COMMENTAREN.md](./INSTRUCTIE_AGENT_REVIEW_COMMENTAREN.md) — agent, review, diagram-fences  
- [DOCUMENTATION_UPGRADE_PLAN.md](./DOCUMENTATION_UPGRADE_PLAN.md) — ontbrekende documentatie en voorgestelde documentatiestructuur
- [TECHNICAL_IMPROVEMENT_BACKLOG.md](./TECHNICAL_IMPROVEMENT_BACKLOG.md) — technische tekortkomingen, optimalisaties en functionele verbeteringen
- [README.md](../README.md) — ultrasnelle ingang

---

*Houd bij grote API-wijzigingen `handlerRev` (health) en de routetabel in dit document synchroon.*
