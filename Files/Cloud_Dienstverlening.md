# Cloud Dienstverlening

Dit gedeelte beschrijft de **Azure Cloud Managed Services** die iO levert als onderdeel van de managed services propositie. De inhoud is opgedeeld in afzonderlijke pagina's per onderwerp, zodat elk thema overzichtelijk en zelfstandig te raadplegen is.

### Opbouw van deze sectie

De Cloud Dienstverlening bestaat uit de volgende onderdelen:

-   **Introductie** – Wat zijn Azure Managed Services en hoe zijn ze opgebouwd?
    
-   **Cloud Resources** – De Azure-infrastructuur en de rol van iO als CSP.
    
-   **Cloud Enablement** – De tooling, standaarden en expertise die de basis vormen.
    
-   **Cloud Operations** – De dagelijkse beheeractiviteiten uitgevoerd door het CloudOps-team.
    
-   **Infrastructuur Set-up & Infrastructure as Code** – Hoe infrastructuur wordt opgezet en beheerd.
    
-   **Monitoring & Alerting** – 24/7 bewaking van alle resources en omgevingen.
    
-   **Continuity Management** – Omgaan met verplichte wijzigingen en uitfasering van resources.
    
-   **Security Management** – Beveiliging, compliance en backup-validatie.
    
-   **Infrastructuur Onderhoud & Optimalisatie** – Projectmatige infrastructuurwijzigingen.
    
-   **Microsoft Advanced Support (ASfP)** – Voordelen van de Microsoft partnerondersteuning.
    
-   **Administratie & Communicatie** – Werkoverzicht, kostenbeheer en communicatie.
    

### Uitgangspunten

De Cloud Managed Services zijn altijd bedoeld om te worden ingezet *in combinatie met een SLA*. Zonder SLA zijn er geen formele processen, communicatieafspraken of verplichtingen van toepassing. De diensten worden geleverd door het **Azure CloudOps-team** van iO, in de context van een oplossing die door iO is ontwikkeld voor de klant.

---

# 1\. Introductie – Azure Managed Services

De **Azure Managed Services** van iO vormen een stevige basis voor continuïteit en optimalisatie van de cloudinfrastructuur van de klant. Ze zijn altijd bedoeld om samen met een SLA te worden ingezet. Zonder SLA zijn er geen formele processen, communicatieafspraken of verplichtingen.

### Wat zijn Azure Managed Services?

Azure Managed Services zijn de combinatie van **expertise** en **proactieve onderhoudsactiviteiten** die worden geleverd door het Azure CloudOps-team van iO. De context is altijd een oplossing die iO heeft ontwikkeld — of in beheer heeft genomen — voor de klant.

De dienstverlening bestaat uit drie bouwstenen:

-   **Cloud Resources** – De feitelijke Azure-infrastructuur waarop de oplossing draait.
-   **Cloud Enablement** – De tooling, standaarden en expertise die als fundament dienen voor alle beheeractiviteiten.
-   **Cloud Operations** – De dagelijkse operationele beheeractiviteiten uitgevoerd door het CloudOps-team.

### Wie voert de diensten uit?

De diensten worden uitgevoerd door het **Azure CloudOps-team** van iO. Dit team beschikt over brede expertise op het gebied van cloudinfrastructuur, beveiliging, kostenoptimalisatie en prestatiebeheer. Het team werkt nauw samen met het ontwikkel- of applicatieondersteuningsteam dat verantwoordelijk is voor de klantoplossing.

### Wanneer zijn Managed Services van toepassing?

Managed Services zijn van toepassing zodra:

-   Er een Azure-infrastructuur is ingericht voor een klantoplossing;
-   Er een geldige SLA is overeengekomen tussen de klant en iO;
-   Er afspraken zijn gemaakt over de taakverdeling tussen het CloudOps-team en het ontwikkelteam.

De omvang en invulling van de diensten variëren per klant en zijn afhankelijk van de architectuur, het gebruik en de specifieke behoeften van de klant.

### Relatie met de SLA

De Managed Services zijn onlosmakelijk verbonden met de Service Level Agreement (SLA). De SLA legt vast binnen welke normen iO de diensten levert: denk aan reactietijden, beschikbaarheidsdoelstellingen en prioritering van incidenten. Zonder actieve SLA zijn er geen formele verplichtingen of gestructureerde communicatieprocessen van kracht.

