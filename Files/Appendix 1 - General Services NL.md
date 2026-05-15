# Bijlage 1: Algemene diensten

Versie 20250321

## Introductie

Wanneer het project eindigt of wanneer de Opdrachtgever wil communiceren over incidenten en prestaties buiten het lopende project, is een SLA nodig. Ook wanneer de Opdrachtgever formele toezeggingen wil over de uptime en beschikbaarheid van de infrastructuur, is een SLA nodig.

Vanuit het perspectief van de Opdrachtgever is er altijd één aanspreekpunt bij iO en uniforme afspraken over reactie- en pick-up times. In dit document wordt de SLA-definitie beschreven die van toepassing is op zowel de SLA-overeenkomsten voor applicatie en infrastructuur.

Het doel van deze Service Level Agreement (SLA) is tweeledig:

1.  Definieer de kwaliteit (Service Levels) en de diensten die door iO moeten worden uitgevoerd
    
2.  Definieer de manier van werken tussen Opdrachtgever en iO voor de implementatie van de SLA.
    

Dit document dient als bijlage bij de formele afspraken over SLA-niveaus en KPI's.

# Algemene diensten

## Servicedesk

De Servicedesk is het enige aanspreekpunt van de Opdrachtgever waar Tickets kunnen worden aangemaakt in het Ticketingsysteem van de IO. Tickets zijn gecategoriseerd als Incidenten, Serviceaanvragen, Wijzigingen, Problemen, Administratieve acties en Gebruikersvragen. Alle informatie en communicatie met betrekking tot een Ticket wordt gelogd in het Ticketingsysteem van iO. De Servicedesk coördineert het gehele proces totdat het Ticket is gesloten.

De Servicedesk verstuurt Tickets, inclusief aanvullende informatie met betrekking tot het Ticket, indien dit noodzakelijk wordt geacht:

-   CloudOps handelt infrastructuurgerelateerde tickets af.
    
-   Het applicatieteam behandelt applicatiegerelateerde tickets.
    
-   Tickets van externe leveranciers worden aangemeld bij de Opdrachtgever.
    

De contact- en procesgegevens van de Servicedesk staan vermeld in het DAP. iO maakt gebruik van een autorisatietabel voor het beheren van de autorisatie van medewerkers van Opdrachtgever: alleen medewerkers die door Opdrachtgever zijn gemachtigd, zijn gerechtigd om Tickets aan te maken. Door het vaststellen van een autorisatietabel controleert iO wie de webapplicatie beheert, en eventuele investeringen die voortvloeien uit de vragen en wensen van de aanvragers. De geautoriseerde contacten staan vermeld in de DAP.

#### Administratieve acties

iO is verantwoordelijk voor diverse Administratieve Handelingen zoals het uitgeven van Tickets, het plannen en uitvoeren (uitvoeren, testen en evalueren) van de werkzaamheden die komen kijken bij het oplossen van een Ticket.

*Tickets aanmaken*

Dit verwijst naar het administratief aanmaken van tickets bij de supportdesk en het toevoegen ervan aan de backlog en omvat de beschrijving of definitie van het op te lossen probleem, evenals het raadplegen van andere specialisten voor hun expertise en de documentatie van dat consult.

*Administratie, beheer en ondersteuning*

Alle relevante opmerkingen -- zoals beslissingen, bevindingen en taken -- moeten worden vastgelegd in het ticketlogboek (d.w.z. als opmerking of in de ticketbeschrijving). Alle medewerkers van de Opdrachtgever die van toepassing zijn, hebben een account om Tickets aan te maken in het Ticketingsysteem van iO en de nodige administratie bij te houden.

*Planning*

In overleg met de Opdrachtgever geeft iO prioriteit aan Tickets op basis van de prioritering zoals gespecificeerd in dit document en volgen bugfixes en release het reguliere releaseschema (zie "Implementatie" hieronder), op basis van de Oplostijd die overeenkomt met de prioriteit van het probleem, of in overleg met de Opdrachtgever.

