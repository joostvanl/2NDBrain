# Instructie voor agents: reviewcommentaren en `@agent`

Dit document beschrijft **exact** hoe een agent (bijvoorbeeld een Cursor-agent) om moet gaan met de commentaardata die hoort bij markdownbestanden in deze workspace. Het is bedoeld als **proceduredocument**: volg de stappen in volgorde, zonder ze over te slaan.

---

## 1. Doel

- Een mens (of proces) zet in de **markdown-viewer** commentaren op geselecteerde tekst in een `.md`-document.
- Commentaren kunnen een **opdracht** bevatten die gericht is aan de agent via het token **`@agent`** (zie detectie hieronder).
- De agent moet:
  1. **Alle** relevante commentaren voor het betreffende document **inzien**.
  2. Waar de opdracht aan `@agent` is gericht: **wijzigingen doorvoeren in het markdownbronbestand** (`Files/<naam>.md`).
  3. Daarna op **hetzelfde commentaar-thread** een **reactie** (`replies`) plaatsen waarin kort en duidelijk staat **wat** er is aangepast (en eventueel **waarom** / welke sectie).

Menselijke of andere commentaren zonder `@agent`-opdracht hoeven geen inhoudelijke markdown-wijziging; de agent mag ze wel lezen voor context.

De markdown-viewer bevat daarnaast een **ingebouwde software-agent**. Die draait server-side, gebruikt een OpenAI-compatible endpoint en voert alleen comments uit waarvan het **eerste bericht** (`body`) begint met `@agent`.

---

## 2. Waar staan de gegevens?

| Artefact | Locatie (standaard in dit project) |
|----------|-------------------------------------|
| Markdownbron | `iOMS/Files/<bestandsnaam>.md` (workspace: `Files/` ten opzichte van repo-root `iOMS`) |
| Review-JSON | `iOMS/Files/.reviews/<bestandsnaam>.md.json` |

Voorbeeld: voor `nevobo-api.md` is het commentaarbestand:

`Files/.reviews/nevobo-api.md.json`

De map `.reviews` wordt door de server aangemaakt als die nog niet bestaat. Pijl: één JSON-bestand **per** `.md`-document.

### Ontbrekend bestand — geen fout in het pad

Het bestand `Files/.reviews/<naam>.md.json` **bestaat vaak nog niet**. Dat is **normaal**: het wordt **pas aangemaakt** wanneer iemand commentaren in de markdown-viewer voor dat document **eerste keer opslaat**. Tot die tijd is er simpelweg nog geen reviewdata op schijf.

**Gedrag voor agents**

- **Lezen:** als het bestand ontbreekt (bijv. “File not found”), behandelen als lege dataset — **niet** concluderen dat de locatie uit deze instructie fout is:
  - effectief: `{"version": 1, "comments": []}`.
- **Werk:** zijn er dan geen commentaren met `@agent`, dan is er **niets** om uit te voeren; meld kort dat er (nog) geen opgeslagen commentaren zijn.
- **Schrijven:** alleen als je wél JSON moet wegschrijven: zorg dat de map `Files/.reviews/` bestaat, schrijf daarna geldige JSON met `version` en `comments` (dezelfde structuur als hieronder).

**Omgeving (alleen ter referentie):** de viewer-server gebruikt `MARKDOWN_DIR` en `REVIEWS_DIR`. Zonder overrides wijst `REVIEWS_DIR` naar `<MARKDOWN_DIR>/.reviews`. Een agent die bestanden rechtstreeks bewerkt, gebruikt de paden hierboven.

**Viewer starten (voor mensen, niet verplicht voor de agent-workflow):** ga naar de map `markdown-viewer` en voer **`npm run dev`** uit. Dat start **twee** processen: de API op **http://127.0.0.1:8787** en Vite op **http://127.0.0.1:5173**. Open in de browser **http://127.0.0.1:5173** — verzoeken naar `/api` worden door Vite naar poort 8787 doorgestuurd. Start **niet** alleen `vite` of “Open with Live Server” zonder die API; dan krijg je **404** op `/api` en worden commentaren niet opgeslagen. Alternatief (één proces): `npm run dev:unified` en de URL uit de terminal gebruiken (standaard ook :5173; geen aparte API-poort nodig).

