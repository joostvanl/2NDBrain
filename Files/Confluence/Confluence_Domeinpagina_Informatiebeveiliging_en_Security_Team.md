# Confluence-domeinpagina — Informatiebeveiliging en het Security Team

## Titelpagina (Confluence)

| Veld | Invullen |
|------|----------|
| **Paginatitel** | Informatiebeveiliging en het Security Team |
| **Doelgroep** | Opdrachtgever en delivery (operationeel en governance-samenspel) |
| **Versie / datum** | Concept — 6 mei 2026 |

---

## Management summary

### Informatiebeveiliging in het kort

De bedrijfsvoering van iO is ingericht in lijn met ISO 27001; continu verbeteren op het gebied van vertrouwelijkheid, beschikbaarheid en integriteit hoort daarbij. Het iO Security Team — ervaren medewerkers uit verschillende teams onder leiding van de Security Officer — bewaakt de beveiliging van beheerde applicaties en infrastructuur, evalueert beveiligingsincidenten met de Opdrachtgever waar nodig, en volgt dreigingen en updates. Security-updates worden ingedeeld met de door de leverancier toegekende CVSS-score; kritieke patches krijgen versnelde implementatie, overige patches volgen het reguliere wijzigings- en testpad inclusief DTAP. Op cloudinfrastructuur vullen Cloud Operations-operaties dit aan met beveiligingsgerichte monitoring, complianceblik en mitigerende platformmaatregelen binnen de afgesproken uren.

### Welke KPI’s en normen zijn hier relevant

Hieronder de meetbare normen die aan dit domein zijn gekoppeld (namen alleen; cijfers en termijnen volgen in KPI’s en meetbare afspraken).

- Implementatietermijn — kritieke security-update (CVSS 9,0–10,0)
- Implementatietermijn — niet-kritieke security-update (CVSS lager dan 9,0)
- Periodieke controle — beschikbare security-updates
- Rapportage — kritieke updates naar de Opdrachtgever

---

## KPI’s en meetbare afspraken

| KPI / norm | Definitie (kort) | Waarde / termijn | Geldigheid / venster | Toelichting (indien nodig, in deze cel) |
|------------|------------------|------------------|------------------------|------------------------------------------|
| Implementatietermijn — kritieke security-update | Patch-implementatie voor kwetsbaarheid met CVSS 9,0–10,0 toegekend door de leverancier | Binnen 1 werkdag na beschikbaarheid van de patch | Meetmoment: datum waarop de patch door de leverancier als beschikbaar wordt gerekend | iO start dezelfde werkdag met actie om de update zo snel mogelijk door te voeren. Het DTAP-proces blijft van toepassing: testen vóór productie blijft onderdeel van de uitvoering, ook bij spoed. |
| Implementatietermijn — niet-kritieke security-update | Patch-implementatie voor kwetsbaarheid met CVSS lager dan 9,0 | Binnen 30 kalenderdagen na beschikbaarheid van de patch | Meetmoment: datum patch-beschikbaarheid | Opgepakt als gewijzigde configuratie of release via wijzigingsbeheer; DTAP blijft van toepassing. |
| Periodieke controle — beschikbare security-updates | Terugkerende controle of er voor de beheerde stack nieuwe security-gerelateerde updates beschikbaar zijn | Maandelijks | Per kalendermaand | Draait samen met de bredere maandelijkse updatecontrole op applicatie- en platformcomponenten waar contractueel van toepassing. |
| Rapportage — kritieke updates naar de Opdrachtgever | Directe terugkoppeling zodra een kritieke security-update wordt geconstateerd | Dezelfde werkdag na constatering | Vanaf moment van vaststelling door iO | Sluit aan op de versnelde implementatieplicht voor kritieke patches. |

---

## Generiek — hoe iO hieraan werkt

### Scope en uitgangspunten

- Informatiebeveiliging richt zich op bescherming van onder meer persoons- en bedrijfsgegevens en op het beperken van ongeautoriseerde toegang tot systemen en data, in samenhang met de CIA-dimensies: vertrouwelijkheid, beschikbaarheid en integriteit.
- Het Security Team houdt toezicht op beheerde applicaties en op de infrastructuur die onder het contract valt; evaluatie van beveiligingsincidenten en het aanscherpen van procedure kan in overleg met de Opdrachtgever plaatsvinden wanneer dat nodig is.
- Beveiligingsupdates worden onderscheiden met de CVSS-score van de leverancier: kritiek versus niet-kritiek bepaalt termijn en urgentie van de planning; reguliere software-updates zonder primair security-dossier vallen buiten de specifieke CVSS-termijnen in deze domeinpagina, tenzij ze alsnog als security-patch worden geclassificeerd.
- Randvoorwaarde voor tijdige uitvoering is dat het delivery team beschikbare capaciteit heeft om test en uitrol te doen; de Opdrachtgever wordt geïnformeerd wanneer de verwachte inspanning naar inschatting meer dan acht uur bedraagt, met de voorafgaande instemming die daarbij hoort. Werkzaamheden worden doorgaans op nacalculatie verantwoord conform het geldende financiële kader.
- Releases en patches worden niet buiten kantooruren op werkdagen (09:00–17:00) en niet op vrijdag gepland, tenzij beide partijen daar schriftelijk mee instemmen; een kritieke security-update vormt een uitzondering waar snelheid voorrang kan hebben op dit patroon, in lijn met de versnelde implementatieplicht.

### Werkwijze

