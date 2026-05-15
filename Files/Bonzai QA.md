# Euroconsumers DXP RFP — Managed Services, Support & Operations Questions

## Purpose

The questions below are focused exclusively on post-go-live operations, hypercare, support, SLA, managed services, maintenance, operational handover, and long-term ownership.

The objective is to clarify how Euroconsumers expects the transition from partner-led delivery and hypercare towards EC-owned operations to work in practice, and how the partner should price and structure the support model in the proposal.

---

# 1. Operational Ownership & Responsibility Transfer

## Q1. Target operating model after go-live

The RFP indicates that Euroconsumers’ internal teams should be able to operate and evolve the platform independently after delivery, while also asking partners to propose hypercare and post-go-live support.

Can Euroconsumers clarify the intended target operating model after go-live?

- Is Euroconsumers expected to be the primary operator of the platform after hypercare?
- Is the partner expected to provide ongoing operational support beyond hypercare?
- Should the partner position post-go-live support as temporary transition support, long-term managed services, or optional escalation support?

## Q2. EC internal operational readiness

To design a realistic transition model, can Euroconsumers clarify its internal operational readiness trajectory?

- Does EC currently have, or plan to recruit, a dedicated operations/support team for the new DXP?
- Or is production responsibility expected to sit with the same EC developers participating in delivery?
- At what point in the programme does EC expect its internal team to be ready to assume operational responsibility: after Phase 1, after selected deployable units, after Phase 2/3, or only after the full programme completes?

## Q3. Operational readiness gates and delayed handover

If the partner proposes handover/readiness criteria and EC’s internal team does not meet those criteria at the planned handover moment, what is EC’s expectation?

- Should the partner extend support until readiness is achieved?
- Should this extended support be priced separately?
- Or does EC expect to take over operational responsibility regardless of readiness status?

## Q4. Role of EC developers during support

Once a deployable unit enters hypercare or BAU support, what role should EC developers play in urgent fixes?

- Are EC developers expected and authorised to perform urgent code changes and hotfixes autonomously?
- Or does responsibility for urgent code fixes remain with the partner during the support period?
- Should the support model be based on “partner fixes” or “EC fixes, partner advises/validates”?

## Q5. Support ownership per deployable unit

The architecture is based on independently deployable units. Should operational ownership and support responsibility also be defined per deployable unit?

- Should each deployable unit have its own operational owner within EC?
- Should the partner provide support per deployable unit?
- Should SLA reporting be structured per deployable unit, per market, or across the full platform?

---

# 2. Hypercare Scope, Duration & Phasing

## Q6. Hypercare duration expectations

Does Euroconsumers have an expected minimum or preferred hypercare duration per go-live event?

- Should hypercare duration be the same for all deployable units and markets?
- Or should it vary based on business criticality and complexity?
- Is EC open to different hypercare durations for content-only, transactional, authenticated, or high-risk deployable units?

## Q7. Definition of a go-live event

The Estimation Workbook refers to “Hypercare per go-live event.”

How should a go-live event be interpreted?

- Per deployable unit?
- Per market?
- Per deployable unit per market?
- Per release wave covering multiple deployable units and/or markets?

## Q8. Hypercare cost structure in the Estimation Workbook

For line 5.1 “Hypercare (per go-live event)” in the Estimation Workbook, should partners provide:

- the cost of one standard hypercare period;
- the total estimated hypercare cost across all planned go-live events;
- or a blended estimate based on assumed go-live waves?

If the total cost is expected, should partners document the assumed number of go-live events and hypercare duration in the Assumptions sheet?

## Q9. Parallel hypercare periods

Given the phased rollout across deployable units and markets, can multiple hypercare periods run in parallel?

- If yes, what is the expected maximum number of concurrent go-live/hypercare events?
- Should partners assume sequential or parallel hypercare for estimation?
- Are there any business constraints that limit the number of concurrent go-lives?

## Q10. Transition from hypercare to BAU support

What are EC’s expectations for the transition from hypercare to BAU support?

