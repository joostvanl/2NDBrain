# Bijlage A — Scope Managed Services

**Intern bestand:** `Bijlage_Scope_Managed_Services.md`  
**Documenttype:** contractuele scope-bijlage (beknopte uitwerking) — **integraal onderdeel** van het juridische contract als **bijlage A**  
**Naslag / detail:** `Applicatie_Dienstverlening.md`, `Cloud_Dienstverlening.md`, `Confluence_Domeinpagina_*.md` en `Dienstbeschrijving_Template_iO_Managed_Services.md`  
**Uitleg documentlagen:** `Documentstructuur_Managed_Services.md`  
**Meetbare normen:** Service Level Agreement (SLA) — alleen van toepassing op hieronder **in scope** genoemde onderdelen



| Veld | Waarde |
| --- | --- |
| Opdrachtgever | **[KLANTNAAM]** |
| Oplossing / domein | **[KORTE OMSCHRIJVING]** |
| Versie scope-bijlage | **[VERSIE]** |
| Datum | **[DATUM]** |



---

## 1 Doel van deze bijlage

Deze bijlage legt vast **wat** iO levert onder de overeenkomst: welke **tweepijlers-scope** geldt (applicatie-onderhoud en/of cloud-onderhoud) en welke **deelgebieden** daarbinnen vallen.

Alles wat hier niet **uitdrukkelijk in scope** staat, valt **niet** onder de overeengekomen levering, tenzij Partijen dit schriftelijk anders overeenkomen.

---

## 2 Pijlerkeuze — bindend voor deze opdracht

De managed-services-propositie rust op **twee dwarsliggende pijlers**. Per opdracht wordt vastgelegd of de **volledige** pijler bij iO in scope is.

**Toepassing:**

-   **Ja** = iO levert de onder §3 respectievelijk §4 beschreven **pijler als geheel**, voor deze opdracht, conform SLA en overige contractdocumenten.
-   **Nee** = deze **gehele pijler** valt **niet** onder de overeenkomst met iO; verantwoordelijkheid en uitvoering liggen dan bij Opdrachtgever en/of een andere leverancier.



| Pijler | In scope voor deze opdracht |
| --- | --- |
| **A. Applicatie-onderhoud** — beheer van de applicatie, website, CMS en aanverwante applicatie-laag (servicedesk-stroom richting applicatieteam, proactief/reactief applicatiebeheer, applicatie-monitoring, OTAP vanuit applicatieperspectief, gebruikersondersteuning, enz.) | **[ Ja / Nee ]** |
| **B. Cloud-onderhoud (Azure Managed Services)** — beheer van cloud-infrastructuur en platform (CloudOps, Cloud Enablement, IaC waar van toepassing, infrastructuur-monitoring, cloud-security en continuïteit op platformniveau, Azure-resources in scope, enz.) | **[ Ja / Nee ]** |



**Minimum:** Voor een geldige managed-services-scope moet **minstens één** van de pijlers **Ja** zijn. Zijn beide **Nee**, dan zijn er geen managed services van iO onder deze bijlage.

**Combinaties:**



| A — Applicatie | B — Cloud | Typisch patroon |
| --- | --- | --- |
| Ja | Ja | Geïntegreerd applicatie- en cloudbeheer onder één governance en SLA-kader. |
| Ja | Nee | Alleen applicatiebeheer; onderliggende infrastructuur niet door iO onder deze bijlage beheerd — randvoorwaarden en escalatie met infrastructuurpartij bij Opdrachtgever. |
| Nee | Ja | Alleen Azure/cloudbeheer; geen applicatiebeheer door iO onder deze bijlage — applicatie-eigenaren en eventueel andere partijen zijn verantwoordelijk voor de applicatielaag. |



---

## 3 Scope-detail — Applicatiepijler *(alleen van toepassing indien §2.A = Ja)*

Indien **§2.A = Nee**, is dit hele onderdeel **niet van toepassing** en levert iO **geen** van onderstaande onderdelen.

Indien **§2.A = Ja**, omvat de applicatiepijler in ieder geval het volgende **samenhangende pakket** (conform naslag, hier beknopt samengevat):



