# Confluence-domeinpagina — Reactief beheer

## Titelpagina (Confluence)

| Veld | Invullen |
|------|----------|
| **Paginatitel** | Reactief beheer |
| **Doelgroep** | Opdrachtgever en delivery (operationeel samenspel) |
| **Versie / datum** | Concept — 6 mei 2026 |

---

## Management summary

### Reactief beheer in het kort

Reactief beheer start wanneer zich een vraag, verstoring of aanvraag voordoet. De keten omvat: servicedesk-intake, prioritering, diagnose, herstel of workaround, en waar nodig doorvertaling naar wijzigings- en releasemanagement. iO koppelt uitvoering aan de overeengekomen serviceniveau-afspraken voor reactie en oppak, telefonische escalatie bij P1, en de productie-beschikbaarheidsnorm. Alerts op foutniveau en reguliere meldingen doorlopen dezelfde procesketen als een gebruikersincident. Probleemopvolging, ondersteuning en wijzigingen sluiten aan op wat wordt gemeld en op wijzigingsverzoeken die via het daarvoor bestemde geautoriseerde traject zijn ingediend.

### Welke KPI’s en normen zijn hier relevant

Hieronder de meetbare normen die aan dit domein zijn gekoppeld (namen alleen; cijfers en termijnen volgen in KPI’s en meetbare afspraken).

- Meetmoment en Service Window
- Reactietijd — P1 t/m P5
- Oppaktijd — P1 t/m P5
- Minimumserviceniveau (tolerantie) — per prioriteit
- P1 — telefonische melding buiten kantoortijden
- Beschikbaarheidsnorm — productie
- Openingstijden van de servicedesk per gekozen dienstniveau (zie matrix onder de KPI-tabel)

---

## KPI’s en meetbare afspraken

| KPI / norm | Definitie (kort) | Waarde / termijn | Geldigheid / venster | Toelichting (indien nodig, in deze cel) |
|------------|------------------|------------------|------------------------|------------------------------------------|
| Meetmoment en Service Window | Start van de meting voor respons op een incidentticket en het Service Window: het overeengekomen tijdsvenster waarbinnen de termijnen voor reactie en oppak worden gemeten | Meting vanaf registratie in het iO-ticketingsysteem; standaard Service Window kantoortijden maandag t/m vrijdag 09:00–17:00, feestdagen uitgesloten | Contractperiode; termijnen voor incidenten zijn in eerste instantie gericht op productie tenzij anders overeengekomen | Tickets die buiten het Service Window binnenkomen, worden opgepakt zodra het eerstvolgende Service Window aanvangt. Afwijkende vensters (extended, 7 dagen, 24x7) gelden alleen indien uitdrukkelijk zo afgesproken. |
| Reactietijd | Eerste terugkoppeling op het ticket na controle en eventuele routing | P1: 1 uur; P2: 2 uur; P3: 8 uur; P4: 24 uur; P5: best effort | Standaard: kantoortijden-Service Window | Dit omvat de eerste controle op volledigheid en de verwijzing naar het juiste team. |
| Oppaktijd | Eerste analyse, korte impactinformatie naar de Opdrachtgever en waar mogelijk schatting of richting oplossing | P1: 2 uur; P2: 4 uur; P3: 16 uur; P4: 40 uur; P5: in overleg | Standaard: kantoortijden-Service Window | Als geen definitieve oplossing binnen deze termijn haalbaar is, kan een workaround het incident sluiten conform de afgesproken opvolglogica voor incidenten. |
| Minimumserviceniveau (tolerantie) | Percentage incidenten dat binnen de afgesproken reactie- én oppaktijd blijft | P1: 95%; P2 t/m P4: 90%; P5: 75% | Per kalendermaand | Meting op basis van ticketregistraties in het iO-ticketingsysteem. |
| P1 buiten kantoortijden | Verplichting tot telefonische melding na registratie bij een P1-incident | Direct na constatering en ticketing | Alle dagen en uren waar een P1 kan optreden | Alleen voor P1; noodnummer en telefonisch spoor zijn per opdracht bij aanvang vastgelegd. Lagere prioriteiten: geen noodnummer; opvolging volgens Service Window. |
| Beschikbaarheidsnorm — productie | Mate waarin de productieomgeving bereikbaar en functioneel is voor eindgebruikers, voor zover binnen iO-verantwoordelijkheid volgens meetmethode | Minimaal 99,5% | Per kalendermaand | Serviceniveau-termijnen voor beschikbaarheid en incidentrespons zijn primair op productie gericht; niet-productieomgevingen hebben geen dezelfde formele norm tenzij expliciet anders overeengekomen. Berekening en uitgesloten downtime volgen de afgesproken meetlogica zoals voor de dienst vastgelegd. |

