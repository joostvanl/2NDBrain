# SLA – Standaard

**Contractpositie:** dit document wordt gebruikt als **bijlage B** bij het juridische managed-services-contract (`Juridisch_Contract_Managed_Services.md`), naast **bijlage A** (`Bijlage_Scope_Managed_Services.md`).

Dit gedeelte bevat de **Service Level Agreement (SLA)** die van toepassing is op de Managed Services van iO. De SLA beschrijft alle meetbare KPI's waarop iO haar dienstverlening kan worden afgerekend. Het is het formele kader waarbinnen de prestaties van de dienstverlening worden gemeten, gerapporteerd en bijgestuurd.

### Wat is de SLA?

De SLA is het document waarin de kwaliteitsnormen van de dienstverlening zijn vastgelegd. Het legt vast:

- Binnen welke tijden iO reageert op en oppakt bij incidenten.
- Welke beschikbaarheid iO nastreeft voor de beheerde omgevingen.
- Wat er wordt gemonitord en welke drempelwaarden daarvoor gelden.
- Binnen welke termijnen beveiligings- en software-updates worden doorgevoerd.
- Welke verstoringen buiten de scope van de SLA vallen.
- Wat de gevolgen zijn als iO de afgesproken normen niet haalt (compensatieregeling).

### Opbouw van deze sectie

- **1. Introductie & Scope** – Wanneer is de SLA van toepassing en wat zijn de uitgangspunten?
- **2. Openingstijden & Service Windows** – Binnen welke tijden is iO bereikbaar?
- **3. Prioritering van Incidenten** – Hoe worden incidenten ingedeeld?
- **4. Reactietijden & Oppaktijden** – De kern-KPIs voor incidentafhandeling.
- **5. Toleranties** – Hoeveel procent van de incidenten moet binnen de norm worden afgehandeld?
- **6. Beschikbaarheid** – De uptime-doelstelling en hoe deze wordt gemeten.
- **7. Monitoring KPIs** – Wat wordt gemeten en gerapporteerd?
- **8. Probleembeheer** – KPIs voor Root Cause Analyse en structurele oplossingen.
- **9. Security- & Software-updates** – Implementatietermijnen per type update.
- **10. Uitgesloten Verstoringen** – Wat valt buiten de scope van de SLA?
- **11. Compensatieregeling** – Wat zijn de gevolgen bij het niet halen van de normen?

### SLA-niveau

Deze SLA beschrijft de **standaard servicenormen** van iO. In de toekomst kunnen aanvullende SLA-niveaus worden toegevoegd (Basic, Plus, Pro+) door de KPI-normen per pagina aan te passen of uit te breiden.

---

# 1. Introductie & Scope

Deze Service Level Agreement (SLA) beschrijft de kwaliteitsnormen waaronder iO de Managed Services levert. De SLA is van toepassing op **de applicatiepijler en/of cloudpijler voor zover die in bijlage A als “in scope” zijn gemarkeerd**, en geldt voor de omgevingen en componenten die daar en in **bijlage C** zijn gespecificeerd.

### Doel van de SLA

De SLA heeft twee doelstellingen:

1. Het definiëren van de **kwaliteitsnormen (KPIs)** waarop iO haar dienstverlening levert.
2. Het vastleggen van de **werkwijze** tussen de Opdrachtgever en iO voor de uitvoering van de SLA.

### Wanneer is de SLA van toepassing?

De SLA is van kracht zodra:

- Het managed-services-contract (inclusief bijlage A — Scope) door beide partijen is aanvaard en ondertekend (of op andere overeengekomen wijze rechtsgeldig tot stand is gekomen).
- De omgeving formeel in productie is genomen en door iO in beheer is genomen (voor zover van toepassing).
- Het DAP (Dossier Afspraken en Procedures) is opgesteld en vastgesteld (tenzij Partijen voor een specifieke klant een andere ingangsregel schriftelijk overeenkomen).

Buiten een actieve SLA zijn er geen formele verplichtingen, reactietijden of communicatieprocessen van kracht.

### Scope

De SLA is van toepassing op de in **bijlage A en bijlage C** gespecificeerde componenten en URL's (en gelijkwaardige scope-objecten). De meetpunten voor beschikbaarheid en performance worden per klant vastgelegd in het DAP.

