# Template — Confluence-pagina per domeinonderwerp

Gebruik dit sjabloon voor **één onderwerp per pagina** (bijv. Security, Incidentbeheer, Monitoring).  
De inhoud is **niet** gestructureerd naar technologie (applicatie vs cloud als hoofdstuk), maar naar **het domein**: eerst het geheel en de afspraken, daarna pas de verschillen per uitvoeringslaag.

**Referentiesjabloon:** `Files/Confluence_Domeinpagina_Probleembeheer.md` (koppen **zonder** hoofdstuknummers, inhoudelijke intro’s onder *Applicatie-onderhoud* en *Cloud Operations*).

---

### Zelfstandige pagina — geen bronverwijzingen

De Confluence-pagina moet voor de lezer **volledig begrijpelijk zijn zonder ergens anders naartoe te moeten**. Maak **geen verwijzingen naar bronnen** (geen links of verwijzingen naar contractdocumenten, SLA-pdf’s, wiki-exporten, SharePoint, repo-bestanden of “zie paragraaf X in …”). Alle benodigde uitleg, KPI’s, termijnen, processen en voorwaarden **zet je op de pagina zelf**, in leesbare vorm.

- Intern mag je bij het schrijven — buiten Confluence om — SLA, beheerovereenkomst, DAP en andere canonical docs gebruiken om feiten juist over te nemen; het **eindproduct** op Confluence bevat die feiten **inline**, niet als pointer.
- Afgeleide of dubbele inhoud op meerdere domeinpagina’s is bewust oké als daarmee elke pagina op zichzelf klopt.

### Opmaak — leesbaarheid van de klanttekst (Confluence)

- Gebruik geen vetgedrukte losse woorden midden in lopende zinnen om nadruk te forceren; dat maakt teksten onrustig (referentievoorbeeld: doorlopende tekst blijft overwegend plat).
- **Uitzondering** (zoals in het voorbeeld Probleembeheer): bij een korte gestructureerde set bullets mag één vet **labelwoord** voor een gedachtestreepje (**Proces** — …).
- Anders: nadruk via koppen en alinea’s; cursief hoogstens zeer spaarzaam.

### Geen hoofdstuknummers in koppen

- Gebruik op de **klantpagina** **geen** “1.”, “2.”, “3.1”, enz. voor structuur — alleen **benoemde koppen** (Markdown `##` / `###` / `####`). De hiërarchie volgt uit de kopniveaus, niet uit nummering.
- Verwijs intern op de pagina bij voorkeur naar **kopnamen** (“zie *KPI’s en meetbare afspraken*”), niet naar paragraafnummers.

---

## Vaste koppen en volgorde (zo op Confluence)

Koppen **zonder nummer voorvoegsel**; alleen `[plaatsvervangers]` vrij invullen.

```
# Confluence-domeinpagina — [Onderwerp]

## Titelpagina (Confluence)

| Veld           | Invullen |
|----------------|----------|
| Paginatitel    | …        |
| Doelgroep      | …        |
| Versie / datum | …        |

## Management summary

[Eén compacte doorlopende alinea.]

### Welke KPI's en normen zijn hier relevant

[Korte verkiezende zin mogelijk — alleen KPI-namen; waarden onder het volgende kopje.]

- …

## KPI's en meetbare afspraken

[Direct de tabel]

| KPI / norm | Definitie (kort) | Waarde / termijn | Geldigheid / venster | Toelichting (indien nodig, in deze cel) |

## Generiek — hoe iO hieraan werkt

### Scope en uitgangspunten
### Werkwijze
### Samenspel Opdrachtgever ↔ iO

[Optioneel domein‑verdieping]
### [Naam domein-verdieping]

#### [Subkop]

## Applicatie-onderhoud

[Inhoudelijke intro — zie schrijfwijzer: geen doelgroep‑zin “primair bedoeld voor lezers…”]

### Wat iO concreet doet
### Operationele details (applicatie)

[Optioneel]
### Afwijkingen en bijzondere afspraken

## Cloud Operations

[Inhoudelijke intro — zelfde uitgangspunt als bij Applicatie]

### Wat iO concreet doet
### Operationele details (cloud)

[Optioneel]
### Afwijkingen en bijzondere afspraken
```