*Implementatie*

Om een Ticket op te lossen, wordt over het algemeen in eerste instantie een oplossing geïmplementeerd in de testomgeving ("DEV") en/of acceptatie ("UAT"). Een Release naar de productieomgeving wordt gepland nadat de Opdrachtgever de relevante oplossingen heeft goedgekeurd. Een Ticket wordt gesloten na de Release van de coördinator naar de productieomgeving.

#### Workflow

De Servicedesk volgt de workflow zoals hieronder weergegeven.

![](media/image2.png){width="5.901388888888889in" height="0.4861111111111111in"}

Uitleg:

-   Incident -- Klant, iO of Monitoring Alert signaleert dat er een Storing is opgetreden;
    
-   Ticket -- iO wordt via de Servicedesk op de hoogte gebracht van het incident en er wordt een Ticket aangemaakt.
    
-   Response -- de tijd tussen de registratie van een incident via het ticketingsysteem van de iO en het formuleren van een eerste antwoord door het teamlid.
    
-   Planning -- de tijd die nodig is om een oplossingsoverzicht te maken;
    
-   Solution -- de tijd die nodig is om een probleem effectief op te lossen (eventueel via een Release);
    
-   Closure -- het sluiten van het ticket nadat de relevante kwestie is opgelost.
    

Een ticket wordt als opgelost beschouwd wanneer:

-   Er wordt een fix geïmplementeerd in de productieomgeving en de Azure hostingomgeving, oftewel Applicatie is (weer) beschikbaar.
    
-   Er wordt een tijdelijke oplossing toegepast zoals beschreven in dit document.
    
-   Het probleem wordt geaccepteerd zoals het is.
    

## Bewaking en alarmering

iO beschikt over een geautomatiseerd monitoringssysteem en zal de Applicatie en Infrastructuur 24/7 monitoren. Monitoring, en als gevolg daarvan alarmering, is daarom een centraal onderdeel van onderhoudsdiensten. De software waarschuwt iO per e-mail of direct message in geval van een Storing met betrekking tot de Applicatie of Infrastructuur. Deze gebeurtenissen worden behandeld als Incidenten en de uitkomsten worden gebruikt als input voor de SLA-rapportages. Er wordt monitoring uitgevoerd met betrekking tot de volgende onderwerpen:

-   het meten van serviceniveaus;
    
-   het detecteren van incidenten;
    
-   Diagnostische monitoring om de oorzaak van eventuele incidenten en problemen te achterhalen;
    
-   Monitoring van infrastructuur resources;
    
-   Monitoring van performance;
    
-   Bewaking van de uptime.
    

De monitoring van de infrastructuur van iO biedt een dashboard om relevante indicatoren voor de beheerde infrastructuur bij te houden, inclusief endpoint monitoring voor specifieke URL's.

Bovendien wordt een waarschuwingsmechanisme geactiveerd wanneer bewaakte KPI's de overeengekomen drempels overschrijden: drempelwaarden op waarschuwingsniveau worden geconfigureerd voor vroege waarschuwingen en preventieve acties; drempels op foutniveau worden geconfigureerd voor situaties die onmiddellijke aandacht vereisen. Waarschuwingen worden afgehandeld door het CloudOps-team van iO, waarbij problemen worden geprioriteerd op basis van de ernst ervan, zoals beschreven in dit document. De monitoringdienst zal als volgt worden uitgevoerd.

-   Productieomgeving:
    
    -   Het meten van de toegankelijkheid van pagina's (beschikbaarheid -- time to first byte);
        
    -   Het meten van de laadtijd van pagina's in zijn geheel (performance -- full page-load);
        
    -   Het meten van het gebruik van Azure Resources (CPU, geheugen, schrijfruimte);
        
    -   Het meten van de beschikbaarheid van externe links (zoals webservices van derden, enzovoort).
        