De SLA is **uitsluitend van toepassing op de productieomgeving**, tenzij expliciet anders overeengekomen. Niet-productieomgevingen (DEV, UAT) vallen buiten de SLA-normen voor beschikbaarheid en incidentrespons.

### Rangorde van documenten

Bij tegenstrijdigheid tussen **formele contractstukken** geldt (indien niet anders overeengekomen):

1. Raamovereenkomst IT-diensten  
2. Juridisch contract Managed Services  
3. Bijlage A — Scope Managed Services  
4. Service Level Agreement (dit document — bijlage B)  

Het **DAP** is geen integraal contractonderdeel en heeft geen overruling-werking ten opzichte van voornoemde documenten.

### Randvoorwaarden

De in deze SLA vastgelegde Service Levels worden alleen nagekomen indien:

- De Opdrachtgever de overeengekomen afspraken en procedures naleeft.
- Incidenten worden gemeld via de vastgestelde kanalen en door geautoriseerde medewerkers.
- De onderliggende infrastructuur voldoet aan de uptime-verwachtingen die voor de overeengekomen SLA noodzakelijk zijn.
- Er voldoende capaciteit beschikbaar wordt gesteld vanuit het delivery team voor de uitvoering van wijzigingen en updates.

---

# 2. Openingstijden & Service Windows

De **Service Windows** bepalen binnen welke tijden de Service Levels van kracht zijn. Reactietijden en oppaktijden worden uitsluitend gemeten binnen het overeengekomen Service Window. Meldingen die buiten het Service Window binnenkomen, worden opgepakt zodra het eerstvolgende Service Window aanvangt.

### KPI: Beschikbare Service Windows
| Service Window | Definitie | Starttijd | Eindtijd |
| --- | --- | --- | --- |
| Kantoortijden | Werkdagen (maandag t/m vrijdag, excl. feestdagen) | 09:00 | 17:00 |
| Extended kantoortijden | Werkdagen (maandag t/m vrijdag, excl. feestdagen) | 08:00 | 22:00 |
| 7 dagen | Alle dagen van de week | 08:00 | 22:00 |
| 24x7 | Alle dagen, alle uren (add-on) | Continue | Continue |

### Geldig Service Window – Standaard SLA

| Prioriteit | Geldig Service Window |
| --- | --- |
| P1 – Kritiek | Kantoortijden (09:00–17:00, werkdagen) |
| P2 – Hoog | Kantoortijden (09:00–17:00, werkdagen) |
| P3 – Gemiddeld | Kantoortijden (09:00–17:00, werkdagen) |
| P4 – Laag | Kantoortijden (09:00–17:00, werkdagen) |
| P5 – Minimaal | Kantoortijden (09:00–17:00, werkdagen) |

### P1-meldingen buiten kantoortijden

P1-incidenten (Kritiek) die buiten kantoortijden worden gedetecteerd, dienen telefonisch te worden gemeld via het **noodnummer** dat is opgenomen in het DAP. Het noodnummer is uitsluitend bedoeld voor P1-incidenten. Meldingen via het noodnummer voor lagere prioriteiten worden opgepakt op de eerstvolgende werkdag.

---

# 3. Prioritering van Incidenten

De prioriteit van een incident bepaalt hoe snel iO reageert en het incident oppakt. De prioriteit wordt vastgesteld op basis van twee dimensies: de **urgentie** (hoe snel moet het worden opgelost?) en de **impact** (hoeveel gebruikers of processen worden geraakt?). De combinatie van beide leidt tot één van vijf prioriteitsniveaus.

### KPI: Prioriteitsmatrix
|  | Impact: Hoog | Impact: Gemiddeld | Impact: Laag |
| --- | --- | --- | --- |
| Urgentie: Hoog – Primaire bedrijfsprocessen geblokkeerd | P1 – Kritiek | P2 – Hoog | P3 – Gemiddeld |
| Urgentie: Gemiddeld – Niet-primaire processen verstoord | P2 – Hoog | P3 – Gemiddeld | P4 – Laag |
| Urgentie: Laag – Klein ongemak | P3 – Gemiddeld | P4 – Laag | P5 – Minimaal |