- Should BAU support start immediately after each deployable unit completes hypercare?
- Or should BAU support only start after a full phase or programme milestone is completed?
- Should there be a formal hypercare exit review before transition to BAU?

## Q11. BAU support during ongoing delivery

If early deployable units complete hypercare while later phases are still being delivered, does EC expect the partner to provide BAU support for already-live units while simultaneously delivering subsequent phases?

- If yes, should this BAU support be included in the implementation estimate?
- Or should it be priced separately as an optional or recurring support service?

---

# 3. Post-Go-Live Support Model & SLA

## Q12. Preferred post-go-live support model

Does EC have a preferred post-go-live support model?

- Time & Materials;
- fixed monthly retainer;
- incident-based support;
- capacity reservation;
- managed services contract;
- or a hybrid model?

Are there any budgetary constraints or expectations for monthly or annual support costs?

## Q13. Support tiers model

Section 9.2 asks partners to describe support tiers.

Does EC expect a classic L1/L2/L3 support model?

- If yes, which tier is expected to be handled by EC?
- Which tier is expected to be handled by the partner?
- Is a model acceptable where EC handles first-line functional and technical triage, with the partner acting as L2/L3 escalation?

## Q14. Scope of partner support

Can EC clarify the expected scope of partner support after hypercare?

Should support include:

- production incidents;
- application defects;
- CMS/DXP configuration issues;
- CI/CD and deployment issues;
- frontend code issues;
- integration issues with BFF APIs;
- monitoring and alert triage;
- security patches;
- minor changes;
- release support;
- editorial user support;
- how-to questions from content editors?

## Q15. Out-of-scope support areas

Can EC confirm which areas are outside the partner’s post-go-live support responsibility?

For example:

- EC-managed BFF services;
- internal backend systems;
- BEAN identity provider;
- mobile applications;
- vendor-managed SaaS outages;
- content entry or editorial operations;
- business configuration by EC users;
- third-party services contracted directly by EC.

## Q16. Response time vs. resolution time

Section 9.2 asks for response and resolution SLAs per severity.

Is EC open to a model where the partner commits to:

- response time;
- pickup/start-of-investigation time;
- communication frequency;
- target resolution time;

but does not guarantee fixed resolution times due to dependency on root cause, third-party vendors, EC-controlled systems, or required EC approvals?

## Q17. Severity classification model

Does EC have an existing incident severity model, such as P1–P4 or Sev1–Sev4?

- If yes, can this be shared?
- If not, should the partner propose a severity model?
- Should severity be based on business impact, number of affected markets, number of affected users, security impact, revenue impact, or availability impact?

## Q18. Phased SLA model

Would EC accept a phased SLA model where service levels increase as platform criticality increases?

For example:

- lower-intensity SLA for early content-only phases;
- extended SLA for transactional or authenticated areas;
- enhanced on-call support for critical market launches or high-risk releases.

Or does EC expect a single fixed SLA level from the first production go-live onwards?

---

# 4. Service Window, On-Call & Critical Incident Handling

## Q19. Expected service window

What service window does EC expect for post-go-live support?

- Office hours only, e.g. 09:00–17:00 CET?
- Extended business hours, e.g. 07:00–19:00 CET?
- Coverage adjusted for Brazil?
- 24×7 coverage for critical incidents only?
- Full 24×7 managed services?

## Q20. P1 / critical incident coverage

For P1 or critical incidents, does EC expect 24×7 on-call support?

- If yes, should this apply from the first go-live?
- Or only once transactional/authenticated deployable units are live?
- Should 24×7 apply to all incidents or only platform-down/security-critical incidents?

## Q21. EC availability during out-of-hours incidents

For critical incidents outside the standard service window, will EC provide an internal on-call contact?

This is relevant for:

- access approvals;
- production deployment approvals;
- business validation;
- vendor escalation;
- communication to internal stakeholders;
- decision-making during incidents.

## Q22. Incident commander role

During major incidents, who is expected to act as incident commander?