-   Testen (DEV) en Acceptatie (UAT) omgevingen:
    
    -   Het meten van het gebruik van Azure Resources (CPU, geheugen, schrijfruimte).

Inzichten in Uptime en alerts worden beschikbaar gesteld aan de Opdrachtgever door toegang te bieden tot een dashboard met afgesproken KPI's. De monitoringsresultaten dienen als input voor Service Level Reporting.

## Proactief onderhoud

Om de hoeveelheid ongeplande downtime te minimaliseren en de kans op verstoringen te verkleinen, voert iO proactief applicatie- en infrastructuuronderhoud uit, beheert de applicatie en infrastructuur en identificeert problemen die in een vroeg stadium tot toekomstige verstoringen kunnen leiden. Bevindingen zullen worden omgezet in maatregelen en acties (meestal resulterend in Tickets) om Incidenten die zich in de toekomst kunnen voordoen te voorkomen of op te lossen, of om maatregelen en acties te ondernemen om het huidige gebruik van de Applicatie en Infrastructuur verder te optimaliseren. iO voert de hieronder opgesomde proactieve onderhoudswerkzaamheden uit om de Beschikbaarheid en veiligheid (te beschrijven in paragraaf 2.3) van de Applicatie te waarborgen:

-   Beheren van CMS-instellingen, zoals CMS-(gebruikers)rechten;
    
-   Het monitoren van CMS- en applicatielogbestanden op terugkerende berichten;
    
-   Monitoring van database- en applicatielogbestanden voor terugkerende berichten;
    
-   Het wissen van de servercache en andere tijdelijke gegevens;
    
-   Specifieke controles op externe koppelingen, processen en andere op maat gemaakte functionaliteit;
    
-   Handelen op basis van meldingen of input van andere partijen (inclusief maar niet beperkt tot monitoring);
    
-   Het opstellen van voorstellen om een applicatie te verbeteren op het gebied van servercapaciteit, platformsnelheid, performance, Beschikbaarheid en kwaliteit.
    

Daarnaast worden resources gemonitord om het kostenaspect van (Azure) resources te beheersen en resources te identificeren die kostenefficiënter kunnen zijn. Ten slotte wordt de release van nieuwe toepasselijke (Azure) resources en functies continu bewaakt en geëvalueerd in een periodieke gezondheidscontrole van de beheerde infrastructuur, waarbij de volgende onderwerpen aan bod komen:

-   Security center;
    
-   Azure monitor;
    
-   Cost review.
    

iO zal de Opdrachtgever adviseren op basis van monitoring van middelen en verbeteringen of kostenbesparingen voorstellen; de daaruit voortvloeiende gewenste wijzigingen worden als Tickets in de Servicedesk geregistreerd en geadresseerd volgens het wijzigingsbeheerproces.

iO behoudt zich het recht voor om in geval van noodsituaties zoals mogelijke veiligheidsrisico's of lekken proactieve activiteiten uit te voeren zonder Opdrachtgever vooraf te informeren. iO zal Opdrachtgever echter zo spoedig mogelijk informeren over de werkzaamheden en de verwachte duur daarvan.

## Systeem- en software-updates

De online omgeving bestaat uit verschillende soorten standaard software, waaronder een CMS, Database servers en een Operating System, waarvoor regelmatig updates zullen worden uitgebracht.

De infrastructuur wordt geïmplementeerd op Microsoft Azure-webapps. Dit betekent dat updates (Windows, IIS en SQL) door Microsoft zelf worden getest en geïnstalleerd.

iO voert maandelijks controles uit om vast te stellen of er beveiligings-, service- of productupdates zijn vrijgegeven voor de onderdelen waarvoor iO verantwoordelijk is. iO onderzoekt de implicaties van een update van de betreffende Software. De procesvolgorde is afhankelijk van het type update, mogelijke beveiligingsrisico's en mogelijke impact op de applicatie en infrastructuur.

