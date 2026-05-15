# Confluence-domeinpagina — Problem Management

## Titelpagina (Confluence)

| Veld | Invullen |
| --- | --- |
| **Paginatitel** | Problem Management |
| **Doelgroep** | Opdrachtgever en delivery (operationeel samenspel) |
| **Versie / datum** | Review en Work in Progress — 13 mei 2026 |

---

## Management summary

### Problem management in het kort

Probleem Management heeft als doel na incidentherstel de onderliggende oorzaak van storingen te onderzoeken en aan te pakken zodat vergelijkbare fouten zich niet blijven herhalen. iO onderzoekt patronen en samenhang tussen incidenten, levert n.a.v. P1 incidenten een Root Cause Analysis (RCA), en bewaakt workaround-registratie en de planning naar een duurzame oplossing volgens de Change Management processen.

### Welke KPI’s en normen zijn hier relevant

Hieronder de meetbare normen die aan dit domein zijn gekoppeld.

-   Root Cause Analyse (RCA), prioriteit P1
-   Root Cause Analyse (RCA), prioriteit P2 (optioneel op verzoek Opdrachtgever)
-   Probleemopvolging — Known Error na workaround
-   Probleemopvolging — planning structurele oplossing na RCA

---

## KPI’s en meetbare afspraken

| KPI / norm | Definitie (kort) | Geldigheid / venster | Toelichting (indien nodig, in deze cel) |
| --- | --- | --- | --- |
| Root Cause Analyse (RCA) — P1 | Schriftelijke Root Cause-analyse na kritiek incident | Werkdagen; telling vanaf moment waarop de dienst naar afspraak is hersteld en het incident uit incidentbeheer kan worden afgesloten | RCA is voor P1 altijd verplicht. Herstel = vastgesteld herstel van de dienst voor dat incident. |
| Root Cause Analyse (RCA) — P2 | Optionele dieptestudie op verzoek van de Opdrachtgever | Zoals per geval afgestemd tussen Opdrachtgever en iO | Geen vaste SLA-termijn tenzij partijen die schriftelijk afspreken. |
| Probleemopvolging — Known Error na workaround | Registratie van workaround als bekende fout voor vervolganalyse en wijzigingsbeheer | Werkdagen na ticketafsluiting in incidentbeheer | Geldt wanneer het incident met een workaround wordt gesloten; registratie ondersteunt gecontroleerde structurele oplossing. |
| Probleemopvolging — planning structurele oplossing | Plan voor definitieve oplossing of structurele maatregel na RCA | Termijn loopt vanaf de RCA-opleverdatum (werkdagen). | Tenzij partijen schriftelijk andere planning afspreken (bijv. omvangrijke release). |

---

## Generiek — hoe iO hieraan werkt

### Scope en uitgangspunten

-   Problem Management sluit aan op signalering en afhandeling uit Incident Management: het gaat om het achterhalen van onderliggende technische problemen die leiden tot (mogelijk) terugkerende incidenten. Door gestructureerd Problem Management en de juiste opvolging hiervan kan de stabiliteit en duurzaamheid van de omgeving worden geoptimaliseerd.
-   Binnen scope vallen detectie van patronen (monitoring, ticketgeschiedenis, melding van de Opdrachtgever), diagnose inclusief RCA waar van toepassing, registratie van Known Errors na een workaround, en voorbereiding van structurele oplossingen die via wijzigingsbeheer worden uitgevoerd.
-   Buiten scope blijven structurele aanpassingen en verbeteringen aan de beheerde omgeving die middels Change Management processen worden geïmplementeerd.

### Werkwijze

-   Melding en voortgang lopen via het centrale ticketproces van de servicedesk: een potentieel probleem ontstaat uit één of meer incidenttickets of uit interne signalering; het werk wordt als apart ticket met een link naar het/de oorspronkelijke incident(en) voortgezet zodat status voor de Opdrachtgever volgbaar blijft.
-   Typische stappen: detectie (patroon of verzoek tot Root Cause Analyses), diagnose inclusief benodigde onderzoeken en eventuele afstemming met leveranciers die onder het beheer van de Opdrachtgever vallen, vastlegging van oorzaak en aanbevelingen, registratie als Known Error.
-   Problem Management wordt gepland door in overleg met de Opdrachtgever een geschikt moment te kiezen, dit in de planning te zetten en de beschikbare onderzoekstijd te maximeren. Het maximale aantal onderzoeksuren wordt vooraf afgestemd met de Opdrachtgever.
-   Binnen de afgesproken tijd voert iO het onderzoek uit, stelt een rapport op met bevindingen, conclusies en aanbevelingen en deelt dit met de Opdrachtgever. Alle gevonden verbeteringen worden geregistreerd als changes in JIRA, zodat de opvolging via wijzigingsbeheer geborgd is.
-   De Root Cause Analyse voor een P1-incident bevat minimaal: beschrijving van het incident en de tijdlijn; analyse van de Root Cause; impact op gebruikers, systemen of processen en duur daarvan; genomen herstelmaatregelen; structurele opvolging en aanbevelingen om herhaling te voorkomen.
-   Rapportage naar de Opdrachtgever gebeurt via het ticket, RCA-document waar geleverd, en periodieke service-overleggen waar openstaande problemen en geplande oplossingen worden meegenomen.