| # | Deelgebied applicatiepijler | In scope |
| --- | --- | --- |
| A1 | **Service Desk** — centraal aanspreekpunt; registratie, routing en voortgang voor **applicatie-gerelateerde** meldingen (incident, serviceaanvraag, change, probleem, gebruikersvraag) | Ja |
| A2 | **Proactief applicatiebeheer** — preventief beheer van applicatie/CMS/logboeken/koppelingen conform naslag | Ja |
| A3 | **Reactief applicatiebeheer** — incident- en probleembeheer op applicatieniveau | Ja |
| A4 | **Monitoring & alerting** — applicatiegerichte monitoring (o.a. beschikbaarheid TTFB/performance, vitale applicatie-/CMS-signalen) | Ja |
| A5 | **Security (applicatie)** — Security Team-toezicht en doorvoeren van security-updates op CMS/framework/applicatiecomponenten volgens afgesproken norm | Ja |
| A6 | **Technisch beheer** — applicatie/CMS-configuratie en -onderhoud binnen beheer-scope | Ja |
| A7 | **Systeem- en software-updates** — applicatie-stack (CMS, frameworks, dependencies) volgens OTAP | Ja |
| A8 | **Wijzigingsbeheer** — gecontroleerde doorvoer van **technische** wijzigingen binnen beheer; geen nieuwe business-features tenzij apart begroot | Ja |
| A9 | **OTAP** — beheer en ondersteuning van applicatie op niet-productie- en productieomgevingen **voor zover** die omgevingen onder deze overeenkomst vallen | Ja |
| A10 | **Gebruikersondersteuning** — vragen over gebruik van de applicatie voor geautoriseerde gebruikers | Ja |
| A11 | **Service management** — coördinatie, rapportage en SLA-review **voor het applicatie-deel** van de dienstverlening | Ja |



**Standaard uitgesloten op applicatiepijler** (tenzij schriftelijk anders overeengekomen):

-   Doorontwikkeling, nieuwe functionaliteit en grote functionele trajecten.
-   Releasemanagement voor major releases als apart project.
-   Deployments buiten afgesproken vensters / Service Desk-openingen.
-   Functionele changes boven **\[X\] uur** — apart begroot.

---

## 4 Scope-detail — Cloudpijler *(alleen van toepassing indien §2.B = Ja)*

Indien **§2.B = Nee**, is dit hele onderdeel **niet van toepassing** en levert iO **geen** van onderstaande onderdelen.

Indien **§2.B = Ja**, omvat de cloudpijler in ieder geval het volgende **samenhangende pakket** (Azure Managed Services, conform naslag):



| # | Deelgebied cloudpijler | In scope |
| --- | --- | --- |
| B1 | **Cloud Resources** — Azure-resources die onder deze overeenkomst vallen (zie ook §6); leveringsmodel **[ iO CSP / tenant Opdrachtgever ]** | Ja |
| B2 | **Cloud Enablement** — fundament (tooling, standaarden, partner-support waar toegepast) voor cloudbeheer | Ja |
| B3 | **Cloud Operations** — operationeel beheer door CloudOps (break-fix, lifecycle, platformcontinuïteit) | Ja |
| B4 | **Infrastructure as Code** — waar van toepassing beheer van IaC en pariteit tussen omgevingen | Ja |
| B5 | **Monitoring & alerting** — infrastructuurmonitoring (o.a. Golden Signals, resourcegezondheid, kosten-/budgetsignalering) | Ja |
| B6 | **Continuity management** — omgaan met verplichte platformwijzigingen en deprecation door leverancier | Ja |
| B7 | **Security management (infrastructuur)** — hardening, compliance-opvolging op infra, backupvalidatie **op infra-niveau** conform naslag | Ja |
| B8 | **Infrastructuur onderhoud & optimalisatie** — structureel en/of projectmatig infra-onderhoud binnen beheer-scope | Ja |
| B9 | **Third-party coördinatie (infra)** — ondersteuning bij escalaties richting o.a. Microsoft/platform **[ voor zover van toepassing ]** | Ja |
| B10 | **Service management** — rapportage en SLA-review **voor het cloud-deel** van de dienstverlening | Ja |



