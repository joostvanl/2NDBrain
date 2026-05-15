# Confluence-domeinpagina — SLA-meetkader

## Titelpagina (Confluence)

| Veld | Invullen |
|------|----------|
| **Paginatitel** | SLA-meetkader |
| **Doelgroep** | Opdrachtgever en delivery (afspraken rond meten en aanspraak) |
| **Versie / datum** | Concept — 6 mei 2026 |

---

## Management summary

### SLA-meetkader in het kort

Het SLA-meetkader beschrijft op welke omgevingen KPI’s gelden, hoe beschikbaarheid en incident-Service-Levels worden vastgesteld en welke verstoringen buiten berekening blijven. Reactie- en oppaktijden worden gemeten vanaf ticketingregistratie binnen het overeengekomen Service Window; meldingen buiten dat venster starten telling bij aanvang van het eerstvolgende venster. Overschrijding van de voor prioriteit vastgelegde toleranties kan leiden tot compensatie naar een vaste percentageschaal tot een vast maandmaximum, mits tijdig gemotiveerde aanvraag. Compensatie verrekent iO met facturatie van het beheerabonnement — er is geen contante uitkering.

### Welke KPI’s en normen zijn hier relevant

- Toepassing van meetbare SLA’s op omgevingen (focus productie tenzij anders vastgelegd)
- Beschikbaarheidsnorm voor productie
- Berekening beschikbaarheid met aftrek van niet meetellende periodes volgens formulering
- Praktische meetmethode beschikbaarheid op het meetpunt
- Compensatiepercentages naar overschrijding van reactie- of oppaktijd tegen tolerantie-eis
- Maandmaximum aan compensatie tegen factuurbedrag van het beheerabonnement
- Termijn voor indienen van gemotiveerde compensatieverzoek na een incident in scope
- Uitsluitingen voor KPI-meting van incident-respons
- Uitsluitingen voor beschikbaarheidsberekening bij ongeplande downtime

---

## KPI’s en meetbare afspraken

| KPI / norm | Definitie (kort) | Waarde / termijn | Geldigheid / venster | Toelichting (indien nodig, in deze cel) |
|------------|------------------|------------------|------------------------|------------------------------------------|
| SLA-scope naar omgeving | Beschikbaarheidsnormen en incident-KPI’s gelden voor de overeengekomen productie-ingangen; niet‑productie valt buiten deze normen tenzij partijen dat schriftelijk verruimen | Standaard uitsluitend productie | Gedurende geldende beheerrelatie met actieve SLA | Meetpunten en URL’s worden per opdracht vastgelegd in het werkafsprakensdossier. |
| Beschikbaarheid — norm productie | Percentage tijd dat de productieomgeving voor eindgebruikers bereikbaar en functioneel is volgens de norm | Minimaal 99,5% | Per kalendermaand | Normale belastingsaannames voor performance en piek zitten in de beschikbaarheidsdefinitie; structureel zwaarder gebruik kan herontwerp van capaciteit vereisen. |
| Beschikbaarheid — formule | Beschikbaarheid = ((A − B) / A) × 100%, met A de beschikbare periode minus geplande downtime en Opdrachtgever-/derde-gelinkte downtime, en B ongeplande downtime die aan iO wordt toegeschreven | Meting en rapportage per kalendermaand | Productie binnen scope | Definities van A en B volgen de letterlijke SLA-tekst zodat er geen interpretatieverschil ontstaat bij review. |
| Beschikbaarheid — meetmethode | Meting via geautomatiseerde monitoring op overeengekomen eindpunten | Time to first byte als doorslaggevend signaal dat de pagina reageert; full page-load als aanvullende performance-indicator waar toegepast | Zolang monitors actief zijn over de betreffende productie-ingangen | Incidentafhandeling gebruikt andere tijdblokken maar deelt registratiebasis voor communicatie naar de Opdrachtgever. |
| Incident — compensatiepercentages naar overschrijding | Compensatie wanneer afgesproken reactie- of oppaktijden worden overschreden naar de gekoppelde toleranties en matrix | 25–50 procent tijdsoverschrijding op die norm ⇒ 15% van het maandtarief; 50–75% ⇒ 25%; meer dan 75% ⇒ 35% | Afrekenperiode per kalendermaand | Basisbedrag blijft het maandelijks tarief onder het relevante beheerabonnement. |
| Incident — compensatiemaximum | Begrenzing totaalbedrag aan compensatie in één kalendermaand | Maximaal 50% van het maandelijkse tarief van de onder het abonnement lopende dienst | Per kalendermaand cumulatief | Meerdere overtredingen in dezelfde maand tellen tegen dezelfde begrenzing. |
| Incident — aanvraagtermijn compensatie | Gemotiveerd schriftelijk compensatieverzoek na een in-scope incident | Ontvangst bij iO binnen 30 werkdagen na het incident | Werkdagen conform vastgelegde definitie | Incident valt niet onder de uitgesloten categorieën en overschrijding is aantoonbaar via ticketregistratie. |
| Incident — KPI-uitsluitingen | Scenario’s waar reactie-/oppak-KPI niet tegen iO wordt afgezet | Onder meer: incident door derde partij waar de oplossing redelijkerwijs buiten iO’s feitelijke beheerinvloed ligt; niet‑productie tenzij verruimd; incident na wijziging buiten het geagendeerde beheerproces door de Opdrachtgever; niet naleven van gemaakte afspraken door de Opdrachtgever | Lopende contract | Bij oorzaak bij een derde geldt waar beschreven dat relevante meldingsinformatie doorzetten naar de Opdrachtgever een afdoende SLA-prestatie kan zijn. |
| Beschikbaarheid — uitsluitingen downtime | Perioden die B in formule niet verhogen | Onder andere: vooraf akkoord geplande stop; door derden veroorzaakte onbeschikbaarheid buiten reasonable iO-kring; gevolgen van eigen handelen Opdrachtgever; overmacht | Per rapportagemaand | Documentatie ondersteunt aftrek tijdens Service Level rapportagecycle. |

