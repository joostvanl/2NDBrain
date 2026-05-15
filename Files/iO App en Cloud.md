# Applicatie SLA (Beheerovereenkomst)

De SLA dekt response time, pickup time, uptime en het service window voor infrastructuur en applicatiebeheer.

### Niveaus & Maandelijkse Prijzen

|  | **Basic** | **Plus** | **Pro** | **Premiun** |
| --- | --- | --- | --- | --- |
| **Max. Service Window** | Kantoortijden | Extended (P1) | Weekend (P1) | 24x7 (P1) |
| **Maandprijs SLA (Applicatie)** | € 375,00 | € 575,00 | € 775,00 | € 875,00 |
| **Maandprijs Service Window (Applicatie)** | € - | € 250,00 | € 425,00 | € 775,00 |
| **Totaal maandelijks (Applicatie)** | € 375,00 | € 825,00 | € 1.200,00 | € 1.650,00 |
| **Maandprijs Hosting SLA (Combell Private Cloud)** | € 100,00 | € 350,00 | € 850,00 | € 1.250,00 |
| **Totaal maandelijks (Applicatie + Hosting)** | € 475,00 | € 1.175,00 | € 2.050,00 | € 2.900,00 |
| **Uptime Garantie (Applicatie + Hosting)** | 99,5% | 99,7% | 99,9% | 99,9% |

> Een lager service window dan het maximum is altijd toegestaan (bijv. Pro+ met kantoortijden = € 875/maand).

### Service Windows – Tijden

| Service Window | Beschikbaarheid |
| --- | --- |
| **Kantoortijden** | Werkdagen 09:00 – 17:00 CET |
| **Extended (P1)** | Werkdagen 07:00 – 19:00 CET |
| **Weekend (P1)** | Inclusief weekenddagen (alleen P1) |
| **24x7 (P1)** | On-call support, 24/7 (alleen P1, melding via telefoon) |

> **Randvoorwaarde:** Bij Extended, Weekend of 24x7 moet de klant ook bereikbaar en beschikbaar zijn.

### KPI's – Response Time (Applicatie)

| Prioriteit | Basic | Plus | Pro | Premium |
| --- | --- | --- | --- | --- |
| **P1 – Kritiek** | Best effort | 4 uur | 2 uur | 1 uur |
| **P2 – Hoog** | Best effort | 8 uur | 4 uur | 2 uur |
| **P3 – Gemiddeld** | Best effort | 16 uur | 8 uur | 4 uur |
| **P4 – Laag** | Best effort | 40 uur | 24 uur | 8 uur |
| **P5 – Minimaal** | Best effort | 40 uur | 40 uur | 24 uur |

### KPI's – Pickup Time (Applicatie)

| Prioriteit | Basic | Plus | Pro | Premium |
| --- | --- | --- | --- | --- |
| **P1 – Kritiek** | Best effort | 8 uur | 4 uur | 2 uur |
| **P2 – Hoog** | Best effort | 12 uur | 8 uur | 4 uur |
| **P3 – Gemiddeld** | Best effort | In overleg | In overleg | In overleg |
| **P4 – Laag** | Best effort | In overleg | In overleg | In overleg |
| **P5 – Minimaal** | Best effort | In overleg | In overleg | In overleg |

### Prioriteitenmatrix (Impact × Urgency)

|  | Impact High | Impact Medium | Impact Low |
| --- | --- | --- | --- |
| **Urgency High** | P1 – Kritiek | P2 – Hoog | P3 – Gemiddeld |
| **Urgency Medium** | P2 – Hoog | P3 – Gemiddeld | P4 – Laag |
| **Urgency Low** | P3 – Gemiddeld | P4 – Laag | P5 – Minimaal |

**Impact:**

-   **High:** Potentieel risico op grootschalige imago- en/of financiële schade
-   **Medium:** Impact beperkt tot een selectief aantal gebruikers
-   **Low:** Impact alleen aantoonbaar voor 1 enkele gebruiker

**Urgency:**

-   **High:** Primair bedrijfsproces geblokkeerd op productieomgeving
-   **Medium:** Niet-primaire bedrijfsprocessen verstoord
-   **Low:** Klein ongemak zonder significante impact op productiviteit

---

## Aanvullende Maandelijkse Kosten (indien van toepassing)

| Component | Prijs |
| --- | --- |
| **Third Party Management (TPM)** | € 325,00 / maand (standaard; kan afwijken) |
| **Service Coordinator** | Aantal uur × uurtarief (standaard 4–8 uur/maand) |
| **Capaciteitsreservering** | Aantal uur × uurtarief |

---

## Eenmalige (Initiële) Kosten

| Component | Omschrijving |
| --- | --- |
| **Opstellen DAP** | Dossier Afspraken en Procedures – processen, afspraken, contactgegevens |
| **Inrichten tooling** | JIRA (tickets, project), monitoring (dashboards, alerting), overige tooling |

> Bedragen worden per opdracht begroot (aantal uur × uurtarief).

---

## Belangrijke Opmerkingen

1.  **SLA- en service window-fees dekken alleen de KPI's.** Capaciteit om deze te halen wordt apart begroot.
2.  **24x7 = on-call, geen shifts.** P1 moet altijd telefonisch worden gemeld.
3.  **Maintenance/deployments tijdens kantoortijden** (zero-downtime) is de best practice.
4.  **De infrastructuur componenten** zijn niet in dit overzicht meegenomen