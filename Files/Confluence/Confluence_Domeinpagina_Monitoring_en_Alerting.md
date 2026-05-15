# Confluence-domeinpagina — Monitoring en alerting

## Titelpagina (Confluence)

| Veld | Invullen |
|------|----------|
| **Paginatitel** | Monitoring en alerting |
| **Doelgroep** | Opdrachtgever en delivery (operationeel samenspel) |
| **Versie / datum** | Concept — 6 mei 2026 |

---

## Management summary

### Monitoring en alerting in het kort

Monitoring en alerting vormen het waarnemingsvlak van het beheer: iO meet continu of de productieomgeving bereikbaar en gezond is, hoe belasting en fouten zich gedragen, en of externe ketens reageren. Drempels vertalen dit naar waarschuwingen voor preventief handelen of naar foutniveau-incidenten in de reguliere Servicedesk-keten. Rapportage en dashboards geven de Opdrachtgever inzicht in trends en in de grondslag voor KPI’s; monitoring vervangt change- of releasebeheer niet.

### Welke KPI’s en normen zijn hier relevant

Hieronder de meetbare en kwalitatieve afspraken die aan dit domein zijn gekoppeld (namen alleen; uitwerking volgt in KPI’s en meetbare afspraken).

- Beschikbaarheid (uptime) — productie
- Performance (paginalaadtijd) — productie
- Azure-resources (CPU, geheugen, opslag)
- Externe koppelingen en integraties
- Azure-kostenbewaking
- Waarschuwingsniveau (alerting)
- Foutniveau (alerting en incidentroute)

---

## KPI’s en meetbare afspraken

| KPI / norm | Definitie (kort) | Waarde / termijn | Geldigheid / venster | Toelichting (indien nodig, in deze cel) |
|------------|------------------|------------------|------------------------|------------------------------------------|
| Beschikbaarheid (uptime) — productie | Bereikbaarheid van overeengekomen endpoints, gemeten als time to first byte (geldig HTTP-antwoord) | Continue meting; maandelijkse verwerking in servicerapportage en beschikbaarheids-KPI | Uitsluitend productie tenzij anders overeengekomen | Meetpunten en URL’s worden per opdracht bij start beheer vastgelegd. Downtime-definities voor de beschikbaarheidsnorm sluiten hierop aan. |
| Performance — productie | Volledige paginalaadtijd (full page-load) als aanvullende indicator naast beschikbaarheid | Continue meting; opname in periodieke rapportage | Productie | Gebruikt voor trend- en performance-inzicht; de beschikbaarheidsmeting blijft op time to first byte gebaseerd. |
| Azure-resources (CPU, geheugen, opslag) | Belasting en benutting van Azure-resources in de beheerde omgeving | Continue meting; alerts naar drempels zoals ingericht | Productie en niet-productie (DEV/UAT) voor resourcemetriek | Niet-productie kent doorgaans geen formele beschikbaarheids-SLA; wel signalering bij kapteits- en risicosignalen. |
| Externe koppelingen en integraties | Bereikbaarheid van afgesproken externe webservices waarvan de oplossing functioneel afhankelijk is | Continue meting waar ingericht; verwerking in rapportage | Doorgaans productie | Afhankelijkheden bij derden kunnen incidenten en beschikbaarheid beïnvloeden; meetdekking volgt de per opdracht afgestemde set. |
| Azure-kostenbewaking | Signalen bij Azure-verbruik en budgetdrempels voor tijdig bijsturen | Continue of periodieke aggregatie met drempelalerts zoals ingericht | Beheerde omgevingen binnen scope | Bedoeld voor sturing en transparantie; opvolging van voorgestelde changes loopt via tickets en wijzigingsbeheer. |
| Waarschuwingsniveau (alerting) | Vroege signalering: drempel wordt benaderd of een risico trend vertoont | Notificatie naar beheer; beoordeling en preventieve actie waar mogelijk | 24 uur per dag signaalgeneratie; opvolging volgt Servicedesk- en serviceniveau-afspraken | Cloud Operations coördineert vaak de eerste beoordeling; wordt bij ticketvorming een applicatieoorzaak waarschijnlijk, dan routeert de Servicedesk naar het applicatieteam. |
| Foutniveau (alerting en incidentroute) | Kritieke drempel: directe aandacht vereist | Automatische incidentregistratie en oppak volgens prioriteit, reactietijd en oppaktijd binnen het overeengekomen Service Window | Prioriteit en Service Window zoals overeengekomen voor incidentbeheer | Lijn met de hoogste urgentie sluit aan op infrastructuurherstel (bijvoorbeeld herstart) waar dat past; code- en CMS-wijzigingen vallen buiten een puur infrastructuurherstelpad en volgen de normale incident- en releaselogica. |

