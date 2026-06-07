# Solution-onboarding voor junior agents

Dit document is de leesroute voor een agent of ontwikkelaar die de iOMS markdown-viewer zonder mondelinge overdracht moet begrijpen. Lees dit naast `TECHNICAL_GUIDE.md`: deze pagina legt de werking en mentale modellen uit, de technical guide is de referentie.

## 1. Wat deze solution doet

De solution is een lokale Markdown-werkomgeving rond `Files/`.

Belangrijkste gebruikerswaarde:

- Markdown-documenten in `Files/` bekijken, bewerken, hernoemen, verplaatsen en printen.
- Reviewcommentaren op tekstselecties bewaren in JSON onder `Files/.reviews/`.
- Een ingebouwde LLM-agent laten reageren op reviewopdrachten of vrije chatvragen.
- Corpus-brede vragen stellen over werkdocumenten en long-term memory.
- Word-export en Word-import ondersteunen via LLM2DOCX of mammoth.
- Een aparte chat-only pagina aanbieden voor Ask-modus zonder documenteditor.

De solution is bewust file-based: er is geen database. De bron van waarheid staat op disk.

## 2. Belangrijkste mappen

| Pad | Rol |
| --- | --- |
| `Files/` | User-owned Markdown-corpus. Dit is de inhoud die de viewer beheert. |
| `Files/.reviews/` | Reviewcommentaren, agent-chatgeschiedenis per document en rollback-versies. |
| `Files/.mv-index/` | Automatisch gegenereerde index van werkdocumenten. Niet handmatig onderhouden. |
| `Files/.memory/` | Agent-owned long-term memory. Wordt niet als gewone werkdocumentboom getoond. |
| `Files/.memory/.mv-index/` | Automatisch gegenereerde index van long-term memory. |
| `markdown-viewer/server/` | Express API, corpus-indexering, LLM-integratie en DOCX-integratie. |
| `markdown-viewer/src/` | Browser-UI in TypeScript, vooral vanilla DOM. |
| `markdown-viewer/templates/` | Viewer-templates voor layout/styling, niet hetzelfde als Word-templates. |
| `markdown-viewer/docs/` | Menselijke en agentgerichte documentatie over de solution. |

## 3. Runtime-architectuur

De standaard development setup heeft twee processen:

1. Express API op `127.0.0.1:8787`.
2. Vite frontend op `localhost:5173`, met proxy van `/api` naar de API.

Productie-achtig draait een build uit `dist/` samen met de API in een Node-proces. Docker draait daarnaast optioneel een aparte docx-export-service.

High-level flow:

```text
Browser UI
  -> src/api.ts
  -> /api routes in server/index.mjs
  -> filesystem: Files/, .reviews/, .memory/, .mv-index/
  -> optioneel: OpenAI-compatible LLM endpoint, Tavily, LLM2DOCX/docx-export
```

## 4. Functionele domeinen

### Documentbeheer

De linker boom wordt opgebouwd via `GET /api/markdown-files`. De server loopt `Files/` recursief af, maar slaat verborgen mappen over. Lege mappen worden apart geretourneerd zodat de UI ze toch kan tonen.

Documentbewerkingen lopen via:

- `GET /api/markdown-file`
- `POST /api/markdown-file`
- `POST /api/markdown-folder`
- `DELETE /api/markdown-folder`
- `POST /api/markdown-rename`
- backup/revert endpoints rond `Files/.reviews/.versions/`

Bij opslaan schrijft de server eerst de vorige inhoud naar een rolling `.bak.md` en daarna de nieuwe Markdown. Na save wordt een debounced corpus-index rebuild gepland.

### Editor en viewer

`src/main.ts` bootstrapt vrijwel de hele applicatie. Het beheert onder meer:

- huidig document en dirty state;
- visual/code editor mode;
- autosave en persist-chain;
- documentboom, drag-and-drop en mapselectie;
- reviewcommentaren en popovers;
- agentpaneel, chatgeschiedenis en instellingen;
- Word-import/export;
- memory-inspectie;
- paneelbreedtes en UI-state in `localStorage`.

Markdown wordt gerenderd via `src/markdown.ts` met `marked` en `DOMPurify`. Mermaid en Chart.js worden pas dynamisch geladen wanneer zulke fenced blocks aanwezig zijn.

### Reviewcommentaren

Reviewcommentaren staan niet in de Markdown zelf. De bronstructuur staat in `Files/.reviews/<relatief-pad>.md.json`.

Een commentaar bevat:

- `body`: eerste bericht;
- `quote`, `prefix`, `suffix`: anker op tekst in de gerenderde editor;
- `replies`: threadreacties;
- timestamps en auteurvelden.

De viewer probeert highlights opnieuw te plaatsen op basis van `prefix + quote + suffix` of alleen `quote`. Als de onderliggende tekst te veel verandert, kan de visuele highlight losraken terwijl de JSON nog geldig is.

