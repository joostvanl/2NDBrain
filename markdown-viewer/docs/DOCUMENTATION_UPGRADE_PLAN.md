# Documentatie-upgradeplan

Dit document beschrijft welke documentatieverbeteringen nodig zijn om de solution significant beter overdraagbaar te maken aan junior agents en nieuwe ontwikkelaars.

## 1. Huidige stand

Sterk aanwezig:

- Quick start in de root `README.md` en `markdown-viewer/README.md`.
- Technische referentie in `TECHNICAL_GUIDE.md`.
- Start/stop-instructies in `OMGEVING_STARTEN_EN_STOPPEN.md`.
- Gedetailleerde procedure voor reviewcommentaren en de ingebouwde agent in `INSTRUCTIE_AGENT_REVIEW_COMMENTAREN.md`.

Belangrijkste hiaten voor onboarding:

- Er was geen compact solution-overzicht dat functionele domeinen, data-eigenaarschap en runtimeflow samenbrengt.
- Er was geen expliciete backlog met technische tekortkomingen en optimalisaties.
- De bestaande technical guide is rijk, maar werkt meer als referentie dan als leesroute.
- De relatie tussen `Files/`, `.reviews`, `.memory`, `.mv-index`, agent-chats en activity logs vraagt om een aparte datamodelbeschrijving.
- Er is geen vaste decision log voor architectuurkeuzes en trade-offs.

## 2. Toegevoegde documentatie

| Bestand | Doel |
| --- | --- |
| `SOLUTION_ONBOARDING.md` | Eerste mentale model voor junior agents: wat doet de solution, welke mappen tellen, welke flows bestaan, welke invarianten gelden. |
| `DOCUMENTATION_UPGRADE_PLAN.md` | Deze analyse: welke documentatie ontbreekt of sterker moet worden. |
| `TECHNICAL_IMPROVEMENT_BACKLOG.md` | Geprioriteerde technische, resource/performance en functionele verbeteringen. |

Deze bestanden vullen de bestaande documentatie aan. Ze vervangen `TECHNICAL_GUIDE.md` niet.

## 3. Aanbevolen documentatiestructuur

Gewenste eindstructuur:

```text
markdown-viewer/docs/
  SOLUTION_ONBOARDING.md
  TECHNICAL_GUIDE.md
  DATA_MODEL_AND_STATE.md
  AGENT_AND_MEMORY_FLOW.md
  API_REFERENCE.md
  OPERATIONS_AND_TROUBLESHOOTING.md
  TECHNICAL_IMPROVEMENT_BACKLOG.md
  DOCUMENTATION_UPGRADE_PLAN.md
  ADR/
    0001-file-based-storage.md
    0002-openai-compatible-agent-api.md
    0003-corpus-memory-split.md
```

De huidige documenten kunnen hier naartoe groeien:

- `OMGEVING_STARTEN_EN_STOPPEN.md` wordt de basis voor `OPERATIONS_AND_TROUBLESHOOTING.md`.
- `INSTRUCTIE_AGENT_REVIEW_COMMENTAREN.md` blijft procedureel, maar zou moeten linken naar een bredere agentflow.
- De routetabel uit `TECHNICAL_GUIDE.md` kan op termijn worden afgesplitst naar `API_REFERENCE.md`.

## 4. Benodigde uitbreidingen

### Data Model And State

Documenteer alle persistente artefacten:

- Markdown-documenten in `Files/`.
- Review JSON per document.
- Rolling backups onder `Files/.reviews/.versions/`.
- Agent-configuratie in `agent.config` en `agent.config.json`.
- Agent-chatstate in `agent-chats.json`.
- Agent activity logs in JSONL.
- Corpus-indexen onder `.mv-index/`.
- Memory-manifest en memory-documenten.
- Viewer-templates en Word-templates.

Voor elk artefact moet duidelijk zijn:

- eigenaar: mens, app, agent of gegenereerd;
- schrijfpad: welke API of functie schrijft het;
- lifecycle: wanneer aangemaakt, bijgewerkt, overschreven of verwijderd;
- Git-beleid: committen, negeren of lokaal houden.

### Agent And Memory Flow

Documenteer apart:

- verschil tussen Ask, Agent en Review-run;
- wanneer corpus-tools beschikbaar zijn;
- wanneer memory-write tools beschikbaar zijn;
- hoe pending versus direct uitgevoerde memory-acties werken;
- waarom deletions alleen suggesties zijn;
- hoe chatpromotie naar long-term memory werkt;
- welke outputcontracten de LLM moet volgen.

### API Reference

De huidige routetabel is nuttig maar compact. Maak per endpoint duidelijk:

- methode en pad;
- requestbody/query;
- responsevorm;
- geschreven artefacten;
- foutcodes;
- security/path-safety aandachtspunten.

Dit is vooral belangrijk omdat alle API-routes in een groot bestand staan.

### Frontend Flow Guide

Maak een kaart van `src/main.ts`:

- bootstrap en DOM-opbouw;
- statevariabelen;
- document lifecycle;
- editor modes;
- autosave;
- review UI;
- agentpaneel;
- Word-import/export;
- memorypaneel;
- file tree en drag-and-drop.

Zonder deze kaart moet een junior agent te veel context uit een groot bestand reconstrueren.

### Testing And QA

Leg vast hoe wijzigingen gecontroleerd worden. Minimaal:

- `npm run build`;
- handmatige smoke test voor document openen/bewerken/opslaan;
- smoke test voor reviewcommentaren;
- smoke test voor Ask/corpus;
- smoke test voor DOCX-import/export afhankelijk van beschikbare omgeving;
- regressiepunten rond autosave, backup/revert en memory-writes.

## 5. Prioriteit

| Prioriteit | Documentatieverbetering | Waarom |
| --- | --- | --- |
| P0 | Data model/state guide | Voorkomt dat agents verkeerde bestanden aanpassen of gegenereerde artefacten handmatig onderhouden. |
| P0 | Frontend flow guide voor `src/main.ts` | Grootste onboarding-frictie en hoogste regressierisico. |
| P1 | Agent/memory flow guide | Nodig voor veilig doorontwikkelen van Ask, memory en review-agent. |
| P1 | API reference per endpoint | Maakt serverwijzigingen controleerbaar en reduceert route-ambiguiteit. |
| P2 | ADR's | Helpt toekomstige agents begrijpen waarom file-based opslag, BM25 en OpenAI-compatible APIs zijn gekozen. |
| P2 | QA checklist | Maakt handmatige regressietests reproduceerbaar zolang er weinig automated tests zijn. |

## 6. Documentatieregels voor toekomstige wijzigingen

- Werk `SOLUTION_ONBOARDING.md` bij als er een nieuw functioneel domein bijkomt.
- Werk `TECHNICAL_GUIDE.md` bij bij nieuwe env vars, scripts, endpoints of runtimekeuzes.
- Werk `TECHNICAL_IMPROVEMENT_BACKLOG.md` bij zodra een tekortkoming is opgelost of een nieuwe risicoanalyse ontstaat.
- Voeg bij structurele architectuurkeuzes een ADR toe.
- Documenteer gegenereerde bestanden altijd als gegenereerd, zodat agents ze niet als handmatige bron gaan onderhouden.
- Beschrijf niet alleen wat een endpoint doet, maar ook welk persistent artefact het raakt.
