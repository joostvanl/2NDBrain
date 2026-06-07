import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const handoutsDir = path.join(__dirname, "../../Files/01-managed-services/handouts");

const rows = [
  ["Handout_Informatiebeveiliging.md", "Informatiebeveiliging & Security Team", "Confluence_Domeinpagina_Informatiebeveiliging_en_Security_Team.md"],
  ["Handout_Service_Desk.md", "Service Desk & ticketafhandeling", "Confluence_Domeinpagina_Service_Desk.md"],
  ["Handout_SLA_Meetkader.md", "SLA-meetkader", "Confluence_Domeinpagina_SLA_meetkader.md"],
  ["Handout_Incidentbeheer.md", "Incidentbeheer", "Confluence_Domeinpagina_Incidentbeheer.md"],
  ["Handout_Monitoring_Beschikbaarheid.md", "Monitoring & beschikbaarheid", "Confluence_Domeinpagina_Monitoring_en_Alerting.md"],
  ["Handout_Wijzigingsbeheer.md", "Wijzigings- en releasemanagement", "Confluence_Domeinpagina_Wijzigings_en_Releasemanagement.md"],
  ["Handout_Probleembeheer.md", "Probleembeheer", "Confluence_Domeinpagina_Probleembeheer.md"],
  ["Handout_Software_Updates.md", "Software- en systeemupdates", "Confluence_Domeinpagina_Software_en_systeemupdates.md"],
  ["Handout_OTAP.md", "OTAP-omgevingsketen", "Confluence_Domeinpagina_OTAP_omgevingsketen.md"],
  ["Handout_Proactief_Beheer.md", "Proactief beheer", "Confluence_Domeinpagina_Proactief_Beheer.md"],
  ["Handout_Gebruikersondersteuning.md", "Gebruikersondersteuning", "Confluence_Domeinpagina_Gebruikersondersteuning.md"],
  ["Handout_Third_Party.md", "Third party & leverancierscoördinatie", "Confluence_Domeinpagina_Third_Party_en_leverancierscoordinatie.md"],
  ["Handout_Cloud_Infrastructuur.md", "Cloud-infrastructuur & resources", "Confluence_Domeinpagina_Cloud_infrastructuur_en_resources.md"],
];

function detailSection(fn, confFile) {
  if (fn === "Handout_Contract_Governance.md") {
    return `## Detail (intern)

- \`../overig/Documentstructuur_Managed_Services.md\`
- \`../contract/Juridisch_Contract_Managed_Services.md\`
- \`../confluence-md/Confluence_Domeinpagina_Service_Management_en_Rapportage.md\` (rapportage)`;
  }
  return `## Detail (intern — Confluence-export)

Zie \`../confluence-md/${confFile}\`.`;
}

for (const [fn, title, conf] of rows) {
  const body =
    `---
status: concept
classificatie: intern
rol: managed-services-handout
---

# Handout — ${title}

Klantgerichte samenvatting; definities en KPI-tabellen staan primair in contract, bijlagen, dienstbeschrijvingen en de gekoppelde Confluence-export.

## Kernpunten

- Gebruik onderstaande bron-documenten als enige basis voor concrete beloftes richting klanten.

## Bron-documenten

- \`../contract/Juridisch_Contract_Managed_Services.md\`
- \`../bijlagen/Bijlage_A_Scope_Managed_Services.md\`
- \`../bijlagen/Bijlage_B_SLA_Standaard.md\`
- \`../dienstbeschrijvingen/Applicatie_Dienstverlening.md\`
- \`../dienstbeschrijvingen/Cloud_Dienstverlening.md\`

${detailSection(fn, conf)}
`;

  fs.writeFileSync(path.join(handoutsDir, fn), body, "utf8");
}

const govFn = "Handout_Contract_Governance.md";
const govBody =
  `---
status: concept
classificatie: intern
rol: managed-services-handout
---

# Handout — Contract & governance

Klantgerichte samenvatting over documentenketen en governance.

## Kernpunten

- Rangorde en scope volgens managed-services-contract en bijlagen.

## Bron-documenten

- \`../contract/Juridisch_Contract_Managed_Services.md\`
- \`../bijlagen/Bijlage_A_Scope_Managed_Services.md\`
- \`../bijlagen/Bijlage_B_SLA_Standaard.md\`
- \`../dienstbeschrijvingen/Applicatie_Dienstverlening.md\`
- \`../dienstbeschrijvingen/Cloud_Dienstverlening.md\`

${detailSection(govFn, "")}
`;

fs.writeFileSync(path.join(handoutsDir, govFn), govBody, "utf8");

console.log("Wrote", rows.length + 1, "handouts under", handoutsDir);