---

## Generiek — hoe iO hieraan werkt

### Scope en uitgangspunten

- Monitoring en alerting zijn gericht op de in beheer genomen componenten binnen de overeengekomen scope: beschikbaarheid en performance van de dienst richting gebruikers, gezondheid van platformresources, keten naar externe afhankelijkheden waar afgesproken, en inzicht in Azure-kosten. Signalen ondersteunen incidentdetectie, probleemanalyse en proactief beheer.
- Meting is continu of gepland frequent genoeg om SLA-rapportage te dragen. Productie levert de formele input voor beschikbaarheid; niet-productie draagt bij aan risicovroegtijdig signaleren (resources), niet aan dezelfde beschikbaarheidscommitment tenzij expliciet afgesproken.
- Buiten scope vallen monitoring van systemen waar iO geen beheercontract voor heeft, diep inhoudelijke APM-tracing die als aparte dienst of project wordt ingevuld, en signalen die alleen door een SaaS-leverancier van de Opdrachtgever ontsloten kunnen worden zonder medewerking van die partij.

### Werkwijze

- Configuratie wordt waar mogelijk code-gedreven en templated gehouden zodat nieuwe resourcetypen en uitbreidingen van de omgeving onder dezelfde standaard vallen; gegevens en alarmstromen zijn per klant gescheiden met passend toegangsbeleid.
- Platformmonitoring is ingericht rond latency, traffic, errors en saturation (de Four Golden Signals): metriek uit Azure-resources wordt samengebracht tot inzicht in verzadiging, foutpercentages, verkeer en responstijd.
- Op applicatielaag wordt waar nodig aangevuld met endpointmetingen, log- en foutpatroonsignalen, en overeengekomen checks op CMS-, applicatie- en databaselogs. Afgeleide acties worden als tickets ingeschoten wanneer een menselijke interventie nodig is.
- Alerts worden via betrouwbare notificatieroutes uitgeleverd; waarschuwingsniveau ondersteunt preventie en capaciteitssturing, foutniveau triggert incidentbeheer. Prioriteit na ticketcreatie volgt de gebruikelijke impact- en urgentiematrix.
- Resultaten worden maandelijks samengebracht in servicerapportage; waar het pakket dit toelaat, is er een live dashboard met de afgesproken indicatoren.

### Samenspel Opdrachtgever ↔ iO

- De Opdrachtgever levert volledige en actuele informatie over business-kritieke URL’s, integraties en acceptatiecriteria voor “gezond” gedrag waar dat niet enkel technisch af te leiden is. Wijzigingen in ketens bij derden die de monitoringset raken, worden tijdig doorgegeven.
- iO waarborgt dat meetconfiguratie aansluit op de overeengekomen SLA en serviceniveaus, en dat storingen uit monitoring dezelfde transparante ticketroute krijgen als meldingen van gebruikers.
- Waar een volcontinu infrastructuuropvolgingsprofiel is afgesproken, gelden aanvullende afspraken over eerste herstelacties (zoals herstart van resources en diensten), de beschikbaarheid van een Opdrachtgever-contact voor goedkeuring van ingrijpendere reparaties, en het feit dat applicatiecode en CMS in die lijn doorgaans niet worden aangepast; vervolg naar structurele oorzaak blijft overdag bij het applicatieteam indien nodig.

### Inrichting per serviceniveau (transparantie)