De volgende SLA voor beveiligingsupdates is van toepassing op het uitvoeren van systeem- en software-updates:

| **Type update** | **Berichtgeving** | **Implemented** |
| --- | --- | --- |
| Zeer kritieke beveiligingsupdate | Maandelijks | Maximaal één werkdag na Release |
| Niet-kritieke beveiligingsupdate | Maandelijks | Maximaal een maand na Release |
| Update van de dienst | Maandelijks | In overleg |
| Productupdate / upgrades | Maandelijks | In overleg |

Leveranciers van de standaard software rapporteren over de prioriteit van een beveiligingsupdate en categoriseren deze in twee categorieën:

-   Zeer kritieke beveiligingsupdate -- dit zijn beveiligingsupdates die een beveiligingsprobleem oplossen dat een grote impact kan hebben.
    
-   Niet-kritieke beveiligingsupdates -- dit zijn beveiligingsupdates die beveiligingsproblemen oplossen die een lage impact hebben.
    

iO monitort (beveiligings)updates en de capaciteit die nodig is om deze uit te voeren. Wanneer een update beschikbaar komt, beoordeelt iO de urgentie waarmee deze moet worden geïmplementeerd ten aanzien van de betreffende Applicatie en/of Infrastructuur.

In het geval van een zeer kritieke beveiligingsupdate zal iO Opdrachtgever onmiddellijk na ontdekking op de hoogte stellen en de impactanalyse met Opdrachtgever bespreken. Als onderdeel van dit voorstel worden de zeer kritieke beveiligingsupdates onmiddellijk geïmplementeerd om ervoor te zorgen dat de update zo snel mogelijk wordt geïmplementeerd om de beveiliging en beschikbaarheid van de relevante applicatie te herstellen.

Andere updates worden als volgt behandeld:

-   Niet-kritieke beveiligingsupdates en regelmatige onderhoudsupdates worden geïmplementeerd via het wijzigingsbeheerproces;
    
-   Het implementeren van productupdates en/of productupgrades is optioneel en zal als project of onderdeel van een SOW aan de Opdrachtgever worden voorgelegd.
    

De implementatie van beveiligingsupdates en essentiële service-updates is noodzakelijk om de veiligheid en beschikbaarheid van de applicaties te waarborgen en de Opdrachtgever mag deze niet belemmeren.

Vereiste beveiligings- en service-updates vinden plaats met betrekking tot de volgende onderdelen:

-   De CMS-uitrol via de DEV-, UAT- en Productie-omgevingen;
    
-   Het besturingssysteem van virtuele machines dat wordt uitgerold in de DEV-, UAT- en Productie-omgevingen;
    
-   Databases worden uitgerold via de DEV-, UAT- en Productie-omgevingen.
    
-   Service- en productupdates worden behandeld als een wijziging en de wijziging wordt geïmplementeerd via de wijzigingsbeheerprocessen. In deze gevallen wordt een offerte uitgebracht voor de uitvoering.
    

## Beheer van incidenten

Incident management omvat het afhandelen en oplossen van eventuele ongeplande verstoringen in een vooraf goedgekeurd (deel van de) Applicatie of Infrastructuur. Incidenten worden geprioriteerd en afgehandeld op basis van de in dit document beschreven prioritering.

Wanneer de Opdrachtgever een incident identificeert tijdens het gebruik van de applicatie(s) die worden uitgevoerd op de Azure-hostingomgeving, moet een ticket worden aangemaakt. Voor Incident Management wordt met het volgende rekening gehouden:

-   Tickets kunnen alleen worden aangemaakt door een selecte groep geautoriseerde medewerkers van de Opdrachtgever die Tickets kunnen aanmaken;
    
-   Regelmatige communicatie met betrekking tot een Ticket verloopt in de eerste plaats via het Ticketingsysteem van iO.
    