---

## Generiek — hoe iO hieraan werkt

### Scope en uitgangspunten

- SLA’s zijn alleen af te dwingen wanneer beheer formeel gestart is, het werkafsprakensdossier actueel is en meldingen via overeengekomen kanalen en geautoriseerde contactpersonen plaatsvinden. Randvoorwaarden zoals voldoende capaciteit vanuit delivery voor wijzigingsvolume en onderliggende infra die bij de KPI’s past zijn expliciete voorwaarden in het standaardkader.

### Werkwijze

- Incidenten worden in het ticketingregistratie-systeem van iO tijdgestempeld; reactietijd tot eerste inhoudelijke terugkoppeling en oppaktijd tot eerste analyse inclusief eerste inschatting richting Opdrachtgever worden tegen tolerantie-percentages afgezet per kalendermaand zoals beschreven onder incidentbeheer-documentatie van de SLA.
- Beschikbaarheid wordt geautomatiseerd gemeten; maandelijkse verwerking leidt tot vaststelling overschrijding of niet tegen de beschikbaarheids-target; gecombineerde rapportage wordt opgenomen in de periodieke rapportage waar dat voor deze opdracht wordt geleverd.
- Bij twijfel of een oorzaak derde-lijn of eigenaar-Opdrachtgever is wordt dit expliciet in het ticket gekwalificeerd voor latere SLA-review om discussie over KPI-telling te beperken.

### Samenspel Opdrachtgever ↔ iO

- Prioriteit wordt initieel door melder gekozen en bij afwijking met iO inhoudelijk rechtgetrokken conform prioriteitenmatrix urgentie-impact.
- Correcte melding inclusief beschikbare feiten verkort tijd naar eerste reactie en verkleint het risico dat tickets teruggeschoven worden voor aanvullen.

### Service Windows en P1-rand

Meting voor respons-KPI gebeurt binnen het gekozen venster zoals tussen partijen vastgezet (bij voorbeeld kantoortijden standaard). P1 kritiek heeft een noodtelefonie-route buiten rand die afzonderlijk in het dossier staat beschreven; misbruik van noodnummer voor lagere urgentie leidt tot verwerking eerstvolgende werkdag.

---

## Applicatie-onderhoud

Voor de applicatie betekenen de meetafspraken dat storingen zich vertalen naar response op functionele fouten langs front-end en CMS-ingangen en dat beschikbaarheid vooral ziet op de door eindgebruikers beladen pagina-routes waar die bewust SLA-dekking hebben.

### Wat iO concreet doet

- Gebruik van time-to-first-byte op de gekozen gebruikersstromen; externe integraties tellen alleen mee wanneer de SLA en meetpunten dat expliciet dekken.

### Operationele details (applicatie)

- Workarounds sluiten een incident KPI-matig af maar kunnen alsnog terecht in compensatie-telling als tijden waren overschreden vóór workaround.

---

## Cloud Operations

Infrastructurele storingen tussen compute, netwerk en platformdiensten bepalen veelal de meetbare downtime zolang beschikbaarheid wordt gemeten op de gekozen publiek bereikbare URL’s of loadbalanced ingangen.

### Wat iO concreet doet

- Geplande infrawijzigingen lopen via het change-proces en worden als geplande downtime met vooraf akkoord buiten B gelaten in de beschikbaarheidsberekening.

### Operationele details (cloud)

- Effecten van CDN of extern DNS buiten de door iO beheerde Azure-abonnementen vallen buiten beschikbaarheid wanneer die laag redelijkerwijs buiten iO’s beheerinvloed onder het contract blijft.

---

*Titel voor opslag:* `Confluence_Domeinpagina_SLA_meetkader.md`
