# Confluence-domeinpagina — Cloud Enablement en Infrastructure as Code

## Titelpagina (Confluence)

| Veld | Invullen |
|------|----------|
| **Paginatitel** | Cloud Enablement en Infrastructure as Code |
| **Doelgroep** | Opdrachtgever en engineering / Cloud Operations |
| **Versie / datum** | Concept — 6 mei 2026 |

---

## Management summary

### Cloud Enablement en Infrastructure as Code in het kort

Cloud Enablement dekt infrastructuur‑standaarden, centrale tooling, werkwijzen en verkregen ondersteuning die alle beheerde cloudklanten gebruiken maar niet terechtkomen als los uurtarief op elk ticket apart. Infrastructure as Code beschouwt infrastructuur als gereviewde, versiebare bron zodat omgevingen consistent blijven, veiliger worden gewijzigd en voorspelbare herstelpaden mogelijk worden. Het eerste inrichtingswerk en grote infra‑herschikking worden als project geleverd en gefactureerd op Time & Material; reguliere beheerhandelingen binnen gebruikelijke scope vallen onder de vooraf gekochte Cloud Operations-retainer waar contract dat zo bepaalt. De maandcomponent Enablement wordt naar schaal en complexiteit ingeschat volgens gangbare tariefband die tussen partijen commerciëel wordt gekozen bij aanvang.

### Welke KPI’s en normen zijn hier relevant

- Maandelijkse Cloud Enablement‑component naar indicatief tariefbereik gekoppeld aan Azure‑verbruiksprofiel en complexiteit
- Grens tussen gedeelde enablementbasis en retainer gekochte operationele capaciteit tegenover infra‑project tegen Time & Material
- IaC als uitgangspunt voor nieuwe of ingrijpend vernieuwde infrastructuur inclusief gereviewde doorvoer waar contract dat voorschrijft

---

## KPI’s en meetbare afspraken

| KPI / norm | Definitie (kort) | Waarde / termijn | Geldigheid / venster | Toelichting (indien nodig, in deze cel) |
|------------|------------------|------------------|------------------------|------------------------------------------|
| Cloud Enablement | Gedeelde kostenbasis voor tooling, standaarden, platformkennis en Microsoft‑partnerondersteuning die voor deze route nodig worden geacht voor Azure Managed Services | Indicatieve band €250–€1.750 per maand afhankelijk van gebruik Azure en grootteorde van de ingezette resources | Gedurende de overeengekomen duur waar Enablement deel van uitmaakt | Geen declarabiliteit als urenschatting per dossier maar vaste blok; exact bedrag wordt in offerte gevangen. |
| Retainer tegenover infra‑projectwerk | Routine Cloud Operations loopt tegen retainer; initiële of grote infra‑inzet wordt los begroot als project tegen Time & Material | Projectfacturatie op basis van nacalculeerbare tijd en middelen tussen partijen | Zolang tussen partijen een start‑ of grootschalig herschikkingstraject voor afzonderlijke financiering is overeengekomen naast verwacht gebruik uit de retainer | Retaineromvang wordt in overleg bijgesteld waar het werkelijk verbruik structureel uit de pas loopt met de gekochte retainer. |
| IaC‑standaard voor nieuwe uitrol | Primaire infra‑uitrol via gereviewde code waar dat haalbaar is | Geldt voor nieuwe of ingrijpend herziene infra volgens de tussen partijen vastgelegde werkwijze | Gedurende opbouw naar de doelarchitectuur, inclusief eventueel vastgelegde tussenfasen bij migratie uit legacy | Hybride fasen tussen handmatige en codegestuurde inrichting hebben eigen risico- en eigenaarschapsafspraken in het bijbehorende project. |

---

## Generiek — hoe iO hieraan werkt

### Scope en uitgangspunten

- Enablement dekt gemeenschappelijke onderdelen zoals centrale tooling, standaarden en partnerondersteuning die voor klanten beschikbaar zijn zonder elk voordeel als aparte declarabele tijd op één dossier te boeken.
- IaC maakt infra‑mutaties traceerbaar ten opzichte van handmatige wijzigingen in portal en ondersteunt gecontroleerde rollback waar dat technisch mogelijk is.

### Werkwijze

- Bij onboarding van Managed Services maakt het offerte‑ en begrotingsniveau duidelijk welk deel Enablement beslaat, welk deel naar de Cloud Operations-retainer gaat en of er aanvullend een projectbudget voor inrichting of migratie wordt voorzien.
- Waar tussen partijen een gereviewde planfase voor infrastructuur staat beschreven, doorlopen infra‑aanpassingen die stap vóór productie-rollout plaatsvinden.

### Samenspel Opdrachtgever ↔ iO

- De Opdrachtgever stelt naamgeving en grenzen tussen subscriptions beschikbaar zodat IaC-parameters de omgevingen ontwikkeling, test, acceptatie en productie consistent kunnen vullen zonder gedrag dat afwijkt van de codebase.
- Release- en vrijgavemomenten waar de business om vraagt worden afgestemd op migratie- of groot onderhoudsvensters voor infrastructuur wanneer die elkaar raken.

---

## Applicatie-onderhoud

De applicatie blijft in beginsel eigenaar van build en release‑pijplijn; infra levert veilige grenzen en gekoppelde eindpunten waar de applicatie volgens afspraak wordt uitgerold, met centrale afspraken over geheimen en configuratie.

### Wat iO concreet doet

- Afstemmen hoe applicatieconfiguratie en secrets gekoppeld blijven aan infra‑outputs zoals endpoints en vault‑objecten volgens tussen partijen geautoriseerde werkwijze.

### Operationele details (applicatie)

- Zoveel mogelijk parametrisatie per omgeving zodat regressietests tegen een infra-opzet lopen die representatief is voor productie.

---

## Cloud Operations

Het Cloud‑team heeft bij voorkeur mede eigenaarschap of reviewplicht op de IaC‑codebasis en wijzigingen met productierisico; waar de Opdrachtgever eigen SRE heeft, blijven integratie-afspraken leidend.

### Wat iO concreet doet

- Technische schuld in IaC (dubbele definities opruimen, verouderde patronen vervangen, testdekking waar zinvol) inplannen binnen de retainer of als project, naar omvang en risico tussen partijen.

### Operationele details (cloud)

- Drift tussen live Azure‑toestand en gewenste toestand afhandelen met een gereviewd correctiepad, ondersteund door tooling daar waar dat tussen partijen wordt ingezet.

---

*Titel voor opslag:* `Confluence_Domeinpagina_Cloud_Enablement_en_IaC.md`