### Samenspel Opdrachtgever ↔ iO

-   De Opdrachtgever levert informatie over gebruikersimpact, recente wijzigingen in de keten en toegang tot derden die iO nodig heeft voor het onderzoek. iO levert de technische data en informatie uit de door iO beheerde systemen en vertaalt deze naar reproduceerbare bevindingen en conclusies voor de Opdrachtgever. Voor een extra verdiepende Root Cause Analyse op P2-niveau maken Opdrachtgever en iO vooraf afspraken over gewenste diepgang en doorlooptijd.
-   De prioriteit van het onderliggende incident wordt bepaald binnen incidentbeheer. De prioriteit van het bijbehorende probleemticket wordt afzonderlijk bepaald op basis van impact en herhaalbaarheid en staat dus niet automatisch gelijk aan de incidentprioriteit. De Opdrachtgever kan extra aandacht vragen voor terugkerende problemen door patronen te melden en om een uitgebreidere analyse te vragen, ook als het oorspronkelijke incident een lagere prioriteit heeft.
-   Een Root Cause Analyse wordt in de praktijk meestal binnen 5 werkdagen na het oplossen van het incident opgeleverd, in lijn met de KPI-afspraak voor P1-incidenten, maar hierover kunnen waar nodig maatwerkafspraken worden gemaakt. Alleen wanneer partijen daar expliciet en schriftelijk afspraken over maken, geldt een concrete termijn.
-   Het doorvoeren van de gevonden en geanalyseerde oplossingen gebeurt als wijziging (change); omvangrijkere wijzigingen en verbeteringen die neerkomen op wezenlijk nieuwe functionaliteit of ontwerpkeuzes buiten beheerbudget of -scope worden als voorstel en eventuele offerte via het reguliere aanvraagtraject opgepakt en vallen daarmee buiten de standaard beheerovereenkomst.

### Root Cause Analyses en continue verbetering

Een Root Cause Analyse is een vast onderdeel van Problem Management. Meestal wordt een analyse gestart naar aanleiding van een incident binnen Incident Management (bijvoorbeeld een P1 of, als afgesproken, een P2), maar de uitvoering, rapportage en opvolging horen altijd thuis in dit domein.

Problem Management stopt niet bij het vaststellen van een directe technische oorzaak. iO zoekt naar de onderliggende Root Cause én naar verbetermogelijkheden die herhaling structureel voorkomen. Dit vraagt om gestructureerde analyse én een blik die verder gaat dan het incident zelf.

#### Root Cause-analyse met de 5 Why’s

Bij complexe of terugkerende problemen past iO waar nuttig de 5 Why’s-methode toe: door herhaaldelijk te vragen naar de oorzaak achter de oorzaak, wordt de werkelijke Root Cause blootgelegd in plaats van alleen het symptoom. Een tijdelijke ingreep op het symptoom voorkomt herhaling niet structureel; een ingreep op het Root Cause-niveau wel. Dit is geen vaste verplichting in elk dossier maar wordt ingezet als hulpmiddel waar dat nodig is. De uitkomst van de gekozen analyse vormt de basis voor de aanbevelingen in de RCA en de planning van structurele maatregelen.

#### Blik op proces, organisatie en governance

Een incident heeft lang niet altijd een puur technische oorzaak. Terugkerende problemen wijzen meestal op knelpunten in werkwijzen, verantwoordelijkheden of governance. Als de analyse daartoe aanleiding geeft, kijkt iO ook naar:

-   **Proces** — Zijn werkwijzen helder, actueel en door alle betrokkenen gevolgd? Zijn er stappen die structureel worden overgeslagen of te laat worden uitgevoerd?
-   **Organisatie** — Is de verdeling van taken en verantwoordelijkheden tussen de Opdrachtgever en iO in de praktijk werkbaar? Zijn de juiste mensen op de juiste momenten betrokken?
-   **Governance** — Zijn beslisbevoegdheden duidelijk belegd? Wordt relevante informatie tijdig gedeeld en geborgd?
-   **Aanpak en tooling** — Zijn de gekozen methoden, standaarden of configuraties nog passend bij de huidige situatie en schaal van de dienstverlening?