### Omschrijving per prioriteit
| Prioriteit | Omschrijving | Voorbeeld |
| --- | --- | --- |
| P1 – Kritiek | De applicatie of een kritiek bedrijfsproces is volledig onbeschikbaar. Risico op grootschalige schade. | Website volledig onbereikbaar, checkout niet bereikbaar in een webshop. |
| P2 – Hoog | Een belangrijke functionaliteit werkt niet correct. Meerdere gebruikers worden geraakt. | Formulieren worden niet verzonden, inlog werkt niet. |
| P3 – Gemiddeld | Een functionaliteit werkt niet optimaal, maar een workaround is beschikbaar. | Een niet-kritieke integratie geeft foutmeldingen. |
| P4 – Laag | Kleine verstoring voor één gebruiker, geen impact op bedrijfsprocessen. | Opmaakfout op een interne pagina voor één gebruiker. |
| P5 – Minimaal | Verwaarloosbare impact. Wordt toegevoegd aan de productbacklog. | Wens of verbetersuggestie zonder urgentie. |

### Wie bepaalt de prioriteit?

De initiële prioriteit wordt vastgesteld door de medewerker van de Opdrachtgever die het incident meldt, eventueel in overleg met de iO-vertegenwoordiger. Als na een eerste analyse blijkt dat de prioriteit moet worden bijgesteld, neemt iO contact op met de Opdrachtgever en wordt de prioriteit na overleg aangepast.

---

# 4. Reactietijden & Oppaktijden

De **reactietijd** en **oppaktijd** zijn de kern-KPIs van incidentbeheer. Ze geven aan binnen hoeveel tijd iO een eerste reactie geeft en het incident daadwerkelijk in behandeling neemt. Beide tijden worden gemeten binnen het overeengekomen Service Window, vanaf het moment dat het ticket is geregistreerd in het ticketsysteem.

### Definities
| Begrip | Definitie |
| --- | --- |
| Reactietijd | De tijd waarbinnen iO een eerste terugkoppeling geeft op het ingediende ticket. Dit omvat een eerste controle op volledigheid en juistheid van de melding, en eventuele doorverwijzing naar het juiste team. |
| Oppaktijd | De tijd waarbinnen iO een eerste analyse uitvoert op het incident, een korte impactanalyse deelt met de Opdrachtgever en waar mogelijk een oplossingsalternatief of urenschatting aanlevert. |
| Meetmoment | Vanaf het moment van registratie van het ticket in het iO ticketsysteem, gemeten binnen het Service Window. |

### KPI: Reactietijden & Oppaktijden – Standaard
| Prioriteit | Reactietijd | Oppaktijd | Service Window |
| --- | --- | --- | --- |
| P1 – Kritiek | 1 uur | 2 uur | Kantoortijden |
| P2 – Hoog | 2 uur | 4 uur | Kantoortijden |
| P3 – Gemiddeld | 8 uur | 16 uur | Kantoortijden |
| P4 – Laag | 24 uur | 40 uur | Kantoortijden |
| P5 – Minimaal | Best effort | In overleg | Kantoortijden |

### Communicatie bij P1-incidenten

Bij P1-incidenten informeert iO de Opdrachtgever regelmatig op tactisch en operationeel niveau over de voortgang van de afhandeling. De updatefrequentie wordt bij de aanvang van het incident in overleg bepaald, tenzij hierover schriftelijk andere afspraken zijn gemaakt. De exacte communicatiewijze en -frequentie zijn vastgelegd in het **DAP**.

### Workarounds

Indien een definitieve oplossing niet binnen de oppaktijd kan worden gerealiseerd, biedt iO een **tijdelijke oplossing (workaround)** aan. Een workaround geldt als afdoende middel om het incident te sluiten. De details van de workaround worden geregistreerd als Known Error. Daarna volgt een diagnose en advies over de definitieve, structurele oplossing.

---

# 5. Toleranties

De **toleranties** geven aan welk percentage van de incidenten binnen de afgesproken reactie- en oppaktijden moet worden afgehandeld. Een tolerantie van 95% voor P1 betekent dat iO voor minimaal 95% van de P1-incidenten de reactie- en oppaktijd haalt. De overige 5% valt binnen de marge en leidt niet direct tot compensatie.

### KPI: Toleranties per prioriteit
| Prioriteit | Minimum Service Level | Meetperiode |
| --- | --- | --- |
| P1 – Kritiek | 95% binnen de gestelde reactie- en oppaktijd | Per kalendermaand |
| P2 – Hoog | 90% binnen de gestelde reactie- en oppaktijd | Per kalendermaand |
| P3 – Gemiddeld | 90% binnen de gestelde reactie- en oppaktijd | Per kalendermaand |
| P4 – Laag | 90% binnen de gestelde reactie- en oppaktijd | Per kalendermaand |
| P5 – Minimaal | 75% binnen de gestelde reactie- en oppaktijd | Per kalendermaand |

