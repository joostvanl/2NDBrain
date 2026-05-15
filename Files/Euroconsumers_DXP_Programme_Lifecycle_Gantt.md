# Euroconsumers DXP — Programme Lifecycle Gantt Chart

## Context

This chart visualises the full programme lifecycle from delivery through hypercare and handover to EC autonomous operation. It is constructed **purely from what the RFP states**. Where the RFP is silent, explicit assumptions are marked.

---

## What the RFP explicitly defines

| Element | RFP source | What it says |
|---------|-----------|--------------|
| **5 delivery phases** | §7.2, §11.4, Estimation Workbook | Phase 0: Foundation & Architecture Validation (Pilot), Phase 1: Content & Foundation, Phase 2: Core Application DUs, Phase 3: Complex Domain DUs, Phase 4: Remaining Sites & Consolidation |
| **11 deployable units** | §1.5.1, Estimation Workbook §3 | Content, Tools, Collective Actions, Acquisition, Financial Products, Consumer Products, Service Selector, Personal Area, Complain, Community, Search |
| **6 markets** | §1 | Belgium, Italy, Spain, Portugal, Poland, Brazil |
| **Hypercare per go-live event** | §9.1, Estimation line 5.1 | "Describe your hypercare model per go-live event (per deployable unit and per market)" |
| **Post-go-live support** | §9.2 | "Ongoing support model after hypercare ends" |
| **Knowledge transfer from day one** | §7.2, §7.4 | EC developers participate from day one; progressive ownership |
| **Formal handover per phase** | §7.3 | "Handover criteria per phase (what must be true before the partner hands over a deployable unit)" |
| **EC autonomous operation** | §7, §7.4 | "EC's internal teams will own and operate the platform long-term" |
| **Market rollout per phase** | §11.4 | Partner proposes market rollout sequence within each phase |
| **Phase 0 = Pilot** | §7.2 | Architecture validation + pilot DU on both CMS platforms |

## What the RFP does NOT define (gaps requiring assumptions)

| # | Gap | Impact | Assumption made for chart | Confidence |
|---|-----|--------|--------------------------|------------|
| **G1** | Phase durations | Cannot draw timeline | Assumed: P0=3mo, P1=4mo, P2=5mo, P3=5mo, P4=4mo (total ~21 months) | ⚠️ LOW — no RFP data |
| **G2** | Hypercare duration per go-live | Cannot size support overlap | Assumed: 4 weeks per DU×market go-live | ⚠️ LOW — RFP asks partner to propose |
| **G3** | Whether handover is a distinct phase or instant cutover | Critical for planning | Assumed: 2-week formal handover after each hypercare | ⚠️ LOW — RFP mentions handover criteria but not duration |
| **G4** | Market rollout sequence within phases | Cannot determine concurrency | Assumed: Belgium first (pilot market), then sequentially Italy → Spain → Portugal → Poland → Brazil | ⚠️ LOW — RFP invites partner to propose |
| **G5** | Whether hypercare is per DU, per market, or per DU×market | Multiplier effect | Assumed: per DU×market (RFP §9.1 says "per go-live event, per deployable unit and per market") | 🟢 HIGH — RFP is explicit |
| **G6** | Number of go-lives per phase | Determines parallel hypercare load | Assumed from DU assignment: P1=2 DUs, P2=4 DUs, P3=3 DUs, P4=2 DUs, each ×6 markets | ⚠️ MEDIUM — based on complexity tiers |
| **G7** | Whether markets go live simultaneously or sequentially per DU | Major impact on hypercare stacking | Assumed: staggered (2-week gaps between markets within a DU) | ⚠️ LOW — no RFP data |
| **G8** | BAU support duration post-handover | Partner commitment timeline | Assumed: ongoing until EC confirms full autonomy (no fixed end stated) | ⚠️ LOW — this is our Q1/Q26 |
| **G9** | Whether Phase 0 has a production go-live | Triggers hypercare or not | Assumed: Yes — pilot DU goes live to validate architecture | 🟡 MEDIUM — §7.2 implies validation |
| **G10** | Overlap between phases | Phases sequential or overlapping? | Assumed: phases are sequential with 2-week buffer between | ⚠️ LOW — no RFP data |

