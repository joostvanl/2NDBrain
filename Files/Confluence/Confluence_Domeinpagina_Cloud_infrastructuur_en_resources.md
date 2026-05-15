# Confluence-domeinpagina — Cloud-infrastructuur en resources

## Titelpagina (Confluence)

| Veld | Invullen |
|------|----------|
| **Paginatitel** | Cloud-infrastructuur en resources |
| **Doelgroep** | Opdrachtgever en delivery (financieel en technisch samenspel) |
| **Versie / datum** | Concept — 6 mei 2026 |

---

## Management summary

### Cloud-infrastructuur en resources in het kort

Azure-resources kunnen via iO worden geleverd en achteraf naar verbruik worden doorbelast, of de Opdrachtgever heeft een eigen Microsoft-contract waarbij iO beheerdersrechten ontvangt en de gebruiksfactuur bij de Opdrachtgever ligt. Voor levering door iO wordt maandelijks achteraf gefactureerd op basis van werkelijk cloudverbruik, met toeslag voor voorfinanciering en daarmee samenhangende risico’s tussen partijen. Kosten en budget worden zichtbaar gehouden via monitoring en rapportage voor zover dat voor deze opdracht tussen partijen is vastgelegd.

### Welke KPI’s en normen zijn hier relevant

- Facturatie van via iO geleverd Azure-verbruik (pay-per-use met toeslag waar van toepassing)
- Toegangsrechten en tenant-eigenaarschap bij eigen klant‑Azure voor beheer door iO
- Inzicht in verbruik en budget in de afgesproken rapportagecycli voor deze opdracht

---

## KPI’s en meetbare afspraken

| KPI / norm | Definitie (kort) | Waarde / termijn | Geldigheid / venster | Toelichting (indien nodig, in deze cel) |
|------------|------------------|------------------|------------------------|------------------------------------------|
| Facturatie via iO (Microsoft Cloud Solution Provider) | Facturatie van de werkelijke Azure-kosten na afloop van de gebruiksperiode | Maandelijks achteraf, pay-per-use, met een toeslag van 20 procent voor voorfinanciering en daarmee samenhangende risico’s | Zolang tussen partijen vastligt dat resources via deze route lopen | Wijzigingen in schaal leiden tot andere verbruiksprofielen; afstemming loopt via Cloud Operations met de Opdrachtgever. |
| Eigen Azure-abonnement van de Opdrachtgever | Het abonnementscontract staat bij de Opdrachtgever; iO krijgt de voor beheer noodzakelijke rechten | Gedurende de beheerrelatie waar deze route gekozen is | Gedurende beheer zoals tussen partijen beschreven | De Opdrachtgever onderhoudt direct de relatie met Microsoft en eigen facturatie; iO gebruikt haar rechten voor de overeengekomen Managed Services. |
| Budget- en verbruikinzicht | Terugkoppeling van gebruik tegen de afgesproken financiële bandbreedtes | Zoals vastgelegd voor rapportage waar dat onderdeel is van deze opdracht | Zolang gekoppelde dashboards en tagging beschikbaar zijn | Drempels en alerting op techniek vallen onder Monitoring; deze norm beschrijft de periodieke bestuurlijke terugkoppeling. |

---

## Generiek — hoe iO hieraan werkt

### Scope en uitgangspunten

- Onder cloud-resources vallen de Azure-componenten waarmee de oplossing draait, zoals compute, opslag en netwerk plus aanpalende platformdiensten binnen de beheer‑scope van de opdracht. Leveringsroute wordt bij aanvang scherp gekozen: CSP via iO of eigen klant‑tenant met beheerdelegatie naar iO.
- Kostenzicht ondersteunt zowel technische beschikbaarheid als financiële sturing door de Opdrachtgever; daar past samenhang met monitoring‑ en rapportageafspraken.

### Werkwijze

- Bij levering door iO sluit het facturatiemoment aan op de gebruiks- en facturatiedata van CSP en Microsoft waarop het verbruik wordt bepaald.
- Bij een eigen klant-abonnement wordt op basis van de verleende rechten gebruik gebundeld naar inzichten die in rapportages en overlegcycli terechtkomen wanneer de opdracht dat voorschrijft.

### Samenspel Opdrachtgever ↔ iO

- De Opdrachtgever geeft wijzigingen in subscriptions, resourcegroepen of tagging die kostenplaats‑attributie beïnvloeden tijdig door.
- Bij budgetsignalen kiest de Opdrachtgever over business‑prioriteit wanneer technische schaal of aanpassingen direct doorwerken naar verbruik.

---

## Applicatie-onderhoud

Hier verschuift het accent naar hoe applicatie‑onderdelen cloudverbruik sturen: database‑ en cacheservices, storage voor mediabestanden en de routes waarmee de applicatie naar eindgebruikers wordt aangeboden.

### Wat iO concreet doet

- Bij grotere releases meenemen welk effect verwacht wordt op infrastructuur‑ en databaseload en dat afstemmen met Cloud Operations.

### Operationele details (applicatie)

- Afstemmen hoe opslag‑ en databaseschaling meebeweegt met pieken in gebruik op basis van tussen partijen gedeelde KPI’s over performance en beschikbaarheid waar van toepassing.

---

## Cloud Operations

Het Cloud-team beheert de levensloop van resources: bijwerken waar platform dat toestaat onder change, tagging volgens ontwerp en zichtbaarheid van verbruik per omgeving waar contract dat dekt.

### Wat iO concreet doet

- Afspraken over niet‑productief verbruik handhaven, waar die in architectuur‑ of contractkader zo staan beschreven.

### Operationele details (cloud)

- In hybride of gedeelde netwerkscenario’s attribueren waar mogelijk automatisch gebruik naar omgeving; waar dat niet lukt wordt verdeling inhoudelijk in overleg onderbouwd voor rapportage met de Opdrachtgever.

---

*Titel voor opslag:* `Confluence_Domeinpagina_Cloud_infrastructuur_en_resources.md`