### Hoe worden toleranties gemeten?

De KPIs worden gemeten op basis van de ticketregistraties in het iO ticketsysteem. Per kalendermaand wordt het percentage incidenten bepaald dat binnen de afgesproken reactie- en oppaktijd is afgehandeld. De resultaten worden opgenomen in de maandelijkse **Service Level Rapportage**.

### Wanneer is er sprake van een overschrijding?

Er is sprake van een overschrijding wanneer het gemeten Service Level **lager** uitkomt dan het minimum Service Level zoals hierboven gedefinieerd. Overschrijdingen worden altijd opgenomen in de rapportage en besproken tijdens het periodieke Service Level Review.

---

# 6. Beschikbaarheid

De **beschikbaarheid** drukt uit welk percentage van de tijd de productieomgeving bereikbaar en functioneel is voor de eindgebruikers. Dit is de meest directe KPI voor de continuïteit van de dienstverlening.

### KPI: Beschikbaarheidsnorm – Standaard
| Omgeving | Beschikbaarheidsnorm | Meetperiode |
| --- | --- | --- |
| Productie | Minimaal 99,5% beschikbaarheid | Per kalendermaand |
| DEV / UAT | Geen formele norm (best effort) | – |

### Berekeningsformule

Beschikbaarheid wordt berekend aan de hand van de volgende formule:

**Beschikbaarheid = ((A – B) / A) × 100%**
| Term | Definitie |
| --- | --- |
| A | Beschikbaarheidsperiode: de totale SLA-tijd minus geplande downtime en downtime veroorzaakt door de Opdrachtgever of derde partijen. |
| B | Ongeplande downtime: de tijd waarop de omgeving niet beschikbaar is voor de eindgebruikers van de website, als gevolg van een ongeplande gebeurtenis binnen de verantwoordelijkheid van iO. |

### Wat telt als downtime?

Downtime wordt gemeten via het geautomatiseerde monitoringsysteem op de overeengekomen meetpunten. De meetmethode is:

- **Beschikbaarheid:** Time to first byte — de pagina is bereikbaar wanneer de server een geldig HTTP-antwoord geeft.
- **Performance:** Full page-load tijd — als aanvullende indicator.

### KPI: Prestatieaannames

De in deze SLA vastgelegde beschikbaarheidsnorm gaat uit van de volgende normale gebruiksbelasting:

| Parameter | Norm |
| --- | --- |
| Normale belasting | 100 gelijktijdige sessies overdag, 7 dagen per week |
| Maximale piekbelasting | 300 gelijktijdige sessies op de gespecificeerde infrastructuur |

Bij structureel hogere belasting dan bovenstaande normen kan de maximaal haalbare beschikbaarheid afwijken. In dat geval wordt de Opdrachtgever geadviseerd over aanpassing van de infrastructuur.

---

# 7. Monitoring KPIs

Monitoring is de basis voor alle SLA-rapportages. Zonder betrouwbare monitoring zijn KPIs niet meetbaar. iO hanteert een vaste set meetpunten per omgevingstype. De resultaten worden maandelijks gerapporteerd en zijn tevens real-time beschikbaar via een monitoringdashboard.

### KPI: Monitoringomvang per omgeving
| Meetpunt | Omschrijving | Productie | DEV / UAT |
| --- | --- | --- | --- |
| Beschikbaarheid (uptime) | Time to first byte – is de pagina bereikbaar? | ✅ Ja | ❌ Nee |
| Performance | Full page-load tijd – hoe snel laadt de pagina volledig? | ✅ Ja | ❌ Nee |
| CPU-gebruik | Belasting van de CPU van de Azure-resources | ✅ Ja | ✅ Ja |
| Geheugengebruik | RAM-gebruik van de Azure-resources | ✅ Ja | ✅ Ja |
| Schrijfruimte (opslag) | Beschikbare en gebruikte schijfruimte | ✅ Ja | ✅ Ja |
| Externe koppelingen | Beschikbaarheid van externe webservices en integraties | ✅ Ja | ❌ Nee |
| Kosten (Azure-verbruik) | Bewaking van Azure-kosten versus budget | ✅ Ja | ✅ Ja |