---

# 2\. Cloud Resources

Cloud Resources zijn de daadwerkelijke Azure-infrastructuurcomponenten waarop de klantoplossing draait. Doorgaans worden deze geleverd door iO, maar het is ook mogelijk om gebruik te maken van een bestaande Azure-omgeving van de klant.

### iO als Microsoft Cloud Solution Provider (CSP)

iO is een gecertificeerd **Microsoft Cloud Solution Provider (CSP) Tier 1**. Dit betekent dat iO Azure-resources rechtstreeks kan leveren, zonder afhankelijkheid van een derde partij. Dat biedt de klant een aantal concrete voordelen:

-   Geen afhankelijkheid van, vertraging door of onduidelijkheid over verantwoordelijkheden bij derden.
-   Geen toegang van externe partijen tot de Cloud Resources van de klant vereist.
-   Toegang tot **Advanced Support for Partners (ASfP)** van iO bij Microsoft: break-fix support op het hoogste kwaliteits- en prioriteitsniveau.
-   Één centraal aanspreekpunt voor alle infrastructuurgerelateerde activiteiten.

Het gebruik van Cloud Resources via iO bindt de klant niet aan iO. Het overzetten van een Azure-tenant naar een andere CSP is een administratieve handeling en vereist geen technische migratie.

### Levering door iO

Wanneer iO de Cloud Resources levert, gelden de volgende afspraken die essentieel zijn voor een succesvolle samenwerking en een optimale werking van de cloudinfrastructuur:

-   iO sluit op eigen naam en voor rekening en risico van de Opdrachtgever een overeenkomst met Microsoft.
-   Microsoft Azure wordt gebruikt als hostingplatform; Microsoft Ltd is de Cloud hosting Service Provider.
-   De algemene voorwaarden van Microsoft zijn van toepassing; de Opdrachtgever dient deze na te leven.
-   De Opdrachtgever heeft jegens iO niet meer rechten ten aanzien van de Cloud hosting Service Provider dan iO zelf op grond van die voorwaarden heeft.
-   Bij beëindiging dient de Opdrachtgever altijd de opzegtermijn van de hostingdienst in acht te nemen. Eventuele beëindigingsvergoedingen worden doorbelast aan de Opdrachtgever.
-   De Opdrachtgever vrijwaart iO voor aanspraken die voortvloeien uit het niet naleven van de voorwaarden van de Cloud hosting Service Provider.

### Levering door

### de klant

Wanneer de klant zelf over een Azure-omgeving beschikt, zijn de volgende afspraken van toepassing:

-   De Opdrachtgever sluit zelf een overeenkomst met Microsoft.
-   De Opdrachtgever verschaft iO de benodigde toegang en beheerdersrechten voor de Azure-omgevingen die binnen de scope van de Managed Services vallen.
-   De Opdrachtgever is verantwoordelijk voor de supportrelatie met Microsoft; iO maakt gebruik van deze relatie bij de uitvoering van de overeengekomen diensten.

### Facturatie

Cloud Resources die via iO worden geleverd, worden gefactureerd op basis van **pay-per-use**. iO factureert de werkelijke Azure-kosten maandelijks achteraf, met een **opslag van 20%** voor voorfinanciering en de daarmee samenhangende risico's.

---

# 3\. Cloud Enablement

**Cloud Enablement** is het starttarief dat van toepassing is op alle klanten die gebruik maken van Cloud Operations. Het omvat geen directe operationele diensten, maar vormt het fundament waarop alle beheeractiviteiten worden uitgevoerd. Denk hierbij aan de tooling, werkwijzen en standaarden die iO centraal beheert ten behoeve van alle klanten.

### Wat valt onder Cloud Enablement?

Cloud Enablement bestaat uit twee categorieën: **indirecte diensten** en **algemene vereisten**.

#### Indirecte diensten

Indirecte diensten zijn activiteiten die niet voor één specifieke klant worden uitgevoerd, maar die alle klanten tegelijkertijd ten goede komen. Voorbeelden zijn:

-   Bijwerken en optimaliseren van monitoring op basis van resourcetypen.
-   Ontwikkelen en verbeteren van werkwijzen rondom Azure-infrastructuur.
-   Opstellen en optimaliseren van (ISO-)standaarden voor resource baselines en processen.
-   Samenwerken met Microsoft en bijblijven op het gebied van nieuwe wijzigingen en functies.
-   Installeren en onderhouden van de managementtooling voor monitoring en alerting.

