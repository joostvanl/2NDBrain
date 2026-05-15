
# Dienstbeschrijving – iO Managed Services

## Documentinformatie
| Veld | Waarde |
|------|--------|
| Versie | [versie] |
| Datum | [datum] |
| Status | [concept / definitief] |
| Classificatie | Vertrouwelijk |

## Leeswijzer

Dit document beschrijft **wat** iO levert als onderdeel van de Managed Services. Per onderwerp is het document opgebouwd uit:

- **Generiek** – Wat geldt ongeacht het domein (de oplossing als geheel)
- **Applicatie** – Wat specifiek betrekking heeft op de applicatielaag
- **Cloud / Hosting** – Wat specifiek betrekking heeft op de infrastructuurlaag

Elk domein-subhoofdstuk is zelfstandig. Wanneer een domein niet van toepassing is, wordt het betreffende subhoofdstuk verwijderd.

Operationele uitwerking (processen, escalatiepaden, contactgegevens, templates) is vastgelegd in het **Dossier Afspraken en Procedures (DAP)**.

---

## 1. Servicedesk

### 1.1 Generiek
De Servicedesk is het centrale aanspreekpunt voor alle meldingen, vragen en verzoeken met betrekking tot de beheerde oplossing. Elke melding wordt geregistreerd als ticket en gecategoriseerd naar type:

- **Incident** – Ongeplande verstoring van de oplossing
- **Serviceaanvraag** – Verzoek om een standaarddienst of -handeling
- **Wijziging (Change)** – Technische of functionele aanpassing
- **Probleem** – Structureel of terugkerend incident
- **Gebruikersvraag** – Informatieve vraag over gebruik

De Servicedesk routeert tickets naar het juiste team (applicatie, infrastructuur of derde partij) en bewaakt de voortgang tot afsluiting.

### 1.2 Applicatie
De Servicedesk behandelt applicatie-gerelateerde meldingen, waaronder:

- Verstoringen in de werking van de applicatie of het CMS
- Vragen over het gebruik van functionaliteiten
- Verzoeken tot functionele aanpassingen

### 1.3 Cloud / Hosting
De Servicedesk behandelt infrastructuur-gerelateerde meldingen, waaronder:

- Verstoringen in de beschikbaarheid of performance van cloud resources
- Verzoeken tot infrastructuuraanpassingen
- Signalen uit infrastructuurmonitoring

---

# 2. Incidentbeheer

### 2.1 Generiek
Incidentbeheer richt zich op het herstellen van de dienstverlening bij ongeplande verstoringen. Incidenten worden geprioriteerd op basis van impact en urgentie (P1–P5) en afgehandeld conform de afgesproken reactie- en oppaktijden uit de SLA.

Bij P1-incidenten informeert iO de Opdrachtgever regelmatig over de voortgang. Indien een definitieve oplossing niet direct mogelijk is, biedt iO een workaround aan.

### 2.2 Applicatie
Applicatie-incidenten omvatten onder andere:

- Onbereikbaarheid of foutmeldingen in de applicatie
- Falende integraties of koppelingen
- Prestatieverlies op applicatieniveau
- Fouten in de werking van het CMS of maatwerkfunctionaliteiten

### 2.3 Cloud / Hosting
Infrastructuur-incidenten omvatten onder andere:

- Onbeschikbaarheid van cloud resources (compute, storage, netwerk)
- Overschrijding van capaciteitsgrenzen (CPU, geheugen, opslag)
- Falen van platform-diensten (databases, containers, load balancers)

---

## 3. Probleembeheer

### 3.1 Generiek
Probleembeheer richt zich op het structureel wegnemen van de grondoorzaak van terugkerende of gerelateerde incidenten. Voor P1-incidenten levert iO een Root Cause Analysis (RCA) op. Bevindingen worden geregistreerd als Known Error en een structurele oplossing wordt gepland.

### 3.2 Applicatie
Probleembeheer op applicatieniveau betreft onder andere:

- Terugkerende fouten in applicatiecode of configuratie
- Structurele performanceproblemen in de applicatie
- Patronen in CMS- of integratie-gerelateerde incidenten