**Controleren of opslag gelukt is:** na het toevoegen/wijzigen van commentaren hoort de **statusbalk** o.a. `Commentaren opgeslagen → .reviews/<naam>.md.json` te tonen. In de terminal van de server verschijnt `[review-comments] wrote` met het volledige bestandspad. Zie je in plaats daarvan `Commentaar opslaan mislukt` of een **404** op `/api/review-comments`, dan bereikt de browser de API niet (verkeerde startmodus) en wordt er **niets** weggeschreven — de commentaren blijven dan alleen in het geheugen tot je de pagina ververst.

### Ingebouwde software-agent

- Configuratie staat lokaal in `markdown-viewer/agent.config.json`.
- Gebruik `markdown-viewer/agent.config.example.json` als voorbeeld, maar zet nooit echte secrets in dat voorbeeldbestand.
- De echte config bevat `apiKey`, `endpoint` en `model`. `agent.config.json` is lokaal en hoort niet in Git.
- De browser krijgt de opgeslagen API key niet terug; de API meldt alleen of er een key aanwezig is.
- In de viewer zijn er twee knoppen: **Agent config** en **Agent uitvoeren**. De run geldt voor het geselecteerde markdownbestand.
- Een nieuwe agent-run wordt geblokkeerd zolang er nog eerdere agentwijzigingen openstaan. De gebruiker moet die eerst met **Akkoord** of **Niet akkoord** afhandelen. Die knoppen staan onder het **laatste agentantwoord** in het **Agent**-chatvenster (niet in de ribbon).

---

## 3. JSON-structuur (exact)

Het bestand is JSON met minimaal:

```json
{
  "version": 1,
  "comments": [ /* array van commentaar-objecten */ ]
}
```

Elk element in `comments` heeft deze velden (velden die ontbreken in oudere bestanden worden bij het inlezen genormaliseerd):

| Veld | Betekenis |
|------|-----------|
| `id` | Unieke id (UUID-string). **Niet wijzigen** tenzij je een nieuw commentaar aanmaakt (dan door tooling gegenereerd). |
| `author` | Wie het eerste bericht plaatste (vrije tekst). |
| `body` | **Tekst van het eerste commentaar** — hier staat doorgaans de opdracht en eventueel `@agent`. |
| `quote` | De exacte geselecteerde fragmenttekst uit het document (anker). |
| `prefix` | Korte tekst vóór `quote` (anker-hulp). |
| `suffix` | Korte tekst na `quote` (anker-hulp). |
| `createdAt`, `updatedAt` | ISO-tijdstempels. |
| `replies` | Array van reacties in **chronologische volgorde**. |

Elk object in `replies`:

| Veld | Betekenis |
|------|-----------|
| `id` | UUID-string. |
| `author` | Bij een agent-reactie: bijvoorbeeld `Agent` of `Cursor Agent`. |
| `body` | Tekst van de reactie. |
| `createdAt`, `updatedAt` | ISO-tijdstempels. |

**Thread:** het eerste bericht is `body` op het commentaar-object; vervolgberichten staan in `replies`.

---

## 4. Wanneer is een opdracht aan `@agent` gericht?

Voor handmatige agents valt een commentaar onder deze workflow als **minstens één** van het volgende waar is:

1. In het **eerste commentaar** (`body`) komt het token **`@agent`** voor (als apart woord / mention), **niet hoofdlettergevoelig**: `@agent`, `@Agent`, `@AGENT`.
2. Optioneel beleid (aanbevolen voor volledigheid): als een **reactie** in `replies` expliciet `@agent` bevat en een nieuwe concrete opdracht geeft, behandel die reactie op dezelfde manier (document wijzigen + antwoord in de thread). *Als je alleen root-`body`-opdrachten wilt uitvoeren, beperk je je tot punt 1.*