**Randvoorwaarden cloudresources:** Facturatie en juridische keten voor Azure/Microsoft zijn zoals in het contract en/of Raamovereenkomst vastgelegd (o.a. CSP-model versus eigen tenant).

---

## 5 Gedeelde orchestratie en Servicedesk-logica

Sommige functies hangen **samen** met beide pijlers maar worden alleen **uitgevoerd voor de stroom die in scope is**:



| Onderdeel | Werkwijze afhankelijk van §2 |
| --- | --- |
| **Service Desk als voordeur** | Open voor alle meldingen die onder **actieve pijler(s)** vallen. Meldingen die uitsluitend een **niet-in-scope pijler** raken, worden **niet** onder deze overeenkomst door iO opgepakt (wel kan doorverwijzing/advisering worden afgesproken in het DAP). |
| **SLA Management / rapportage** | Rapportage en KPI’s sluiten aan op **wat in scope is**. Geen prestatie-eis van iO voor een pijler die **Nee** is. |
| **Third Party Management** | Alleen voor ketens die horen bij **actieve pijler(s)**. |



---

## 6 Beheerde omgevingen en URLs

Concrete scope-objecten (URLs, OTAP-namen, subscriptions/resource groups):



| Object | Omgeving | Opmerking |
| --- | --- | --- |
| **[URL / resource]** | **[Prod / Test / …]** | **[ … ]** |



*(Voeg regels toe tot volledig; gedetailleerd infra-overzicht: **bijlage C**.)*

---

## 7 Relatie met SLA en DAP

-   **SLA:** De rechten en plichten uit de SLA gelden voor **de combinatie van actieve pijlers** en de daar beschreven meetpunten. KPI’s die zien op een **uitgeschakelde pijler**, zijn **niet van toepassing**.
-   **DAP:** Operationele afspraken (contacten, escalatie, vensters) staan in het **DAP**; het DAP is een **levend document** en geen statische contractbijlage, tenzij Partijen anders bepalen.

---

## 8 Verwijzing naar uitgebreide beschrijvingen

Uitwerking per onderwerp staat in de **Confluence-markdown**\-pagina’s (naslag). Bij inhoudelijke vragen: eerst deze bijlage en de SLA; daarna naslag voor detailniveau.

---

## 9 Gelaagde verantwoordelijkheid *(richtinggevend voor deze opdracht)*

De onderstaande matrix geeft per **component** of domein aan welke partij **primair verantwoordelijk** is voor exploitatie en inhoud. Afwijkingen zijn alleen geldig indien Partijen deze **schriftelijk** hebben vastgelegd (bijlage C, contract of order).



| Component / domein | Verantwoordelijke partij |
| --- | --- |
| Infrastructuur (hosting/cloud-platform in scope bij Leverancier) | **[Leverancier / Opdrachtgever / Derde — invullen]** |
| Netwerk & internetconnectie tot overeengekomen grenspunt | **[ … ]** |
| Hardware / virtuele machines / platformresources | **[ … ]** |
| Besturingssysteem (guest OS) binnen cloudbeheer | **[ … ]** |
| Standaardsoftware op infra (waar onder cloudbeheer) | **[ … ]** |
| Applicatie, website, CMS (binnen applicatiepijler) | **[ … ]** |
| Changes & doorontwikkeling buiten beheer-scope | **[ … ]** |
| Functioneel beheer & businessrules | **[ Opdrachtgever tenzij anders overeengekomen ]** |
| Contentbeheer | **[ Opdrachtgever ]** |
| Eindgebruikers-helpdesk buiten gecontracteerde gebruikersondersteuning | **[ Opdrachtgever ]** |



---

## 10 Afhankelijkheid infrastructuur

Waar bijlage A **alleen de applicatiepijler** als **Ja** markeert en infrastructuur bij een derde of bij Opdrachtgever berust, geldt dat Leveranciers prestaties **mede afhankelijk** zijn van die infrastructuur. De juridische uitwerking van leveranciers-, beschikbaarheids- en aansprakelijkheidsketens staat in **artikel 7** van het contract. Technische details van grenzen en contacten staan in **bijlage C** en het DAP.

---

*Einde bijlage A (scope).*