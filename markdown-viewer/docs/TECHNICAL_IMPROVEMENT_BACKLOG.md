# Technische en functionele verbeterbacklog

Deze backlog bundelt technische tekortkomingen, resource/performance-optimalisaties en functionele verbeterkansen die tijdens de solution-inspectie zijn gevonden. De prioriteiten zijn gericht op overdraagbaarheid, stabiliteit en schaalbaarheid van de huidige file-based solution.

## Samenvatting

De solution is functioneel rijk en lokaal praktisch inzetbaar, maar de complexiteit zit sterk geconcentreerd in twee grote bestanden: `server/index.mjs` en `src/main.ts`. De belangrijkste upgrades zijn modularisatie, explicietere state-documentatie, testdekking, minder blocking filesystemwerk en betere lifecycle-afspraken voor backups, logs en gegenereerde indexen.

## Status op branch `improvements/technical-backlog-foundation`

Eerste tranche uitgevoerd:

- Path-safety helpers zijn uit `server/index.mjs` gehaald naar `server/path-safety.mjs`.
- `server/index.mjs` gebruikt nu die gedeelde module voor Markdown-, memory-, folder-, template- en DOCX-padvalidatie.
- Er is een `npm test` script toegevoegd op basis van Node's ingebouwde test runner.
- Er zijn regressietests toegevoegd voor path-safety en basisgedrag van corpus-section/retrieval.

Nog open in deze backlog:

- Verdere modularisatie van `server/index.mjs` en `src/main.ts`.
- Uitbreiding van tests naar patch matching, review-normalisatie en API-smoke tests.
- Performancewerk rond async filesystemoperaties en incrementele corpus-indexering.
- Robuustere lifecycle voor backups, chatstate en activity logs.

## Status op branch `improvements/second-brain-core-upgrades`

Tweede tranche uitgevoerd op basis van de second-brain benchmark:

- De corpus-index leest YAML/frontmatter-achtige metadata uit Markdown-documenten en bewaart die als `properties`.
- Tags uit frontmatter en inline `#tags` worden geïndexeerd en geteld in `tagCounts`.
- Elk manifest-entry bevat nu expliciete `backlinks`.
- De index detecteert `unlinkedMentions`: documenten waarvan titel of bestandsnaam in een ander document genoemd wordt zonder link.
- `CORPUS_OVERVIEW.md` toont tags en status/properties.
- `CORPUS_GRAPH.md` toont backlinks en mogelijke onverbonden mentions.
- Retrieval-ranking gebruikt nu ook tags, properties, backlinks en unlinked mentions als zoektekst.
- Nieuwe API: `GET /api/second-brain/context` voor een compacte second-brain samenvatting van werkdocumenten en memory.
- De agent-UI heeft een `Second brain` knop voor indexstatus en een `Ask -> Agent` knop om het laatste Ask-antwoord als reviewbare Agent-instructie klaar te zetten.

Nog open voor latere tranches:

- Echte semantische embeddings naast BM25.
- Volwaardige database-views op metadata in de UI.
- Interactieve graph/canvasweergave.
- Formele freshness/verification workflow met owners, reviewdatums en documentstatussen.
- Brontraceerbaarheid per Ask-antwoord persistent opslaan in de chatgeschiedenis.

## P0 - Hoogste prioriteit

### 1. Splits `server/index.mjs` in domeinmodules

Probleem:

- `server/index.mjs` bevat configuratie, path guards, documentroutes, reviewroutes, agentroutes, corpus-tools, DOCX-integratie, chatstate, logging en static serving.
- Nieuwe agents moeten veel context laden voordat ze een kleine wijziging veilig kunnen doen.
- Regressierisico is hoog omdat route- en helperlogica door elkaar staan.

Aanbevolen richting:

- `server/config.mjs`
- `server/path-safety.mjs`
- `server/routes/markdown.mjs`
- `server/routes/reviews.mjs`
- `server/routes/agent.mjs`
- `server/routes/memory.mjs`
- `server/routes/docx.mjs`
- `server/services/agent-client.mjs`
- `server/services/chat-store.mjs`
- `server/services/file-store.mjs`