- EC internal operations;
- the implementation/support partner;
- a joint incident manager;
- or the party responsible for the affected component?

Should the partner coordinate third-party vendors during incidents, or should EC manage vendor escalation directly?

## Q23. P1 incident initiation

How should P1 incidents be initiated?

- Automatically from monitoring/alerting systems;
- manually via phone;
- via ticketing portal;
- via email;
- via EC service desk escalation;
- or through another process?

Is there an EC-mandated tool or process for triggering major incident handling?

---

# 5. Hosting, SaaS Vendors & Third-Party Responsibility

## Q24. Operational management of hosting platform

Post-go-live, who is responsible for operational management of the selected hosting platform, such as Vercel or Netlify?

- EC internal team;
- hosting vendor;
- implementation partner;
- or a shared model?

This includes monitoring, incident response, configuration changes, scaling issues, deployment troubleshooting, and vendor coordination.

## Q25. Hosting/vendor outage handling

If a production incident is caused by Vercel, Netlify, Azure, Cloudflare, Sitecore SaaS, Optimizely SaaS, or another vendor-managed platform:

- Is the partner expected to act as first responder?
- Is the partner expected to coordinate with the vendor?
- Or is vendor escalation owned by EC?

## Q26. Availability SLA and vendor-managed services

The RFP requests uptime/availability commitments per deployable unit.

Given that parts of the stack are vendor-managed SaaS platforms outside partner operational control, how should availability SLAs be defined?

- Should vendor-caused outages be excluded from partner SLA calculations?
- Should the partner commit only to application-layer availability within its control?
- Should EC expect an end-to-end availability SLA regardless of vendor dependencies?

## Q27. Vendor contract ownership

Who will own vendor contracts and support relationships for:

- Sitecore or Optimizely;
- Vercel or Netlify;
- Azure;
- Cloudflare;
- monitoring/logging tools;
- testing platforms;
- other third-party operational tools?

Should the partner be authorised to raise support tickets directly with these vendors?

---

# 6. Monitoring, Observability & Operational Tooling

## Q28. Monitoring ownership post-handover

The RFP describes observability requirements such as log drains, Web Vitals monitoring, alerting, health checks, and scheduled monitoring pipelines.

After handover, who is expected to operate the monitoring stack?

- EC operations team;
- EC development teams per deployable unit;
- partner support team;
- or a shared model?

## Q29. Alert triage responsibility

Who is responsible for first-line alert triage after go-live?

- EC internal team;
- partner service desk;
- partner development/support team;
- hosting/vendor support;
- or a combination?

## Q30. Monitoring-to-incident process

Should monitoring alerts automatically create incidents in the ITSM tool?

- If yes, which tool should be used?
- Should all alerts create tickets, or only alerts above a defined severity threshold?
- Who is responsible for reviewing and tuning alert thresholds over time?

## Q31. ITSM tooling

iO uses Jira Service Management as its standard ITSM tool for incident registration, triage, SLA measurement, and reporting.

Is the use of Jira Service Management permitted within EC’s IT governance and security policies?

Alternatively:

- does EC require the partner to use an EC-mandated ITSM tool?
- should the partner integrate with EC’s existing ticketing system?
- are there data residency or access restrictions for support tooling?

## Q32. Operational dashboards and reporting

Does EC expect the partner to provide operational dashboards?

If yes, should dashboards include:

- incident status;
- SLA performance;
- Web Vitals;
- deployment status;
- error rates;
- availability;
- security vulnerabilities;
- open defects;
- support backlog;
- trends per deployable unit and market?

---

# 7. Change, Release & Deployment Management

## Q33. Production deployment authority

Post-go-live, who has authority to approve production deployments?

- EC internal team;
- partner;
- joint approval;
- Change Advisory Board;
- product owner per deployable unit;
- technical owner per deployable unit?

## Q34. Deployment execution responsibility

Who is expected to execute production deployments after handover?

- EC development teams;
- partner support team;
- automated pipeline triggered by EC;
- joint execution during a transition period?