De openingstijden van de servicedesk verschillen per gekozen dienstniveau (Basic, Plus, Pro, Pro+). Onderstaande matrix is leidend wanneer het contract zo’n niveau definieert en dat afwijkt van het standaard Service Window in de eerste rij van de tabel hierboven.

| Dienstniveau | Openingstijden servicedesk | Prioriteiten en venster |
|--------------|---------------------------|-------------------------|
| Basic / Plus | Maandag t/m vrijdag 09:00–17:00 (werkdagen, feestdagen uitgesloten) | Alle prioriteiten P1–P5 binnen dit venster |
| Pro | P1: maandag t/m vrijdag 08:00–22:00 (werkdagen). P2–P5: maandag t/m vrijdag 09:00–17:00 (werkdagen) | Extended venster geldt alleen voor P1 |
| Pro+ | P1: elke dag 08:00–22:00. P2–P5: maandag t/m vrijdag 09:00–17:00 (werkdagen). Optioneel 24×7-add-on voor kritieke infrastructuuralerts en eerste herstelacties op platformniveau, conform aanvullende afspraak | 24×7-add-on beperkt zich tot infrastructuurspoor zoals contract bepaalt; applicatie- of CMS-wijzigingen volgen doorgaans het reguliere venster voor lagere prioriteiten |

Als het gekozen dienstniveau afwijkt van bovenstaande standaardmatrix, zijn de contractueel vastgelegde tabellen en vensters leidend.

---

## Generiek — hoe iO hieraan werkt

### Scope en uitgangspunten

- Reactief beheer heeft betrekking op de in het beheercontract opgenomen applicatie-, CMS- en platformcomponenten en de overeengekomen servicedesk-route. Het omvat alles wat zich na melding voordoet als incident, serviceaanvraag of gebruikersvraag, wijzigingsverzoeken die via het daarvoor bestemde proces zijn goedgekeurd, en tickets die ontstaan doordat monitoring een alert op foutniveau genereert.
- Binnen scope vallen intake en registratie, prioritering P1–P5, eerste- en tweedelijnsreactie, workaround en waar passend registratie als Known Error. Een Known Error is een bekende fout waarvoor de oorzaak vaststaat maar nog geen definitieve oplossing beschikbaar is. Verder vallen binnen scope coördinatie met Cloud Operations en applicatie-teams, en het inbedden van structurele oplossingen in wijzigings- en releasemanagement wanneer een directe fix geen onderdeel van een lopende release is.
- Buiten scope vallen meldingen voor systemen waar iO geen beheer levert, doorontwikkeling en grote functionele changes die zakelijk als project worden gevoerd (wel via ticketpad, niet impliciet onder standaard reactieve capaciteit), deployments buiten de openingstijden van de servicedesk tenzij partijen daar schriftelijk mee instemmen, en werk dat uitsluitend onder een ander contract bij een leverancier valt zonder medewerking van de Opdrachtgever.

### Werkwijze