---

## Mermaid Gantt Chart — Programme Lifecycle

```mermaid
gantt
    title Euroconsumers DXP — Programme Lifecycle (Managed Services View)
    dateFormat  YYYY-MM-DD
    axisFormat  %b %Y

    section Delivery Phases
    Phase 0 - Foundation & Pilot          :p0, 2026-09-01, 90d
    Phase 1 - Content & Foundation        :p1, after p0, 120d
    Phase 2 - Core Application DUs        :p2, after p1, 150d
    Phase 3 - Complex Domain DUs          :p3, after p2, 150d
    Phase 4 - Remaining & Consolidation   :p4, after p3, 120d

    section Phase 0 — Pilot (1 DU × 1 market)
    Build: Content DU (pilot)             :p0_build, 2026-09-01, 75d
    Go-live: BE pilot                     :milestone, p0_gl, after p0_build, 0d
    Hypercare: Content DU × BE            :p0_hc, after p0_build, 28d
    Handover: Content DU × BE             :p0_ho, after p0_hc, 14d

    section Phase 1 — Content & Foundation (2 DUs × 6 markets)
    Build: Content DU (full) + Tools DU   :p1_build, after p0, 90d
    Go-live: BE (Content + Tools)         :milestone, p1_gl1, after p1_build, 0d
    Hypercare: BE                         :p1_hc1, after p1_build, 28d
    Handover: BE                          :p1_ho1, after p1_hc1, 14d
    Go-live: IT                           :milestone, p1_gl2, 2027-02-01, 0d
    Hypercare: IT                         :p1_hc2, 2027-02-01, 28d
    Go-live: ES                           :milestone, p1_gl3, 2027-02-15, 0d
    Hypercare: ES                         :p1_hc3, 2027-02-15, 28d
    Go-live: PT                           :milestone, p1_gl4, 2027-03-01, 0d
    Hypercare: PT                         :p1_hc4, 2027-03-01, 28d
    Go-live: PL                           :milestone, p1_gl5, 2027-03-15, 0d
    Hypercare: PL                         :p1_hc5, 2027-03-15, 28d
    Go-live: BR                           :milestone, p1_gl6, 2027-04-01, 0d
    Hypercare: BR                         :p1_hc6, 2027-04-01, 28d
    Handover: all P1 markets              :p1_ho_all, 2027-04-29, 14d

    section Phase 2 — Core Application (4 DUs × 6 markets)
    Build: Collective Actions + Acquisition + Financial + Consumer :p2_build, after p1, 120d
    Go-live: BE (4 DUs)                   :milestone, p2_gl1, 2027-07-01, 0d
    Hypercare: BE                         :p2_hc1, 2027-07-01, 28d
    Go-live: IT                           :milestone, p2_gl2, 2027-07-15, 0d
    Hypercare: IT                         :p2_hc2, 2027-07-15, 28d
    Go-live: ES                           :milestone, p2_gl3, 2027-08-01, 0d
    Hypercare: ES                         :p2_hc3, 2027-08-01, 28d
    Go-live: PT + PL + BR                 :milestone, p2_gl4, 2027-08-15, 0d
    Hypercare: PT + PL + BR              :p2_hc4, 2027-08-15, 28d
    Handover: all P2 DUs                  :p2_ho, 2027-09-12, 14d

    section Phase 3 — Complex Domain (3 DUs × 6 markets)
    Build: Service Selector + Personal Area + Complain :p3_build, after p2, 120d
    Go-live: BE (3 DUs)                   :milestone, p3_gl1, 2027-12-01, 0d
    Hypercare: BE                         :p3_hc1, 2027-12-01, 28d
    Go-live: IT + ES                      :milestone, p3_gl2, 2027-12-15, 0d
    Hypercare: IT + ES                    :p3_hc2, 2027-12-15, 28d
    Go-live: PT + PL + BR                 :milestone, p3_gl3, 2028-01-05, 0d
    Hypercare: PT + PL + BR              :p3_hc3, 2028-01-05, 28d
    Handover: all P3 DUs                  :p3_ho, 2028-02-02, 14d

    section Phase 4 — Remaining & Consolidation (2 DUs × 6 markets)
    Build: Community + Search             :p4_build, after p3, 90d
    Go-live: BE (2 DUs)                   :milestone, p4_gl1, 2028-04-01, 0d
    Hypercare: BE                         :p4_hc1, 2028-04-01, 28d
    Go-live: all remaining markets        :milestone, p4_gl2, 2028-04-15, 0d
    Hypercare: remaining markets          :p4_hc2, 2028-04-15, 28d
    Handover: all P4 DUs                  :p4_ho, 2028-05-13, 14d

    section Partner Support (BAU)
    BAU support: P0+P1 DUs (post-handover) :bau1, 2027-05-15, 2028-06-01
    BAU support: P2 DUs (post-handover)    :bau2, 2027-09-26, 2028-06-01
    BAU support: P3 DUs (post-handover)    :bau3, 2028-02-16, 2028-06-01
    BAU support: P4 DUs (post-handover)    :bau4, 2028-05-27, 2028-08-01
    Partner exit / EC full autonomy        :milestone, exit, 2028-08-01, 0d

    section EC Internal Readiness
    EC developers embedded (knowledge transfer) :kt, 2026-09-01, 2028-06-01
    EC shadow support (progressive ownership)   :shadow, 2027-05-15, 2028-06-01
    EC fully autonomous                         :ec_auto, 2028-06-01, 2028-08-01
```