-   Incidenten die als P1 (Kritiek) worden beschouwd en worden gevonden door geautoriseerde medewerkers, worden altijd rechtstreeks telefonisch gemeld aan het Service Desk-team volgens het Servicevenster. Voor problemen op P2-niveau (Hoog) is telefonisch contact aan te raden.
    
-   Bij het melden van een Incident of het melden van een Probleem, verstrekt de Opdrachtgever voorbeeldinformatie en instructies om het probleem te reproduceren, evenals stappen die al zijn genomen om het probleem op te lossen (ongeacht de resultaten).
    
-   Om een specifiek Incident op te lossen, kan een Wijziging in de Applicatie of Infrastructuur vereist zijn, in welk geval de Wijziging zal worden doorgevoerd via het wijzigingsbeheerproces (paragraaf 2.2.6);
    
-   Van de Opdrachtgever wordt verwacht dat hij meewerkt aan het zoeken naar een oplossing voor elk gemeld incident of probleem waarbij hun ondersteuning nodig is.
    

Incidenten worden aangemaakt als een Ticket in de Service Management Tool van iO en vervolgens toegewezen aan het CloudOps-team en/of het verantwoordelijke applicatieteam van iO. Bij twijfel kunnen issues altijd worden toegewezen aan het CloudOps-team, waarna het CloudOps-team de impact van het issue zal bepalen en indien nodig zal toewijzen aan het verantwoordelijke ontwikkelingsteam.

### Prioritering

iO maakt onderscheid tussen de volgende vijf (5) prioriteitsniveaus met het oog op het oplossen van problemen: Critical, High, Normal, Minimal en Trivial. Elk prioriteitsniveau heeft zijn eigen reactietijd en oplossingstijd. Alle niveaus volgen dezelfde procedure van optreden tot sluiting. De servicecoördinator van iO houdt de Opdrachtgever op de hoogte tijdens deze servicedeskprocedure.

| Urgentie / Impact | Hoog | Gemiddeld | Laag |
| --- | --- | --- | --- |
| **Hoog** | 1 – Critical\* | 2 - High | 3 - Normal |
| **Gemiddeld** | 2 - High | 3 - Normal | 4 - Minimal |
| **Laag** | 3 - Normal | 4 - Minimal | 5 - Trivial |

**Impact (kolommen)**

- **Hoog:** Potentieel risico op grootschalige reputatieschade en/of financiële schade.
- **Gemiddeld:** Beperkte impact, vaak beperkt tot een selectief aantal gebruikers.
- **Laag:** Impact is alleen aantoonbaar voor een enkele gebruiker.

**Urgentie (rijen)**

- **Hoog:** Het primaire bedrijfsproces is geblokkeerd in een productieomgeving en een tijdelijke oplossing is niet mogelijk.
- **Gemiddeld:** Bepaalde elementen zijn minder functioneel, maar er zijn work-arounds mogelijk.
- **Laag:** Klein ongemak zonder noemenswaardige impact op de productiviteit.

*\* Incidenten met Critical Priority dienen altijd telefonisch te worden gemeld nadat ze zijn geïdentificeerd en aangekaart bij de Servicedesk. Prioriteit 1 -- kritieke incidenten buiten kantooruren moeten telefonisch worden gemeld via het noodnummer dat is vermeld in de DAP.*

De prioriteit van een incident wordt bepaald door de vertegenwoordiger van de Opdrachtgever die het probleem aan de orde stelt, en indien nodig, in overleg met de vertegenwoordiger van de iO die het probleem ontvangt. Indien na een eerste analyse wordt vastgesteld dat de Prioriteit moet worden aangepast, zal iO contact opnemen met Opdrachtgever en de Prioriteit na overleg aanpassen. Incidenten met triviale of minimale prioriteit worden toegevoegd aan de productbacklog van het Application Team.

## Third-party beheer

