# Applicatie Dienstverlening

Dit document beschrijft de **Applicatie Managed Services** die iO levert als onderdeel van de managed services propositie. Het doel van applicatiebeheer is de online omgeving te allen tijde beschikbaar te houden voor de gebruikers en het aantal incidenten en verstoringen tot een minimum te beperken.

---

# 1\. Introductie – Applicatiebeheer

Applicatiebeheer door iO richt zich op het **dagelijks beschikbaar houden** van de online omgeving van de klant. Door proactief en reactief beheer te combineren, wordt de continuïteit van de weboplossing gewaarborgd en wordt het aantal incidenten en verstoringen tot een minimum beperkt.

### Wat is applicatiebeheer?

Applicatiebeheer omvat alle activiteiten die nodig zijn om een applicatie of website operationeel, veilig en performant te houden. iO onderscheidt twee typen beheer:

-   **Proactief applicatiebeheer** – Preventieve werkzaamheden om verstoringen te voorkomen voordat ze zich voordoen. Denk aan het controleren van logbestanden, monitoren van de omgeving en het uitvoeren van software-updates.
    
-   **Reactief applicatiebeheer** – Het opvangen en oplossen van verstoringen, gebruikersvragen en wijzigingsverzoeken zodra deze zich voordoen.
    

### Wat valt buiten de scope?

Applicatiebeheer richt zich uitsluitend op het in stand houden van de bestaande omgeving. De volgende activiteiten vallen **buiten** de scope van het standaard beheercontract:

-   Het doorvoeren van codewijzigingen en nieuwe functionaliteit (doorontwikkeling).
    
-   Releasemanagement voor nieuwe versies of major updates.
    
-   Deployments buiten de openingstijden van de Service Desk.
    

### Gelaagde verantwoordelijkheid

Applicatiebeheer bestaat binnen een gelaagde verantwoordelijkheidsstructuur:

| Onderdeel | Verantwoordelijke |
| --- | --- |
| Infrastructuur, Netwerk, Hardware, OS | Hostingprovider |
| Standaard Software, Website, CMS, Changes & Project | iO |
| Functioneel Beheer, Content Beheer, Ondersteuning eindgebruikers | Opdrachtgever |

### Relatie met de SLA

De kwaliteit van de applicatiebeheer dienstverlening wordt formeel geborgd via de Service Level Agreement (SLA). De SLA legt vast binnen welke normen iO de diensten levert: reactietijden, beschikbaarheidsdoelstellingen en de prioritering van incidenten. De Service Levels worden alleen nagekomen indien de overeengekomen afspraken en procedures door beide partijen worden nageleefd.

---

# 2\. Servicedesk

De **Servicedesk** is het enige en centrale aanspreekpunt voor de Opdrachtgever voor alles wat met het beheer van de applicatie te maken heeft. Alle meldingen, vragen en verzoeken worden via de Servicedesk ingediend en gecoördineerd totdat het ticket is afgesloten.

### Ticketcategorieën

Meldingen worden door iO gecategoriseerd als één van de volgende tickettypes:

-   **Incident** – Een ongeplande verstoring van de applicatie of infrastructuur.
    
-   **Serviceaanvraag** – Een verzoek om een standaarddienst of -handeling.
    
-   **Wijziging (Change)** – Een technische of functionele aanpassing aan de omgeving.
    
-   **Probleem** – Een terugkerend of structureel incident dat om een grondoorzaakanalyse vraagt.
    
-   **Administratieve actie** – Beheertaken zoals planning, uitvoering, testen en evaluatie.
    
-   **Gebruikersvraag** – Een informatieve vraag van een eindgebruiker.
    

### Hoe werkt het ticketproces?

Elke melding doorloopt de volgende stappen:

1.  **Aanmaken** – Een geautoriseerde medewerker van de Opdrachtgever maakt een ticket aan in het ticketingsysteem van iO.
    
2.  **Analyse & registratie** – De Servicedesk analyseert de melding, kent een prioriteit toe en legt alle informatie vast in het ticketlogboek.
    
3.  **Routing** – Het ticket wordt doorgezet naar het juiste team:
    

-   Infrastructuurgerelateerde tickets → CloudOps-team.
    
-   Applicatiegerelateerde tickets → Applicatieteam.
    
