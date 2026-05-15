# Confluence-domeinpagina — Proactief beheer

## Titelpagina (Confluence)

| Veld | Invullen |
|------|----------|
| **Paginatitel** | Proactief beheer |
| **Doelgroep** | Opdrachtgever en delivery (operationeel samenspel) |
| **Versie / datum** | Concept — 6 mei 2026 |

---

## Management summary

### Proactief beheer in het kort

Proactief beheer heeft tot doel ongeplande downtime en storingsrisico te verkleinen door vroeg signaleren, onderhouden en optimaliseren vóór de gebruiker daar hinder van ondervindt. iO combineert structurele controles op applicatie, CMS en logs met platforminzicht uit monitoring, alerting en periodieke gezondheidschecks op security, observability en kosten. Bevindingen worden vertaald naar concrete maatregelen en worden doorgaans als ticket opgevolgd via servicedesk-, wijzigings- en releaselogica; monitoring en alerting leveren vooral het waarnemingsvlak, terwijl dit domein de interpretatie en de preventieve-lijn beschrijft. Bij acute veiligheidsrisico’s kan iO tijdelijk handelen zonder eerst inhoudelijke afstemming uit te stellen en de Opdrachtgever daarover zo spoedig mogelijk informeren.

### Welke KPI’s en normen zijn hier relevant

Hieronder de meetbare en procesmatige normen die aan dit domein zijn gekoppeld (namen alleen; uitwerking volgt in KPI’s en meetbare afspraken).

- Service Level Report (SLR)
- Waarschuwingsniveau — preventieve alerting-opvolging
- Periodieke infra-gezondheidsreview (Security Center, Azure Monitor, Cost Review)
- Noodscenario — proactieve veiligheidsinterventie

---

## KPI’s en meetbare afspraken

| KPI / norm | Definitie (kort) | Waarde / termijn | Geldigheid / venster | Toelichting (indien nodig, in deze cel) |
|------------|------------------|------------------|------------------------|------------------------------------------|
| Service Level Report (SLR) | Periodiek overzicht van verrichte werkzaamheden (reactief en proactief), relevante gebeurtenissen en waar mogelijk verbeteradviezen | Minimaal elk kwartaal | Lopende contractperiode | Adviezen worden opgenomen waar passend; vervolgvoorstellen volgen het reguliere ticket- en wijzigingstraject waar uitvoering nodig is. |
| Waarschuwingsniveau — preventieve alerting-opvolging | Vroege signalering: drempel wordt benaderd of een risico trend vertoont | Notificatie naar beheer; beoordeling en preventieve actie waar mogelijk | Signaalgeneratie 24 uur per dag waar monitoring is ingericht; opvolging en servicerespons volgen de overeengekomen Servicedesk- en serviceniveau-afspraken | Cloud Operations coördineert veelal de eerste beoordeling; lijkt een applicatieoorzaak waarschijnlijk na triage, dan routeert de servicedesk naar het applicatieteam. Sluit inhoudelijk aan op het domein Monitoring en alerting. |
| Periodieke infra-gezondheidsreview | Geïntegreerde check op Security Center-, Azure Monitor- en kosteninzicht voor de beheerde infrastructuur | Uitvoering en frequentie zoals geborgd in Cloud Operations-retainer en operationele planning; sanity-checkonderdeel kent bij standaardpakket doorgaans een maandelijkse gemiddelde inspanning van ongeveer 1–3 uur | Beheerde cloudomgevingen binnen scope | Bevindingen en adviezen over performance, continuïteit of kostenbesparing worden met de Opdrachtgever gedeeld; geaccordeerde verbeteringen lopen via tickets en wijzigingsbeheer. Projectmatige of buitenscope-impact kan afzonderlijk worden afgerekend naar afspraak. |
| Noodscenario — proactieve veiligheidsinterventie | Acuut dreigend scenario (zoals aanwijzingen voor ernstig veiligheidsrisico of lek) waarbij wachten op vooraf door de Opdrachtgever gereviewde instructies disproportionele schade kan geven | iO onderneemt proactief passende werkzaamheden zonder eerst inhoudelijke afstemming uit te stellen waar direct handelen nodig is | Lopende contractperiode; buiten gerechtvaardigde noodgevallen wordt normaal vooraf overlegd | iO licht de Opdrachtgever zo spoedig mogelijk toe over uitgevoerde werkzaamheden en verwachtte duur. Verdere documentatie vindt plaats in het ticket waar passend. |