### 3.3 Cloud / Hosting
Probleembeheer op infrastructuurniveau betreft onder andere:

- Terugkerende resource-uitval of capaciteitsproblemen
- Structurele configuratiefouten in de cloudinfrastructuur
- Patronen in platform- of netwerkgerelateerde incidenten

---

## 4. Monitoring & Alerting

### 4.1 Generiek
iO monitort de beheerde oplossing via een geautomatiseerd systeem. Monitoring signaleert verstoringen en afwijkingen vroegtijdig, zodat actie kan worden ondernomen voordat de Opdrachtgever impact ervaart.

Alerting is geconfigureerd op twee niveaus:

- **Waarschuwingsniveau** – Drempelwaarde wordt benaderd; preventieve actie mogelijk
- **Foutniveau (kritiek)** – Drempelwaarde overschreden; opvolging conform SLA

De Opdrachtgever heeft toegang tot een monitoringdashboard en ontvangt periodiek een rapportage.

### 4.2 Applicatie
Op applicatieniveau worden de volgende aspecten gemonitord:

- **Beschikbaarheid** – Time to first byte van de productieomgeving
- **Performance** – Full page-load tijd
- **Externe koppelingen** – Beschikbaarheid van integraties en webservices
- **Applicatie- en CMS-logboeken** – Terugkerende foutmeldingen of afwijkingen

### 4.3 Cloud / Hosting
Op infrastructuurniveau worden de volgende aspecten gemonitord, gebaseerd op de Four Golden Signals:

- **Latency** – Verwerkingstijd van verzoeken
- **Traffic** – Hoeveelheid vraag op het systeem
- **Errors** – Percentage mislukte verzoeken
- **Saturation** – Mate van capaciteitsbenutting

Aanvullend worden per resource gemeten:

- CPU-gebruik, geheugengebruik en schrijfruimte
- Azure-kostenverbruik versus budget
- Beschikbaarheid van platform-diensten

---

## 5. Security Management

### 5.1 Generiek
De beveiliging van de beheerde oplossing is een integraal onderdeel van de dienstverlening. iO hanteert internationale normen voor informatiebeveiliging en waarborgt:

- **Vertrouwelijkheid** – Bescherming tegen onbevoegde toegang
- **Beschikbaarheid** – Systemen zijn beschikbaar wanneer nodig
- **Integriteit** – Voorkomen van ongeautoriseerde wijzigingen

Security-updates worden geïmplementeerd op basis van de door de leverancier toegekende CVSS-score:

- **Kritiek** (CVSS 9.0–10.0): binnen 1 werkdag na beschikbaarheid patch
- **Niet-kritiek** (CVSS < 9.0): binnen 30 kalenderdagen na beschikbaarheid patch

iO controleert maandelijks op beschikbare updates en rapporteert kritieke bevindingen dezelfde werkdag.

### 5.2 Applicatie
Op applicatieniveau omvat security management:

- Toezicht door het iO Security Team op de applicatie
- CMS- en framework security-updates
- Evaluatie van beveiligingsincidenten op applicatieniveau
- Monitoring van applicatie-specifieke kwetsbaarheden en dependencies

### 5.3 Cloud / Hosting
Op infrastructuurniveau omvat security management:

- Security awareness en mitigatie van infrastructuur-dreigingen
- Compliance reviews op beveiligingsinstellingen en toegangsbeheer
- Beveiligingsmonitoring en -preventie op infrastructuurcomponenten
- Backup-validatie (RTO/RPO) en herstelcontroles

---

## 6. Wijzigingsbeheer

### 6.1 Generiek
Wijzigingsbeheer omvat alle gewenste technische en functionele aanpassingen aan de beheerde oplossing. Wijzigingen worden gecontroleerd, getest en gedocumenteerd doorgevoerd via het OTAP-proces.

Releases worden niet buiten kantooruren (werkdagen 09:00–17:00) en niet op vrijdag doorgevoerd, tenzij er expliciet schriftelijk akkoord is van beide partijen.

### 6.2 Applicatie
Applicatiewijzigingen omvatten onder andere:

- Functionele verbeteringen of uitbreidingen
- Technische aanpassingen aan applicatiecode
- Implementatie van CMS- of framework-updates
- Oplossingen voortkomend uit probleembeheer

### 6.3 Cloud / Hosting
Infrastructuurwijzigingen omvatten onder andere:

- Aanpassingen aan de cloudarchitectuur
- Schaling of optimalisatie van resources
- Implementatie van platform-updates of migraties
- Wijzigingen in de Infrastructure as Code (IaC) codebase

---

## 7. Systeem- & Software-updates

### 7.1 Generiek
iO voert maandelijks controles uit op beschikbare updates. Het DTAP-proces blijft altijd van toepassing: updates worden getest in DEV/UAT vóór productie-release. Bij een verwachte tijdsinvestering van meer dan 8 uur wordt de Opdrachtgever vooraf geïnformeerd.

### 7.2 Applicatie
Op applicatieniveau worden de volgende componenten bijgewerkt:

- Content Management Systeem (CMS)
- Applicatie-frameworks en libraries
- Dependencies en packages

### 7.3 Cloud / Hosting
Op infrastructuurniveau worden de volgende componenten bijgewerkt:

- Besturingssystemen van virtuele machines
- Container-platformen (bijv. AKS-versies)
- Database-engines
- Platform-diensten bij verplichte uitfasering of deprecation door Microsoft

---

## 8. Third-party Beheer

### 8.1 Generiek
Bij het beheer van de oplossing zijn vaak meerdere partijen betrokken. iO analyseert incidenten en stelt vast of een externe partij betrokken moet worden. iO informeert en adviseert de Opdrachtgever en ondersteunt bij de communicatie richting derden.

De Opdrachtgever draagt de contractuele verantwoordelijkheid voor de relatie met derde partijen.

### 8.2 Applicatie
Third-party beheer op applicatieniveau betreft onder andere:

- Leveranciers van systemen waarmee koppelingen zijn gemaakt
- SaaS-platformen en externe API-providers
- Licentieleveranciers van het CMS of frameworks

### 8.3 Cloud / Hosting
Third-party beheer op infrastructuurniveau betreft onder andere:

- Microsoft (Azure platform, ASfP-escalatie)
- CDN- en DNS-providers
- Externe hosting- of netwerkpartijen

---

## 9. Service Management & Rapportage

### 9.1 Generiek
Service Management zorgt voor coördinatie van alle beheeractiviteiten. De Opdrachtgever heeft een vast aanspreekpunt (Supportcoördinator) voor operationele zaken. iO en de Opdrachtgever komen periodiek bijeen voor evaluatie en bijsturing.

iO stelt periodiek een Service Level Rapportage op met daarin:

- Overzicht van afgehandelde tickets per categorie
- Prestaties ten opzichte van de SLA-normen
- Bevindingen en aanbevelingen

### 9.2 Applicatie
Rapportage op applicatieniveau omvat onder andere:

- Status van applicatie-incidenten en wijzigingen
- Resultaten van proactief applicatiebeheer
- Overzicht van doorgevoerde applicatie-updates

### 9.3 Cloud / Hosting
Rapportage op infrastructuurniveau omvat onder andere:

- Status van infrastructuur-incidenten en wijzigingen
- Azure-kostenrapportage en budgetbewaking
- Resultaten van periodieke sanity checks en compliance reviews

---

## 10. OTAP Omgeving

### 10.1 Generiek
iO beheert een OTAP-omgeving (Ontwikkeling, Test, Acceptatie, Productie) om wijzigingen gecontroleerd te kunnen ontwikkelen, testen en uitrollen. De omgevingen zijn identiek in architectuur, zodat gedrag in test representatief is voor productie.

### 10.2 Applicatie
Op applicatieniveau omvat het OTAP-beheer:

- Beschikbaarheid van de applicatie op alle omgevingen
- Synchronisatie van content tussen omgevingen (met anonimisering indien nodig)
- Ondersteuning van het release- en testproces

### 10.3 Cloud / Hosting
Op infrastructuurniveau omvat het OTAP-beheer:

- Provisioning en onderhoud van resources op alle omgevingen
- Pariteit van infrastructuurconfiguratie via Infrastructure as Code
- Scheiding van omgevingen op netwerk- en toegangsniveau

---

## 11. Proactief Beheer

### 11.1 Generiek
iO voert structureel proactieve werkzaamheden uit om verstoringen te voorkomen en de kwaliteit van de oplossing continu te waarborgen. Bevindingen worden omgezet in concrete maatregelen of adviezen aan de Opdrachtgever.

### 11.2 Applicatie
Proactief applicatiebeheer omvat:

- Controle op CMS-inrichting en gebruikersrechten
- Analyse van applicatie- en database-logboeken
- Opschonen van cache en tijdelijke gegevens
- Controle op externe koppelingen en maatwerkfunctionaliteiten
- Verbetervoorstellen op het gebied van performance en kwaliteit

### 11.3 Cloud / Hosting
Proactief infrastructuurbeheer omvat:

- Periodieke sanity check (Security Center, Azure Monitor, Cost Review)
- Signalering van verouderde of inefficiënte resources
- Aanbevelingen voor kostenbesparing en prestatieverbeteringen
- Bijhouden van Microsoft-aankondigingen over uitfasering en verplichte wijzigingen

---

## 12. Gebruikersondersteuning

### 12.1 Applicatie
iO beantwoordt vragen van geautoriseerde medewerkers van de Opdrachtgever over het gebruik van de applicatie. Het betreft informatieve vragen over bestaande werking en inrichting. Verzoeken die leiden tot aanpassingen worden behandeld als wijziging.

*(Dit hoofdstuk heeft geen Generiek of Cloud/Hosting subhoofdstuk – gebruikersondersteuning is uitsluitend applicatie-specifiek.)*

---

## 13. Cloud Enablement & Infrastructure as Code

### 13.1 Cloud / Hosting
iO beheert een fundament van tooling, standaarden en expertise waarop alle infrastructuurdiensten worden uitgevoerd. Dit omvat:

**Cloud Enablement:**
- Centraal beheerde monitoring- en beheertooling
- Gestandaardiseerde werkwijzen en ISO-baselines voor cloud resources
- Advanced Support for Partners (ASfP) bij Microsoft

**Infrastructure as Code:**
- Infrastructuurconfiguratie vastgelegd en beheerd in code
- Gegarandeerde pariteit tussen omgevingen
- Herbruikbare modules en versiebeheer op infrastructuurwijzigingen

**Microsoft Advanced Support (ASfP):**
- Geprioriseerde technische ondersteuning en break-fix support van Microsoft
- Directe escalatiemogelijkheid naar gespecialiseerde Microsoft-teams
- Toegewezen Partner Success Accountmanager

*(Dit hoofdstuk heeft geen Generiek of Applicatie subhoofdstuk – het is uitsluitend hosting/cloud-specifiek.)*

---

## 14. Gelaagde Verantwoordelijkheid

Per component van de oplossing wordt vastgelegd wie de verantwoordelijkheid draagt:

| Component | iO | Opdrachtgever | Derde partij |
|---|---|---|---|
| Applicatiecode & CMS | ● | | |
| Integraties & koppelingen | ● | | ○ |
| Cloud Resources (compute, storage) | ● | | |
| Netwerk & DNS | ● | ○ | ○ |
| Externe services (SaaS, API's) | | ● | ○ |
| Contentbeheer | | ● | |
| Licenties derde partijen | | ● | |

● = verantwoordelijk | ○ = betrokken

*(De concrete invulling per klant wordt vastgelegd in bijlage A — Scope en bijlage C — componenten/URLs, onder het managed-services-contract.)*

---

## Bijlage: Modulariteitsinstructie

Dit document is modulair opgebouwd. Bij het opstellen per klant:

1. **Geïntegreerd (app + hosting):** Gebruik het volledige document
2. **Alleen applicatie:** Verwijder alle §x.3 subhoofdstukken en hoofdstuk 13
3. **Alleen hosting:** Verwijder alle §x.2 subhoofdstukken en hoofdstuk 12
4. Pas de verantwoordelijkheidsmatrix (§14) aan op de specifieke klantsituatie