Bij het onderhoud van de relevante omgevingen en apps zijn meerdere partijen betrokken. De Opdrachtgever zal voor die partijen het eerste aanspreekpunt zijn wanneer Incidenten worden gemeld. De Opdrachtgever beoordeelt eventuele Incidenten en stuurt deze door naar de iO wanneer dit nodig wordt geacht. Indien iO vaststelt dat er toch een Derde nodig is om het Incident op te lossen, zal iO dit aan Opdrachtgever kenbaar maken.

## Probleembeheer

Probleembeheer omvat al het werk dat nodig is om de hoofdoorzaak van twee of meer incidenten goed te diagnosticeren en het vinden van een oplossing of structurele workaround voor deze oorzaken, die worden geïmplementeerd via de Change Management-processen. In dit verband zal waar nodig de hulp worden ingeroepen van partners, leveranciers en aangesloten derden. Het detecteren en elimineren van repetitieve incidenten kan de kwaliteit van de dienstverlening verbeteren.

## Verandermanagement

Het gaat hier om technische en/of functionele aanpassingen om de Infrastructuur en/of Applicatie verder te verbeteren. Aanpassingen omvatten het implementeren, testen en bijwerken van documentatie naast project- en releasemanagement.

Voor het doorvoeren van Wijzigingen maakt iO (uren)inschattingen en levert deze als voorstel aan Opdrachtgever. Indien Opdrachtgever akkoord gaat met de inschatting, stelt iO een Statement of Work (SOW) of een inschatting op in de Service Management Tool van iO en na goedkeuring wordt de planning in overleg met Opdrachtgever afgestemd. Opdrachtgever en iO kunnen overeenkomen om meerdere wijzigingen te combineren en deze samen te voegen tot één SOW of schatting.

## Support

iO voert supportactiviteiten reactief uit, met als doel het oplossen van Problemen met de Infrastructuur en/of Applicatie, en het ondersteunen van medewerkers van Opdrachtgever bij het gebruik van de Applicatie. iO zorgt voor de beschikbaarheid ervan in functie van urgentie en impact (zie paragraaf 3.6.1), zodat opgehaalde Tickets kunnen worden opgelost.

### Informatiebeveiliging

De bedrijfsvoering van iO is ingericht in overeenstemming met ISO 27001. iO ziet toe op continue verbetering van de manier waarop wordt omgegaan met vertrouwelijkheid, beschikbaarheid en gegevensintegriteit - denk bijvoorbeeld aan de bescherming van persoons- en bedrijfsgegevens of bescherming tegen indringing van hackers.

### Security Team

Applicaties van Opdrachtgever vallen onder toezicht van het Security Team van iO. Dit team bestaat uit ervaren medewerkers van iO uit de verschillende teams onder leiding van de Security Officer van iO. Het Security Team is verantwoordelijk voor de beveiliging van applicaties en infrastructuur. Het Security Team evalueert beveiligingsincidenten en verbetert waar nodig procedures in overleg met Klant. Verder signaleert het Security Team nieuwe ontwikkelingen en dreigingen en bespreekt deze waar nodig met de klant.

### Service Management

Alle bovengenoemde ondersteunende activiteiten worden gecoördineerd door de Support Coördinator, binnen de met elkaar gemaakte afspraken. De Support Coördinator is het aanspreekpunt voor de Opdrachtgever voor alle zaken die van invloed zijn op het beheer van de omgeving.

### Onderhoud OTAP

iO zorgt voor een goed werkende OTAP-omgeving zodat er professioneel gewerkt kan worden aan de applicatie en de applicatie betrouwbaar beschikbaar wordt gesteld voor het beoogde gebruik. Wanneer er werkzaamheden opgeleverd moeten worden, bijvoorbeeld vanwege een Incident, een Security Update of Change, maakt de OTAP-omgeving het mogelijk om het werk op de applicatie efficiënt en betrouwbaar te deployen en te testen. De verschillende omgevingen moeten identiek zijn in zowel architectuur als data.