#### Van analyse naar verbetering

Verbeteradviezen die voortvloeien uit deze analyse worden concreet en uitvoerbaar geformuleerd. Waar verbetering een wijziging in configuratie, inrichting of werkwijze vereist, wordt dit opgepakt via het reguliere wijzigingsbeheerproces. Bredere organisatorische of governance-verbeteringen worden als aanbeveling opgenomen in de RCA of ingebracht in het periodieke service-overleg, zodat de Opdrachtgever hierop kan sturen en besluiten.

Het doel is niet alleen het oplossen van het huidige probleem, maar het versterken van de dienstverlening als geheel.

---

## Applicatie-onderhoud

Op dit vlak richt Problem Management zich op terugkerende incidenten veroorzaakt door fouten in de applicatie, het CMS en maatwerk, en op structurele degradatie die zichtbaar wordt in logging en metrics. Daarnaast kijkt iO naar de samenhang met integraties en releases. RCA’s en Known Errors koppelt iO aan concrete componenten en wijzigingstrajecten, zodat een structurele oplossing getest kan worden voordat de productieomgeving wordt aangepast.

### Wat iO concreet doet

-   Analyse van terugkerende fouten in applicatiecode, CMS-configuratie of maatwerkfunctionaliteit en vertaling naar gerichte wijzigingsaanvragen.
-   Onderzoek naar structurele performanceproblemen die uit meetgegevens of logs blijken en niet met eenmalige tuning zijn verholpen.
-   Patroonanalyse bij integratie- en koppelingsincidenten, inclusief afstemming aan welke zijde van een koppeling de meeste fouten optreden (welke component eerder faalt of de grootste storingsbijdrage levert).

### Operationele details (applicatie)

-   RCA’s en Known Error-registraties koppelt iO aan de betrokken applicatiecomponenten en releases, zodat waar nodig eerst op de niet-productieomgevingen in de DTAP-lijn (Development, Test, Acceptance, Production) getest kan worden voordat wijzigingen naar productie worden doorgevoerd.
-   Leveranciers van software-as-a-service (SaaS) of programmeerinterfaces (API’s) waar de Opdrachtgever contractpartij is, hebben de plicht om mee te werken aan het onderzoek door relevante technische details en loggegevens te leveren. iO ondersteunt de Opdrachtgever hierbij door reproduceerbare feiten, technische tussenconclusies en gerichte vragen aan deze leveranciers aan te leveren.

---

## Cloud Operations

Hier richt Problem Management zich op herhalende signalen uit platform en infrastructuur: capaciteit, beschikbaarheid van diensten, configuratie- en netwerkpatronen, en tijdelijke mitigaties die vastgelegd moeten worden zodat cloudbeheer gericht naar permanente herbouw of schaalbewegingen kan worden doorvertaald via wijzigingsbeheer, met zicht op beschikbaarheid en Azure-kosten.

### Wat iO concreet doet

-   Analyse van terugkerende infrastructuur- of platformincidenten, waaronder resource-uitval, capaciteitsgrenzen en foutclusters in platformdiensten.
-   Doorlichting van herhalende configuratie- of netwerkpatronen die uit Azure-monitorlogboeken en alerts naar voren komen.
-   Waar nodig inschakelen van leverancier-ondersteuning voor het cloudplatform conform het contractueel afgesproken ondersteunings- en escalatieprofiel bij die leverancier (zoals prioriteit en responstermijnen bij vendor-support, bijvoorbeeld Microsoft voor Azure); onderzoeksuren volgen het geldende financiële kader voor dat traject.

### Operationele details (cloud)

-   Known Errors die samenhangen met tijdelijke infrastructuurmitigaties worden vastgelegd met verwijzing naar betrokken resources en naar change-concepten (conceptuele wijzigingsvoorstellen voordat ze formeel als change worden doorgezet), zodat permanente correctie via infrastructuur-as-code (IaC) of een gecontroleerde handmatige wijziging kan plaatsvinden.
-   Structurele oplossingen die een bredere architectuurwijziging vragen worden conform wijzigingsbeheer uitgewerkt met impact op beschikbaarheid en kosten daar waar schaal of nieuwe resources nodig zijn.

---

*Titel voor opslag:* `Confluence_Domeinpagina_Problem Management.md`