### Agent-modus

Er zijn twee agentvormen:

- Review-agent: verwerkt reviewopdrachten voor het huidige document.
- Ask-agent: beantwoordt chatvragen, eventueel corpus-breed met tools.

De server gebruikt een OpenAI-compatible `/v1/chat/completions` endpoint. Configuratie komt uit `agent.config`, `agent.config.json` of env fallback (`AGENT_*` / `OPENAI_*`).

Voor reviewwijzigingen verwacht de server idealiter JSON met exacte `find`/`replace` patches. Patches worden alleen toegepast als ze exact matchen, tenzij `replaceAll: true` expliciet is gezet.

### Corpus en memory

De corpus-indexer in `server/corpus-index.mjs` maakt manifesten en Markdown-overzichten. Retrieval gebruikt lichte BM25-ranking op titel, koppen, preview en relaties.

Er zijn twee zoekruimtes:

- werkdocumenten: `Files/`;
- long-term memory: `Files/.memory/`.

Ask met `corpusWide: true` krijgt compacte routekaarten en kan via tools gerichte outlines, secties of volledige documenten lezen. Memory-write tools mogen agent-owned memory-documenten aanmaken of bijwerken, maar geen documenten verwijderen.

### DOCX

Word-import gebruikt `mammoth` server-side om `.docx` naar Markdown om te zetten.

Word-export heeft drie varianten:

- extern LLM2DOCX-portaal (`DOCX_EXPORT_STYLE=portal`);
- minimale docx-export-service (`DOCX_EXPORT_STYLE=minimal`);
- lokale Python-bridge als fallback wanneer geen `DOCX_EXPORT_URL` is gezet.

## 5. Waar een junior agent moet beginnen

Aanbevolen leesvolgorde:

1. `README.md` in de repo-root voor doel en quick start.
2. `markdown-viewer/README.md` voor de app-ingang.
3. Dit document voor functioneel begrip.
4. `TECHNICAL_GUIDE.md` voor API, env en uitbreidingspunten.
5. `INSTRUCTIE_AGENT_REVIEW_COMMENTAREN.md` voor reviewcommentaar- en agentprocedures.
6. `TECHNICAL_IMPROVEMENT_BACKLOG.md` voor bekende risico's en prioriteiten.

Aanbevolen codevolgorde:

1. `server/index.mjs`: configuratie bovenin, path-safety helpers, routes onderaan.
2. `server/corpus-index.mjs`: index- en retrievalmodel.
3. `src/api.ts`: contract tussen UI en API.
4. `src/main.ts`: UI-state en editor/agentflows.
5. Specialistische modules: `markdown.ts`, `htmlToMarkdown.ts`, `reviewComments.ts`, `tableEditor.ts`, `mermaidDiagrams.ts`, `chartJsBlocks.ts`.

## 6. Invarianten

Houd deze regels aan bij wijzigingen:

- `Files/` is user-owned. Schrijf daar alleen op expliciete documentacties.
- `Files/.memory/` is agent-owned. Gebruik dit voor duurzame context, niet voor tijdelijke chatruis.
- Verborgen mappen onder `Files/` horen niet in de gewone documentboom.
- Nieuwe filesystem-routes moeten altijd via path-safety helpers lopen.
- Reviewcommentaren blijven in JSON, niet als inline markup in Markdown.
- Agent-patches moeten klein en exact toepasbaar zijn.
- Secrets mogen niet naar de browser of Git.
- Gegenereerde indexbestanden onder `.mv-index/` kunnen worden overschreven.

## 7. Operationele signalen

Gebruik deze checks bij diagnose:

- `GET /api/health` toont of de juiste API-build draait via `handlerRev`.
- 404 op `/api` in Vite betekent vaak dat alleen Vite draait en de API ontbreekt.
- Een oude Node-listener op `8787` kan de browser naar verouderde servercode sturen.
- `GET /api/agent/logs` toont de in-memory agentlogbuffer.
- `GET /api/agent/activity-logs` leest persistente activity logs uit JSONL.
- `POST /api/corpus-index/rebuild` herbouwt werkdocument- en memory-index.

## 8. Belangrijkste risico's om te onthouden

- `server/index.mjs` en `src/main.ts` zijn groot en bevatten veel verschillende verantwoordelijkheden.
- Veel filesystem-operaties zijn synchroon; dit is simpel maar kan de event loop blokkeren bij grote corpora of grote documenten.
- Er is geen testscript in `package.json`; regressies worden vooral handmatig ontdekt.
- De backupstrategie is rolling per bestand en geen volledige versiegeschiedenis.
- Agent-output blijft afhankelijk van LLM-JSON-discipline en exacte patchbaarheid.
- Corpus-retrieval is heuristisch en niet semantisch; brede vragen kunnen context missen zonder extra toolrondes.