- Updates en patches doorlopen waar van toepassing het OTAP-pad (Development, Test, Acceptance, Productie): wijzigingen worden eerst in niet-productie getest voordat productie wordt aangeraakt; omgevingen zijn qua architectuur afgestemd zodat test representatief blijft.
- Bij een kritieke security-update informeert iO de Opdrachtgever direct en wordt dezelfde werkdag met implementatie gestart, zonder te wachten op een regulier releaseschema.
- Niet-kritieke security-updates en reguliere onderhoudsupdates worden als wijziging opgepakt en via wijzigingsbeheer uitgevoerd.
- Maandelijkse controles signaleren beschikbare updates; geconstateerde kritieke items worden dezelfde werkdag naar de Opdrachtgever gerapporteerd.
- Platformcomponenten die door de cloudprovider worden bijgewerkt (zoals door Microsoft beheerde delen van Azure) volgen het leveranciers- en ondersteuningsmodel van die partij naast de door iO uitgevoerde beheer-, configuratie- en governance-acties.

### Samenspel Opdrachtgever ↔ iO

- De Opdrachtgever ondersteunt bij het tijdig beschikbaar stellen van capaciteit en — waar nodig — van besluitvorming voor test en livegang, en bij het delen van feiten bij beveiligingsincidenten (impact, recente ketenwijzigingen, betrokken derden).
- Afstemming over nieuwe dreigingen of wijzigingen in het bedreigingsbeeld gebeurt wanneer dat relevant is voor de beheerde omgeving; inhoudelijke diepgang wordt per situatie bepaald.
- Bij security-gerelateerde incidenten kan het Security Team expertise leveren naast de servicedesk- en incidentlijn; er is geen afzonderlijke KPI op deze samenwerking, de effectiviteit volgt uit incidentafhandeling en overleg.
- Voor SaaS- of andere leverancierscontracten waar de Opdrachtgever contractpartij blijft, faciliteert iO waar mogelijk reproduceerbare technische feiten en blijft de Opdrachtgever waar nodig eerste lijn richting de leverancier.

### Dreigings- en compliancebeeld

Periodiek wordt op infrastructuurzijde gevalideerd of instellingen voor beveiliging, toegang en aanverwante ISO-maatregelen aansluiten op het beleid; back-ups worden waar van toepassing meegenomen in monitoring en waar contractueel voorzien in validatie van herstelperspectief (RTO/RPO). Het CloudOps-team houdt kennis van actuele dreigingen bij en zet infrastructuurcomponenten in voor signalering en preventie. De uren voor deze reguliere lijn zijn in de praktijk grotendeels gebundeld met Monitoring & Alerting; bij zware beveiligingsincidenten of uitgebreide compliance-trajecten kan aanvullend tijd worden ingezet op tijd- en materiaalbasis.

---

## Applicatie-onderhoud

In deze laag gaat het om de beveiligingspositie van de applicatie zelf: CMS en frameworks, libraries en configuratie, en het opvolgen van kwetsbaarheden die uit leveranciersupdates of dependency-inzicht naar voren komen. Het Security Team bewaakt dit veld naast het applicatieteam; wijzigingen blijven verbonden met het OTAP-spoor en met wijzigingsbeheer zodat releases gecontroleerd blijven.

### Wat iO concreet doet

- Toezicht vanuit het Security Team op de beheerde applicatie en afstemming bij beveiligingsincidenten en relevante dreigingsontwikkelingen.
- Opvolgen en inplannen van security-updates voor CMS, applicatieframeworks en gerelateerde stackonderdelen volgens CVSS-prioriteit en termijnen uit KPI’s en meetbare afspraken.
- Monitoren van kwetsbaarheden en beschikbare patches in samenhang met maandelijkse updatecontroles.

### Operationele details (applicatie)

- Implementatie verloopt via de OTAP-lijn zodat nieuwe versies en patches op test en acceptatie worden gevalideerd voordat productie wordt bijgewerkt.
- Kritieke patches krijgen versnelde planning; niet-kritieke patches worden ingebed in het reguliere wijzigingsproces en release-overleg met de Opdrachtgever waar dat gebruikelijk is.

---

## Cloud Operations

Hier ligt het accent op de beveiliging van de beheerde infrastructuur en platformdiensten: instellingen en toegang, leveraging van security- en compliance-inzichten uit het cloudplatform, mitigatie van infrastructuurdreigingen en samenhang met monitoring en periodieke gezondheidsreviews waar security-elementen (zoals securitycentrum-inzichten) onderdeel van uitmaken.

### Wat iO concreet doet

- Security awareness en vertaling van actuele dreigingen naar concrete maatregelen op de beheerde omgeving.
- Compliance-gerichte controles op configuratie, beveiligingsinstellingen en gebruikerstoegang in het licht van het ISO-kader van iO.
- Inzet van beveiligingsmonitoring en preventieve infrastructuurmaatregelen; backupzicht en waar contractueel van toepassing validatie van herstel in relatie tot RTO/RPO.
- Opvolging van platform- en vendorafhankelijke verplichte wijzigingen samenhangend met continuity- en ondersteuningsprofielen van de provider.

### Operationele details (cloud)

- Reguliere security-taken in deze lijn zijn grotendeels verweven met het uren- en takenpakket voor Monitoring & Alerting; incidenten of grotere compliance-inspanningen kunnen aanvullend op tijd- en materiaalbasis worden uitgevoerd na afstemming.
- Hybride situaties waarin een kwetsbaarheid zowel applicatie- als platformraakvlak heeft worden inhoudelijk gekoppeld zodat test en uitrol in samenhang plaatsvinden.

---

*Titel voor opslag:* `Confluence_Domeinpagina_Informatiebeveiliging_en_Security_Team.md`