---

## Generiek — hoe iO hieraan werkt

### Scope en uitgangspunten

- Proactief beheer heeft betrekking op de in het beheercontract opgenomen applicatie-, CMS- en platformcomponenten plus de overeengekomen ketenen en integrationscontroles; het is complementair aan reactief incidentbeheer en sluit inhoudelijk aan op monitoring, alerting, probleembeheer en wijzigingsbeheer.
- Typerende bronnen zijn log- en foutpatronen, CMS- en rechtentoetsing, gebruik van monitoring- en alertingdrempels op waarschuwingsniveau, vendor- en platformaankondigingen, externe meldingen, en uitkomsten van periodieke gezondheidschecks (security-, monitor- en kostenperspectief).
- Buiten scope vallen werkzaamheden voor systemen of contracten waar iO geen beheerverantwoordelijkheid heeft, analyse die alleen onder een ander contract beschikbaar is zonder gegevens of medewerking van de Opdrachtgever, en structurele herbouw die zakelijk als project of nieuwe uitbreiding wordt aangemerkt tenzij die expliciet in retainer valt.

### Werkwijze

- Signalen worden beoordeeld op risico voor beschikbaarheid, integriteit en performance; waar geen automatische remedy bestaat ontstaat een ticket zodat status, eigenaarschap en beslissingen voor de Opdrachtgever volgbaar blijven.
- Waarschuwingen op waarschuwingsniveau ondersteunen preventie en kapaciteits- of kostensturing; overschrijding van foutniveau sluit eerder bij incidentdetectie aan. Na ticketcreatie gelden impact- urgentie-afspraken uit incidentbeheer.
- Verbeter- of optimalisatievoorstellen op servercapaciteit, performance, beschikbaarheid of kwaliteit worden verwoord en besproken zoals gebruikelijk op serviceoverleggen of in rapportageproducten; uitvoerbare onderdelen worden niet in productie doorgevoerd voordat de geldende OTAP-, change- en akkoordsfasen zijn doorlopen waar van toepassing.
- Continuïteit op platforms (verplichte wijzigingen, uitfasering, breaking advisories) wordt proactief gemonitoord aan de klantzijde waar Cloud Operations-contractueel is ingericht: impact beoordelen, opties adviseren en geïmplementeerde handelingen Borgen waar binnen scope.

### Samenspel Opdrachtgever ↔ iO

- De Opdrachtgever levert volledige informatie die nodig is om ketens, integraties, business-critical gedrag en toegangen te bewaken — bijvoorbeeld actuele eindpunten, testaccounts of third-party contacten waar iO daar niet automatisch beschikking over heeft.
- iO beschrijft zowel reactieve als proactieve werkzaamheden in het SLR (minimaal elk kwartaal) en brengt terugkerende thema’s tijdens SLA-review en service-overleggen passend in.
- Bij voorstellen waarvoor budgets, inhoudelijke product prioriteit of groot projectgat geldt, wordt de grens tussen beheer-optimalisatie en nieuwe ontwikkeling expliciet in het voorstel of ticket beschreven, zonder dat de kern van proactief beheer (signalering en eerste inschatting) stokt op die procedure.
- Bij externe SaaS of API-contracten waar de Opdrachtgever contractpartij is, blijft die partij eigenaar van formele leveranciersescalatie tenzij anders gedelegeerd; iO ondersteunt met technische analyse en gereproduceerbare bevindingen.

### Signalering en continuïteit

Proactief beheer leunt op herkenbare werkstromen tussen waarnemen, rangschikken en doorvertalen.

#### Van waarschuwing naar geplande maatregel

Als een alert of review iets meer is dan vluchtige drempelbereiking, wordt beoordeeld of sprake is van kapaciteitsdruk, regressie na release, foutclustering of architecturale bottleneck. Licht ingrijpende maatregelen (cache-reset, parametrisatie, schaalherstel waar vooraf vrijgegeven) kunnen in het platformspoor plaatsvinden; alles wat productcode, CMS-structurele inhoud of business beslissen vereist, plant iO langs applicatie-incident‑ of changetijdlijn met test daar waar OTAP beschikbaar is.