-   Tickets van externe leveranciers → worden aangemeld bij de Opdrachtgever.
    

4.  **Planning** – Tickets worden ingepland op basis van prioriteit en het reguliere releaseschema.
    
5.  **Uitvoering & testen** – Oplossingen worden eerst getest in de DEV/UAT-omgeving, waarna een productie-release plaatsvindt na goedkeuring van de Opdrachtgever.
    
6.  **Afsluiting** – Een ticket wordt als opgelost beschouwd bij een fix in productie, een geaccepteerde tijdelijke oplossing (workaround), of expliciete acceptatie van het probleem door de Opdrachtgever.
    

### Autorisatie

iO hanteert een **autorisatietabel**. Alleen medewerkers van de Opdrachtgever die expliciet zijn gemachtigd, mogen tickets aanmaken. Dit geeft de Opdrachtgever controle over wie invloed uitoefent op de applicatie en de bijbehorende kosten. De geautoriseerde contactpersonen worden vastgelegd in het **DAP (Dossier Afspraken en Procedures)**.

### Communicatie

Alle communicatie over een ticket verloopt primair via het ticketingsysteem. Bij **P1-incidenten (Kritiek)** dient de melding — naast registratie in het systeem — altijd ook telefonisch te worden doorgegeven aan de Servicedesk, conform het in de DAP vastgelegde noodnummer en servicevenster.

---

# 3\. Incidentbeheer

**Incidentbeheer** is het proces dat verantwoordelijk is voor het oppakken en verhelpen van ongeplande verstoringen ten opzichte van een eerder goedgekeurde werking van de applicatie of infrastructuur. Incidenten worden geprioriteerd en afgehandeld conform de afspraken in de SLA.

### Wanneer is er sprake van een incident?

Een incident is elke ongeplande verstoring of verslechtering van de werking van de applicatie of de onderliggende infrastructuur. Voorbeelden zijn: een onbereikbare website, een falende integratie, of een aanzienlijk prestatieverlies.

### Prioritering

De prioriteit van een incident wordt bepaald op basis van twee dimensies: de **impact** (hoeveel gebruikers of processen worden geraakt) en de **urgentie** (hoe snel moet het worden opgelost). Dit leidt tot vijf prioriteitsniveaus:

| Prioriteit | Omschrijving |
| --- | --- |
| P1 – Kritiek | Grootschalig risico; de applicatie is volledig onbereikbaar of een kritiek proces is uitgevallen. Altijd telefonisch melden. |
| P2 – Hoog | Beperkte impact; een belangrijke functionaliteit werkt niet correct. Telefonisch contact wordt aanbevolen. |
| P3 – Gemiddeld | Matige impact; een functionaliteit werkt niet optimaal, maar een workaround is beschikbaar. |
| P4 – Laag | Lage impact; slechts één gebruiker of een niet-kritiek onderdeel wordt geraakt. |
| P5 – Minimaal/Triviaal | Verwaarloosbare impact; wordt toegevoegd aan de productbacklog van het applicatieteam. |

De initiële prioriteit wordt bepaald door de medewerker van de Opdrachtgever die het incident meldt, eventueel in overleg met de iO-vertegenwoordiger. Als na een eerste analyse blijkt dat de prioriteit moet worden bijgesteld, neemt iO contact op met de Opdrachtgever.

### Workarounds

Indien een definitieve oplossing niet direct mogelijk is, biedt iO een **tijdelijke oplossing (workaround)** aan. Details over de workaround worden geregistreerd als Known Error. Een workaround geldt als afdoende middel om het incident te verhelpen; de definitieve structurele oplossing wordt daarna via het wijzigingsbeheerproces ingepland.

### Wat te vermelden bij een melding?

Bij het melden van een incident verstrekt de Opdrachtgever:

-   Voorbeeldinformatie en stappen om het probleem te reproduceren.
    
-   Een overzicht van stappen die al zijn ondernomen om het probleem op te lossen.
    

### Kosten

Incidentbeheer is inbegrepen in de vaste maandelijkse beheerinvestering. De Opdrachtgever betaalt geen extra vergoedingen voor de afhandeling van incidenten. De werkwijze en processen zijn verder uitgewerkt in het **DAP**.

---

# 4\. Proactief Applicatiebeheer