- Meldingen lopen via het centrale ticketproces: een gemachtigde medewerker van de Opdrachtgever registreert in het ticketingsysteem; de servicedesk analyseert, wijst prioriteit toe en routeert naar Cloud Operations of het applicatieteam.
- Voor incidenten geldt de keten eerste reactie, oppak met korte terugkoppeling naar de Opdrachtgever over impact en vervolg, oplossing of workaround, en afsluiting wanneer productieherstel, geaccepteerde workaround of expliciete acceptatie bereikt is; P1 krijgt naast het ticket telefonische bereikbaarheid en periodieke voortgangsupdates waarover bij start van het incident overleg plaatsvindt.
- Alerts op foutniveau leiden waar ingericht tot automatische of beheerde incidentcreatie zodat reactieve opvolging dezelfde termijnen volgt als bij gebruikersmeldingen.
- Overschrijding van reactie- of oppaktijd wordt waar contractueel van toepassing afgehandeld volgens de afgesproken compensatieregeling en wordt opgenomen in de periodieke rapportage en serviceniveau-review.

### Samenspel Opdrachtgever ↔ iO

- De Opdrachtgever meldt volledig en tijdig, levert reproduceerbare feiten en benoemt reeds ondernomen stappen; voor P1 wordt naast registratie telefonisch contact verwacht.
- iO waarborgt routing, prioriteitstoetsing in overleg bij twijfel, en terugkoppeling binnen de overeengekomen termijnen binnen het geldende Service Window; bij externe SaaS of API’s waar de Opdrachtgever contractpartij is, blijft die partij eigenaar van formele leveranciersescalatie tenzij anders gedelegeerd, terwijl iO technische analyse en reproduceerbare bevindingen levert.
- Workarounds en structurele vervolgen lopen via vastgelegde change- en releaseprocesstappen met akkoord waar het budget of de impact dat vereist; de grens naar nieuwe functionaliteit of groot project wordt in het ticket of voorstel benoemd.

### Stromen en aansluiting op andere domeinen

Reactief beheer is het uitvoerende spoor voor meldingen en bevindingen die al tot actie dwingen: iets is gebeurd of is als ticket aangemeld en moet binnen afgesproken termijnen worden opgepakt.

**Monitoring** levert waarneming; overschrijding op foutniveau leidt in de regel tot hetzelfde ticket- en prioriteitenpad als een melding van een gebruiker, zodat meetmoment en termijnen vergelijkbaar blijven. **Proactief beheer** richt zich op voorkomen en vroeg signaleren; waar een alert eerst op waarschuwingsniveau bleef en daarna escaleert, kan alsnog een incident ontstaan dat in dit reactieve domein wordt afgehandeld. **Probleembeheer** volgt vaak ná herstel, als patronen, workarounds of RCA’s structurele opvolging vragen buiten de eerste reactielijn. **Informatiebeveiliging** komt in beeld bij incidenten met een duidelijke securitycomponent, zodat herstel en communicatie aansluiten op de afgesproken securityketen naast het technische herstelpad.

#### Van melding tot herstel

De stappen hieronder beschrijven de hoofdlijn; concrete rollen, frequenties en escalatiekanalen stemmen partijen per opdracht operationeel af.

- **Intake** — Elke melding krijgt een ticket in het centrale systeem. De servicedesk controleert volledigheid, indeling en of de melder volgens de autorisatietabel mag aanmelden; zonder registratie start de meting voor reactie- en oppaktijd niet formeel.
- **Prioriteit** — Impact en urgentie leiden tot P1–P5. Wijkt de inschatting na eerste analyse bij iO af van de keuze bij aanmaak, dan wordt met de Opdrachtgever overlegd voordat verdere termijnen voor reactie en oppak als leidend worden genomen.
- **Diagnose en herstel** — Afhankelijk van de aard van de storing routeert de servicedesk naar Cloud Operations, het applicatieteam of beide; grensgevallen worden in één ticket samengehouden zodat de Opdrachtgever één keten ziet.
- **Afsluiting** — Het incident sluit als de dienst in productie hersteld is, als een tijdelijke workaround is geaccepteerd (met Known Error waar van toepassing), of als een structurele oplossing via wijzigingsbeheer is ingepland en de melding daarmee inhoudelijk is afgewikkeld voor dit incident.