---

## Schrijfwijzer (niet als blokkop op de klantpagina plaatsen)

### Management summary

| Wat | Richtlijn |
|-----|-----------|
| Hoofdstukkop | Exact: **Management summary** |
| Tweede niveau kop | **`### [Onderwerp] in het kort`** — bijvoorbeeld *Problem management in het kort*; Nederlandse of gangbare Engelse vakterm, één duidelijke regel |
| Tekst daaronder | Bij voorkeur **één samenhangende alinea**, richtwaarde **maximaal ca. 90 woorden**. Geen cijfers uit de KPI-tabel hierin |
| **Welke KPI’s…** | Optioneel één verkiezende zin; daarna bullets met alleen **begripsnamen**. Verwijs voor waarden naar **KPI’s en meetbare afspraken** (met die woorden), niet met §-nummers |
| Geen KPI’s beschikbaar | Eén zin onder *Welke KPI’s…*; uitwerking mogelijk als ene tabelregel onder *KPI’s en meetbare afspraken* |

### Afstemming management summary ↔ KPI-tabel

- Elke bullet onder *Welke KPI’s en normen zijn hier relevant* hoort bij **minstens één rij** in *KPI’s en meetbare afspraken*. Geen extra tabelrijen zonder equivalent in die lijst (tenzij je de lijst eerst aanvult).
- Onder *KPI’s en meetbare afspraken* volgt **direct** de tabel; geen schrijvers‑limieten of meta‑koppen op de klantpagina. Procesuitleg → *Generiek*.

### Generiek — hoe iO hieraan werkt

- Vaste deelkoppen: **Scope en uitgangspunten**, **Werkwijze**, **Samenspel Opdrachtgever ↔ iO**.
- Optioneel extra `### …` voor diepgang die nog generiek is (methodes, volwassenheid); binnen dat blok `####` voor compacte deelonderwerpen.

### Applicatie-onderhoud en Cloud Operations

- Hoofdletter **Applicatie-onderhoud** en **Cloud Operations** als H2‑koppen — zonder `- domeinspecifiek` of nummer.
- **Direct onder elke H2:** minimaal **één inhoudelijke alinea** die uitlegt **wat dit onderwerp in deze laag betekent** voor het domein (focus, grenzen, samenhang met generieke werkwijze en met wijzigings-/release-/platformcontext).  
  **Niet gebruiken:** zinnen als *Primair bedoeld voor lezers die …* als vervanging van deze inhoud — doelgroep hoort bij **Titelpagina** / metadata, niet als intro‑paragraaf.
- Daarna alleen deze subkoppen (tenzij je afwijkingen nodig hebt): **Wat iO concreet doet**, **Operationele details (applicatie)** of **(cloud)** — formulering met **iO**, niet *wij*.
- **Afwijkingen en bijzondere afspraken** alleen opnemen bij echte klant‑specifieke uitzonderingen; anders weglaten.

---

## Placeholder KPI-tabel (alleen ter herinnering voor schrijvers)

| KPI / norm | Definitie (kort) | Waarde / termijn | Geldigheid / venster | Toelichting (indien nodig, in deze cel) |
|------------|------------------|------------------|------------------------|------------------------------------------|

---

## Richtlijnen bij gebruik

1. Eén onderwerp per pagina.
2. Vaste volgorde: Management summary → KPI’s en meetbare afspraken → Generiek — hoe iO hieraan werkt → Applicatie-onderhoud → Cloud Operations; geen standaard governance‑nasleep na Cloud Operations.
3. Pagina zelfstandig; geen externe bronverwijzing voor feiten.
4. KPI’s onder *Welke KPI’s…* alleen als namen; volledige bepaling in de KPI‑tabel.
5. Koppen zonder hoofdstuknummers; zie blok **Vaste koppen en volgorde**.
6. Inhoudelijke H2‑intro’s voor Applicatie en Cloud conform schrijfwijzer.
7. Opmaak: zie blok *Opmaak* hierboven.

---

*Titel voor opslag:* `Template_Confluence_Domeinpagina.md`  
*Bedoeld als:* instructie voor Confluence‑pagina’s, in lijn met `Confluence_Domeinpagina_Probleembeheer.md`.
