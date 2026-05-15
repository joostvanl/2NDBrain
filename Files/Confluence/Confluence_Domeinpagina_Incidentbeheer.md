# Confluence-domeinpagina — Incidentbeheer

## Titelpagina (Confluence)

| Veld | Invullen |
|------|----------|
| **Paginatitel** | Incidentbeheer |
| **Doelgroep** | Opdrachtgever en delivery (operationeel samenspel) |
| **Versie / datum** | Concept — 6 mei 2026 |

---

## Management summary

### Incidentbeheer in het kort

Incidentbeheer richt zich op het zo snel mogelijk herstellen van de dienst bij een ongeplande verstoring van de eerder goedgekeurde werking van applicatie of infrastructuur binnen het beheer bij iO. Meldingen lopen via de servicedesk; voor incidenten gelden de contractuele prioriteiten P1–P5 met bijbehorende termijnen voor reactie en oppak. Een geaccepteerde workaround kan het incident afsluiten; inhoudelijke diagnose en structurele verbetering worden waar nodig gekoppeld aan probleem- en wijzigingsbeheer.

### Welke KPI’s en normen zijn hier relevant

Hieronder de meetbare normen die aan incidentbeheer zijn gekoppeld (namen alleen; waarden staan in KPI’s en meetbare afspraken). Deze sluiten inhoudelijk aan op de servicedesk en het serviceniveau voor incidenten.

- Meetmoment voor reactie- en oppaktijd
- Service Window
- Reactietijd — P1 t/m P5
- Oppaktijd — P1 t/m P5
- Minimumserviceniveau (tolerantie)

---

## KPI’s en meetbare afspraken

| KPI / norm | Definitie (kort) | Waarde / termijn | Geldigheid / venster | Toelichting (indien nodig, in deze cel) |
|------------|------------------|------------------|------------------------|------------------------------------------|
| Meetmoment voor reactie- en oppaktijd | Begin van de tijdmeting voor reactie en oppak op een incidentticket | Vanaf registratie in het iO-ticketingsysteem | Binnen het Service Window dat voor die prioriteit geldt | Meldingen buiten het venster tellen mee vanaf start van het eerstvolgende venster, tenzij het contract een ander dienstniveau beschrijft met ruimere beschikbaarheid. |
| Service Window | Het overeengekomen tijdsvenster waarin reactie- en oppaktijden voor incidenten worden gemeten | Standaard maandag t/m vrijdag 09:00–17:00 (feestdagen uitgesloten) | Incident-serviceniveau’s zijn primair gericht op productie tenzij anders overeengekomen | Contracten met dienstniveau Basic of Plus volgen voor alle prioriteiten dit venster; Pro en Pro+ kunnen ruimere servicedesktijden voor P1 (en bij Pro+ optioneel 24×7 voor infrastructuur-add-on) vastleggen conform de contractuele matrix. |
| Reactietijd | Eerste terugkoppeling na controle en routing | P1: 1 uur; P2: 2 uur; P3: 8 uur; P4: 24 uur; P5: best effort | Standaard kantoortijden-Service Window | Dit omvat de eerste controle op volledigheid en de verwijzing naar het juiste team. |
| Oppaktijd | Eerste analyse, korte impactinformatie naar de Opdrachtgever en waar mogelijk richting oplossing | P1: 2 uur; P2: 4 uur; P3: 16 uur; P4: 40 uur; P5: in overleg | Standaard kantoortijden-Service Window | Als binnen deze termijn geen volledige fix haalbaar is, kan een workaround het incident sluiten volgens de gebruikelijke opvolglogica; de structurele oplossing volgt via wijzigingsbeheer waar passend. |
| Minimumserviceniveau (tolerantie) | Percentage incidenten binnen de norm voor zowel reactie als oppak | P1: 95%; P2 t/m P4: 90%; P5: 75% | Per kalendermaand | Rapportage vindt plaats aan de hand van ticketregistraties. |

---

## Generiek — hoe iO hieraan werkt