---

## Key Observations from the Chart

### 1. Hypercare stacking is significant
With 6 markets per phase and staggered go-lives, **multiple hypercare periods run in parallel**. At peak (Phase 2), there could be 4 DUs × 6 markets = up to 24 individual hypercare events within a 2-month window. Even with grouping, this requires dedicated support capacity.

### 2. BAU portfolio grows while delivery continues
From Phase 1 handover completion (~May 2027) onwards, the partner simultaneously:
- Delivers Phase 2/3/4
- Provides BAU support for already-handed-over DUs

This is a **dual obligation** that runs for approximately 12 months.

### 3. The "handover" phase is undefined
The RFP mentions "handover criteria per phase" (§7.3) but does not define:
- Duration of the handover
- Exit criteria (who signs off?)
- Whether handover = instant transfer or gradual fade-out
- Partner obligations during handover (full SLA? reduced? advisory only?)

### 4. Total programme duration (support perspective)
From first go-live (Phase 0 pilot, ~Nov 2026) to partner exit (~Aug 2028):
**≈ 21 months of active support obligation**

### 5. EC developer readiness is the critical path for exit
The RFP assumes EC developers progressively take ownership. If this is delayed (understaffing, skill gaps, attrition), the partner cannot exit — creating an open-ended support obligation without contractual protection.

---

## Gaps that directly map to our Q&A questions

| Gap | Maps to question |
|-----|-----------------|
| G1 — Phase durations | Q12 (total rollout duration) |
| G2 — Hypercare duration | Q12 (hypercare distribution) |
| G3 — Handover as distinct phase | Q3 (formal handover phase) |
| G4 — Market rollout sequence | Q12 (concurrent go-lives) |
| G5 — Hypercare per DU×market | Already confirmed by RFP |
| G6 — DUs per phase | Q14 (estimation workbook structure) |
| G7 — Market staggering | Q12 (parallel vs sequential) |
| G8 — BAU duration | Q1 (timeline to autonomy) |
| G9 — Phase 0 production go-live | Q12 (hypercare from Phase 0?) |
| G10 — Phase overlap | Q13 (consolidation point?) |

---

## Summary: What we KNOW vs. what we must ASK

### ✅ Known (from RFP)
- 5 phases, 11 DUs, 6 markets
- Hypercare is per DU × market
- EC wants to own & operate long-term
- Knowledge transfer from day one
- Formal handover criteria exist per phase
- Partner proposes market sequence

### ❓ Must ask (critical for planning)
- **Durations** of each phase (no timeline given)
- **Hypercare duration** (partner proposes but EC may have expectations)
- **Handover duration and model** (distinct phase? exit criteria?)
- **Market concurrency** (parallel or sequential within a phase?)
- **BAU end date** (when is the partner formally released?)
- **EC team readiness** (who decides EC is ready to take over?)