Voorkomen is beter dan genezen. Door actief beheer op de applicatie uit te voeren, signaleert iO in een vroeg stadium zaken die in de toekomst tot verstoringen kunnen leiden — en onderneemt tijdig actie. **Proactief applicatiebeheer** heeft tot doel de werking, beschikbaarheid en veiligheid van de applicatie continu te waarborgen.

### Wat doet iO proactief?

De volgende werkzaamheden worden door iO structureel en proactief uitgevoerd:

-   Controle op de inrichting van het CMS en de daarin vastgelegde (gebruikers)rechten.
    
-   Controle van de logbestanden van het CMS, de applicatie en databases op terugkerende meldingen of afwijkingen.
    
-   Controle van logbestanden van virtuele machines ten behoeve van databases en de applicatie.
    
-   Opschonen van de servercache en overige tijdelijke gegevens.
    
-   Specifieke controles op externe koppelingen, processen en maatwerkfunctionaliteiten.
    
-   Acteren op meldingen of input van derde partijen (waaronder maar niet beperkt tot monitoringtools).
    
-   Opstellen van voorstellen ter verbetering van de applicatie op het gebied van servercapaciteit, performance, beschikbaarheid en kwaliteit.
    

### Van bevinding naar actie

Wanneer proactief onderhoud leidt tot een bevinding, wordt deze omgezet in een concrete maatregel of actie. Dit resulteert doorgaans in een ticket in de Service Management Tool, dat vervolgens wordt opgepakt binnen de afgesproken werkwijze rondom doorontwikkeling of wijzigingsbeheer.

Bij noodsituaties — waarbij direct handelen noodzakelijk is om schade te voorkomen — kan iO proactieve acties uitvoeren zonder voorafgaande afstemming met de Opdrachtgever. iO informeert de Opdrachtgever in dat geval zo snel mogelijk achteraf.

### Periodieke gezondheidscontrole

Naast de dagelijkse beheeractiviteiten voert iO periodiek een bredere gezondheidscontrole uit op de beheerde omgeving. Dit omvat onder andere:

-   Security Center review
    
-   Azure Monitor analyse
    
-   Cost Review
    

De bevindingen en adviezen worden gedeeld met de Opdrachtgever, met concrete aanbevelingen voor verbeteringen of kostenbesparingen.

---

# 5\. Monitoring & Alerting

iO monitort de applicatie en de onderliggende infrastructuur **24/7 via een geautomatiseerd systeem**. Monitoring zorgt voor vroegtijdige signalering van verstoringen en afwijkingen, zodat er snel en gericht actie kan worden ondernomen — vaak nog voordat de Opdrachtgever iets merkt.

### Wat wordt gemonitord?

De monitoring dekt de volgende aspecten van de omgeving:

-   **Beschikbaarheid (uptime)** – Time to first byte van de productieomgeving.
    
-   **Performance** – Full page-load tijd van de productieomgeving.
    
-   **Azure Resources** – CPU-gebruik, geheugengebruik en schrijfruimte (productie én DEV/UAT).
    
-   **Externe koppelingen** – Beschikbaarheid van externe webservices en integraties.
    
-   **Applicatie- en CMS-logboeken** – Terugkerende foutmeldingen of afwijkingen.
    
-   **Incidentdetectie** – Automatische signalering van verstoringen op basis van drempelwaarden.
    

### Hoe werkt alerting?

Het waarschuwingsmechanisme activeert automatisch wanneer een KPI-drempel wordt overschreden. Er zijn twee niveaus:

-   **Waarschuwingsniveau** – Een eerste signaal dat een drempelwaarde wordt benaderd. Het CloudOps-team wordt geïnformeerd en beoordeelt de situatie.
    
-   **Foutniveau** – Een kritieke drempelwaarde is overschreden. Het CloudOps-team handelt direct op basis van de ernst van de melding en de afgesproken SLA-prioriteiten.
    

### Dashboard en rapportage

De Opdrachtgever krijgt toegang tot een **dashboard** met de afgesproken KPI's en monitoringresultaten. Dit dashboard biedt inzicht in de actuele staat van de omgeving en dient tevens als input voor de periodieke **Service Level Rapportage**.

### Omgevingen

| Omgeving | Wat wordt gemonitord? |
| --- | --- |
| Productie | Beschikbaarheid, performance, Azure Resources, externe koppelingen |
| DEV / UAT | Azure Resources (CPU, geheugen, schrijfruimte) |