Ook zal de Opdrachtgever regelmatig een wijzigingsverzoek (op basis van T&M) indienen bij iO om de inhoud van de productieomgeving over te zetten naar de acceptatieomgeving. Als de inhoud persoonsgegevens bevat, worden deze vooraf geanonimiseerd.

# Beschikbare Service Levels

## Beschikbare Service Levels

### Openingsuren

De openingstijden van de Servicedesk zijn afhankelijk van het SLA-niveau. De volgende opties zijn beschikbaar.

| Openingsuren | Definitie |
| --- | --- |
| Business hours | Doordeweeks van 09:00 tot 17:00 uur |
| Extended business hours | Doordeweeks van 08:00 tot 22:00 uur |
| 7 dagen | Alle dagen van 08:00 tot 22:00 uur |
| 24x7 | Alle dagen alle uren |

De geldende openingstijden zijn afhankelijk van het afgesproken serviceniveau zoals beschreven in onderstaande tabel.

| Dienstniveau | Openingsuren |
| --- | --- |
| Basic | Business hours voor alle prioriteiten |
| Plus | Business hours voor alle prioriteiten |
| Pro | Extended business hours voor P1; business hours voor andere prioriteiten |
| Pro+ | 7 dagen voor P1; 24x7 add-on beschikbaar; business hours voor andere prioriteiten |

Voor het Pro+ serviceniveau op infrastructuur is een add-on beschikbaar om 7 dagen te upgraden naar 24x7. Met de 24x7-add-on ontvangt het Azure CloudOps-team 24 uur per dag, 7 dagen per week kritieke waarschuwingen van de infrastructuurbewaking en wordt er op gereageerd zodra ze worden ontvangen. Daarnaast is iO buiten de openingstijden van de Servicedesk bereikbaar voor kritieke zaken. Het 24x7 team herstelt de beschikbaarheid door resources, services en databases opnieuw op te starten. Code- en CMS-aanpassingen of het doorvoeren van Wijzigingen zijn niet inbegrepen. Opdrachtgever stelt iO 24x7 contactpersoon ter beschikking die verantwoordelijk is voor de goedkeuring van de Reparatie. Problemen met een oorzaak die buiten de span of control van het 24x7-team valt, worden de volgende werkdag door het applicatieteam afgehandeld.

### Reactietijd

Reactietijden en Oplostijden zijn van toepassing per Ticket en tijdens de Service Window, te beginnen op het moment dat een Ticket is aangemaakt. De prioriteit wordt bepaald op basis van urgentie en impact, zoals elders beschreven in dit document.

De oplossingstijd wordt gemeten als de pick-up time. iO zal er alles aan doen om het incident binnen de oplostijd op te lossen, maar kan alleen de pick-up time garanderen.

De onderstaande tabellen definiëren de variaties in de reactie- en oplossingstijd per Service Level.

**Basic**

| Priority | Response time | Resolution time |
| --- | --- | --- |
| 1 - Critical | Best effort | Best effort |
| 2 - High | Best effort | Best effort |
| 3 - Normal | Best effort | Best effort |
| 4 - Minimal | Best effort | Best effort |
| 5 - Trivial | Best effort | Best effort |

**Plus**

| Priority | Response time | Resolution time |
| --- | --- | --- |
| 1 - Critical | 4 uur | 3 werkdagen |
| 2 - High | 8 uur | 4 werkdagen |
| 3 - Normal | 16 uur | 6 werkdagen |
| 4 - Minimal | Best effort | Best effort |
| 5 - Trivial | Best effort | Best effort |

**Pro**

| Priority | Response time | Resolution time |
| --- | --- | --- |
| 1 - Critical | 2 uur | 2 werkdagen |
| 2 - High | 4 uur | 3 werkdagen |
| 3 - Normal | 8 uur | 5 werkdagen |
| 4 - Minimal | Best effort | Best effort |
| 5 - Trivial | Best effort | Best effort |