---

## Applicatie-onderhoud

In deze laag draait proactief beheer om fout- en gedragssporen voordat zij outages worden: gebruikersrechten en CMS-inrichting, applicatie‑ en databaselogs, VM-logboeken rond database- en applicatiewerk, cache/tijdelijke data, externe ketens en klantspecifiek maatwerk. Input uit monitoring wordt net als observaties uit derden meegenomen bij triage naar concrete tickets en voorgeschreven wijzigingstraject.

### Wat iO concreet doet

- Toetsen van CMS‑configuratie en vastgelegde (gebruikers)rechten op consistentie en veelvoorkomende misconfiguraties die tot incidenten kunnen leiden.
- Analyseren van CMS-, applicatie- en databaselogs en VM‑gerelateerde logs op patronen die op voorhand herstel vragen buiten gebruikers-incidentvolume.
- Opschonen van servercache en overige tijdelijke opslag daar waar dat voorspelbare performance- en stabiliteitseffect heeft.
- Uitvoeren van afgestemde controles op externe koppelingen, achtergrondprocessen en klant-maatwerk.
- Omzetten van bevindingen naar tickets inclusief verkorte impactinschatting en voorstel voor test- en uitrolsequentie langs OTAP waar van toepassing.

### Operationele details (applicatie)

- Periodiek bredere gezondheidscontrole wordt naast deze applicatiechecks uitgevoerd waar contractueel gedeeld: security center review, analyse van observability-gegevens en cost review worden gezamenlijk met cloudbeheer beschouwd; uitkomsten landen bij de Opdrachtgever met concrete adviezen.
- Voorstellen ter verbetering van capaciteit, performance, beschikbaarheid of kwaliteit krijgen eigenaarschap in ticketvorm voordat wijzigingen in planning komen zodat regressierisico wordt beheerst conform releasekalender en change-proces.

---

## Cloud Operations

Hier wordt proactief beheer gekoppeld aan platformobservabiliteit en leveranciersbewegingen: middelenbewaking tegen kosten- en saturationrisico’s, infra-sanity waar security- en compliantieblik periodiek tegen de werkende omgeving wordt gehouden, en Continuity Management richting verplichte of uit te faseren cloudresources — steeds met de bedoeling verstoringen te voorkomen vóór zij kritisch worden voor gebruikersflows.

### Wat iO concreet doet

- Bewaken en beoordelen van waarschuwingsalerts inclusief eerste technische tussenconclusie alvorens te escaleren of tot structurele infrastructuur‑ of configuratie‑change over te gaan.
- Uitvoeren en documenteren van periodieke infra-gezondheidsreviews (onder meer Security Center, Azure Monitor aggregatie, Cost Review), met deelbare bevindingen en concrete optimalisatie- of continuïteitsvoorstellen.
- Bijhouden van Microsoft‑ en ander relevante leveranciersaankondigingen voor uitfasering, verplichte updates en continuïteitsimpact; initiëren van beoordeling en planning volgens continuïteitsafspraken binnen Cloud Operations-retainer waar van toepassing.
- Voorgestelde kosten- of capaciteitsverschuiving die een architectuur- of IaC-wijziging vereisen voorbereiden en laten uitvoeren langs wijzigingsbeheer, inclusief inschatting van beschikbaarheidseffect en, waar gevraagd, een verkorte zakelijk-motiverende toelichting.

### Operationele details (cloud)

- Sanity‑checkinspanning is retainer-gekoppelde periodieke activiteit gemiddeld in de grootteorde van circa 1–3 uur per maand aan Cloud Operations-zijde naast andere monitoring-/alertwerkzaamheden waar die retainer dekking heeft; werk buiten gebudgetteerde continuïteits- of groot upgrade‑opdrachten kan tijdsregistratie en afzonderlijke financiële aftekening vragen waar contract dat voorschrijft.
- Proactief ingrijpen tijdens noodsituaties met acuut veiligheidskarakter volgt de noodregel in de KPI-tabel; daarna normaliseert iO documentatie en eventuele structurele herstelpaden via changes.

---

*Titel voor opslag:* `Confluence_Domeinpagina_Proactief_Beheer.md`