#### Algemene vereisten

Om Cloud Operations te kunnen leveren, zijn een aantal randvoorwaarden noodzakelijk. Deze worden gedekt vanuit Cloud Enablement:

-   Aanschaf van **Advanced Support for Partners (ASfP)** bij Microsoft.
-   Aanschaf van licenties voor de beheertooling.
-   Aanschaf van Cloud Resources voor de beheertools zelf.

### Wat levert Cloud Enablement de klant op?

Hoewel de klant Cloud Enablement niet direct ervaart als een zichtbare dienst, profiteert hij er indirect van. De tooling, standaarden en samenwerkingsverbanden die via Cloud Enablement worden onderhouden, zorgen ervoor dat het CloudOps-team altijd beschikt over:

-   Up-to-date monitoringconfiguraties voor alle relevante Azure-resourcetypen.
-   Bewezen en gestandaardiseerde werkwijzen die snelle en betrouwbare opvolging mogelijk maken.
-   Een directe lijn met Microsoft voor ondersteuning en kennis over nieuwe ontwikkelingen.

### Tarieven

De prijs voor Cloud Enablement is afhankelijk van de omvang en complexiteit van de beheerde Azure-omgeving. De tarieven variëren van **€ 250 tot € 1.750 per maand**, op basis van het Azure-verbruik en de complexiteit van de ingezette resources.

---

# 4\. Cloud Operations

**Cloud Operations** zijn de dagelijkse Managed Services-activiteiten die het Azure CloudOps-team van iO uitvoert voor de klant. Ze omvatten het beheren, monitoren en updaten van Cloud Resources, aangevuld met consultancy en optimalisatie. Cloud Operations vormen het operationele hart van de Azure Managed Services.

### Wat doet het CloudOps-team?

Het CloudOps-team werkt nauw samen met het ontwikkelings- of applicatieondersteuningsteam van de klant. Afhankelijk van de behoeften van de klant en de capaciteiten van het ontwikkelteam, kan de invulling van Cloud Operations variëren van:

-   **Consultancy en monitoring** – het CloudOps-team adviseert en houdt de omgeving in de gaten, terwijl het ontwikkelteam zelf de infrastructuur beheert.
-   **Volledige infra-architectuur opzet en onderhoud** – het CloudOps-team is volledig verantwoordelijk voor het inrichten en onderhouden van de infrastructuur.

Een belangrijke toegevoegde waarde van het CloudOps-team is de brede expertise op het gebied van het runnen en onderhouden van een cloudinfrastructuur, gecombineerd met een actieve signaleringsfunctie op het gebied van **prestaties, kosten en beveiliging**.

### Overzicht van Cloud Operations-diensten

De volgende diensten worden geleverd als onderdeel van Cloud Operations. Elke dienst is uitgewerkt op een eigen pagina:

-   **Infrastructuur Set-up & Infrastructure as Code** – Kwaliteitsborgde opzet van de infrastructuur via geautomatiseerde code.
-   **Monitoring & Alerting** – 24/7 bewaking van alle resources en omgevingen.
-   **Continuity Management** – Proactief omgaan met verplichte wijzigingen en uitfasering van resources.
-   **Security Management** – Beveiliging, compliance en backup-validatie.
-   **Infrastructuur Onderhoud & Optimalisatie** – Projectmatige aanpassingen en verbeteringen.
-   **Microsoft Advanced Support (ASfP)** – Directe escalatielijn naar Microsoft voor break-fix support.
-   **Administratie & Communicatie** – Werkorganisatie, kostenbeheer en klantcommunicatie.

### Facturatie

De uren voor Cloud Operations worden doorgaans **vooraf gefactureerd als een service retainer**. De omvang van de retainer is afhankelijk van:

-   De grootte en complexiteit van de architectuur.
-   De intensiteit van het gebruik van de omgeving.
-   De communicatieprocessen met de klant.
-   De taakverdeling tussen het CloudOps-team en het ontwikkelteam.

De benodigde uren zullen van maand tot maand variëren, maar komen over een langere periode gemiddeld uit op het afgesproken aantal uren. Werkzaamheden buiten de retainer — zoals grote infrastructuurwijzigingen of migraties — worden gefactureerd op basis van **Time & Material**.