### KPI: Alertingdrempels
| Niveau | Doel | Actie |
| --- | --- | --- |
| Waarschuwingsniveau | Vroegtijdige signalering; drempelwaarde wordt benaderd. | CloudOps-team wordt geïnformeerd; preventieve actie mogelijk. |
| Foutniveau (kritiek) | Drempelwaarde is overschreden; onmiddellijke actie vereist. | Automatisch incident aangemaakt; opvolging conform SLA-prioriteiten. |

### KPI: Four Golden Signals (Cloud Infrastructure)
| Signaal | Omschrijving |
| --- | --- |
| Latency | Verwerkingstijd van verzoeken (Request Service Time) |
| Traffic | Hoeveelheid vraag op het systeem (User Demand) |
| Errors | Percentage mislukte verzoeken (Failure Rate) |
| Saturation | Mate waarin het systeem op zijn grenzen zit (Overall Capacity) |

### Rapportage

De Opdrachtgever ontvangt maandelijks een **Service Level Rapportage** met een overzicht van de monitoringresultaten. Aanvullend heeft de Opdrachtgever toegang tot een live **monitoringdashboard** met de actuele KPI-indicatoren.

---

# 8. Probleembeheer

Waar incidentbeheer gericht is op het zo snel mogelijk herstellen van de dienst, richt probleembeheer zich op het structureel wegnemen van de grondoorzaak. De KPIs voor probleembeheer hebben betrekking op de termijnen waarbinnen een Root Cause Analyse (RCA) wordt opgeleverd en structurele maatregelen worden getroffen.

### KPI: Root Cause Analyse (RCA)
| Prioriteit | RCA vereist? | Termijn voor oplevering |
| --- | --- | --- |
| P1 – Kritiek | Ja – altijd verplicht | Binnen 5 werkdagen na herstel van het incident |
| P2 – Hoog | Optioneel – op verzoek van de Opdrachtgever | In overleg te bepalen |
| P3 t/m P5 | Nee – bevindingen worden vastgelegd in het ITSM-ticket | – |

### Inhoud van de RCA

De RCA voor een P1-incident bevat minimaal de volgende onderdelen:

- Beschrijving van het incident en de tijdlijn.
- Analyse van de grondoorzaak (root cause).
- Impact: welke gebruikers, systemen of processen zijn geraakt en gedurende welke periode.
- Genomen maatregelen voor het herstel.
- Structurele opvolging: aanbevelingen om herhaling te voorkomen.

Het template en de vereiste onderwerpen voor het RCA-document zijn vastgelegd in het **DAP**.

### KPI: Probleemopvolging

| Activiteit | Termijn / Norm |
| --- | --- |
| Oplevering RCA na P1-incident | Binnen 5 werkdagen na herstel |
| Registratie als Known Error (bij workaround) | Binnen 1 werkdag na sluiten incident |
| Planning van structurele oplossing | Binnen 10 werkdagen na oplevering RCA (tenzij anders overeengekomen) |

---

# 9. Security- & Software-updates

Het tijdig implementeren van beveiligings- en software-updates is een essentieel onderdeel van de beveiligde en stabiele beheerde omgeving. iO hanteert vaste implementatietermijnen, gebaseerd op de ernst van de update zoals bepaald door de door de leverancier toegekende **CVSS-score**.

### KPI: Implementatietermijnen security-updates
| Type update | CVSS-score | Maximale implementatietermijn | Meetpunt |
| --- | --- | --- | --- |
| Kritieke security-update | 9.0 – 10.0 | Binnen 1 werkdag na beschikbaarheid patch | Datum patch-beschikbaarheid |
| Niet-kritieke security-update | Lager dan 9.0 | Binnen 30 kalenderdagen na beschikbaarheid patch | Datum patch-beschikbaarheid |
| Service- of productupdate | – | In overleg met de Opdrachtgever | – |

### KPI: Maandelijkse updatecontrole

| Activiteit | Frequentie |
| --- | --- |
| Controle op beschikbare security-updates | Maandelijks |
| Controle op beschikbare service- en productupdates | Maandelijks |
| Rapportage aan Opdrachtgever over kritieke updates | Direct na constatering (dezelfde werkdag) |

### Werkwijze

- Het DTAP-proces blijft altijd van toepassing, ook bij kritieke updates: testen in DEV/UAT vóór productie-release.
- Updates worden doorbelast op nacalculatie.
- Bij een verwachte tijdsinvestering van meer dan **8 uur** wordt de Opdrachtgever vooraf geïnformeerd en is akkoord vereist.
- Een randvoorwaarde is dat er voldoende capaciteit beschikbaar wordt gesteld vanuit het delivery team.

