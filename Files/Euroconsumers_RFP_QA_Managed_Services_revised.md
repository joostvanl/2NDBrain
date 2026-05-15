## Euroconsumers DXP RFP — Q&A: Managed Services & Post-Go-Live Support

**RFP:** Platform Evolution & Digital Experience Platform RFP  
**Subject:** Managed Services / Post-Go-Live Support (Section 9)  
**Date:** 2026-05-11  
**Prepared by:** iO — Operational Services

---

## A. Operational Responsibility Transfer

### Q1. EC internal operational readiness

The RFP asks the partner to propose both the handover model (§7.3) and the post-go-live support model (§9.2). To design a realistic and achievable transition plan, what are EC's expectations regarding team composition, the timing of internal operational readiness to assume production responsibility, how to handle situations where agreed readiness criteria are not met at the planned handover moment, and how to allocate budget for ongoing production support between hypercare completion and EC full autonomy?

---

### Q2. EC development team availability for urgent fixes

The RFP emphasises that EC developers participate from day one (§7.2, §7.4). Once a deployable unit enters hypercare or BAU support: is EC's internal development team available and authorised to perform **urgent code changes and hotfixes** autonomously, or does this remain the partner's responsibility during the support period?

In other words: does the partner provide a traditional support service (partner fixes), or is the model closer to "EC fixes, partner advises and validates"?

---

## B. Programme Timeline & Hypercare Phasing

### Q3. Total rollout duration and hypercare overlap

What is the planned **total duration** from the first deployable unit go-live to the final go-live of the last market? How are hypercare periods distributed across this timeline — can multiple hypercare periods run in parallel, and what is the maximum number of concurrent go-live events per phase?

---

### Q4. Continuous BAU support during ongoing delivery

If early deployable units complete hypercare and transition to BAU support while later units are still being delivered: does EC expect the partner to provide **continuous BAU support** for all previously delivered and handed-over units while simultaneously delivering subsequent phases? Or is there a planned **consolidation point** where all units are handed over together?

---

### Q5. Hypercare cost structure in Estimation Workbook

Is the support cost estimate in the Estimation Workbook (line 5.1 "Hypercare per go-live event") expected to cover **all** go-live events across all phases combined, or should it represent the cost of a **single** hypercare period that is then multiplied by the number of go-live events?

---

## C. Service Window & Incident Classification

### Q6. Expected service window

The platform serves 6 markets across multiple time zones (Belgium, Italy, Spain, Portugal, Poland, Brazil). What is the expected **service window** for post-go-live support?

-   Is support required during **office hours only** (e.g. 09:00–17:00 CET)?
-   Or is **extended availability** expected (e.g. 07:00–19:00 CET, or wider to cover Brazil)?
-   For critical incidents (P1): is **24×7 on-call** support expected, or is out-of-hours coverage limited to specific hours?

---

### Q7. EC availability for out-of-hours collaboration

For P1 (critical) incidents outside the standard service window: does EC have an **internal on-call team** available to collaborate with the partner (e.g. for access, validation, deployment approval)? Or is the partner expected to resolve P1 incidents fully autonomously?

---

### Q8. Existing severity classification model

Does EC have an existing **incident severity classification** (P1–P4/P5) with defined response and resolution time expectations? If so, can this be shared? If not, is the partner expected to propose a severity model?

---

### Q9. Response time vs. resolution time commitment

Section 9.2 requests "response and resolution SLAs per severity." Our standard model defines **response time** (first acknowledgement within service window) and **pickup time** (start of active investigation) as committed KPIs, but does **not** guarantee a fixed **resolution time** — as resolution depends on root cause complexity, third-party dependencies, and client cooperation.

Is EC open to a model based on response + pickup commitments (without guaranteed resolution time), or is a committed resolution time per severity a **hard requirement** for this RFP?

---

### Q10. Phased SLA model

As the platform grows (content-only in Phase 1 → transactional in Phase 2 → authenticated/personal data in Phase 3), the business criticality increases significantly. Does EC expect a **single, fixed SLA level** from the first go-live onwards, or is a **phased SLA model** acceptable — where the SLA level (response times, service window, on-call commitments) scales up as business criticality increases with each phase?

---

## D. Hosting, Infrastructure & Third-Party Responsibilities

### Q11. Operational management of hosting platform

The RFP states that hosting platform costs (Vercel/Netlify, Azure) are not in scope for partner pricing. Post-go-live, who is responsible for the **operational management** of the hosting platform (monitoring, scaling, incident response at infrastructure level)? Is this EC's internal responsibility, or is the partner expected to include infrastructure operations in the support model?

---

### Q12. Incident command during hosting outages

If a production incident is caused by the hosting platform (e.g. Vercel/Netlify outage, Azure service degradation): is the partner expected to act as **incident commander** and coordinate with the hosting vendor, or is this EC's responsibility?

---

### Q13. Availability KPI on vendor-managed SaaS stack

The NFRs (§8) mention "Availability & Resilience (uptime, failover)." Given that the hosting platform (Vercel/Netlify), CMS (Sitecore/Optimizely SaaS), and CDN (Cloudflare) are all **vendor-managed SaaS platforms** outside partner operational control: is the partner expected to commit to an **availability SLA (uptime percentage)** for the production environment?

If so, how should vendor-caused outages be treated in availability calculations — excluded, or counted against the partner's SLA?

**Proposed operational ownership (for discussion)**



