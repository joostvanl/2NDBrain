# iOMS — Markdown workspace & viewer

De map `markdown-viewer` is een lokale **Markdown-viewer met bestandsbeheer**, review-comments, optionele agent-run en **Word-export** (via LLM2DOCX-portaal of een aparte docx-export-API).

De map `Files/` bevat je Markdown-documenten en `.reviews/` de bijbehorende review-metadata (geen backups van `.reviews/.versions/` in Git — zie `.gitignore`).

## Vereisten

- Node.js 20+ (voor `markdown-viewer`)
- Optioneel: project **LLM2DOCX** (eigen repo) — draai portaal op `:8080` of minimale export op `:8790`; zie `markdown-viewer/.env.example`

## Quick start

```bash
cd markdown-viewer
cp .env.example .env
# Vul .env (o.a. DOCX_EXPORT_* , VITE_API_ORIGIN , DOCX_EXPORT_TOKEN bij portaal-modus)
npm install
npm run dev
```

Open de URL die Vite toont (vaak http://localhost:5173). Zie `markdown-viewer` voor gedetailleerde gedrag en env-variabelen.

**Let op:** de map `Files/` kan **vertrouwelijke** inhoud bevatten. Gebruik bij GitHub bij voorkeur een **private** repository tenzij je bewust alleen publieke documenten commit.

## LLM2DOCX

Word-export via het **portaal** gebruikt dezelfde generator als de MCP-tools; zet `DOCX_EXPORT_STYLE=portal` en een API-sleutel (`llm2docx_…`) in `.env`. LLM2DOCX staat normaal **naast** deze repo (niet mee in dit project).

## GitHub

De repository root is deze map (`iOMS`). Eerste push na aanmaken van een leeg repository op GitHub:

```bash
git remote add origin https://github.com/JOUW_ORG/JOUW_REPO.git
git branch -M main
git push -u origin main
```

(Zonder GitHub CLI: op github.com **New repository**, geen README/license laten genereren als je lokaal al commit.)

## Documentatie

- `markdown-viewer/docs/SOLUTION_ONBOARDING.md` — solution-overzicht en leesroute voor junior agents
- `markdown-viewer/docs/TECHNICAL_IMPROVEMENT_BACKLOG.md` — technical debt, optimalisaties en functionele verbeterpunten
- `markdown-viewer/docs/DOCUMENTATION_UPGRADE_PLAN.md` — benodigde documentatie-upgrades
- `markdown-viewer/docs/` — overige technische, development- en agent/review-instructies