**Pro+**

| Priority | Response time | Resolution time |
| --- | --- | --- |
| 1 - Critical | 30 minuten | 4 uur |
| 2 - High | 2 uur | 8 uur |
| 3 - Normal | 8 uur | 3 werkdagen |
| 4 - Minimal | 2 werkdagen | Best effort |
| 5 - Trivial | Best effort | Best effort |

Bij het oplossen van een kritiek Incident informeert iO Opdrachtgever regelmatig op tactisch en operationeel niveau over de voortgang, tenzij schriftelijk anders is overeengekomen tussen iO en Opdrachtgever. In overleg met elkaar spreken beide partijen de updatefrequentie af bij aanvang van een Incident.

Wanneer de oorzaak van een Incident bij een derde partij ligt en daarom buiten het bereik van iO valt, wordt het doorgeven van het Incident (of informatie over dat Incident) aan Opdrachtgever ook beschouwd als een oplossing in het kader van de overeengekomen Service Levels.

### Monitoring

Applicatiemonitoring is altijd een implementatie op maat die afhankelijk is van de oplossing en de behoeften van de klant. Infrastructuurmonitoring is altijd opgenomen in de SLA van de infrastructuur. De implementatie en mogelijkheden verschillen per serviceniveau.

| Dienstniveau | Toezicht op de uitvoering |
| --- | --- |
| Basic | Infrastructuur wordt gemonitord met behulp van golden metrics |
| Plus | Infrastructuur wordt gemonitord met behulp van golden metrics. Een monitoringoverzicht wordt toegevoegd aan het servicerapport. |
| Pro | Infrastructuur wordt bewaakt met behulp van golden metrics. Endpoint monitoring wordt toegevoegd voor de hoofd-URL. Een monitoringoverzicht wordt toegevoegd aan het servicerapport. |
| Pro+ | Infrastructuur wordt gemonitord met behulp van golden metrics. Endpoint monitoring wordt toegevoegd voor belangrijke URL's. Een monitoringoverzicht wordt toegevoegd aan het servicerapport. Een live monitoringdashboard kan beschikbaar worden gesteld. |

### Beschikbaarheid

De beschikbaarheid van de applicatie is afhankelijk van zowel de infrastructuur als het gedrag van de applicatie. De beschikbaarheid van applicaties is altijd een op maat gemaakte implementatie die afhankelijk is van de oplossing en de behoeften van de klant. Infrastructuurmonitoring is standaard opgenomen in de SLA voor infrastructuur. De implementatie en mogelijkheden verschillen per serviceniveau.

| Dienstniveau | Beschikbaarheid |
| --- | --- |
| Basisch | iO streeft naar een minimale beschikbaarheid van 99% op jaarbasis. |
| Plus | iO zal op maandbasis een beschikbaarheid van minimaal 99,5% realiseren. |
| PRO | iO zal op maandbasis een beschikbaarheid van minimaal 99,7% realiseren. |
| Pro+ | iO zal op maandbasis een beschikbaarheid van minimaal 99,7% realiseren. |

De beschikbaarheid voor elk serviceniveau veronderstelt een infrastructuur die voldoet aan de uptime-verwachtingen. Wanneer de infrastructuur niet op één lijn ligt met de uptime voor de overeengekomen SLA, kan de maximale uptime-garantie lager zijn dan gedefinieerd voor de SLA.

De berekening van de hierboven gespecificeerde beschikbaarheid is altijd gebaseerd op de hieronder beschreven formule.

$$Availability = \\frac{Measurement\\ period - Unplanned\\ Unavailability}{Measurement\\ period}\\ X\\ 100%$$

De *Meetperiode* wordt berekend als SLA maal minus geplande downtime en downtime veroorzaakt door Opdrachtgever en/of enige andere partij.

*Ongeplande onbeschikbaarheid* is het moment waarop de omgeving ongepland niet beschikbaar is voor websitebezoekers.