---

# 5\. Infrastructuur Set-up & Infrastructure as Code

Het opzetten van de infrastructuur valt buiten de reguliere Cloud Operations, maar het CloudOps-team van iO is hier altijd bij betrokken. Standaard richt het CloudOps-team de infrastructuur in via **Infrastructure as Code (IaC)** — een aanpak waarbij de volledige infrastructuurconfiguratie in code wordt vastgelegd en beheerd.

### Waarom Infrastructure as Code?

IaC biedt structurele voordelen op het gebied van kwaliteit, efficiëntie, onderhoudbaarheid en veiligheid. Hieronder worden de belangrijkste voordelen per categorie toegelicht.

#### Kwaliteit

-   De infrastructuur komt gegarandeerd overeen met de beoogde, gedocumenteerde configuratie.
    
-   Omgevingen die identiek zouden moeten zijn (bijvoorbeeld Acceptatie en Productie) zijn dat ook gegarandeerd.
    
-   De opzet kan door een collega worden getest en beoordeeld vóór implementatie.
    
-   Vereiste updates van infrastructuurcomponenten kunnen worden gepland, herzien en getest voordat ze worden doorgevoerd in de klantomgeving.
    

#### Efficiëntie

-   Een resource hoeft slechts één keer te worden geconfigureerd in code en kan daarna steeds opnieuw worden ingezet.
    
-   De inrichting van één omgeving (bijv. Test) kan direct worden hergebruikt voor een andere omgeving (bijv. Acceptatie), waarbij alleen de expliciete verschillen worden geconfigureerd.
    
-   Eerder ontwikkelde IaC-modules kunnen eenvoudig worden hergebruikt voor nieuwe projecten en klanten.
    

#### Onderhoudbaarheid

-   De beoogde staat en configuratie van de omgeving is eenduidig vastgelegd en kan worden gevalideerd en beoordeeld.
    
-   Learnings en verplichte updates kunnen eenvoudig worden overgenomen tussen niet-gerelateerde architecturen die dezelfde infrastructuurcomponenten gebruiken.
    
-   Wijzigingen in resources hoeven slechts één keer te worden doorgevoerd en worden automatisch hergebruikt voor opvolgende omgevingen in de OTAP-sequentie.
    

#### Veiligheid en continuïteit

-   Herstelscenario's (disaster recovery) zijn gedeeltelijk al ingericht via IaC, zodat een herstelomgeving identiek is aan de live-omgeving.
    
-   Configuratie-informatie kan worden gedeeld zonder dat directe toegang tot de (productie)omgeving nodig is.
    
-   Beveiligingsgevoelige configuraties worden gegarandeerd correct toegepast en zijn niet afhankelijk van individueel handelen in de omgeving.
    

### Rol van het CloudOps-team

Hoewel de initiële infrastructuur set-up doorgaans onderdeel is van het projecttraject, wordt het CloudOps-team altijd geconsulteerd over de voorgestelde architectuur. Dit zorgt ervoor dat aspecten als **prestaties, kosten, beveiliging en onderhoudbaarheid** al in de ontwerpfase worden meegenomen.

Bij voorkeur is het CloudOps-team verantwoordelijk voor, of minimaal betrokken bij, het beheer van de IaC-codebase en alle infrastructuurwijzigingen die daaruit voortkomen.

### Facturatie

Infrastructuur set-up en -wijzigingen zijn altijd **projectmatig** en worden gefactureerd op basis van **Time & Material**.

---

# 6\. Monitoring & Alerting

Het monitoren van de infrastructuur is een **kerndienst** van Cloud Operations. iO hanteert een centraal beheerde monitoringimplementatie die **24/7 alle resources op alle omgevingen** afdekt. Alerting is gekoppeld aan dedicated tooling om te garanderen dat alle meldingen tijdig worden opgevolgd, conform de SLA-afspraken.

### Monitoring: de Four Golden Signals

De monitoring is opgezet rond de industriestandaard van de **Four Golden Signals**:

-   **Latency** – De tijd die nodig is om een verzoek te verwerken (Request Service Time).
    
-   **Traffic** – De hoeveelheid vraag op het systeem (User Demand).
    
