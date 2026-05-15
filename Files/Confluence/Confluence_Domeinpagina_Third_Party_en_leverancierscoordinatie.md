# Confluence-domeinpagina — Third party en leverancierscoördinatie

## Titelpagina (Confluence)

| Veld | Invullen |
|------|----------|
| **Paginatitel** | Third party en leverancierscoördinatie |
| **Doelgroep** | Opdrachtgever en delivery (operationeel samenspel) |
| **Versie / datum** | Concept — 6 mei 2026 |

---

## Management summary

### Third party en leverancierscoördinatie in het kort

Beheerde oplossingen hangen vaak aan externe API’s, SaaS‑producten en hostingproviders. Bij een storing waar de oorzaak buiten het dienstverleningsbereik van iO als beheerder van de eigen componenten valt, blijft de Opdrachtgever in principe contractpartij bij die derde partij. iO levert technische analyse, reproduceerbare feiten en praktische begeleiding zodat de Opdrachtgever een gerichte escalatie kan starten; diepgaande vendor-onderhandeling buiten dat kader is optioneel mee te kopen.

### Welke KPI’s en normen zijn hier relevant

- Eskalatie-informatie richting Opdrachtgever bij leveranciersafhankelijke oorzaak
- Optionele uitgebreide leveranciersbegeleiding (Time & Material)
- Afhandeling volgens servicemeetkader bij derdenoorzaak (geldige oplossing via doorstuurdossier)

---

## KPI’s en meetbare afspraken

| KPI / norm | Definitie (kort) | Waarde / termijn | Geldigheid / venster | Toelichting (indien nodig, in deze cel) |
|------------|------------------|------------------|------------------------|------------------------------------------|
| Eskalatie-informatie bij externe bottleneck | Status en technische feiten wanneer de volgende actie bij de Opdrachtgever of een door hem ingeschakelde leverancier ligt | Zodra triage daartoe voldoende zekerheid heeft voor voortgang van het hoofdticket | Per gemeld incident of change waar een derde partij kritisch is | Voorkomt dat tickets stil blijven staan zonder dat duidelijk is wie de volgende stap moet zetten. |
| Optionele uitgebreide leveranciersbegeleiding | Extra uren waarin iO dieper meewerkt in vendor-communicatie of technische vertaling voor de leverancier | Op Time & Material of via afzonderlijk begroot blok zoals commercieel afgesproken | Op verzoek van de Opdrachtgever | Standaard beheer dekt niet onbeperkt tweedelijns vendor-escalatie voor elke externe contractrelatie. |
| Servicemeet-afhandeling bij leveranciersincident | Wanneer de managed oplossing exclusief afhankelijk is van een externe dienst en iO die niet zelfstandig kan herstellen | Het leveren van een onderbouwd dossier en begeleiding richting de Opdrachtgever telt als geldige afhandeling voor de incident-serviceniveau-meting indien het contract daarvoor uitzonderingsregels bevat | Per incident waar van toepassing | Sluit aan op de regels voor uitgesloten verstoringen door derden in het serviceniveau voor incidenten. |

---

## Generiek — hoe iO hieraan werkt

### Scope en uitgangspunten

- iO is verantwoordelijk voor de keten die onder het beheercontract valt; voor componenten waar de Opdrachtgever zelf contractpartij is, blijft die relatie primair.
- iO schakelt geen externe leverancier structureel in zonder voorafgaande instemming van de Opdrachtgever, behalve waar contract of wet expliciet anders verlangt.
- Beschikbaarheid en responstijd van een derde partij vallen buiten de SLA van iO voor zover die metingen alleen iO’s eigen levering betreffen.

### Werkwijze

- iO beoordeelt of een melding technisch naar een externe oorzaak wijst en documenteert welke feiten nodig zijn voor een leveranciersticket.
- De Opdrachtgever opent normaliter zelf het ticket bij de leverancier; iO denkt technisch mee en levert input totdat de keten weer functioneert of duidelijk is dat het pad buiten beheer valt.
- Voortgang blijft zichtbaar in het centrale serviceticket zodat status voor beide partijen leesbaar blijft.

### Samenspel Opdrachtgever ↔ iO

- De Opdrachtgever bewaakt contactpersonen en contractuele supportniveaus bij externe partijen en deelt relevante casenummers waar dat helpt.
- Waar iO namens de Opdrachtgever mag optreden, legt iO dat vast in het ticket inclusief beperkingen uit het vendorcontract.

### Eskalatie en verwachtingen

Transparante afspraak wie de volgende actie heeft voorkomt misverstanden over SLA-termijn die niet door iO beïnvloedbaar zijn wanneer de fout bij een ander contract ligt.

---

## Applicatie-onderhoud

Third-party onderwerpen raken integratielagen, gebruik van externe betaal‑ of CRM‑koppen en maatwerk dat van een externe SOAP of REST gebruik maakt.

### Wat iO concreet doet

- Isoleert fouten tot applicatie‑ of configuratielaag versus externe foutcode of time-out gedrag aan buitenzijde.
- Stelt beschrijvingen en logging samen geschikt voor upload in een leveranciersportaal waar de Opdrachtgever die kan gebruiken.

### Operationele details (applicatie)

- Wanneer quota of licentiekwesties bij SaaS zich voordoen, wordt de oorzaakkant meestal bij leveranciersrelatie gelegd; iO beschrijft technisch hoe de gekoppelde applicatie zich gedraagt.

---

## Cloud Operations

Hier ontstaan third-party vraagstukken rond bereik van Microsoft‑platformfeatures, CSP‑facturatie en supportlijn naar de cloudprovider die bij klanteigen subscriptions bij de Opdrachtgever zelf ligt.

### Wat iO concreet doet

- Bundelt logging en resource-identificatie voor break-fix met de cloudplatformleverancier waar iO volgens model mag escaleren.
- Bij klanteigen subscription blijft formele Microsoft-ondersteuning bij de Opdrachtgever; iO levert technische tusseninfo die past bij die route.

### Operationele details (cloud)

- Continuïteitsmaatregelen die door de cloudleverancier worden afgedwongen kunnen impact hebben op infra die door iO wordt beheerd; die wijzigingen gaan inhoudelijk via wijzigings- en continuïteitsafspraken, niet spontaan alleen langs een vendor zonder klantinzage.

---

*Titel voor opslag:* `Confluence_Domeinpagina_Third_Party_en_leverancierscoordinatie.md`