---

## Applicatie-onderhoud

In deze laag gaat reactief beheer over verstoringen en verzoeken die CMS, maatwerk, integraties, data en applicatiegedrag in productie raken: storingen in functionele ketens, fouten na release, gebruikersvragen die een technische handeling vragen, en serviceaanvragen die langs dezelfde ticket- en releaseline worden gepland. De nadruk ligt op het tijdig herstellen van de dienst binnen de prioriteit en op het voorkomen dat omleidingen via derden onnodig de doorloopt vertragen.

### Wat iO concreet doet

- Afhandelen van incident- en storingsmeldingen over CMS-configuratie, templates, rechten en maatwerkfunctionaliteit, inclusief eerste analyse en route naar oplossing of workaround.
- Opvolging van gebruikers- en functionele klachten die een technische ingreep in de applicatie of keten vereisen, met korte impactcommunicatie richting de Opdrachtgever.
- Inplannen van fixes en wijzigingen langs de DTAP-lijn (Development, Test, Acceptance, Production) waar dat voor de omgeving geldt, en productiereleases na de gebruikelijke goedkeuringsfasen tenzij een noodprocedure anders is overeengekomen.
- Afstemming bij incidenten met een securitycomponent zodat het juiste inhoudelijke spoor wordt ingezet naast het reactieve herstel.

### Operationele details (applicatie)

- P4- en P5-achtige meldingen met minimale impact kunnen, conform prioriteitdefinitie, als backlogwerk bij het applicatieteam landen in plaats van volledige incidentafhandeling op productieniveau.
- Integraties en externe koppelingen: iO werkt de keten langs totdat de gemelde klacht is opgelost of duidelijk is dat een andere contractpartij de volgende stap moet zetten; de servicedesk blijft coördinerend kanaal.

---

## Cloud Operations

In dit domein richt reactief beheer zich op platform- en infrastructuurincidenten: resource-uitval, capaciteitsdruk, configuratie- en netwerkfouten, en alerts op foutniveau die uit monitoring komen. Cloud Operations voert veelal de eerste beoordeling en herstelpogingen op infraniveau uit; blijkt de oorzaak aan de applicatiezijde waarschijnlijk, dan routeert de servicedesk naar het applicatieteam met behoud van één overzichtelijk ticket waar mogelijk.

### Wat iO concreet doet

- Behandelen van infrastructuur- en platformgerelateerde incidenten, waaronder beschikbaarheid van Azure-resources, schijf- en geheugendruk, en platformalerts die tot storingsimpact leiden.
- Eerste herstelacties op infrastructuurniveau waar contractueel voorzien, inclusief herstart van resources of diensten binnen de afgesproken 24x7-add-on voor Pro+ indien van toepassing, zonder applicatiecode-wijzigingen in die buiten-urenlijn tenzij anders belegd.
- Escalatie richting leverancier-ondersteuning voor het cloudplatform conform het ondersteuningsprofiel dat voor die omgeving geldt, met technische analyse en reproduceerbare bevindingen.

### Operationele details (cloud)

- Bij een Cloud Service Provider-model (CSP) of een klanteigen Azure-abonnement blijft de servicedesk-route gelijk; voldoende rechten en leverancierssupport moeten beschikbaar zijn zodat reactieve stappen uitvoerbaar blijven.
- Alerts op foutniveau en alerts op waarschuwingsniveau sluiten respectievelijk op directe incidentreactie en op proactieve of preventieve opvolging; na ticketcreatie voor een incident gelden dezelfde impact- en urgentie-afspraken als voor overige meldingen.

---

*Titel voor opslag:* `Confluence_Domeinpagina_Reactief_Beheer.md`
