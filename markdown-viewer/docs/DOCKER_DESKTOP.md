# iOMS lokaal draaien in Docker Desktop

Deze variant draait de Markdown Viewer als productiecontainer op je eigen machine. Je lokale `../Files` map blijft de bron van je Markdown-bestanden en wordt live in de container gemount.

## Wat draait er?

- `app`: Node/Express server met de gebouwde Vite frontend.
- Hostpoort: `8787` standaard.
- Containerpoort: `8787`.
- Data mount: `../Files` naar `/data/files`.
- Config volume: `ioms-config` voor agentconfig, chatgeschiedenis, promptmacro's, instructies en activity logs.

De Raspberry Pi-deploy komt pas hierna; deze Docker Desktop-variant is de lokale basis.

## Eerste setup

Voer dit uit vanuit `markdown-viewer`:

```powershell
copy .env.docker.local.example .env.docker.local
notepad .env.docker.local
```

Vul minimaal in:

```env
IOMS_AUTH_USER=joost
IOMS_AUTH_PASSWORD=een-sterk-wachtwoord
AGENT_API_KEY=...
AGENT_ENDPOINT=...
AGENT_MODEL=...
```

Optioneel kun je ook zetten:

```env
TAVILY_API_KEY=...
CONFLUENCE_BASE_URL=...
CONFLUENCE_PAT=...
```

## Starten

```powershell
npm run docker:local:up
```

Open daarna:

```text
http://localhost:8787
```

Log in met de waarden uit `.env.docker.local`.

## Stoppen

```powershell
npm run docker:local:down
```

## Logs bekijken

```powershell
docker compose --env-file .env.docker.local -f docker-compose.local.yml logs -f app
```

## Status controleren

```powershell
docker compose --env-file .env.docker.local -f docker-compose.local.yml ps
```

De service heeft een healthcheck op `/api/health`, inclusief Basic Auth.

## Waar staat data?

- Markdown en memory: je bestaande `../Files` map op de host.
- Reviews: `../Files/.reviews`.
- Memory-index: `../Files/.memory/.mv-index`.
- App-config en chatstate: Docker volume `ioms-local_ioms-config`.

Volume inspecteren:

```powershell
docker volume inspect ioms-local_ioms-config
```

## Word-export

Voor de eerste lokale Docker-test staat Word-export standaard uit, tenzij je in `.env.docker.local` een `DOCX_EXPORT_URL` configureert.

De bestaande `docker-compose.yml` bevat nog de oudere stack met een aparte `docx-export` service. Gebruik voor de lokale viewer eerst expliciet:

```powershell
docker compose --env-file .env.docker.local -f docker-compose.local.yml up -d --build
```

## Wijzigingen toepassen

Na codewijzigingen:

```powershell
npm run docker:local:up
```

Docker bouwt de image opnieuw en start de container opnieuw.

## Troubleshooting

Als poort `8787` bezet is, wijzig in `.env.docker.local`:

```env
APP_PORT=8788
```

Open dan `http://localhost:8788`.

Als je `Authentication required` ziet, klopt de Basic Auth, maar gebruik je nog geen of verkeerde login.

Als de agent geen LLM kan bereiken, controleer `AGENT_API_KEY`, `AGENT_ENDPOINT` en `AGENT_MODEL` in `.env.docker.local`.
