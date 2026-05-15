# Confluence-domeinpagina — Software- en systeemupdates

## Titelpagina (Confluence)

| Veld | Invullen |
|------|----------|
| **Paginatitel** | Software- en systeemupdates |
| **Doelgroep** | Opdrachtgever en delivery (operationeel samenspel) |
| **Versie / datum** | Concept — 6 mei 2026 |

---

## Management summary

### Software- en systeemupdates in het kort

Software- en systeemupdates gaat over **reguliere onderhouds‑ en serviceupdates** van standaardcomponenten in beheer, zoals CMS‑onderdelen, besturingssystemen van virtuele machines en databases. Dit sluit inhoudelijk aan op wijzigings- en DTAP‑praktijk: waar niet‑productie beschikbaar is, vindt eerst test en vrijgave op acceptatie plaats vóór productie. Updates worden doorgaans op nacalculatie doorbelast; bij meer dan acht verwacht werkuren is eerst inhoudelijke goedkeuring van de Opdrachtgever noodzakelijk. Kritieke veiligheidspatches met CVSS‑score tussen 9,0 en 10,0 hebben tussen partijen vastgelegde verkorte cadans inclusief melding aan de Opdrachtgever dezelfde werkdag waar contract dat beschrijft.

### Welke KPI’s en normen zijn hier relevant

- Maandelijkse controle op beschikbare service- en productupdates
- Timing implementatie voor service- of productupdate in overleg
- Goedkeuring vooraf bij verwachte inspanning boven acht uur
- Facturatie op nacalculatie waar contract dat voorschrijft
- Releasebeleid voor routine‑uitrol naar productie

---

## KPI’s en meetbare afspraken

| KPI / norm | Definitie (kort) | Waarde / termijn | Geldigheid / venster | Toelichting (indien nodig, in deze cel) |
|------------|------------------|------------------|------------------------|------------------------------------------|
| Maandelijkse controle | Inventarisatie van beschikbare service- en productupdates | Ten minste eens per maand | Gedurende beheer zoals tussen partijen is vastgelegd | Bij constatering kritieke kwetsbaarheid met CVSS 9,0–10,0 informeert iO de Opdrachtgever dezelfde werkdag waar contract zo verlangt zodat snelle keten kan volgen zoals daar beschreven tussen partijen. |
| Service-/productimplementatie | Plannen van inhoudelijke service- of onderhoudsreleases | Timing in onderling overleg op basis van impact en beschikbaarheid van partijen | Per release‑dossier | Dit onderscheidt zich van de verkorte route voor kritieke patches met zeer hoge dreigingsclassificatie. |
| Drempel acht uur | Vereiste inhoudelijke goedkeuring vóór start grote blokken werk | Bij een verwacht tijdsbudget groter dan acht uur op één traject | Voor elk betreffend traject waar van toepassing | Voorkomt onbedoelde financiële overschrijding zonder uitdrukkelijk akkoord. |
| Facturatie | Doorbelasting volgens het tussen partijen vastgelegde model | Doorgaans nacalculatie | Gedurende beheer | Uitzonderingen op het financiële plaatje staan in het contract tussen partijen. |
| Releasebeleid routine‑uitrol | Uitvoer gebeurt tijdens werkvensters voor inhoudelijke wijzigingen | Doorgaans werkdagen 09:00–17:00, geen vrijdagreleases tenzij de eindverantwoordelijken van beide organisaties daar schriftelijk van afwijken | Gedurende beheer | Stemt overeen met de vrijgavenafspraken uit wijzigings- en releasebeleid voor deze opdracht. |

---

## Generiek — hoe iO hieraan werkt

### Scope en uitgangspunten

- Het onderwerp betreft onderhoud aan standaardsoftware en randvoorwaarden die direct aan de beheerde omgeving zijn gekoppeld, niet commerciële doorontwikkeling die als project is begroot.
- Cloudplatformonderdelen waar de leverancier zelf volledig beheerde updates levert zonder iO‑configuratiewijziging, vallen buiten de vrijgaveketen van deze opdracht maar kunnen indirect impact hebben op foutanalyse.
- Tijdig leveren van beschikbaarheid bij het delivery team is een randvoorwaarde om geplande updatevensters te kunnen halen.

### Werkwijze

- Uit de maandelijkse controle volgen concrete wijzigingsvoorstellen met beschreven teststappen en terugval opties waar zinvol voor risicoklasse.
- Kritieke patches met hoogste dreigingswaardering kunnen versneld ingepland worden en dezelfde werkdag worden gestart waar contract dat beschrijft, met test op niet‑productie zolang tijd en risico dat toestaan.
- Reguliere service- en onderhoudsupdates volgen de geplande vrijgavecyclus en communicatie via tickets.

### Samenspel Opdrachtgever ↔ iO

- Waar functionele acceptatie op UAT vereist is, plant iO testvensters met vertegenwoordigers van de Opdrachtgever.
- Financiële grenzen en meerwerk boven begroting worden expliciet uitgesproken voorafgaand aan grote trajecten zodat besluiten traceerbaar blijven.

### Kritieke security-updates

Patches met CVSS tussen 9 en 10 hebben verkorte termijnen en dezelfde werkdag‑escalatie waar contract dat voorschrijft; niet‑kritieke kwetsbaarheden hebben vaak vastgelegde termijn van dertig kalenderdagen. De inhoudelijke classificatie en timing staan tussen partijen in het contract; deze pagina vult dat aan voor geplande service- en productupdates.

---

## Applicatie-onderhoud

Hier plaatsen zich CMS‑upgrades en patches op applicatie‑ en databaselaag inclusief regressietest en acceptatie waar dat past in de geleverde omgeving.

### Wat iO concreet doet

- Bouwt eerst niet‑productie omgevingen bij met de update en voert regressietests uit tegen bekende kritieke gebruikersscenario’s waar die bekend zijn.
- Documenteert de vrijgaves in het wijzigingsticket met korte vrijgavezorg na productiegang.

### Operationele details (applicatie)

- Integratie met externe endpoints krijgt rooktests waar contract dat als minimum verwacht heeft vastgezet tussen partijen.

---

## Cloud Operations

Infrastructurele updates volgen gereviewde wijziging van templates of scripts daar waar infra-as-code beheer geldt voor de gebruikte middelen onder dit contract.

### Wat iO concreet doet

- Plant platformwijzigingen samen met resource‑impact zoals beschikbaarheid en kosten daar waar financiële signalen nodig zijn voor beslissing over doorvoeren.

### Operationele details (cloud)

- Adviezen uit leveranciers over lifecycle en uitfasering worden vertaald naar concrete change‑ of projectvoorstellen wanneer de impact groter wordt dan kleine configuratie‑aanpassingen.

---

*Titel voor opslag:* `Confluence_Domeinpagina_Software_en_systeemupdates.md`