### Scope en uitgangspunten

- Een incident treedt op wanneer gebruikers of het bedrijfsproces ongeplande verstoring van dienstverlening ondervinden, bijvoorbeeld onbereikbare site, kritieke integratie die faalt of ernstige performancevermindering met duidelijke fout.
- Incidenten op niet-productie vallen buiten de standaard KPI’s voor incident-reactie en -oppak voor productie tenzij partijen dat contractueel uitbreiden.
- Wanneer de oorzaak bij een derde partij buiten de redelijke invloedssfeer van iO ligt, kan het doorgeven van een onderbouwd dossier aan de Opdrachtgever als geldige afhandeling voor de serviceniveau-meting gelden, op de manier die tussen partijen voor uitgesloten derdenoorzaken is vastgelegd.

### Werkwijze

- Intake en registratie via de servicedesk; prioriteit volgt uit impact en urgentie volgens de vijf prioriteitsniveaus.
- Bij P1 is naast het ticket telefonische bereikbaarheid vereist; over de frequentie van voortgangsupdates wordt bij start van een groot incident overleg gepleegd.
- Herstel kan inhoudelijke release via DTAP vereisen; hotfixes plaatsen in het gebruikelijke releasevenster werkdagen 09:00–17:00 en niet standaard op vrijdag tenzij beide partijen schriftelijk anders vrijgeven voor die situatie.

### Samenspel Opdrachtgever ↔ iO

- De Opdrachtgever geeft de eerste prioriteit mee bij melding en levert waar mogelijk reproductiestappen en eerder gedane handelingen.
- Bij afwijkende prioriteitsinschatting na eerste analyse bij iO volgt inhoudelijke afstemming voordat de definitieve klasse wordt vastgezet voor de KPI-meting.
- Goedkeuring voor uitrol naar productie volgt waar van toepassing het wijzigings- en releasepad tenzij partijen schriftelijk voor die specifieke noodsituatie afwijken van het gebruikelijke venster.

### Verschil met andere ticketstromen

Een gebruikersvraag zonder fout in functionaliteit wordt niet als incident met storingsprioriteit behandeld. Een inhoudelijke wijzigingswens gaat naar wijzigingsbeheer zodra er sprake is van aanpasbare functionaliteit buiten klassiek herstel van bestaande goedgekeurde werking.

---

## Applicatie-onderhoud

In deze laag richt incidentbeheer zich op fouten in CMS, maatwerk, keten naar externe API’s en applicatieperformance zichtbaar voor eindgebruikers.

### Wat iO concreet doet

- Zoek foutsporen in configuratie en code waar iO onderhoud levert; stel waar mogelijk een tijdelijke maatregel voor.
- Bereid een correctieve release voor volgens de DTAP-keten waar van toepassing.

### Operationele details (applicatie)

- Lagere-impactmeldingen kunnen per prioriteitdefinitie als backlog bij het applicatieteam terechtkomen in plaats van volledige productie-incidentketen waar contract dat zo beschrijft voor P4/P5-achtig gedrag.

---

## Cloud Operations

Incidenten met vooral platform-uitval, capaciteitsgrenzen of foutcluster in Azure-diensten komen eerst langs Cloud Operations binnen hetzelfde ticket.

### Wat iO concreet doet

- Eerste technische tussenbeoordeling en waar passend herstart of schaal aanpassing die geen nieuwe applicatiecode vereisen.
- Bij een gemengde oorzaak behoudt de servicedesk waar mogelijk één hoofdticket totdat de storingsimpact voor gebruikers uit meetbaar perspectief is opgeheven.

### Operationele details (cloud)

- Herstelpogingen tijdens een 24×7-add-on waar contract dat kent zijn beperkt tot infrastructuuracties zoals beschreven in dat add-on-profiel, zonder wijzigingen aan applicatiecode of CMS in die eerste lijn.

---

*Titel voor opslag:* `Confluence_Domeinpagina_Incidentbeheer.md`
