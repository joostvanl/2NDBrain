# Confluence-domeinpagina — OTAP- en omgevingsketen

## Titelpagina (Confluence)

| Veld | Invullen |
|------|----------|
| **Paginatitel** | OTAP- en omgevingsketen |
| **Doelgroep** | Opdrachtgever en delivery (operationeel samenspel) |
| **Versie / datum** | Concept — 6 mei 2026 |

---

## Management summary

### OTAP- en omgevingsketen in het kort

De OTAP‑structuur (Ontwikkeling, Test, Acceptatie, Productie) borgt dat wijzigingen en herstelpaden eerst buiten de live omgeving worden ontwikkeld en getest voordat gebruikers op productie worden geraakt. iO is verantwoordelijk voor technisch beheer en synchronisatie daarvan binnen de tussen partijen overeengekomen beheeromvang. Op verzoek kan productie‑inhoud worden overgezet naar acceptatie voor representatieve test; bevat die inhoud persoonsgegevens, dan vindt anonimisatie plaats conform de privacyafspraken tussen partijen. Niet‑productie kent geen gelijke beschikbaarheids‑KPI als productie tenzij contract dat expliciet uitbreidt.

### Welke KPI’s en normen zijn hier relevant

- Monitoring kernresources op niet‑productieve Azure‑middelen waar contract dat voorschrijft
- Kopie naar acceptatie op aanvraag met databescherming waar van toepassing

---

## KPI’s en meetbare afspraken

| KPI / norm | Definitie (kort) | Waarde / termijn | Geldigheid / venster | Toelichting (indien nodig, in deze cel) |
|------------|------------------|------------------|------------------------|------------------------------------------|
| Monitoring kernresources niet‑productie | Volgen van CPU, geheugen en schijfcapaciteit voor beheerde Azure‑resources op ontwikkeling en test waar contract dat voorschrijft | Continu waar monitoring is geconfigureerd | Zolang middelen onder beheer vallen | Signalen volgen dezelfde technische opzet als andere monitoring en alerting die voor deze opdracht tussen partijen is overeengekomen. |
| Kopie inhoudelijke product naar acceptatie | Optioneel werk om acceptatie inhoudelijk representatiever ten opzichte van live te maken | Op aanvraag als afzonderlijk wijzigingsdossier, vaak tegen Time & Material als contract dat financieel zo beschrijft | Per gevraagd traject | Persoonsgebonden inhoud wordt vooraf geanonimiseerd waar de tussen partijen vastgelegde werkwijze dat vóór overzetting voorschrijft. |

---

## Generiek — hoe iO hieraan werkt

### Scope en uitgangspunten

- De keten heeft als doel om code, configuratie en onderliggende middelen zo te verplaatsen dat risico voor eindgebruikers beperkt blijft binnen het beheer dat tussen partijen is overeengekomen.
- Als niet alle tussenstappen in het contract beheerd worden aangeboden, stemt iO vrijgaven af op het werkelijk aanwezige aantal omgevingen zonder vier niveaus aan te nemen die inhoudelijk niet bestaan.
- De keuze voor synthetische testdata versus geanonimiseerde kopie van productie hangt samen met privacy‑ en databeveiligingsafspraken tussen partijen.

### Werkwijze

- Releases en fixes volgen waar mogelijk de volgorde ontwikkeling, test en acceptatie vóór productie inclusief vrijgave-informatie via het normale wijzigingsproces.
- Incident‑hotfixes mogen tussenstappen inkorten maar alleen wanneer eindverantwoordelijken van beide organisaties dat schriftelijk voor die casus goedkeuren.
- Kopie‑werk van product naar acceptatie heeft een eigen ticket met inschatting en planning en, waar nodig, gecontroleerde anonimisatie vóór overzetting van gegevens.

### Samenspel Opdrachtgever ↔ iO

- De Opdrachtgever levert functionele acceptatie en testbereidheid voor UAT wanneer het contract daar eisen voor stelt.
- Grote kopie‑ of synchronisatieopdrachten krijgen waar nodig een offerte‑ of budgetafstemming voor start.

### Naamgevingsconsistentie OTAP en DTAP

Ontwikkel‑, Test‑, Acceptatie‑ en Productieomgevingen worden in teksten ook wel aangeduid met DEV/TEST/UAT en PROD; inhoudelijk blijft de betekenis gelijk.

---

## Applicatie-onderhoud

Hier vindt werk plaats op CMS‑, databaselaag‑ en maatwerkcode in niet‑productieve omgevingen vóór livegang.

### Wat iO concreet doet

- Houdt de niet‑productieve applicatiemiddelen actueel en in lijn met de tussen partijen vastgelegde baseline waar die bestaat.
- Bereidt test en regressie voor, registreert vrijgave-informatie per omgeving in het ticket en coördineert de overstap naar productie na inhoudelijke goedkeuring.

### Operationele details (applicatie)

- Voor ketentesten waar externe stubs of testaccounts nodig zijn, leveren partijen samen de benodigde gegevens volgens de vastgelegde verantwoordelijkheidsverdeling.

---

## Cloud Operations

Niet‑productieve cloudmiddelen gebruiken eigen resourcegroepen en netwerksegmenten daar waar tussen partijen dat technisch zo is vastgezet; alerting en budgetsignalen helpen verschil tussen omgevingen beheersbaar te houden.

### Wat iO concreet doet

- Voert infra‑wijzigingen eerst langs niet‑productie volgens gereviewde infrastructure-as-code praktijk waar dat contractueel geldt.
- Bij platformaankondigingen over lifecycle of uitfasering beoordeelt iO impact op elke stap in de keten en koppelt grote aanpassingen aan een change of apart project indien nodig.

### Operationele details (cloud)

- Kosten en gebruiksbudget per omgeving worden zichtbaar gehouden in periodieke rapportage zodra contract en tooling dat ondersteunen.

---

*Titel voor opslag:* `Confluence_Domeinpagina_OTAP_omgevingsketen.md`