Het gekozen serviceniveau (bijvoorbeeld Basic, Plus, Pro, Pro+) bepaalt hoe ver endpoint- en dashboardfunctionaliteit uitgewerkt zijn: variërend van infra-golden metrics met rapportage-overzicht tot uitbreiding met hoofd-URL of meerdere belangrijke URL’s en optioneel een live dashboard. De kern blijft dat infrastructuurmonitoring in het cloudbeheer zit en dat applicatie-specifieke diepgang per oplossing kan verschillen.

#### Four Golden Signals op het platform

De vier signalen vormen het ruggengraatdenkraam voor infrastructuurobservability: hoe snel reageert het platform (latency), hoeveel vraag komt er binnen (traffic), welk deel faalt (errors) en waar grenzen van capaciteit worden benaderd (saturation). Alerts en capaciteitsadviezen worden hierop afgestemd, in combinatie met kosten- en beveiligingssignalen uit periodieke gezondheidschecks.

---

## Applicatie-onderhoud

In deze laag gaat monitoring vooral over het zichtbaar maken van foutgedrag en degradatie in CMS, applicatiecode, integraties en user flows: niet alleen “staat de pagina omhoog”, maar ook of functionele paden en backend-keten gezond zijn binnen wat technisch is afgesproken. Logging en waar ingericht aanvullende applicatiemonitoring voeden proactief beheer, probleembeheer en prioritering van changes.

### Wat iO concreet doet

- Inrichten en onderhouden van overeengekomen endpoint- en scenario-monitoring voor productie, afgestemd op de gekozen serviceniveaus en de architectuur van de oplossing.
- Behandeling van foutniveau-alerts die na triage naar applicatie-, CMS- of integratieoorzaak wijzen; vertaling naar tickets, workaround of geplande fix via OTAP en release.
- Analyse van terugkerende log- en foutpatronen in applicatie-, CMS- en databaselogs als input voor preventieve acties en probleembeheer.

### Operationele details (applicatie)

- Beschikbaarheid en performance op productie worden op de afgesproken meetwijze (time to first byte en full page-load) gerapporteerd; niet-productie blijft primair relevant voor resource- en teststabiliteit.
- Externe koppelingen worden alleen betrouwbaar bewaakt als de Opdrachtgever de juiste eindpunten en toegang voor controles beschikbaar houdt; anders blijven metingen beperkt tot wat contractueel haalbaar is.

---

## Cloud Operations

Cloud Operations draagt de standaard voor platformobservability: Azure Monitor en gerelateerde bronnen, centrale alarmstromen, kosten- en capaciteitssignalen, en de koppeling naar eerste herstel waar dat infra-technisch past. Applicatie-incidenten die zich als infra-symptoom manifesteren, worden na eerste analyse alsnog bij het juiste team neergelegd.

### Wat iO concreet doet

- 24 uur per dag signalering op resources en omgevingen, met drempels op waarschuwings- en foutniveau en periodieke infra-sanity checks (onder andere richting Azure Monitor, security- en kosteninzicht).
- Bijwerken van monitoringconfiguratie mee met nieuwe resourcetypen, schaalwijzigingen en continuïteitsverwachtingen van het platform.
- Eerste opvolging van kritieke infrastructuuralerts binnen het overeengekomen Service Window en eventueel volcontinu-profiel; escaleren naar leverancier-support waar contract en bevoegdheid dat vereisen.

### Operationele details (cloud)

- Golden-signal-benadering en code-gedreven configuratie zorgen dat metriek op schaal uitbreidbaar blijft wanneer de omgeving groeit.
- Back-up- en beschikbaarheidsartifacts van het platform worden in de monitoringopzet meegenomen zodat detectie van uitval of misconfiguratie niet alleen op compute gericht is.
- Kostenalerts ondersteunen begrotingsbeheersing; besluiten over bijstuurresource of architectuur blijven voorbehouden aan de afgesproken change- en besluitvormingsroute met de Opdrachtgever.

---

*Titel voor opslag:* `Confluence_Domeinpagina_Monitoring_en_Alerting.md`