| Hosting component | Description | Proposed operational owner |
| --- | --- | --- |
| Application runtime (Next.js on Vercel/Netlify) | Build, deploy, runtime monitoring and scaling within agreed capacity | Partner (iO) during the managed services term; gradual handover to EC operations as internal readiness increases |
| Azure platform services | Configuration of platform resources, health monitoring and troubleshooting of EC-owned subscriptions used by the DXP | Shared: EC owns the subscription and governance; partner operates day-to-day within agreed runbooks |
| CMS SaaS (Sitecore/Optimizely) | Content delivery configuration and integration with the DXP | Shared: vendor operates the SaaS platform; partner owns application-level integration; EC owns content and governance |
| CDN (Cloudflare) | Caching rules, routing and WAF policies specific to the DXP | Partner configures and operates within EC security guidelines; EC owns the overarching security and network policy |



*All roles above are our default proposal and remain subject to confirmation with EC during contracting.*

---

## E. Tooling & Operational Processes

### Q14. JIRA as ITSM tool

iO uses **Jira Service Management** as the standard ITSM tool for operational support (incident registration, triage, tracking, SLA measurement). Is the use of Jira permitted within EC's IT governance and security policies, or is the partner required to integrate with or adopt **specific EC-mandated tooling** for incident and request management?

---

### Q15. Monitoring operation post-handover

The RFP describes an observability model (§4.10) with log drains, Application Insights, and Web Vitals monitoring. Post-go-live, is the partner expected to **operate** this monitoring stack (including alert triage and incident creation), or is this transferred to EC's internal operations team after handover?

---

### Q16. P1 incident initiation model

For P1 incident initiation: does EC expect that monitoring/alerting systems **automatically trigger** the incident process (e.g. PagerDuty/OpsGenie alert directly to on-call engineer), or is a **manual notification** (e.g. phone call to the support number) required to initiate the P1 process?

---

### Q17. Change approval and deployment authority

Post-go-live, what is the **change approval and deployment authority** model?

-   Who authorises production deployments — EC's internal team, the partner, or a joint Change Advisory Board?
-   Is the partner expected to perform deployments on behalf of EC, or does EC deploy autonomously with the partner in an advisory/validation role?
-   Are there restrictions on deployment windows (e.g. no Friday deployments, no out-of-hours deployments)?

---

## F. Security, Performance & Documentation

### Q18. Security patching responsibility

Post-go-live, who is responsible for **security patching** of application dependencies (CMS platform, Next.js, npm packages)? Is the partner expected to provide ongoing patching as part of the support SLA, or is this EC's responsibility after knowledge transfer?

---

### Q19. Security update policy alignment

Does EC have a defined **security update SLA** or policy (e.g. critical patches within X hours/days)? If so, is the partner expected to comply with EC's policy during the support period?

---

### Q20. Web Vitals: monitoring vs. performance guarantee

The NFRs specify Web Vitals targets (LCP, CLS, INP). Post-go-live, is the partner expected to:

-   (a) **Monitor and alert** on Web Vitals regressions (observability role), or
-   (b) **Maintain and guarantee** performance levels as a committed SLA KPI (accountability for fixing regressions)?

If (b): how should performance degradation caused by third-party factors (e.g. CMS vendor update, hosting platform change, increased traffic) be handled in SLA measurement?

---

### Q21. Documentation baseline / Definition of Done

Is there a defined **Definition of Done** (or equivalent baseline) that mandates documentation deliverables (e.g. runbooks, architecture decision records, Storybook coverage, deployment procedures) as a prerequisite for each deployable unit to be considered "done" and eligible for handover to BAU support? If so, can this be shared?

---

## G. Support Scope, Communication & Governance

### Q22. Support tiers model

Section 9.2 references "support tiers." Does EC expect a classic **L1 / L2 / L3 tiered model** (with distinct teams per tier), or is a model acceptable where a **Service Desk** handles intake and triage, and the **delivery/development team** performs diagnosis and resolution directly?

Once EC developers are production-ready: does EC envision them acting as **L2** (first-line technical investigation) with the partner as **L3** (escalation only)?

---

### Q23. Ongoing support for content editors

Post-go-live, is **ongoing support for content editors** (how-to questions, CMS usage guidance, editorial workflow issues) expected as part of the partner's support scope? Or is this EC's internal responsibility, with the partner's support limited to **technical incidents and defects** only?

---

### Q24. Language of support communication

In which **language(s)** is support communication expected? Is English the standard working language for all incident and support interactions, or is multi-language support required (e.g. Italian, Spanish, Portuguese, Polish, French/Dutch for the Belgian market)?

---

### Q25. Reporting and governance cadence

What are EC's expectations regarding **reporting and governance cadence** for post-go-live support?

-   Is a monthly **Service Level Report** (incident overview, SLA compliance, trends) expected?
-   Is a periodic **Service Level Review** meeting required (e.g. monthly, quarterly)?
-   Is there an existing governance structure that the partner must integrate into?

---

### Q26. Preferred pricing model

Section 9.2 asks for the pricing model for post-go-live support (T&M, fixed retainer, or incident-based). Is there a **preference** from EC's side, or is this entirely open for the partner to propose? Are there constraints on minimum/maximum support budget per month or year?

---

## Summary



| # | Theme | Core question |
| --- | --- | --- |
| Q1–Q2 | **Operational responsibility transfer** | When does EC take over? Who fixes? What if EC isn't ready? |
| Q3–Q5 | **Timeline & hypercare phasing** | Total duration, overlap, BAU during delivery, cost structure? |
| Q6–Q10 | **Service window & SLA** | Hours, severity model, response vs resolution, phased SLA? |
| Q11–Q13 | **Hosting & third parties** | Who manages infra, who coordinates outages, availability KPI? |
| Q14–Q17 | **Tooling & processes** | JIRA, monitoring ops, P1 initiation, deployment authority? |
| Q18–Q21 | **Security, performance & documentation** | Patching, Web Vitals, DoD baseline? |
| Q22–Q26 | **Support scope & governance** | Tiers, editor support, language, reporting, pricing? |