**Belangrijk — eigen berichten van de agent:** in teksten die **de agent zelf** wegschrijft (`replies[].body`, en eventueel andere door de agent toegevoegde reviewtekst) mag **`@agent` nergens voorkomen** (ook niet als voorbeeld, citaat of grap). Gebruik neutrale formuleringen (“de opdracht”, “het verzoek”, “jouw instructie”). Zo voorkom je dat een volgende run het **eigen** antwoord van de agent opnieuw als nieuwe `@agent`-opdracht interpreteert.

**Niet uitvoeren** als:

- Het token ontbreekt en er is geen redelijke interpretatie dat de tekst aan de agent is gericht.
- De opdracht onduidelijk of strijdig is met andere regels — zie §7.

**Ingebouwde software-agent:** deze is strikter en voert alleen comments uit waarvan `body.trim().toLowerCase().startsWith("@agent")` waar is. Replies met een mention-token worden door de ingebouwde agent niet als nieuwe opdracht gebruikt.

---

## 5. Verplichte werkwijze (stappen)

Voer voor **elk** te bewerken `.md`-document waar je commentaren gaat afhandelen het volgende uit.

### Stap A — Inlezen

1. Open het markdownbestand: `Files/<naam>.md`.
2. Open het reviewbestand `Files/.reviews/<naam>.md.json` **als het bestaat**. Als het ontbreekt: gebruik een lege lijst (`comments: []`), zie §2.
3. Parse JSON (of lege standaard); werk met de array `comments`.

### Stap B — Inventarisatie

1. Loop **alle** objecten in `comments` langs (bij voorkeur in array-volgorde).
2. Bepaal per object of er een `@agent`-opdracht is (§4).
3. Maak een **interne checklist** van welke `id`-waarden je gaat afhandelen (om geen commentaar te vergeten).

### Stap C — Context gebruiken

Voor elk af te handelen commentaar:

- Gebruik **`quote`** (en indien nodig `prefix` / `suffix`) om de **bedoelde plek** in het markdownbestand te vinden.
- Gebruik **`body`** (en zo nodig eerdere `replies`) als **opdrachtbeschrijving**.

Als `quote` **niet uniek** voorkomt in het bestand: gebruik `prefix`/`suffix` conceptueel (tekst rondom het fragment) om **de juiste locatie** te kiezen. Als het dan nog ambigu is: voer **geen** riskante brede wijziging uit; plaats een reactie waarin je het conflict beschrijft en vraag om verduidelijking.

### Stap D — Markdown wijzigen

1. Voer de gevraagde aanpassingen door in **`Files/<naam>.md`** alleen.
2. Houd wijzigingen **minimalistisch en gericht** op wat `@agent` vraagt.
3. Wijzig **niet** de structuur van review-JSON behalve wat in stap E beschreven staat.
4. Het markdownbestand bevat **geen** ingesloten review-highlights; commentaren leven alleen in JSON. Bewerk dus normale markdown-inhoud.

**Voor de ingebouwde software-agent:** bij elke uit te voeren opdracht stuurt de server het **volledige actuele markdowndocument** mee als `fullMarkdownDocument`, naast `instruction`, `selectedQuote`, `prefix` en `suffix`. De agent moet die volledige documentcontext gebruiken om de opdracht goed te begrijpen. De LLM mag niet het hele document herschrijven. De LLM moet JSON teruggeven met alleen exact toepasbare patches:

```json
{
  "changes": [
    { "find": "exact bestaande tekst", "replace": "nieuwe tekst", "replaceAll": false }
  ],
  "reply": "Korte uitleg zonder mention-token"
}
```

De server past een patch standaard alleen toe als elke `find` exact één keer voorkomt in de actuele markdown. Als dat niet zo is, wordt voor dat commentaar geen markdownwijziging gedaan en wordt er een fout-uitleg in dezelfde thread geplaatst.

Voor expliciet documentbrede terminologie-opdrachten mag de LLM `replaceAll: true` zetten. Dan vervangt de server alle exacte voorkomens van `find`. Gebruik dit alleen bij duidelijke opdrachten zoals: “gebruik door het hele document heen `Problem Management` in plaats van `Probleembeheer`”.