---

# 6\. Wijzigingsbeheer

**Wijzigingsbeheer** omvat alle gewenste technische en/of functionele aanpassingen aan de applicatie of infrastructuur. Het doel is om wijzigingen gecontroleerd, getest en gedocumenteerd door te voeren, zodat de stabiliteit en beschikbaarheid van de omgeving niet in gevaar komen.

### Wat valt onder wijzigingsbeheer?

Wijzigingen kunnen betrekking hebben op:

-   Technische aanpassingen aan de software of infrastructuur.
    
-   Functionele verbeteringen of uitbreidingen van de applicatie.
    
-   Het implementeren van beveiligings- of service-updates (zie ook pagina Systeem- en Software-updates).
    
-   Aanpassingen die voortvloeien uit proactief applicatiebeheer of probleembeheer.
    

### Hoe verloopt het wijzigingsproces?

Elke wijziging doorloopt een gecontroleerd proces:

1.  **Aanvraag** – De Opdrachtgever of iO dient een wijzigingsverzoek in via de Service Management Tool.
    
2.  **Beoordeling & planning** – iO beoordeelt de wijziging op impact, prioriteit en haalbaarheid, en plant deze in conform het reguliere releaseschema.
    
3.  **Uitvoering in DEV/UAT** – De wijziging wordt eerst geïmplementeerd en getest in de ontwikkel- en/of acceptatieomgeving.
    
4.  **Goedkeuring** – Na succesvolle tests geeft de Opdrachtgever akkoord voor de productie-release.
    
5.  **Productie-release** – De wijziging wordt doorgevoerd in de productieomgeving.
    
6.  **Documentatie** – De wijziging wordt gedocumenteerd en het ticket wordt afgesloten.
    

### Releasebeleid

Hotfixes, patches, releases en vergelijkbare wijzigingen worden **niet buiten kantooruren** (werkdagen 09:00–17:00) en **niet op vrijdag** doorgevoerd, tenzij er expliciet schriftelijk akkoord is gegeven door de eindverantwoordelijken van zowel iO als de Opdrachtgever. Dit beleid minimaliseert risico's rondom beschikbaarheid, support en escalatie buiten kantoortijd.

### Facturatie

Wijzigingen worden gefactureerd op basis van **Time & Material**, tenzij anders overeengekomen. Voor grotere wijzigingen brengt iO vooraf een offerte uit.

---

# 7\. Probleembeheer

**Probleembeheer** omvat alle werkzaamheden die nodig zijn om de grondoorzaak van terugkerende of gerelateerde incidenten te achterhalen en een structurele oplossing te vinden. Waar incidentbeheer gericht is op het zo snel mogelijk herstellen van de dienst, richt probleembeheer zich op het *voorkomen* dat hetzelfde incident zich herhaalt.

### Wanneer wordt probleembeheer ingezet?

Probleembeheer wordt geactiveerd wanneer:

-   Twee of meer incidenten een gemeenschappelijke oorzaak lijken te hebben.
    
-   Een incident zich herhaaldelijk voordoet zonder dat de grondoorzaak is weggenomen.
    
-   Een incident dusdanig complex is dat een diepgaandere analyse noodzakelijk is.
    

### Hoe werkt het?

Het probleembeheerproces bestaat uit de volgende stappen:

1.  **Detectie** – iO signaleert een patroon in incidenten of ontvangt een melding die om een diepere analyse vraagt.
    
2.  **Diagnose** – iO stelt een grondoorzaakanalyse op (Root Cause Analysis). Waar nodig wordt de hulp ingeroepen van partners, leveranciers of andere derde partijen.
    
3.  **Structurele oplossing** – Op basis van de analyse wordt een definitieve oplossing of structurele workaround bepaald.
    
4.  **Implementatie** – De oplossing wordt via het wijzigingsbeheerproces doorgevoerd in de omgeving.
    

### Root Cause Analysis (RCA)

Voor **P1-incidenten (Kritiek)** levert iO binnen **vijf werkdagen** na herstel een volledige Root Cause Analysis op. De RCA bevat minimaal een beschrijving van de oorzaak, de impact, de genomen maatregelen en de structurele opvolging. De template en vereiste onderwerpen zijn vastgelegd in het **DAP**.

