# Confluence-domeinpagina — Servicedesk

## Titelpagina (Confluence)

| Veld | Invullen |
|------|----------|
| **Paginatitel** | Servicedesk |
| **Doelgroep** | Opdrachtgever en delivery (operationeel samenspel) |
| **Versie / datum** | Concept — 6 mei 2026 |

---

## Management summary

### Servicedesk in het kort

De servicedesk is de centrale ingang voor alle beheermeldingen onder managed services zodat intake, prioriteit en routing voorspelbaar blijven. iO registreert elke gemachtigde melding als ticket, beoordeelt type en de combinatie urgentie en impact en coördineert voortgang tot inhoudelijke afronding. Communicatie verloopt primair via het ticket; bij kritieke verstoringen gelden aanvullende telefonische afspraken. De gekoppelde serviceniveau-termijnen voor eerste reactie en oppak worden gemeten vanaf registratie en binnen het geldende Service Window per prioriteit zolang dat contractueel is vastgelegd.

### Welke KPI’s en normen zijn hier relevant

Hieronder de meetbare normen die aan dit domein zijn gekoppeld (namen alleen; uitwerking volgt onder KPI’s en meetbare afspraken).

- Meetmoment voor reactie- en oppaktijd
- Service Window (start meting voor incident-SLA-termijnen)
- Reactietijd — P1 t/m P5
- Oppaktijd — P1 t/m P5
- Minimumserviceniveau (tolerantie)
- P1 — telefonische escalatie buiten gecontracteerde servicedesktijden
- Openingstijden van de servicedesk per gekozen dienstniveau (matrix onder de KPI-tabel)
- Pro+ infrastructuur — 24×7-add-on voor platformherstel (indien afgenomen)

---

## KPI’s en meetbare afspraken

| KPI / norm | Definitie (kort) | Waarde / termijn | Geldigheid / venster | Toelichting (indien nodig, in deze cel) |
|------------|------------------|------------------|------------------------|------------------------------------------|
| Meetmoment voor reactie- en oppaktijd | Start van de meting voor respons op een incidentticket | Vanaf registratie in het iO-ticketingsysteem | Binnen het voor die prioriteit geldende Service Window | Tickets buiten het venster worden opgepakt vanaf het eerstvolgende venster tenzij een hoger contractueel dienstniveau andere openingstijden geeft. |
| Service Window | Het overeengekomen tijdsvenster waarbinnen serviceniveau-termijnen voor reactie en oppak op incidenten worden gemeten | Standaard maandag t/m vrijdag 09:00–17:00, feestdagen uitgesloten | Incident-SLA gericht op productie tenzij anders overeengekomen | Afwijkende vensters zoals extended uren voor P1, 7 dagen of een 24×7-add-on gelden alleen indien zo contractueel vastgelegd. |
| Reactietijd | Eerste terugkoppeling op het ticket na controle en eventuele routing | P1: 1 uur; P2: 2 uur; P3: 8 uur; P4: 24 uur; P5: best effort | Standaard: kantoortijden-Service Window | Dit omvat de eerste controle op volledigheid en verwijzing naar het juiste team. |
| Oppaktijd | Eerste analyse, korte impactinformatie naar de Opdrachtgever en waar mogelijk schatting of richting oplossing | P1: 2 uur; P2: 4 uur; P3: 16 uur; P4: 40 uur; P5: in overleg | Standaard: kantoortijden-Service Window | Als geen definitieve oplossing binnen deze termijn lukt, kan een documented workaround als afsluiting gelden conform de voor incidenten gebruikte opvolglogica. |
| Minimumserviceniveau (tolerantie) | Percentage incidenten binnen reactie én oppaktijd | P1: 95%; P2–P4: 90%; P5: 75% | Per kalendermaand | Meting uit ticketgeschiedenis; bespreking in serviceniveau-review bij structurele tekorten. |
| P1 buiten gecontracteerde servicedesktijden | Telefonisch contact naast ticketing bij productie‑P1 | Direct na constatering én ticketing | Alle momenten waarop een productie‑P1 relevant is | Alleen voor P1; noodnummer en proces per opdracht bij start vastgelegd. Lagere prioriteiten gebruiken het reguliere servicedesk‑ en Service Window‑ritme tenzij contract anders voorschrijft. |
| Pro+ infrastructuur — 24×7-add-on (indien afgenomen) | Platformalerts kritiek niveau continu aan Cloud Operations; eerste herstel infra | Opvolging zo snel signalen de keten bereiken | 24×7 waar add-on geldt | Geen applicatie‑ of CMS‑code in deze eerste lijn; herstelacties infra zoals contract bepaalt; vervolganalyse applicatie waar nodig eerstvolgende reguliere blok. |

De openingstijden verschillen per gekozen contractueel dienstniveau en bepalen binnen welk venster servicedesk-afhandeling tegen de KPI’s wordt gemeten waar dat van toepassing is.