**Section-scoped patches (Nexus):** optioneel kun je per change ook `"sectionId"` (heading, id of headingPath uit outline), `"beforeSnippet"` (validatie vóór apply) en `"rationale"` (verplicht op beschermde templates zoals SLA/DAP) meegeven. De server past de patch dan alleen binnen die sectie toe. Legacy `find`/`replace` blijft werken.

**Let op (ankers):** het commentaar wordt in de viewer onder andere aan tekst gekoppeld via `quote` / `prefix` / `suffix`. Als je het document zo wijzigt dat dat fragment **verdwijnt of anders wordt**, kan de markering in de viewer later niet meer kloppen. De JSON en je wijzigingen zijn dan nog steeds geldig; alleen de visuele koppeling in de editor kan haperen tot iemand het commentaar opnieuw uitlijnt.

### Stap E — Reactie op het oorspronkelijke commentaar

Na succesvolle (of geprobeerde) uitvoering:

1. Voeg aan **hetzelfde** commentaar-object (zelfde `id`) een nieuw element toe aan **`replies`**.
2. Het nieuwe reply-object moet minimaal bevatten:
   - `author`: bijvoorbeeld `"Agent"` of `"Cursor Agent"` (consistent binnen één sessie).
   - `body`: een **duidelijke samenvatting** (zonder het token `@agent` — zie §4):
     - wat je hebt aangepast (welke sectie / welk onderdeel, of welke zoek/replace-logica);
     - eventueel: wat je **niet** hebt gedaan en waarom;
     - geen ruwe interne tool-dumps tenzij nuttig voor de gebruiker.
   - `id`: nieuwe UUID-string.
   - `createdAt` en `updatedAt`: huidige tijd in ISO-8601 (zelfde waarde bij aanmaak mag).
3. Werk **`updatedAt`** van het **bovenliggende commentaar-object** bij naar “nu” als je het JSON-veld consistent wilt houden met de rest van de stapel (aanbevolen).

**Herhalende runs:** als dezelfde `@agent`-opdracht al een eerdere agent-reply heeft die de opdracht afhandelt, voer die opdracht **niet opnieuw** uit tenzij de gebruiker of nieuw bericht expliciet om herziening vraagt. Voeg dan een **nieuwe** reply toe die naar de eerdere actie verwijst.

### Stap F — Opslaan

1. Sla `Files/<naam>.md` op (geformatteerd, geen accidentele side-effects).
2. Sla `Files/.reviews/<naam>.md.json` op met **geldige JSON** (bij voorkeur netjes geïndenteerd, consistent met `version: 1` en `comments`-array).

### Stap G — Akkoord / niet akkoord door gebruiker

Na een agent-reply toont de viewer bij de thread twee acties:

- In edit mode toont de viewer de verschillen tussen rollback-snapshot en huidige versie: **rood = oude tekst**, **groen = nieuwe/geldende tekst**.
- **Akkoord:** de wijziging blijft staan; de rode/groene markeringen worden verwijderd, alleen de huidige tekst blijft over, en de commentaarthread wordt verwijderd uit `comments`, zodat de agent dezelfde opdracht bij een volgende run niet opnieuw uitvoert.
- **Niet akkoord:** de viewer zet `Files/<naam>.md` terug naar de vorige versie die door de software is vastgelegd, verwijdert daarna de rode/groene markeringen en verwijdert dezelfde commentaarthread.
- Zolang één of meer agentwijzigingen nog niet goed- of afgekeurd zijn, mag er geen nieuwe agent-run starten. Dit voorkomt dat meerdere rollback-snapshots en reviewbeslissingen door elkaar gaan lopen.

**Belangrijk:** een externe of handmatige agent maakt **geen** rollback-snapshot en schrijft **niet** rechtstreeks naar `Files/.reviews/.versions/`. Als een backup nodig is, verzorgt de software dat. De ingebouwde software-agent legt vóór de eerste succesvolle wijziging zelf zo'n software-snapshot vast, zodat Akkoord/Niet akkoord kan blijven werken.