### Toegevoegde waarde

Door het structureel aanpakken van terugkerende incidenten verbetert de kwaliteit van de dienst over tijd. Probleembeheer draagt daarmee direct bij aan een stabielere en beter beschikbare applicatie voor de Opdrachtgever.

---

# 8\. Gebruikersondersteuning

**Gebruikersondersteuning** richt zich op het beantwoorden van vragen van medewerkers van de Opdrachtgever over het gebruik van de applicatie. Het gaat hierbij niet om incidenten of storingen, maar om informatieve vragen of onduidelijkheden in het gebruik van de omgeving.

### Hoe werkt het?

Het proces verloopt als volgt:

1.  Een geautoriseerde medewerker van de Opdrachtgever maakt een **gebruikersvraag-ticket** aan in de Service Management Tool.
    
2.  iO neemt het ticket in behandeling en zorgt voor een passend antwoord of toelichting.
    
3.  Nadat de vraag is beantwoord, ontvangt de Opdrachtgever hiervan bericht via de Service Management Tool en wordt het ticket gesloten.
    

### Scope

Gebruikersondersteuning is gericht op vragen over de bestaande werking en inrichting van de applicatie. Verzoeken die leiden tot aanpassingen aan de applicatie worden behandeld als een **wijzigingsverzoek** (zie pagina Wijzigingsbeheer).

### Kosten

Gebruikersondersteuning is inbegrepen in de vaste maandelijkse beheerinvestering, voor zover het gaat om vragen die binnen de afgesproken capaciteit worden afgehandeld.

---

# 9\. Third-party Beheer

Bij het beheer van de applicatie zijn vaak meerdere partijen betrokken: denk aan leveranciers van systemen waarmee koppelingen zijn gemaakt, externe hostingproviders of andere dienstverleners. **Third-party beheer** beschrijft hoe iO en de Opdrachtgever samenwerken bij incidenten waarbij een externe partij betrokken is.

### Verantwoordelijkheidsverdeling

De Opdrachtgever is het **eerste aanspreekpunt** richting externe partijen wanneer er incidenten worden gemeld. De Opdrachtgever beoordeelt de situatie en stuurt het incident door naar iO wanneer dat nodig is.

Indien iO bij de analyse van een incident constateert dat een derde partij betrokken moet worden om het probleem op te lossen, brengt iO dit kenbaar aan de Opdrachtgever. iO schakelt externe partijen alleen in na overleg met en goedkeuring van de Opdrachtgever.

### Wat doet iO bij third-party incidenten?

-   iO analyseert het incident en stelt vast of een externe partij verantwoordelijk is of betrokken moet worden.
    
-   iO informeert de Opdrachtgever en adviseert over de te nemen stappen.
    
-   iO ondersteunt de Opdrachtgever bij de communicatie richting de externe partij, indien gewenst.
    
-   iO bewaakt de voortgang en houdt de Opdrachtgever op de hoogte totdat het incident is opgelost.
    

### Wat valt buiten de scope?

iO is niet verantwoordelijk voor de beschikbaarheid, prestaties of het oplossen van problemen bij externe partijen. De Opdrachtgever draagt zelf de verantwoordelijkheid voor de contractuele relatie met derde partijen. Technische escalatie naar externe leveranciers is niet inbegrepen in het standaard beheercontract en wordt — indien van toepassing — gefactureerd op basis van **Time & Material**.

---

# 10\. Informatiebeveiliging & Security Team

De beveiliging van de applicatie is een integraal onderdeel van de beheerovereenkomst. iO hanteert internationale normen voor informatiebeveiliging en heeft een dedicated **Security Team** dat toeziet op de veiligheid van alle beheerde applicaties.

### Informatiebeveiliging

De bedrijfsvoering van iO is ingericht volgens internationale normen voor informatieveiligheid. iO ziet toe op continue verbetering in de wijze waarop wordt omgegaan met:

-   **Vertrouwelijkheid** – Bescherming van bedrijfs- en persoonsgegevens tegen onbevoegde toegang.
    
-   **Beschikbaarheid** – Het waarborgen dat informatie en systemen beschikbaar zijn wanneer dat nodig is.
    
-   **Integriteit** – Het voorkomen van ongeautoriseerde wijzigingen in data en systemen.
    