-   **Errors** – Het percentage mislukte verzoeken (Failure Rate).
    
-   **Saturation** – De mate waarin het systeem op zijn grenzen zit (Overall Capacity).
    

Deze vier signalen worden gemeten aan de hand van een groot aantal metrische gegevens, verzameld uit alle geïmplementeerde Azure-resources. De monitoringimplementatie maakt gebruik van gecentraliseerde tooling met vooraf gedefinieerde sjablonen voor alle resourcetypen.

### Kenmerken van de monitoringopzet

-   **Klantscheiding:** Monitoring is altijd gescheiden per klant, met een duidelijke scheiding van gegevens en een gedetailleerd toegangsbeleid.
    
-   **Code-gedreven configuratie:** De monitoringconfiguratie wordt beheerd via code en dekt automatisch alle resourcetypen — ook resources die op een later moment worden toegevoegd aan de omgeving.
    
-   **Kostenmonitoring:** Naast beschikbaarheid worden ook de kosten van Azure-resources gemonitord. Kostenwaarschuwingen worden geconfigureerd voor vroegtijdige signalering bij verwachte budgetoverschrijdingen.
    

### Periodieke Sanity Check

Het CloudOps-team voert periodiek een **sanity check** uit op de beheerde infrastructuur, waarbij kennis van nieuwe Azure-functies en best practices wordt toegepast. De sanity check omvat de volgende onderwerpen:

-   Security Center
    
-   Azure Monitor
    
-   Cost Review
    

De bevindingen en adviezen worden gedeeld met de klant, met concrete aanbevelingen voor verbeteringen of kostenbesparingen. De maandelijkse tijdsinvestering voor de sanity check en kostenbeheersing bedraagt gemiddeld **1 tot 3 uur**. Het opvolgen van adviezen en voorgestelde verbeteringen wordt gefactureerd op basis van **Time & Material**.

### Alerting

Alerting wordt geconfigureerd op basis van de SLA-afspraken en is gekoppeld aan dedicated tooling. Dit zorgt ervoor dat het CloudOps-team automatisch wordt geïnformeerd bij overschrijding van drempelwaarden, zodat tijdige opvolging gegarandeerd is. Meldingen met een hoge prioriteit worden direct opgepakt conform de afgesproken reactie- en oppaktijden uit de SLA.

---

# 7\. Continuity Management

Cloudinfrastructuur is voortdurend in beweging. Microsoft fasert regelmatig resources uit, introduceert verplichte configuratiewijzigingen en geeft adviezen om specifieke resources of implementaties bij te werken. **Continuity Management** zorgt ervoor dat de infrastructuur van de klant up-to-date en operationeel blijft, ook als externe partijen zoals Microsoft wijzigingen doorvoeren.

### Wat houdt Continuity Management in?

Het CloudOps-team monitort actief welke verplichte wijzigingen op de beheerde infrastructuur afkomen en initieert tijdig actie. Concreet omvat dit:

-   Het bijhouden van aankondigingen van Microsoft over uitfasering van resources en verplichte updates.
    
-   Het beoordelen van de impact van deze wijzigingen op de klantomgeving.
    
-   Het adviseren van de klant over de gewenste opvolging en het uitvoeren van de overeengekomen acties.
    
-   Basisbeheersactiviteiten zoals het herstarten van resources voor een verplichte update of het aanpassen van configuraties bij verplichte wijzigingen.
    

### Voorbeelden per infrastructuurtype

De specifieke activiteiten zijn afhankelijk van de ingezette infrastructuur:

-   **AKS-gebaseerde infrastructuur:** Periodieke AKS-versie-updates zijn een vast onderdeel van Continuity Management.
    
-   **VM-gebaseerde infrastructuur:** OS-updates kunnen van toepassing zijn, hoewel dit minder vaak voorkomt omdat iO bij voorkeur SaaS-diensten en Docker-containers inzet die de up-to-date applicatie-instellingen al bevatten.
    

### Impact van wijzigingen

De impact van continuïteitswijzigingen kan sterk variëren:

-   **Minimale impact:** Wanneer een clouddienst automatisch door Microsoft kan worden bijgewerkt zonder tussenkomst.
    
-   **Grote impact:** Wanneer resources worden uitgefaseerd en de architectuur fundamenteel moet worden aangepast. Dit wordt als een apart project behandeld en gefactureerd.
    

