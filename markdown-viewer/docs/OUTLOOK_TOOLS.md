# Outlook Agent Tools

iOMS kan lokaal Outlook Desktop uitlezen via Windows PowerShell COM. Dit is bedoeld voor een volledig lokale Windows-installatie: de tool leest via het ingelogde Outlook-profiel en benadert niet rechtstreeks Exchange/Graph.

## Mogelijkheden

- `search_outlook_calendar`: zoekt afspraken in de lokale Outlook-agenda.
- `search_2ndbrain_calendar`: zoekt afspraken in de door iOMS beheerde Outlook-agenda.
- `create_2ndbrain_calendar_event`: maakt een afspraak aan in de door iOMS beheerde Outlook-agenda.
- `search_outlook_mail`: zoekt inbox, verzonden of concept-mail binnen een datumrange (`folder`: `inbox`, `sent` of `drafts`). Concepten worden op laatste wijzigingsdatum gesorteerd.
- `read_outlook_mail`: leest één gevonden mail op basis van `entryId`.
- `create_outlook_draft`: maakt een conceptmail aan in Outlook.

Zoeken en lezen zijn read-only. De agent krijgt standaard metadata en korte snippets. Volledige mailbody wordt alleen opgehaald wanneer de agent daar expliciet de `read_outlook_mail` tool voor gebruikt.

Agenda-schrijfacties zijn bewust beperkt tot een aparte Outlook-agenda. Standaard heet die agenda `2ndbrain`. De hoofdagenda wordt nooit door iOMS beschreven.

Conceptmails worden alleen als draft aangemaakt en nooit automatisch verzonden. Het concept wordt standaard geopend in Outlook zodat je het zelf kunt controleren en verzenden.

## Randvoorwaarden

- Windows.
- Outlook Desktop is geïnstalleerd en geconfigureerd.
- Outlook Desktop draait al onder dezelfde Windows-gebruiker als iOMS.
- Niet beschikbaar in Docker/Linux/Raspberry Pi.

## Configuratie

De tools staan op Windows standaard aan. Zet ze uit met:

```env
OUTLOOK_TOOLS_DISABLED=1
```

iOMS koppelt standaard alleen aan een al draaiende Outlook-sessie. Daardoor opent iOMS Outlook niet onverwacht. Automatisch starten kan expliciet met:

```env
OUTLOOK_ALLOW_START=1
```

Naam van de agenda waar iOMS in mag schrijven:

```env
OUTLOOK_MANAGED_CALENDAR_NAME=2ndbrain
```

Als PowerShell niet standaard beschikbaar is:

```env
OUTLOOK_POWERSHELL=powershell.exe
```

## API Smoke Tests

Agenda voor vandaag:

```powershell
Invoke-RestMethod `
  -Uri http://127.0.0.1:8787/api/outlook/calendar/search `
  -Method Post `
  -ContentType application/json `
  -Body (@{ date = (Get-Date -Format yyyy-MM-dd); limit = 10 } | ConvertTo-Json)
```

Mail zoeken:

```powershell
Invoke-RestMethod `
  -Uri http://127.0.0.1:8787/api/outlook/mail/search `
  -Method Post `
  -ContentType application/json `
  -Body (@{
    query = "project"
    fromDate = (Get-Date).AddDays(-7).ToString("s")
    toDate = (Get-Date).ToString("s")
    limit = 10
  } | ConvertTo-Json)
```

Als Basic Auth aan staat, voeg dan `-Credential` toe.

Beheerde `2ndbrain`-agenda doorzoeken:

```powershell
Invoke-RestMethod `
  -Uri http://127.0.0.1:8787/api/outlook/managed-calendar/search `
  -Method Post `
  -ContentType application/json `
  -Body (@{ date = (Get-Date -Format yyyy-MM-dd); limit = 10 } | ConvertTo-Json)
```

Afspraak aanmaken in de `2ndbrain`-agenda:

```powershell
Invoke-RestMethod `
  -Uri http://127.0.0.1:8787/api/outlook/managed-calendar/event `
  -Method Post `
  -ContentType application/json `
  -Body (@{
    subject = "Focusblok iOMS"
    start = "2026-06-08T10:00:00+02:00"
    end = "2026-06-08T11:00:00+02:00"
    body = "Aangemaakt door iOMS in de 2ndbrain-agenda."
  } | ConvertTo-Json)
```

Conceptmail maken:

```powershell
Invoke-RestMethod `
  -Uri http://127.0.0.1:8787/api/outlook/mail/draft `
  -Method Post `
  -ContentType application/json `
  -Body (@{
    to = @("naam@example.com")
    subject = "Concept vanuit iOMS"
    body = "Hallo,\n\nDit is een conceptmail. Hij is niet automatisch verzonden.\n\nGroet,\nJoost"
    display = $true
  } | ConvertTo-Json)
```

Gebruik in Ask bijvoorbeeld:

```text
Maak een conceptmail aan Rimante over de afspraken uit dit gespreksverslag. Gebruik mijn corpus en memory voor context.
```

Of:

```text
Plan morgen van 10:00 tot 11:00 een focusblok in mijn 2ndbrain-agenda voor het uitwerken van het Zadkine-verslag.
```