Concrete voorbeelden zijn de bescherming van persoonsgegevens, bedrijfsgevoelige informatie en het weren van onbevoegde toegang door hackers.

### Het Security Team

De applicatie van de Opdrachtgever staat onder toezicht van het **iO Security Team**. Dit team bestaat uit ervaren medewerkers uit de verschillende iO-teams, onder leiding van de Security Officer van iO. De taken van het Security Team zijn:

-   Evalueren van beveiligingsincidenten en — waar nodig — in overleg met de Opdrachtgever processen aanscherpen.
    
-   Nieuwe beveiligingsontwikkelingen en dreigingen in kaart brengen en bespreken met de Opdrachtgever indien relevant.
    
-   Monitoren van security-updates en zorgen voor voldoende capaciteit om deze tijdig op te volgen.
    

### Security-updates

iO onderscheidt twee categorieën security-updates, gebaseerd op de door de leverancier toegekende **CVSS-score**:

| Categorie | CVSS-score | Termijn |
| --- | --- | --- |
| Kritieke security-update | 9.0 – 10.0 | Binnen 1 werkdag na beschikbaarheid van de patch |
| Niet-kritieke security-update | Lager dan 9.0 | Binnen 30 dagen na beschikbaarheid van de patch |

Bij een kritieke security-update wordt dezelfde werkdag actie ondernomen om de update zo snel mogelijk door te voeren. Niet-kritieke security-updates en reguliere onderhoudsupdates worden als een wijziging opgepakt en via het wijzigingsbeheerproces geïmplementeerd. Het DTAP-proces blijft in beide gevallen van toepassing.

### Randvoorwaarden

Een randvoorwaarde voor tijdige implementatie van security-updates is dat er voldoende capaciteit beschikbaar wordt gesteld vanuit het delivery team om de benodigde wijzigingen tijdig te kunnen doorvoeren. Updates worden op nacalculatie doorbelast. Bij een inschatting van meer dan 8 uur wordt de Opdrachtgever vooraf geïnformeerd.

---

# 11\. Systeem- en Software-updates

De online omgeving bestaat uit standaardsoftware — zoals het CMS, databaseservers en het besturingssysteem — die regelmatig updates vereist. iO zorgt voor een gestructureerde aanpak van deze updates om de veiligheid, stabiliteit en continuïteit van de applicatie te waarborgen.

### Typen updates

iO voert maandelijks controles uit op beschikbare updates en onderscheidt drie categorieën:

| Type update | Maximale implementatietermijn |
| --- | --- |
| Kritieke security-update (CVSS 9.0–10.0) | Binnen 1 werkdag na patch-beschikbaarheid |
| Niet-kritieke security-update (CVSS < 9.0) | Binnen 30 dagen na patch-beschikbaarheid |
| Service- of productupdate | In overleg met de Opdrachtgever |

### Welke componenten worden bijgewerkt?

Updates worden doorgevoerd op de volgende onderdelen van de omgeving:

-   **CMS** – Via de DEV-, UAT- en productieomgevingen (DTAP-proces).
    
-   **Besturingssysteem** van virtuele machines – Via de DEV-, UAT- en productieomgevingen.
    
-   **Databases** – Via de DEV-, UAT- en productieomgevingen.
    
-   **Azure-infrastructuur** – Updates worden getest en geïnstalleerd door Microsoft.
    

### Werkwijze

Service- en productupdates worden behandeld als een **wijziging** en doorlopen het standaard wijzigingsbeheerproces. Voor de uitvoering van grotere updates brengt iO vooraf een offerte uit.

Bij kritieke security-updates informeert iO de Opdrachtgever direct en start dezelfde werkdag met de implementatie — zonder te wachten op het reguliere releaseschema.

### Facturatie

Updates worden op nacalculatie doorbelast. Bij een verwachte tijdsinvestering van meer dan **8 uur** wordt de Opdrachtgever vooraf geïnformeerd en is voorafgaande goedkeuring vereist.

---

# 12\. OTAP Omgeving

iO beheert een volwaardige **OTAP-omgeving** (Ontwikkeling, Test, Acceptatie, Productie) om wijzigingen op een gecontroleerde en betrouwbare manier te kunnen ontwikkelen, testen en uitrollen. De OTAP-structuur garandeert dat nieuwe releases en fixes eerst worden gevalideerd voordat ze in de productieomgeving worden doorgevoerd.