| Dienstniveau | Openingstijden servicedesk | Prioriteiten en venster |
|--------------|---------------------------|-------------------------|
| Basic / Plus | Maandag t/m vrijdag 09:00–17:00 (werkdagen, feestdagen uitgesloten) | Alle prioriteiten P1–P5 |
| Pro | P1: ma–vr 08:00–22:00; P2–P5: ma–vr 09:00–17:00 | Uitbreiding geldt voor P1 op werkdagen |
| Pro+ | P1: elke dag 08:00–22:00; P2–P5: ma–vr 09:00–17:00; plus optioneel 24×7-add-on voor kritieke infra-alerts zoals beschreven | Add-on infrastructuur naar contract |

Als contract tabellen verschillend zijn vastgelegd, zijn die leidend boven deze standaardmatrix.

---

## Generiek — hoe iO hieraan werkt

### Scope en uitgangspunten

- De servicedesk ontvangt en beheert tickets voor incidenten, serviceaanvragen, wijzigingsverzoeken, gebruikersvragen en geplande werkzaamheden die langs het formele beheerpad lopen, plus administratief kader rond deze typen waar dat in de tooling is ingericht.
- Routering geschiedt naar Cloud Operations voor platform- en infrastructuurzaken en naar het applicatieteam voor CMS- en maatwerk; alerts uit monitoring worden als storingsworkflow in hetzelfde ticketmodel gezet waar contract en tooling dat voorschrijven.
- Deployments naar productie buiten vastgelegde servicedeskopening of releasebeleid vereisen schriftelijke instemming van beide partijen zoals gebruikelijk in het wijzigings- en releasekader.

### Werkwijze

- Gemachtigde contactpersonen van de Opdrachtgever maken aanvragen aan; inhoudelijke onvolledigheid wordt in het ticket bijgewerkt zodat de meetklok eerlijk kan starten nadat registratie gereed is voor triage.
- Na intake volgen prioriteit op basis van impact en urgentie, toewijzing, voortgang in het ticket, en bij P1 vaste combinatie ticket plus telefonie plus periodieke voortgang waarover bij start van een major incident wordt afgestemd.
- De servicecoördinator houdt overzicht over doorlooptijd, escalatie tussen teams en inhoudelijke koppeling met de bredere servicerapportages.

### Samenspel Opdrachtgever ↔ iO

- De Opdrachtgever houdt gemachtigde melders actueel en levert reproduceerbare melding bij incident en probleemwerk.
- Bij escalatierichting externe SaaS waar de Opdrachtgever contractpartij is, blijft formele escalatie daar primair maar iO ondersteunt met technisch onderbouwd dossier voor die dialoog.
- Beslissingen over grotere uitbreiding dan standaard beheer blijven in het ticket vastgelegd zodat begrotings- en prioritair beleid niet versnipperd raakt.

### Van ticket tot afronding

- Intake en triage worden in één systeem geborgd; daarna assignment naar het team dat inhoudelijk leidend is voor die melding.
- Oplossing kan direct zijn, tijdelijk via workaround plus Known Error waar passend, of structureel via een geplande release of change wanneer de omvang daarom vraagt.

---

## Applicatie-onderhoud

Hier wordt de servicedesk het coördinatievlak tussen melding uit de gebruikersketen enerzijds en werk op CMS, maatwerk, integraties en applicatie gedrag anderzijds. Incident-SLA‑termijnen voor productie sturen de urgentie bij storingen aan de applicatie; andere tickettypen hangen inhoudelijk vast aan andere onderwerpregels maar delen tooling en eerstelijnsorde.

### Wat iO concreet doet

- Classificatie en doorzet van tickets naar applicatie-expertise inclusief backlogroute voor laag-impactitems waar prioriteit zo is gedefinieerd.
- Inbedding releases en fixes in DTAP waar een omgeving die keten kent, met formele goedkeuring productie tenzij een noodgeval expliciet anders is geregeld.
- Koppeling met security-expertise wanneer een melding veiligheidskarakter krijgt naast pure beschikbaarheid.

### Operationele details (applicatie)

- Geen impliciete incident-SLA op niet-productie tenzij contract dat zegt; testomgevingen volgen doorgaans planning en capaciteit in plaats van dezelfde termijnen als productie-incidenten.

---

## Cloud Operations

In dit vlak vangt de servicedesk infrastructurele en platformoorzaken op en zorgt dat Cloud Operations de eerste technische beoordeling kan doen zonder dat de Opdrachtgever meerdere ingangen hoeft te kennen.

### Wat iO concreet doet

- Doorstroom van capaciteits-, runtime- en platformalerts naar dezelfde ticketstructuur als interactieve meldingen zodat prioriteit en communicatie één spoor blijven.
- Organisatie van eerste herstel op infra met Pro+ 24×7-add-on waar die is afgenomen, zonder dat applicatiecode in die lijn wordt gewijzigd tenzij apart belegd.

### Operationele details (cloud)

- Bij een Cloud Service Provider-model met iO als doorfacturerende partij of bij klanteigen Azure blijft de servicedesk het meldpunt; de Opdrachtgever faciliteert rechten en leverancierssupport zodat Cloud Operations kan uitvoeren.

---

*Titel voor opslag:* `Confluence_Domeinpagina_Service_Desk.md`