Let op: doe dit gefaseerd en met build/smoke tests per stap. Eerst helpers extraheren die weinig afhankelijkheden hebben.

### 2. Splits `src/main.ts` in UI-domeinen

Probleem:

- `src/main.ts` bootstrapt vrijwel alle UI: documentboom, editor, reviewpaneel, agentchat, settings, DOCX, memory, resizing en autosave.
- State is verspreid over veel lokale variabelen in `bootstrap()`.
- Een junior agent kan moeilijk voorspellen welke functie welke state muteert.

Aanbevolen richting:

- `src/appState.ts` voor centrale statevorm en mutaties.
- `src/fileTree.ts` voor boom, mappen, drag-and-drop.
- `src/editorController.ts` voor edit/view/code mode, autosave en Markdown-conversie.
- `src/reviewPanel.ts` voor comments, popovers en approval.
- `src/agentPanel.ts` voor chat, settings, logs en memory-acties.
- `src/docxUi.ts` voor import/export dialogs.

Begin met pure of bijna-pure helpers en eventgroepen. Vermijd een grote rewrite in een keer.

### 3. Voeg minimale automated checks toe

Probleem:

- `package.json` heeft geen testscript.
- Kritieke logica zoals path guards, patch matching, corpus-section selectie en review-normalisatie heeft geen expliciete tests.
- Regressies worden vooral handmatig ontdekt.

Aanbevolen minimale set:

- Unit tests voor `safeMarkdownPath`, `safeMemoryMarkdownPath`, `safeFolderPath`, `safeDocxTemplateName`.
- Unit tests voor `applyExactPatches` en newline/Unicode-normalisatie.
- Unit tests voor `extractMarkdownSections`, `scoreMarkdownSectionsForQuestion` en retrieval-budgetkeuze.
- Unit tests voor reviewcomment-normalisatie en quote-offset matching.
- Smoke test: server start, `/api/health`, tijdelijk markdownbestand opslaan/lezen/verwijderen.

Mogelijke toolkeuze: Vitest voor frontend/pure TS; Node test runner voor serverhelpers.

### 4. Maak een expliciet data/state contract

Probleem:

- Persistente state staat verspreid over Markdown, JSON, JSONL, generated indexes en lokale config.
- Sommige bestanden zijn user-owned, sommige agent-owned, sommige generated.
- Zonder contract kan een agent per ongeluk gegenereerde indexen of persoonlijke memory verkeerd behandelen.

Aanbevolen richting:

- Voeg `DATA_MODEL_AND_STATE.md` toe.
- Leg per artefact eigenaar, lifecycle, schrijver, lezer, Git-beleid en recoverypad vast.
- Markeer `.mv-index/` expliciet als rebuildbaar en overschrijfbaar.
- Markeer `agent.config.json` en activity/chat logs als lokaal/semi-privaat.

## P1 - Resource en performance

### 5. Verminder blocking filesystemwerk in API-routes

Probleem:

- Veel routes gebruiken `fs.readFileSync`, `fs.writeFileSync`, `fs.readdirSync` en `fs.statSync`.
- Voor lokaal gebruik is dit simpel, maar bij grote corpora, grote DOCX-imports of meerdere browserrequests kan de Node event loop blokkeren.

Aanbevolen richting:

- Stap voor stap naar `fs.promises` in routes met grote payloads of recursieve scans.
- Begin met `GET /api/markdown-files`, corpus-index rebuild en DOCX/template-routes.
- Houd kleine configreads eventueel sync als dat eenvoudiger blijft.
- Voeg timinglogs toe voor index rebuild en directory scans.

### 6. Maak corpus-indexering incrementeel of slimmer gedebounced

Probleem:

- Save triggert een debounced rebuild van werkdocumenten en memory.
- Rebuild loopt het hele corpus af en schrijft meerdere indexbestanden.
- Bij grotere corpora is dit duur en kunnen opeenvolgende saves leiden tot onnodig werk.

Aanbevolen richting:

- Houd per document `mtimeMs`, size en eventueel content hash bij.
- Herindexeer alleen gewijzigde documenten.
- Bouw werkdocument-index en memory-index onafhankelijk van elkaar.
- Voeg een "rebuild running / queued" status toe zodat handmatige rebuilds elkaar niet overlappen.
- Maak indexstats zichtbaar in de UI of logs: duur, aantal documenten, gewijzigde documenten.

### 7. Beperk grote agentcontext en toolresponses explicieter

Probleem:

- Er zijn limieten zoals `CORPUS_READ_MAX_CHARS`, maar brede vragen kunnen alsnog veel context en toolrondes veroorzaken.
- De huidige retrieval is BM25/heuristisch en kan bij brede vragen veel documenten nodig hebben.

Aanbevolen richting:

- Toon in de UI een compacte indicator van gebruikte context/tokens en toolrondes.
- Voeg hardere per-run limieten toe voor aantal gelezen documenten, totale toolresponse-chars en memory-writes.
- Maak "broad question mode" explicieter zichtbaar voor de gebruiker.
- Overweeg later embeddings of persistent section-indexing als het corpus groter wordt.

### 8. Optimaliseer rendering van grote documenten

Probleem:

- Markdown wordt volledig gerenderd en headings/toc worden steeds opnieuw opgebouwd.
- Review-highlights lopen over tekstnodes en offsets.
- Bij zeer grote documenten kan edit/render/markering merkbaar traag worden.

Aanbevolen richting:

- Debounce render- en TOC-updates expliciet documenteren en waar nodig aanscherpen.
- Cache parsed TOC zolang `currentMd` niet wijzigt.
- Overweeg section-based rendering voor zeer grote documenten.
- Maak een performance smoke test met een groot Markdownbestand en veel reviewcomments.

### 9. Lazy-load meer zware functionaliteit

Sterk punt:

- Mermaid en Chart.js worden al dynamisch geladen.

Verbeterkans:

- Onderzoek of DOCX-import/export UI en zware Turndown-paden pas geladen kunnen worden wanneer nodig.
- Houd de chat-only bundle klein; deze gebruikt nu al een beperkte flow, maar deelt nog algemene CSS en markdownrendering.

## P1 - Betrouwbaarheid en onderhoudbaarheid

### 10. Verbeter backup- en versiebeheer

Probleem:

- De huidige backup is rolling per bestand (`.bak.md`), geen echte versiegeschiedenis.
- Bij meerdere edits of agentruns kan alleen de laatste snapshot worden teruggezet.

Aanbevolen richting:

- Maak backupbestanden run- of timestamp-based.
- Leg metadata vast: trigger, document, agent run id, checksum, tijdstip.
- Voeg cleanupbeleid toe: max aantal versies per document of maximale leeftijd.
- Toon in de UI welke backup teruggezet wordt.

### 11. Maak activity logs en chatstate robuuster

Probleem:

- Chatstate en activity logs staan in JSON/JSONL-bestanden.
- Er is geen expliciete rotatie, locking of corruptieherstel beschreven.

Aanbevolen richting:

- JSONL-logrotatie op grootte of datum.
- Atomic writes voor chatstate: schrijf naar temp file en rename.
- Corruptieherstel: backup laatste geldige state of skip corrupte JSONL-regels met teller.
- Documenteer privacy/Git-beleid voor logs.

### 12. Versterk security rond lokale server

Probleem:

- De app is lokaal bedoeld, maar beheert vertrouwelijke documenten en LLM-secrets.
- CORS en API-origins zijn deels configureerbaar; documentatie waarschuwt al voor private repo's.

Aanbevolen richting:

- Bind standaard aan localhost expliciet documenteren en valideren.
- Voeg optionele eenvoudige bearer-token of localhost-only guard toe voor productie-achtig gebruik.
- Maak een security checklist: secrets, logs, private corpus, Docker volumes, browser origins.
- Controleer dat debugpayloads geen API keys of volledige gevoelige responses lekken.

### 13. Centraliseer API-foutcontracten

Probleem:

- Foutafhandeling is per route en clientfunctie licht verschillend.
- Sommige clientfuncties lezen JSON, andere tekst, andere fallbacken naar generieke errors.

Aanbevolen richting:

- Serverhelper `sendError(res, status, code, message, detail?)`.
- Clienthelper voor alle JSON API-calls.
- Documenteer error codes in `API_REFERENCE.md`.

## P2 - Functionele verbeteringen

### 14. Maak agentactiviteiten beter navigeerbaar

Verbeterkans:

- Corpus activity events bestaan al, maar kunnen functioneel rijker.

Aanbevolen richting:

- Toon per antwoord welke documenten/secties zijn gelezen.
- Maak "open bron" acties prominenter.
- Bewaar bronverwijzingen bij het chatantwoord, niet alleen als tijdelijke UI-acties.
- Voeg filter toe op activity logs: datum, document, mode, changed/wroteFile.

### 15. Verbeter memory-governance

Probleem:

- De agent mag memory direct bijwerken, maar de kwaliteitscontrole is grotendeels prompt- en heuristiekgestuurd.

Aanbevolen richting:

- Periodieke memory-audit: doublures, conflicten, stale documenten.
- UI voor voorgestelde consolidaties.
- Confidence/risk labels zichtbaar maken bij memory-writes.
- Duidelijkere scheiding tussen persoonlijke feiten, projectcontext, werkwijzen en voorkeuren.

### 16. Verwijder of heroverweeg legacy/fallback-functionaliteit

Kandidaten voor review:

- `agent.config` legacy naast `agent.config.json`.
- Legacy/fallback memory-actions endpoints als ze niet meer via de UI gebruikt worden.
- Lokale Python DOCX-bridge als HTTP/portal-flow de standaard is geworden.
- Externe `_mv_external` sessiepaden als browser File System Access voldoende stabiel is.
- Scripts in `scripts/` die eenmalig of historisch zijn, zoals restructure/handout-scripts.

Aanpak:

- Meet eerst gebruik: UI-knoppen, routehits in logs, of grep op clientcalls.
- Markeer deprecated in docs.
- Verwijder pas na een kleine release-notitie en fallbackplan.

### 17. Maak documentimport/export voorspelbaarder

Verbeterkans:

- DOCX-import via mammoth is praktisch, maar conversiekwaliteit kan variëren.
- DOCX-export heeft meerdere modes met verschillende afhankelijkheden.

Aanbevolen richting:

- Voeg een "conversion report" toe na import met mammoth warnings en bekende beperkingen.
- Documenteer template-placeholder contracten in een eigen guide.
- Maak exportmode zichtbaar in settings.
- Voeg smoke test toe voor de geconfigureerde exportmode.

### 18. Verbeter accessibility en keyboard flows

Verbeterkans:

- Veel UI wordt handmatig opgebouwd; keyboard- en screenreaderconsistentie moet expliciet bewaakt worden.

Aanbevolen richting:

- Audit op focus management in dialogs/popovers.
- Keyboard shortcuts documenteren.
- ARIA voor tree, review highlights en resizers nalopen.
- Chat-only pagina testen op mobile en screenreader-basics.

## P3 - Nice to have

### 19. Overweeg semantische retrieval

BM25 is eenvoudig, snel en lokaal, maar mist synoniemen en betekenis. Als het corpus groeit of vragen abstracter worden, kan een optionele embeddings-index nuttig zijn. Houd BM25 als fallback en documenteer duidelijk waar embeddings worden opgeslagen en hoe ze worden gerebuild.

### 20. Voeg een plugin-achtig model toe voor renderers

Mermaid en Chart.js zijn nu specialistische modules. Als er meer bloktypes komen, kan een klein renderer-register helpen:

- detecteer fenced block;
- transformeer naar DOM;
- herstel naar Markdown;
- destroy/cleanup.

Voeg dit pas toe als er een derde of vierde renderer bijkomt.

## Voorgestelde eerste implementatiestappen

1. Voeg `DATA_MODEL_AND_STATE.md` toe.
2. Voeg tests toe voor path-safety en patch matching.
3. Extraheer path-safety helpers uit `server/index.mjs`.
4. Extraheer reviewcomment- en markdownroute handlers.
5. Maak een handmatige smoke-test checklist.
6. Meet corpus-index rebuild duur en documentaantallen in logs.
