# Confluence-domeinpagina — Wijzigings- en releasemanagement

## Titelpagina (Confluence)

| Veld | Invullen |
|------|----------|
| **Paginatitel** | Wijzigings- en releasemanagement |
| **Doelgroep** | Opdrachtgever en delivery (operationeel samenspel) |
| **Versie / datum** | Concept — 6 mei 2026 |

---

## Management summary

### Wijzigings- en releasemanagement in het kort

Wijzigings- en releasemanagement regelt hoe technische en functionele aanpassingen gecontroleerd, getest en uitgerold worden. Waar DTAP‑omgevingen beschikbaar zijn, worden gewijzigde onderdelen eerst op niet‑productie beproefd; productiegoedkeuring door de Opdrachtgever is het normale slot, tenzij partijen schriftelijk afwijken voor een bijzonder noodgeval. Werk boven de in het beheercontract beschreven uurgrens wordt apart begroot; overige wijzigingsuren worden doorgaans tegen Time & Material verrekend zoals tussen partijen vastligt.

### Welke KPI’s en normen zijn hier relevant

- Releasevenster voor productiedoorvoer
- Grote wijzigingen ten opzichte van het contractueel uurdrempel
- Facturatie wijzigingen (Time & Material)
- Testketen vóór productie waar DTAP beschikbaar is

---

## KPI’s en meetbare afspraken

| KPI / norm | Definitie (kort) | Waarde / termijn | Geldigheid / venster | Toelichting (indien nodig, in deze cel) |
|------------|------------------|------------------|------------------------|------------------------------------------|
| Releasevenster voor productiedoorvoer | Wanneer reguliere inhoudelijke wijzigingen naar productie worden gezet | Werktijden werkdagen 09:00–17:00, geen standaard vrijdagrelease | Gedurende de contractlooptijd | Afwijking vergt expliciete schriftelijke instemming van de eindverantwoordelijken van beide partijen zoals beschreven in het releasebeleid. |
| Grote wijzigingen t.o.v. contractueel uurdrempel | Werk boven de grens zoals beschreven in het beheercontract | Apart begroot en ingepland vóór aanvang | Zoals tussen partijen financieel is vastgelegd | Zo blijft standaard beheer gescheiden van klein-projectmatige werkstromen. |
| Facturatie wijzigingen | Financiële verwerking van change-werk | Doorgaans Time & Material tenzij het pakket iets anders beschrijft | Facturatiecycli tussen partijen | Grotere blokken worden vooraf offerte-gekoppeld waar dat commerciële gebruik tussen partijen is. |
| Testketen vóór productie | Niet‑productie en acceptatie vóór productie | Bij aanwezige DEV/TEST/UAT eerst daar testen, daarna vrijgave op acceptatie voor productie | Zolang deze omgevingen contractueel bestaan | Kritieke security-updates (CVSS 9,0–10,0) strekken naar actie binnen een werkdag na patch-beschikbaarheid waar contract dat beschrijft; niet‑kritieke security patches binnen dertig kalenderdagen. Zelfs bij versnelde planning blijft test op niet‑productie onderdeel van de keten voor zover tijd en risico dat toelaten. |

---

## Generiek — hoe iO hieraan werkt

### Scope en uitgangspunten

- Dit domein beschrijft hoe geplande en goedgekeurde aanpassingen aan systeemonderdelen onder managed services worden voorbereid, getest en uitgerold, inclusief reguliere onderhoudsupdates die vrijgave en regressietest vragen maar niet uit een acuut incident hoeven voort te komen.
- Doorontwikkeling die zakelijk als project of groot functioneel blok is verkocht volgt niet automatisch onder het vast beheerblok maar het project- of offerteproces tussen partijen.
- Als een storing eerst wordt gestabiliseerd met een tijdelijke maatregel, volgt registratie als change zodra de inhoudelijke wijziging planbaar is, zodat productievrijgaven aantoonbaar blijven.

### Werkwijze

- Aanmelding geschiedt via de servicetooling; inhoudelijke beoordeling, impactrisico en testbehoefte worden bij het dossier vastgelegd voor planning tegen het release‑ of sprintritme tussen partijen.
- Stapvolgorde: aanmelding, inhoudelijke beoordeling, werk op niet‑productie, tests en review, vrijgave op acceptatie, vrijgave op productie en afronding inclusief kern van vrijgavinformatie in het ticket.
- Raken twee teams hetzelfde onderwerp, dan coördineert iO Cloud Operations en applicatie zodat de Opdrachtgever waar mogelijk een eenduidig voortgangslog ziet.

### Samenspel Opdrachtgever ↔ iO

- Productievrijgave volgt uit de tussen partijen vastgelegde rollen wie mag accorderen; zonder inhoudelijke goedkeuring gaat een wijziging op het reguliere pad niet naar productie.
- Loopt de inschatting voorbij het begrote blok of heeft het merkbare budgettaire gevolgen, dan wordt dat expliciet in het ticket of in een gekoppeld commercieel voorstel vastgelegd zodat de Opdrachtgever kan kiezen.
- Een vrijgave buiten het gebruikelijke tijdsvenster of op vrijdag vraagt schriftelijke instemming van de eindverantwoordelijken van beide organisaties, met een korte motivering in het dossier waarom deze uitzondering nodig is.

### Releasebeleid en risico

Het releasebeleid beperkt risico tijdens periodes waar minder directe ondersteuningsdekking beschikbaar is. Daarom gelden combinatie vrijdag vrij en vrijgaven buiten kantoortijd alleen met expliciete schriftelijke instemming; die beslissing blijft in het ticket gedocumenteerd voor latere audit.

---

## Applicatie-onderhoud

Hier worden wijzigingen uitgevoerd aan CMS‑configuraties, maatwerkcode, databasestructuren en integratie-eindpunten die onder het applicatie-onderdeel van het contract vallen.

### Wat iO concreet doet

- Zet wijzigingen neer op development- en testomgevingen, plant waar nodig acceptatietijd met vertegenwoordigers van de Opdrachtgever wanneer functionele acceptatie in het contract zo is beschreven.
- Koppelt een change waar zinvol aan een Known Error‑dossier zodat herstel van eerder werk met workaround geen dubbele werklijn wordt zonder oorzaakanalyse.

### Operationele details (applicatie)

- Op aanvraag kan inhoudelijke data van productie naar acceptatie worden gekopieerd tegen de gebruikelijke T&M-afspraken; bevat deze data persoonsgegevens, dan gebeurt anonimiseren vooraf waar de privacywet dat verlangt voordat de kopie beschikbaar komt voor test.

---

## Cloud Operations

Infrastructurele wijzigingen volgen waar contract dat voorschrijft een gereviewd infra-as-code traject naar productie toe, met test op niet‑productie vóór productievrijgave.

### Wat iO concreet doet

- Werkt parametrisatie en templating door op test zodat het gedrag van resources overeenkomt met wat verwacht wordt in productie binnen beschikbare tooling.
- Communiceert de verwachte kostenimpact bij schaal- of capaciteitswijzigingen wanneer budgetwaarschuwingen of financiële drempels in het contract daar om vragen voor een bewuste productie‑goedkeuring.

### Operationele details (cloud)

- Verplichte platformwijzigingen en uitfasering van resources door de cloudleverancier worden proactief gevolgd; grotere architectuurherzieningen gaan als afzonderlijk begroot werk buiten de standaard retainer zodra de omvang dat vereist.

---

*Titel voor opslag:* `Confluence_Domeinpagina_Wijzigings_en_Releasemanagement.md`