### Tijdsinvestering

De benodigde tijd voor Continuity Management is van nature onvoorspelbaar — sommige uitfaseringsschema's zijn vooraf bekend (zoals bij AKS), andere verplichte wijzigingen zijn dat niet. De maandelijkse tijdsinvestering varieert doorgaans tussen **1 en 24 uur**, afhankelijk van de aanwezigheid van AKS en andere periodiek uitgefaseerde resources.

### Facturatie

Standaard continuïteitsactiviteiten zijn onderdeel van de maandelijkse service retainer. Grote upgrades, migraties, breaking changes of andere activiteiten die buiten de initiële urenschatting vallen, worden als een apart project afgehandeld en gefactureerd op basis van **Time & Material**.

---

# 8\. Security Management

Het CloudOps-team van iO speelt een centrale rol bij het waarborgen van de informatiebeveiliging van de beheerde infrastructuur. De aanpak is gebaseerd op het ISO-beleid van iO en omvat meerdere beveiligingsdimensies — van preventie en detectie tot herstel en compliance.

### Wat valt onder Security Management?

Security Management omvat de volgende activiteiten:

-   **Security awareness:** Het CloudOps-team blijft continu op de hoogte van actuele beveiligingsdreigingen en past deze kennis toe op de beheerde omgevingen.
    
-   **Kennis en mitigatie van dreigingen:** Actieve opvolging van bekende kwetsbaarheden en het nemen van mitigerende maatregelen waar nodig.
    
-   **Compliance reviews:** Periodieke controles om te valideren dat beveiligingsinstellingen, gebruikerstoegang en overig ISO-beleid correct zijn geconfigureerd.
    
-   **Beveiligingsmonitoring en -preventie:** Inzet van infrastructuurcomponenten gericht op het monitoren van beveiligingsincidenten en het voorkomen van aanvallen.
    
-   **Backup-validatie:** Het valideren van de Recovery Time Objective (RTO) en Recovery Point Objective (RPO) van backups, en het controleren of backups daadwerkelijk kunnen worden hersteld.
    

### Backup en herstel

Voor een volwaardige invulling van backup- en hersteldiensten is doorgaans een actieve SLA vereist, omdat het proces communicatie met de klant vereist en de RTO- en RPO-instellingen klantspecifiek kunnen zijn. Ongeacht de SLA-status zal het CloudOps-team:

-   De beschikbaarheid van backups altijd opnemen in de monitoringconfiguratie.
    
-   Backup-validatie altijd meenemen als onderdeel van de periodieke Compliance Review.
    

### Tijdsinvestering

De uren die nodig zijn voor Security Management zijn grotendeels opgenomen in de uren die al zijn gepland voor **Monitoring & Alerting**. Er zijn geen afzonderlijke extra uren voor reguliere beveiligingstaken. Alleen bij specifieke beveiligingsincidenten of uitgebreide compliance-trajecten worden uren aanvullend gefactureerd op basis van **Time & Material**.

---

# 9\. Infrastructuur Onderhoud & Optimalisatie

Infrastructuurwijzigingen — of het nu gaat om het bijwerken van een component, het optimaliseren van de architectuur of het doorvoeren van een verbetering — zijn altijd **projectmatig van aard**. Ze worden niet uitgevoerd als onderdeel van de reguliere maandelijkse retainer, maar worden apart ingepland en gefactureerd.

### Rol van het CloudOps-team

Hoewel infrastructuurwijzigingen buiten de standaard Cloud Operations vallen, is het CloudOps-team hier altijd bij betrokken. Het team wordt minimaal geconsulteerd over voorgestelde wijzigingen en heeft bij voorkeur de regie over:

-   Het onderhoud van de **Infrastructure as Code (IaC)** codebase.
    
-   Het beoordelen en uitvoeren van alle infrastructuurwijzigingen die impact hebben op de beheerde omgeving.
    

Deze betrokkenheid garandeert dat wijzigingen aansluiten op de bestaande monitoringconfiguratie, het beveiligingsbeleid en de operationele standaarden van iO.

### Wanneer is onderhoud of optimalisatie aan de orde?

Typische aanleiding voor infrastructuuronderhoud of -optimalisatie zijn:

-   Verouderde of uitgefaseerde Azure-resources die moeten worden vervangen.
    