## Q35. Emergency changes and hotfixes

What is the expected process for emergency changes and hotfixes?

- Who can approve an emergency change?
- Are emergency deployments allowed outside the standard deployment window?
- Should the partner be able to deploy autonomously during a P1 incident?
- Is EC approval always required before production changes?

## Q36. Deployment windows and restrictions

Does EC have standard deployment windows or restrictions?

For example:

- no Friday deployments;
- no deployments outside business hours;
- market-specific freeze periods;
- campaign blackout periods;
- holiday freeze periods;
- approval lead times.

## Q37. Release support

Should post-go-live support include release support for EC-led deployments?

If yes:

- should this be part of the standard support retainer?
- should it be charged separately?
- should release support be mandatory for high-risk deployable units only?

---

# 8. Security, Patching & Vulnerability Management

## Q38. Security patching responsibility

Post-go-live, who is responsible for security patching of application dependencies?

This includes:

- Next.js;
- npm packages;
- frontend libraries;
- build tooling;
- CMS SDKs;
- integration libraries;
- CI/CD pipeline dependencies;
- monitoring or testing agents.

## Q39. Security patching as part of support SLA

Does EC expect security patching to be included in the post-go-live support SLA?

- If yes, should this be included in the standard retainer?
- Or should patches be handled as separately approved changes?
- Should the partner provide proactive vulnerability monitoring?

## Q40. EC security update policy

Does EC have an existing security update policy?

For example:

- critical vulnerabilities patched within X hours/days;
- high vulnerabilities within X days;
- medium vulnerabilities within X days/weeks;
- emergency process for actively exploited vulnerabilities.

If yes, should the partner align to this policy during the support period?

## Q41. Vulnerability scanning ownership

Who is responsible for operating vulnerability scanning after handover?

- EC;
- partner;
- shared responsibility;
- automated pipeline only?

Who reviews, prioritises, and remediates vulnerabilities found by tools such as Snyk or equivalent scanners?

---

# 9. Performance, Web Vitals & Reliability Support

## Q42. Web Vitals monitoring vs. guarantee

Post-go-live, does EC expect the partner to:

- monitor and alert on Web Vitals regressions;
- investigate regressions;
- fix regressions under support;
- or guarantee Web Vitals performance levels as SLA KPIs?

## Q43. Performance degradation caused by third parties

If Web Vitals or platform performance degrades due to third-party factors, how should this be treated in support and SLA reporting?

Examples:

- CMS vendor changes;
- hosting platform changes;
- CDN configuration;
- analytics/tagging changes;
- third-party scripts;
- increased traffic;
- content changes by editors;
- changes in backend/API performance.

## Q44. Performance regression remediation

If a performance regression is detected after go-live, should remediation be treated as:

- an incident;
- a defect;
- a change request;
- a performance optimisation backlog item;
- or part of standard support?

## Q45. Load and peak-event support

Does EC expect additional support for high-traffic periods, campaigns, PR events, or seasonal peaks?

If yes:

- should this be included in the standard support model?
- should this be planned and priced separately?
- should partners propose a peak-event support package?

---

# 10. Documentation, Runbooks & Handover

## Q46. Documentation as handover prerequisite

Should documentation deliverables be mandatory prerequisites for handover to BAU support?

Examples:

- runbooks per deployable unit;
- architecture decision records;
- deployment procedures;
- incident response procedures;
- rollback procedures;
- monitoring dashboards;
- alert definitions;
- Storybook coverage;
- onboarding documentation.

## Q47. EC Definition of Done

Does EC have an existing Definition of Done that includes operational readiness, documentation, monitoring, and supportability requirements?

If yes, can this be shared?

If not, should the partner propose an operational Definition of Done per deployable unit?

## Q48. Runbook ownership after handover

After handover, who owns and maintains operational runbooks?

- EC;
- partner;
- shared ownership during support period;
- owner per deployable unit?

## Q49. Documentation update responsibility during support

If defects, patches, or changes are implemented during the support period, who is responsible for keeping documentation up to date?