### Releasebeleid

Updates en patches worden **niet** buiten kantooruren (werkdagen 09:00–17:00) en **niet op vrijdag** doorgevoerd, tenzij er voor de specifieke situatie expliciet schriftelijk akkoord is gegeven door de eindverantwoordelijken van zowel iO als de Opdrachtgever.

---

# 10. Uitgesloten Verstoringen

Niet alle verstoringen vallen binnen de scope van de SLA. Verstoringen die zijn veroorzaakt door factoren buiten de invloedsfeer van iO worden uitgesloten van de KPI-metingen. Dit voorkomt dat iO wordt afgerekend op omstandigheden die zij redelijkerwijs niet kan beheersen.

### Uitgesloten verstoringen – Incidentbeheer

De volgende situaties tellen **niet mee** in de KPI-meting voor reactie- en oppaktijden:

- Incidenten veroorzaakt door derde partijen of services van derde partijen waarvan de beheerde oplossing afhankelijk is (bijv. een externe betaalprovider, CDN of SaaS-platform).
- Incidenten op niet-productieomgevingen (DEV, UAT). Deze zijn niet gebonden aan de KPIs zoals beschreven in deze SLA.
- Incidenten die zijn veroorzaakt door handelingen van de Opdrachtgever of door wijzigingen die buiten het normale beheerproces zijn doorgevoerd.
- Incidenten die voortvloeien uit het niet naleven van afspraken en procedures door de Opdrachtgever.

### Uitgesloten verstoringen – Beschikbaarheid

De volgende perioden tellen **niet mee** als ongeplande downtime bij de berekening van de beschikbaarheid:

- **Geplande downtime:** Onderhoud dat vooraf is gecommuniceerd aan de Opdrachtgever en waarvoor akkoord is gegeven.
- **Downtime door derden:** Onbeschikbaarheid veroorzaakt door (web)services van derde partijen, waaronder de hostingprovider of andere externe leveranciers, buiten de invloedsfeer van iO.
- **Downtime door de Opdrachtgever:** Onbeschikbaarheid die het directe gevolg is van handelingen of nalatigheden van de Opdrachtgever.
- **Overmacht:** Onvoorziene omstandigheden buiten de redelijke invloedsfeer van iO (force majeure).

### Communicatie bij uitgesloten verstoringen

Wanneer de oorzaak van een incident bij een derde partij ligt, geldt het doorsturen van de melding (of relevante informatie) naar de Opdrachtgever als een geldige oplossing in het kader van de SLA-afspraken. iO ondersteunt de Opdrachtgever bij de communicatie richting de betreffende partij.

---

# 11. Compensatieregeling

Indien iO de afgesproken reactie- of oppaktijden niet haalt, heeft de Opdrachtgever recht op compensatie in de vorm van een korting op het maandelijks tarief. De compensatieregeling is een financieel vangnet dat de Opdrachtgever beschermt bij structurele overschrijding van de SLA-normen.

### KPI: Compensatiematrix

| Procentuele overschrijding van de reactie- of oppaktijd | Compensatie (% van het maandelijkse tarief voor dit beheerabonnement) |
| --- | --- |
| 25% – 50% overschrijding | 15% |
| 50% – 75% overschrijding | 25% |
| > 75% overschrijding | 35% |

### Maximum compensatie

De totale som van alle compensaties is per kalendermaand begrensd tot **50% van het maandelijkse tarief** van de dienstverlening onder dit beheerabonnement.

### Voorwaarden voor aanspraak

Om aanspraak te maken op compensatie, moet aan de volgende voorwaarden worden voldaan:

- De Opdrachtgever dient een **gemotiveerd schriftelijk verzoek** in bij iO.
- Dit verzoek moet worden ontvangen binnen **30 werkdagen** na het betreffende incident.
- Het incident valt binnen de scope van de SLA (zie pagina Uitgesloten Verstoringen).
- De overschrijding is aantoonbaar op basis van de ticketregistraties in het iO ticketsysteem.

### Uitkering

Een toegekende compensatie wordt verrekend als korting op de **eerstvolgende factuur** na goedkeuring van het verzoek. Compensatie wordt nooit uitbetaald als contante vergoeding.

---