---

## 6. Kwaliteit van de agent-reactie (`replies.body`)

De agent schrijft **uitsluitend** neutrale rapportagetekst: **geen** `@agent` in `replies[].body` (harde regel; zie §4).

Een goede reactie is:

- **Gefocust**: bulletpoints of korte alinea’s.
- **Navigeerbaar**: kopnamen, regelnummers (als de agent die kan geven), of letterlijke fragmenten van vóór/na.
- **Eerlijk**: als iets niet lukte, zeg dat expliciet.

Voorbeeldstructuur (vrije tekst, geen verplichting):

```text
Uitgevoerd naar aanleiding van de opdracht in dit thread.

Wijzigingen:
- …

Geen wijziging:
- … (reden: …)
```

---

## 7. Conflicten, veiligheid en scope

- **Scope:** werk alleen binnen het document en de reviewdata dat bij die taak hoort, tenzij de opdracht uitdrukkelijk andere bestanden noemt.
- **Tegenstrijdige commentaren:** als twee `@agent`-opdrachten elkaar tegenspreken, volg de **nieuwere duidelijke instructie** of de meest specifieke; anders: resolve in een reply en voer geen destructieve merge uit.
- **Geen `@agent`:** geen automatische markdown-wijziging op basis van dat commentaar; hooguit context gebruiken.
- **Geen `@agent` in agent-output:** de agent plaatst **`@agent` nooit** in eigen `replies` (of andere zelf toegevoegde reviewtekst); zie §4 en §6.

---

## 8. Mermaid en Chart.js in de markdown-viewer

De viewer rendert na parsing twee soorten **fenced blocks** automatisch (naast normale Markdown):

### Mermaid

- Open met een regel **` ```mermaid `** (drie backticks, direct gevolgd door `mermaid`), sluit af met **` ``` `** op een eigen regel.
- Daartussen: geldige **Mermaid**-definitie (flowchart, sequence diagram, enz.) volgens de Mermaid-syntax.
- Gebruik **geen geneste** triple-backtick-blokken binnen de Mermaid-inhoud.

### Chart.js

- Open met **` ```chartjs `** of **` ```chart `**, sluit af met **` ``` `**.
- Daartussen: **alleen strikte JSON** (geen commentaar, geen trailing komma’s): een object met minimaal:
  - **`"type"`** — string, bijv. `"bar"`, `"line"`, `"pie"` (Chart.js v4-charttypes);
  - **`"data"`** — object met o.a. `labels` en `datasets` zoals in de Chart.js-documentatie.
- Optioneel **`"options"`** voor titel, legenda, schaal, enz.

**Voor agents (ingebouwd en extern):** bij wijzigingen via find/replace het **hele fenced blok** (van de openende ``` tot en met de sluitende ```) in `find` opnemen, of voldoende unieke context zodat de patch exact één keer matcht. Nieuwe diagrammen op dezelfde manier invoegen als platte Markdown-tekst.

---

## 9. Samenvatting voor prompting

Korte prompt die je aan een agent kunt meegeven:

> Lees `Files/<naam>.md`. Probeer `Files/.reviews/<naam>.md.json` te openen; **als dat bestand ontbreekt**, neem `comments` als lege array (§2). Loop alle `comments` langs. Waar `body` of een relevante `reply` een opdracht met `@agent` bevat: pas het markdownbestand daarop aan, sla op, en voeg op dat commentaar een `replies`-item toe (author Agent) met een korte uitleg van de wijzigingen — **zonder** `@agent` in die uitleg (§4). Maak zelf geen rollback-snapshot; als backup nodig is, verzorgt de software dat. De gebruiker handelt daarna af met Akkoord/Niet akkoord; verwijder de oorspronkelijke thread niet zelf. Voor diagrammen/grafieken: zie §8 (Mermaid / Chart.js).

---

**Versie:** 1.13 — §8 toegevoegd: Mermaid en Chart.js; systeemprompt server uitgebreid.