- partner for partner-executed changes;
- EC for EC-executed changes;
- shared responsibility;
- documentation updates as mandatory part of every change.

---

# 11. Content Editor Support & Functional Support

## Q50. Ongoing support for content editors

After go-live, is ongoing support for content editors expected to be part of the partner’s support scope?

This includes:

- CMS usage questions;
- editorial workflow questions;
- publishing issues;
- content model questions;
- preview issues;
- role/permission questions;
- training refreshers.

## Q51. Key-user model for editorial support

Does EC plan to establish an internal key-user or super-user model for editorial support?

If yes:

- should the partner support only EC key users;
- or should the partner support individual editors directly?

## Q52. Distinction between defect and user support

How should EC distinguish between:

- product defects;
- configuration issues;
- user errors;
- how-to questions;
- training gaps;
- change requests?

Should different support processes or commercial models apply to each category?

---

# 12. Support Communication, Language & Governance

## Q53. Support communication language

What language should be used for support communication?

- English only;
- English as default with local-language support where possible;
- multilingual support across market languages;
- local-language support for content editors only.

## Q54. Stakeholder communication during incidents

During major incidents, who communicates with EC business stakeholders?

- EC internal incident manager;
- partner incident manager;
- joint communication;
- market-specific business owner?

Should the partner provide incident updates directly to business users or only to EC’s internal IT/contact points?

## Q55. Support reporting cadence

Does EC expect periodic service reporting after go-live?

If yes:

- monthly;
- quarterly;
- per phase;
- per deployable unit;
- per market;
- only during hypercare;
- throughout BAU support.

## Q56. Service review meetings

Does EC expect recurring service review meetings?

If yes:

- monthly operational review;
- quarterly service review;
- post-incident review after P1/P2 incidents;
- hypercare exit review;
- phase-end operational readiness review.

## Q57. Existing governance structure

Does EC have an existing operational governance structure that the partner should integrate with?

For example:

- service management board;
- change advisory board;
- incident management process;
- security governance;
- release calendar;
- market governance forums.

---

# 13. Commercial Model & Budget Allocation

## Q58. Budget for ongoing BAU support

Is there a separate budget allocated for ongoing production support between hypercare completion and EC full operational autonomy?

Or should partners assume that only hypercare is in scope for the implementation estimate?

## Q59. Support pricing in the proposal

Should partners include post-go-live BAU support pricing in the main Estimation Workbook?

Or should this be presented separately as an optional managed services/support package?

## Q60. Minimum support commitment

Does EC expect a minimum support period after go-live?

For example:

- 1 month after each go-live;
- 3 months after each phase;
- 6 months after full programme completion;
- 12-month managed services period;
- optional extension only.

## Q61. Support volume assumptions

Should partners assume a specific number of support tickets, incidents, or support hours per month?

If not, should partners propose support volume assumptions and document them in the Assumptions sheet?

## Q62. Pricing for out-of-hours support

If out-of-hours or 24×7 support is required, should this be priced:

- as part of a fixed retainer;
- as an optional add-on;
- on a standby fee basis;
- on actual usage;
- or through a separate managed services agreement?

## Q63. Pricing for extended partner responsibility

If EC is not ready to take over operational responsibility at the planned handover point, should extended partner support be:

- included in the original price;
- handled as a change request;
- priced through a monthly retainer;
- priced through T&M;
- or covered by a separate support agreement?

---

# 14. Final Clarification: Desired End State

## Q64. Desired long-term support end state

Can EC clarify the desired long-term end state for support?

Which of the following best represents EC’s expectation?

1. EC fully operates the platform independently, with no recurring partner support.
2. EC operates the platform, with partner available for optional L3 escalation.
3. EC operates day-to-day support, with partner providing fixed monthly L2/L3 support.
4. Partner provides managed services for the delivery layer while EC owns business and content operations.
5. Partner provides full operational support across application, platform, and incident management.

This clarification is important to align the handover model, hypercare model, BAU support model, SLA commitments, and pricing.