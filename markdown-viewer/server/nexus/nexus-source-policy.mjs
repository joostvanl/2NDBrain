const SOURCE_TIERS = [
  { tier: 100, label: "contract", test: /\b(contract|bijlage|annex|juridisch)\b/i },
  { tier: 95, label: "sla-standard", test: /SLA Standaarden|iO (Basic|Plus|Pro)/i },
  { tier: 90, label: "dap-template", test: /DAP template|DAP Template|Availability Management/i },
  { tier: 85, label: "managed-services", test: /01-managed-services/i },
  { tier: 70, label: "confluence", test: /confluence|atlassian/i },
  { tier: 55, label: "email-memory", test: /\.memory\/email-agent|email-agent/i },
  { tier: 40, label: "memory", test: /\.memory\//i },
  { tier: 25, label: "kanban", test: /\.kanban|kanban/i },
  { tier: 10, label: "experiment", test: /90-experiments-en-test/i },
  { tier: 5, label: "chat", test: /chat-promoties|agentChat/i },
];

export function sourceTierForPath(pathOrText) {
  const text = String(pathOrText || "");
  for (const rule of SOURCE_TIERS) {
    if (rule.test.test(text)) return rule.tier;
  }
  return 50;
}

export function sourceLabelForTier(tier) {
  const match = SOURCE_TIERS.find((r) => r.tier === tier);
  return match?.label || "general";
}

/**
 * @param {Array<{ path?: string, excerpt?: string, tier?: number, claim?: string, sourceType?: string }>} evidence
 */
export function resolveSourceConflicts(evidence = []) {
  const items = (Array.isArray(evidence) ? evidence : []).map((item) => ({
    ...item,
    tier: typeof item.tier === "number" ? item.tier : sourceTierForPath(item.path || item.excerpt || ""),
  }));

  const byClaim = new Map();
  for (const item of items) {
    const key = (item.claim || item.excerpt || item.path || "").slice(0, 120).toLowerCase();
    if (!key) continue;
    if (!byClaim.has(key)) byClaim.set(key, []);
    byClaim.get(key).push(item);
  }

  const conflicts = [];
  for (const [claimKey, group] of byClaim.entries()) {
    if (group.length < 2) continue;
    const tiers = [...new Set(group.map((g) => g.tier))];
    if (tiers.length < 2) continue;
    const winner = group.reduce((a, b) => (a.tier >= b.tier ? a : b));
    conflicts.push({
      claimKey,
      summary: `Conflicterende bronnen voor "${claimKey.slice(0, 80)}": hoogste tier wint (\`${winner.path}\`, ${sourceLabelForTier(winner.tier)}).`,
      winnerPath: winner.path,
      winnerTier: winner.tier,
    });
    for (const item of group) {
      if (item.path !== winner.path && item.tier < winner.tier) {
        item.possiblyStale = true;
      }
    }
  }

  return { evidence: items, conflicts };
}

export function compareSourcePriority(pathA, pathB) {
  return sourceTierForPath(pathB) - sourceTierForPath(pathA);
}
