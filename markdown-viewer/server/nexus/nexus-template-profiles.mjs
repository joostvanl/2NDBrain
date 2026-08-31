const TEMPLATE_PROFILES = [
  {
    id: "dap",
    label: "DAP Template",
    detectPath: /DAP\s*template|DAP Template/i,
    requiredHeadings: [/Event Management/i, /Availability/i],
    checklist: [
      "Controleer Event Management-blok (detectie, classificatie, escalatie).",
      "Controleer Availability / RTO-RPO-paragraaf.",
      "Controleer contact- en escalatielijst.",
    ],
  },
  {
    id: "sla",
    label: "SLA Standaard",
    detectPath: /SLA Standaarden|iO (Basic|Plus|Pro)/i,
    requiredHeadings: [/KPI|responstijd|availability/i],
    checklist: [
      "Controleer KPI-tabel (responstijd, beschikbaarheid, doorlooptijd).",
      "Controleer prioriteitsdefinities (P1–P4 of equivalent).",
      "Controleer uitzonderingen en reviewperiode.",
    ],
  },
  {
    id: "rca",
    label: "RCA Template",
    detectPath: /RCA template|Root Cause/i,
    requiredHeadings: [/Root Cause|Timeline|Corrective/i],
    checklist: [
      "Controleer incident-timeline.",
      "Controleer root cause analyse (5-whys of equivalent).",
      "Controleer corrective/preventive actions met eigenaar.",
    ],
  },
];

function headingMatches(markdown, pattern) {
  const re = pattern instanceof RegExp ? pattern : new RegExp(String(pattern), "i");
  return re.test(String(markdown || ""));
}

export function detectTemplateProfile(documentPath, markdown = "") {
  const path = String(documentPath || "");
  const md = String(markdown || "");
  for (const profile of TEMPLATE_PROFILES) {
    if (!profile.detectPath.test(path) && !profile.detectPath.test(md.slice(0, 400))) continue;
    const headingHits = (profile.requiredHeadings || []).filter((h) => headingMatches(md, h)).length;
    if (headingHits >= 2 || (profile.detectPath.test(path) && headingHits >= 1)) {
      return { ...profile, headingHits };
    }
  }
  return null;
}

export function getTemplateChecklist(documentPath, markdown = "") {
  const profile = detectTemplateProfile(documentPath, markdown);
  if (!profile) return null;
  return {
    profileId: profile.id,
    label: profile.label,
    items: profile.checklist,
    promptBlock:
      `## Template-checklist (${profile.label})\n` +
      profile.checklist.map((item, idx) => `${idx + 1}. ${item}`).join("\n"),
  };
}

export function listTemplateProfiles() {
  return TEMPLATE_PROFILES.map(({ id, label }) => ({ id, label }));
}
