# Overzicht — onderwerpen voor klantvriendelijke handouts

**Canonical overzicht:** alle afgebakende klant‑handouts staan in **`Handout_Index.md`** onder bestandsnamen **`Handout_<Onderwerp>.md`** (elfde kapstok: korte samenvatting + KPI’s waar van toepassing; vervolgens **Generiek**, **Applicatie‑specifiek**, **Cloud‑specifiek**). Elke **`Handout_*`** bevat onderaan **Bron-documenten** naar de canonieke **`Juridisch_Contract_Managed_Services.md`**, **`Bijlage_Scope_Managed_Services.md`**, **`SLA_Standaard.md`**, **`Applicatie_Dienstverlening.md`** en **`Cloud_Dienstverlening.md`** — geen vrij geïnventeerde cijfers.

---

## Staat nu als handout (implementatie af)

| Handout | Onderwerp (kort) |
| --- | --- |
| `Handout_Informatiebeveiliging.md` | CIA, Security Team, security‑updates/KPI’s, cloud vs applicatie |
| `Handout_Service_Desk.md` | Servicedesk, tickets, Service Windows, P1–P5, reactie/oppaktijd, toleranties |
| `Handout_SLA_Meetkader.md` | Documentenketen, productie-scope, beschikbaarheid, SLA‑meetlogica kern |
| `Handout_Incidentbeheer.md` | Incident-definitie, samenspel servicedesk, workaround |
| `Handout_Monitoring_Beschikbaarheid.md` | Monitoring, alerting, uptime/beschikbaarheids KPI’s |
| `Handout_Wijzigingsbeheer.md` | Change-proces, releasebeleid, facturatie |
| `Handout_Probleembeheer.md` | Probleem vs incident, RCA, Known Error |
| `Handout_Software_Updates.md` | Niet‑security updates, maandcontrole, randvoorwaarden |
| `Handout_OTAP.md` | OTAP‑lijn, test vs productie, data/anonimisering |
| `Handout_Proactief_Beheer.md` | Signalering, health, doorvertaling naar tickets |
| `Handout_Gebruikersondersteuning.md` | Gebruikersvragen vs wijziging, KPI‑verwijzing servicedesk |
| `Handout_Third_Party.md` | iO–klant–leverancier, escalatie, shared responsibility |
| `Handout_Cloud_Infrastructuur.md` | Retainer, resources, continuity (RTO/RPO), cloud‑financieel kader |
| `Handout_Contract_Governance.md` | Documentenrangorde, scope, governance, rapportage |

**Legacy bestandsnamen** `Informatiebeveiliging_en_Security_Team.md` en `Service_Desk.md` verwijzen door naar de `Handout_*`‑varianten.

---

## Brondocumenten (conceptueel; voor uitbreiding/aanpassing)

Onderstaande blokken beschrijven nog steeds **waar inhoud traditioneel vandaan komt** (`Applicatie_Dienstverlening.md`, `SLA_Standaard.md`, cloud‑ en BK‑teksten). Gebruik ze om handouts inhoudelijk te verrijken; juridisch leidend blijven raamcontract, managed-services-contract met bijlagen A–E, SLA en DAP.

### Operationeel & SLA

| Ref | Voorgesteld onderwerp | Brondocumenten |
| --- | --- | --- |
| A1 | Incidentbeheer | § incident in applicatie‑SLA, template |
| A2 | Monitoring & beschikbaarheid | SLA monitoring, cloud/applicatie dienstverlening |
| A3 | Wijzigingsbeheer | Applicatie § change, SLA release/security |
| A4 | Probleembeheer & RCA | SLA § probleem |
| A5 | Software‑updates (niet‑security) | Applicatie updates, SLA § patches |
| A6 | OTAP | Applicatie OTAP‑paragraaf, bijlagen |
| A7 | SLA in één plaatje — zie **`Handout_SLA_Meetkader`** | SLA intro, rapportage, uitsluitingen |

### Applicatie‑specifiek

| Ref | Kern | Bron |
| --- | --- | --- |
| B1 | Proactief beheer | Applicatie § proactief |
| B2 | Gebruikersondersteuning | Applicatie § gebruikers, template |
| B3 | Third party | Applicatie § leveranciers |

### Cloud / Azure

Geconsolideerd in **`Handout_Cloud_Infrastructuur.md`**; detail uit `Cloud_Dienstverlening.md` (retainer, CSP, enablement, continuity, T&M, ASfP, admin).

### Contract & governance

Geconsolideerd in **`Handout_Contract_Governance.md`**; detail uit `Juridisch_Contract_Managed_Services.md`, `Bijlage_Scope_Managed_Services.md` en dienstbeschrijvingen.

---

## Optioneel / intern

- **Template modulariteit** — `Dienstbeschrijving_Template_iO_Managed_Services.md` (verkoop/samstelling, geen standaard eindklant‑handout).
- **Volledige definities** — bijlage E van het managed-services-contract; geen vereenvoudigde brochure tenzij gewenst.
- **`Appendix 1 - General Services NL.md`** — bron voor alignment; geen duplicatie per onderwerp als los handout tenzij nodig.

---

*Dit bestand kan blijven dienen als **inhoudelijke backlog**; voor “welk bestand hoort bij welk onderwerp?” gebruik **`Handout_Index.md`**.*