### Wat is de OTAP-omgeving?

| Omgeving | Doel |
| --- | --- |
| Ontwikkeling (DEV) | Ontwikkeling en initieel testen van nieuwe functionaliteit of fixes. |
| Test (TEST) | Geautomatiseerd en handmatig testen van wijzigingen. |
| Acceptatie (UAT) | Validatie door de Opdrachtgever vóór productie-release. |
| Productie (PROD) | De live omgeving voor eindgebruikers. |

### Waarom een OTAP-omgeving?

Een goed ingerichte OTAP-omgeving maakt het mogelijk om:

-   Wijzigingen veilig te testen zonder risico voor de productieomgeving.
    
-   De kwaliteit van releases te borgen door een gestructureerd testproces.
    
-   Snel en betrouwbaar te deployen bij incidenten, security-updates of changes.
    

De verschillende omgevingen zijn **identiek in architectuur en data**, zodat gedrag in de testomgeving representatief is voor productie.

### Synchronisatie van omgevingen

De Opdrachtgever kan periodiek een wijzigingsverzoek (op basis van Time & Material) indienen bij iO om de inhoud van de productieomgeving over te zetten naar de acceptatieomgeving. Indien de productie-inhoud persoonsgegevens bevat, worden deze vooraf **geanonimiseerd** conform de geldende privacywetgeving.

### Beheer van de OTAP-omgeving

iO is verantwoordelijk voor het technisch beheer en de beschikbaarheid van alle OTAP-omgevingen. Dit omvat het actueel houden van de omgevingen, het doorvoeren van updates en het bewaken van de consistentie tussen de omgevingen. Monitoring van de DEV/UAT-omgevingen richt zich op Azure Resources (CPU, geheugen, schrijfruimte).

---

# 13\. Service Management & Rapportage

**Service Management** zorgt voor de coördinatie van alle beheeractiviteiten en is het verbindende element tussen de Opdrachtgever en de uitvoerende teams van iO. Rapportage maakt de kwaliteit van de dienstverlening inzichtelijk en vormt de basis voor periodieke evaluatie en bijsturing.

### De Supportcoördinator

Alle supportwerkzaamheden worden gecoördineerd door de **Supportcoördinator** van iO. De Supportcoördinator is het vaste aanspreekpunt voor de Opdrachtgever voor alle zaken die het beheer van de omgeving raken. Taken omvatten:

-   Coördinatie van lopende tickets en prioritering van werkzaamheden.
    
-   Bewaken van de naleving van SLA-afspraken.
    
-   Escaleren van issues wanneer dat nodig is.
    
-   Onderhouden van de relatie met de Opdrachtgever op operationeel niveau.
    

### Overlegstructuur

iO en de Opdrachtgever komen periodiek bijeen om de voortgang, kwaliteit en eventuele verbeterpunten te bespreken. De overlegstructuur bestaat uit drie niveaus:

| Overleg | Doel | Frequentie |
| --- | --- | --- |
| Service Level Review | Evaluatie van de SLA-prestaties op basis van KPI's en rapportages. | Maandelijks / kwartaal |
| Tactisch overleg | Afstemming over lopende werkzaamheden, wijzigingen en planningen. | Periodiek (in overleg) |
| Detailafspraken | Operationele afstemming over specifieke tickets of werkzaamheden. | Ad hoc |

### Rapportage

iO stelt periodiek een **Service Level Rapportage** op. Deze rapportage bevat minimaal:

-   Een overzicht van afgehandelde incidenten, wijzigingen en problemen.
    
-   Prestaties ten opzichte van de afgesproken SLA-normen (reactietijden, beschikbaarheid).
    
-   Monitoringresultaten en trends.
    
-   Eventuele aanbevelingen voor verbeteringen of kostenbesparingen.
    

De inhoud, frequentie en format van de rapportage worden vastgelegd in het **DAP (Dossier Afspraken en Procedures)**.

### SLA Management

iO is verantwoordelijk voor het actueel houden van de SLA-documentatie en het bewaken van de overeengekomen Service Levels. De Service Manager bewaakt de naleving van alle afspraken en stuurt bij waar nodig. Een kwartaalreview van de SLA zorgt ervoor dat de afspraken aansluiten op de actuele situatie van de Opdrachtgever.

---