-   Aanbevelingen vanuit de periodieke sanity check (zie pagina Monitoring & Alerting).
    
-   Kostenbesparing of prestatieverbeteringen die zijn geïdentificeerd via monitoring of een architectuurreview.
    
-   Functionele uitbreidingen of wijzigingen aan de klantoplossing die infrastructuuraanpassingen vereisen.
    

### Facturatie

Alle uren voor infrastructuuronderhoud en -optimalisatie worden gefactureerd op basis van **Time & Material**. Grote trajecten — zoals migraties, breaking changes of volledige architectuurvernieuwingen — worden als een apart project afgehandeld met een eigen begroting en planning.

---

# 10\. Microsoft Advanced Support (ASfP)

Wanneer Cloud Resources worden afgenomen via de CSP van iO, heeft het CloudOps-team toegang tot **Advanced Support for Partners (ASfP)** van Microsoft. Dit is het hoogste niveau van Microsoft-ondersteuning dat beschikbaar is voor partners en verhoogt de slagkracht van het team aanzienlijk — ten voordele van de klantoplossing.

### Wat biedt Advanced Support for Partners?

#### Microsoft Escalation Support

Via ASfP heeft het CloudOps-team toegang tot geprioriseerde technische ondersteuning vanuit Microsoft, inclusief break-fix support met de snelste responstijden die Microsoft biedt. Kenmerken:

-   Ingediende issues worden standaard opgepakt door senior supporttechnici.
    
-   Bij complexe problemen is directe escalatie mogelijk naar gespecialiseerde technische teams binnen Microsoft.
    
-   Snellere doorlooptijd bij het oplossen van platform- en infrastructuurproblemen.
    

#### Microsoft Partner Success Accountmanager

iO beschikt over een toegewezen **Partner Success Accountmanager** bij Microsoft. Deze accountmanager ondersteunt iO bij problemen, nieuwe ontwikkelingen en overige behoeften rondom Microsoft-diensten. Dit zorgt voor een directe lijn naar Microsoft op strategisch en operationeel niveau.

#### Microsoft Cloud Enablement Services

Via ASfP heeft iO toegang tot meerdere rapportages en gespecialiseerde consultaties die zijn gericht op het optimaliseren van processen en het verdiepen van kennis rondom Microsoft-diensten.

### Belangrijk: scope en bereikbaarheid

-   ASfP is **uitsluitend beschikbaar** voor Cloud Resources die zijn ingericht binnen de CSP van iO. Bij Cloud Resources die via de klant zelf worden afgenomen, is ASfP niet van toepassing.
    
-   ASfP is **niet rechtstreeks toegankelijk voor klanten**. Microsoft levert deze ondersteuning uitsluitend aan het iO CloudOps-team.
    

### Facturatie

De uren die gemoeid zijn met het inzetten van Microsoft-ondersteuning worden altijd gefactureerd op basis van **Time & Material** en maken deel uit van de afhandeling van het specifieke probleem of verbetervoorstel.

---

# 11\. Administratie & Communicatie

Goed werkbeheer, kostenbewaking en heldere communicatie zijn essentiële onderdelen van een betrouwbare dienstverlening. Hoewel deze activiteiten minder zichtbaar zijn dan de technische taken, vergen zij wel tijd en aandacht. Het CloudOps-team borgt deze taken als vast onderdeel van de samenwerking met de klant.

### Wat valt onder Administratie & Communicatie?

-   **Werkorganisatie:** Het plannen, prioriteren en bijhouden van lopende taken en tickets binnen het CloudOps-team.
    
-   **Kostenbeheer:** Het bewaken van de Azure-kosten, signaleren van afwijkingen en rapporteren aan de klant.
    
-   **Klantcommunicatie:** Reguliere afstemming met de klant over de status van de omgeving, lopende werkzaamheden en relevante ontwikkelingen.
    
-   **Rapportage:** Het opstellen en delen van periodieke overzichten over de staat van de infrastructuur, uitgevoerde werkzaamheden en verbruikte uren.
    

### Facturatie

De uren voor standaard administratie en communicatie zijn inbegrepen in de **maandelijkse service retainer**. Communicatie en administratie rondom wijzigingstrajecten of andere Time & Material-afspraken worden meegenomen in de facturatie van die specifieke werkzaamheden.

---