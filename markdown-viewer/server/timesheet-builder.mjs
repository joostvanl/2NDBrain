/**
 * Evidence-first timesheet draft builder.
 * Aggregates activity logs, Kanban, e-mailmemory and optionally Outlook calendar
 * into day/dossier buckets before the LLM allocates hours.
 */

const WORKDAY_HOURS = 8;
const WEEKDAYS = new Set([1, 2, 3, 4, 5]); // Mon–Fri
const CLIENT_SHARE = 0.8;
const INTERNAL_SHARE = 0.2;

const INTERNAL_DOSSIER_PATTERNS = [
  /^algemeen\s*\/\s*intern$/i,
  /^managed services\s*\(intern\)/i,
  /^persoonlijk werk/i,
  /^overig\s*\/\s*intern$/i,
];

/** @type {{ pattern: RegExp; dossier: string; confidence?: number }[]} */
export const DEFAULT_DOSSIER_RULES = [
  { pattern: /\bdhl\b|dhlexs|dhlexc|sentinel/i, dossier: "DHL / Sentinel", confidence: 0.92 },
  { pattern: /02-projecten\/dhl/i, dossier: "DHL / Sentinel", confidence: 0.95 },
  { pattern: /ocean.cleanup|the-ocean-cleanup|ocean cleanup/i, dossier: "The Ocean Cleanup", confidence: 0.92 },
  { pattern: /02-projecten\/.*ocean/i, dossier: "The Ocean Cleanup", confidence: 0.9 },
  { pattern: /provincie.zeeland|provincie zeeland|02-projecten\/.*zeeland/i, dossier: "Provincie Zeeland", confidence: 0.9 },
  { pattern: /\bcgi\b|venus|uvb|02-projecten\/cgi/i, dossier: "CGI / Venus / UVB", confidence: 0.9 },
  { pattern: /stanley.stella|stanley-stella|02-projecten\/stanley/i, dossier: "Stanley Stella", confidence: 0.9 },
  { pattern: /superunie|euroconsumers|bonzai|02-projecten\/(superunie|euroconsumers)/i, dossier: "Superunie / Euroconsumers", confidence: 0.88 },
  { pattern: /natuurmonumenten|02-projecten\/natuur/i, dossier: "Natuurmonumenten", confidence: 0.88 },
  { pattern: /knltb|02-projecten\/knltb/i, dossier: "KNLTB", confidence: 0.88 },
  { pattern: /firan|02-projecten\/firan/i, dossier: "Firan", confidence: 0.88 },
  { pattern: /zadkine|02-projecten\/zadkine/i, dossier: "Zadkine", confidence: 0.88 },
  { pattern: /knmi|01-managed-services\/knmi/i, dossier: "KNMI", confidence: 0.88 },
  { pattern: /01-managed-services/i, dossier: "Managed Services (intern)", confidence: 0.75 },
  { pattern: /03-persoonlijk-werk/i, dossier: "Persoonlijk werk / intern", confidence: 0.7 },
  { pattern: /governance|sla|beheerovereenkomst|managed services/i, dossier: "Managed Services (intern)", confidence: 0.65 },
];

export function parseIsoDateOnly(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return "";
  return d.toISOString().slice(0, 10);
}

export function parseDateRange(fromDate, toDate) {
  const from = parseIsoDateOnly(fromDate);
  const to = parseIsoDateOnly(toDate);
  if (from && to) return { from, to };
  const now = new Date();
  const day = now.getDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;
  const monday = new Date(now);
  monday.setDate(now.getDate() + mondayOffset);
  const friday = new Date(monday);
  friday.setDate(monday.getDate() + 4);
  return {
    from: from || monday.toISOString().slice(0, 10),
    to: to || friday.toISOString().slice(0, 10),
  };
}

export function listWeekdays(fromDate, toDate) {
  const from = parseIsoDateOnly(fromDate);
  const to = parseIsoDateOnly(toDate);
  if (!from || !to) return [];
  const out = [];
  const cursor = new Date(`${from}T12:00:00`);
  const end = new Date(`${to}T12:00:00`);
  while (cursor <= end) {
    if (WEEKDAYS.has(cursor.getDay())) out.push(cursor.toISOString().slice(0, 10));
    cursor.setDate(cursor.getDate() + 1);
  }
  return out;
}

export function resolveDossier(text, hints = {}) {
  const hay = [
    hints.documentPath,
    hints.project,
    hints.title,
    hints.detail,
    text,
  ]
    .filter(Boolean)
    .join("\n");
  if (!hay.trim()) return { dossier: "Algemeen / intern", confidence: 0.4 };

  for (const rule of DEFAULT_DOSSIER_RULES) {
    if (rule.pattern.test(hay)) {
      return { dossier: rule.dossier, confidence: rule.confidence ?? 0.8 };
    }
  }
  if (hints.project && String(hints.project).trim()) {
    return { dossier: String(hints.project).trim(), confidence: 0.72 };
  }
  return { dossier: "Algemeen / intern", confidence: 0.45 };
}

export function isInternalDossier(dossier) {
  const d = String(dossier || "").trim();
  if (!d) return true;
  if (/^klantwerk\s*\(/i.test(d)) return false;
  return INTERNAL_DOSSIER_PATTERNS.some((p) => p.test(d));
}

function signalDateParts(ts, localDate) {
  const date = parseIsoDateOnly(localDate) || parseIsoDateOnly(ts);
  return { localDate: date, ts: ts || (date ? `${date}T12:00:00.000Z` : "") };
}

function inRange(localDate, from, to) {
  return localDate && localDate >= from && localDate <= to;
}

function estimateMinutes(signal) {
  switch (signal.type) {
    case "calendar":
      return Math.max(15, Math.round((signal.durationMinutes || 30)));
    case "activity_log":
      if (signal.durationMinutes) return Math.min(120, Math.max(10, signal.durationMinutes));
      return signal.changed || signal.wroteFile ? 35 : 20;
    case "kanban_event":
      return 20;
    case "kanban_task":
      return 15;
    case "email":
      return signal.requiresAction ? 20 : 10;
    case "outlook_mail":
      return 15;
    default:
      return 15;
  }
}

function pushSignal(buckets, signal) {
  const date = signal.localDate;
  if (!date) return;
  if (!buckets[date]) buckets[date] = { signals: [], byDossier: {} };
  buckets[date].signals.push(signal);
  const dossier = signal.dossier || "Algemeen / intern";
  if (!buckets[date].byDossier[dossier]) buckets[date].byDossier[dossier] = [];
  buckets[date].byDossier[dossier].push(signal);
}

function collectActivityLogSignals(entries, range) {
  const out = [];
  for (const row of entries || []) {
    const { localDate, ts } = signalDateParts(row.ts, row.localDate);
    if (!inRange(localDate, range.from, range.to)) continue;
    const text = [row.chatTitle, row.documentPath, row.request, row.reply].filter(Boolean).join("\n");
    const { dossier, confidence } = resolveDossier(text, {
      documentPath: row.documentPath,
      title: row.chatTitle,
      detail: row.request,
    });
    out.push({
      id: `log:${row.id || ts}`,
      type: "activity_log",
      ts,
      localDate,
      dossier,
      confidence,
      title: row.chatTitle || row.request?.slice(0, 80) || "Ask/Agent-sessie",
      detail: [row.documentPath, row.request].filter(Boolean).join(" · "),
      durationMinutes: row.durationMs ? Math.max(5, Math.round(row.durationMs / 60000)) : undefined,
      changed: row.changed === true,
      wroteFile: row.wroteFile === true,
      source: "agent-activity-logs",
      sourceRef: row.documentPath || row.id,
    });
  }
  return out;
}

function collectKanbanSignals(payload, range) {
  const out = [];
  for (const task of payload?.tasks || []) {
    const updated = parseIsoDateOnly(task.updatedAt || task.createdAt);
    if (!inRange(updated, range.from, range.to)) continue;
    const { dossier, confidence } = resolveDossier(
      [task.title, task.summary, task.nextAction, task.project].filter(Boolean).join("\n"),
      { project: task.project, title: task.title, detail: task.nextAction },
    );
    out.push({
      id: `kanban-task:${task.id}`,
      type: "kanban_task",
      ts: task.updatedAt || task.createdAt,
      localDate: updated,
      dossier,
      confidence,
      title: task.title,
      detail: [task.status, task.nextAction].filter(Boolean).join(" · "),
      source: "kanban",
      sourceRef: task.id,
    });
  }
  for (const ev of payload?.recentEvents || []) {
    const { localDate, ts } = signalDateParts(ev.ts || ev.timestamp, ev.localDate);
    if (!inRange(localDate, range.from, range.to)) continue;
    const note = ev.note || ev.title || ev.event || ev.type || "Kanban-event";
    const { dossier, confidence } = resolveDossier(note, { title: note, project: ev.project });
    out.push({
      id: `kanban-event:${ev.id || ts}`,
      type: "kanban_event",
      ts,
      localDate,
      dossier,
      confidence,
      title: note,
      detail: ev.taskId ? `taak ${ev.taskId}` : "",
      source: "kanban-events",
      sourceRef: ev.taskId,
    });
  }
  return out;
}

function collectEmailSignals(results, range) {
  const out = [];
  for (const mail of results || []) {
    const localDate = parseIsoDateOnly(mail.mailDate || mail.processedAt || mail.receivedAt);
    if (!inRange(localDate, range.from, range.to)) continue;
    const text = [mail.subject, mail.summary, mail.action, ...(mail.tags || [])].filter(Boolean).join("\n");
    const { dossier, confidence } = resolveDossier(text, { title: mail.subject, detail: mail.summary });
    out.push({
      id: `email:${mail.notificationId || mail.messageKey || localDate + mail.subject}`,
      type: "email",
      ts: mail.mailDate || mail.processedAt,
      localDate,
      dossier,
      confidence,
      title: mail.subject || "(geen onderwerp)",
      detail: [mail.action, mail.summary].filter(Boolean).join(" · ").slice(0, 240),
      requiresAction: mail.requiresAction === true || mail.status === "action_required",
      source: "email-memory",
      sourceRef: mail.notificationId || mail.messageKey,
    });
  }
  return out;
}

function collectCalendarSignals(items, range) {
  const out = [];
  for (const item of items || []) {
    const start = item.start || item.Start || item.startTime;
    const end = item.end || item.End || item.endTime;
    const { localDate, ts } = signalDateParts(start, item.date);
    if (!inRange(localDate, range.from, range.to)) continue;
    const subject = item.subject || item.Subject || item.title || "Agenda-afspraak";
    const startMs = start ? new Date(start).getTime() : NaN;
    const endMs = end ? new Date(end).getTime() : NaN;
    const durationMinutes =
      Number.isFinite(startMs) && Number.isFinite(endMs) && endMs > startMs
        ? Math.round((endMs - startMs) / 60000)
        : 30;
    const { dossier, confidence } = resolveDossier(subject, { title: subject, detail: item.location || item.body });
    out.push({
      id: `cal:${item.entryId || item.id || ts + subject}`,
      type: "calendar",
      ts,
      localDate,
      dossier,
      confidence,
      title: subject,
      detail: [item.location, item.organizer].filter(Boolean).join(" · "),
      durationMinutes,
      source: "outlook-calendar",
      sourceRef: item.entryId || item.id,
    });
  }
  return out;
}

function collectOutlookMailSignals(items, range, folder) {
  const out = [];
  for (const mail of items || []) {
    const localDate = parseIsoDateOnly(mail.receivedTime || mail.sentOn || mail.sentTime || mail.date);
    if (!inRange(localDate, range.from, range.to)) continue;
    const subject = mail.subject || "(geen onderwerp)";
    const parties = [mail.from, mail.to, mail.sender].filter(Boolean).join(" · ");
    const { dossier, confidence } = resolveDossier(subject, { title: subject, detail: parties });
    out.push({
      id: `outlook-mail:${folder}:${mail.entryId || localDate + subject}`,
      type: "outlook_mail",
      ts: mail.receivedTime || mail.sentOn || mail.sentTime,
      localDate,
      dossier,
      confidence,
      title: subject,
      detail: `${folder === "sent" ? "verzonden" : "inbox"} · ${parties}`.slice(0, 200),
      source: `outlook-mail-${folder}`,
      sourceRef: mail.entryId,
    });
  }
  return out;
}

function rescaleAllocationRows(rows, targetMinutes) {
  if (!rows.length) return [];
  if (targetMinutes <= 0) return rows.map((r) => ({ ...r, minutes: 0 }));
  const sum = rows.reduce((s, r) => s + r.minutes, 0);
  if (sum <= 0) {
    const per = Math.max(15, Math.floor(targetMinutes / rows.length));
    return rows.map((r, i) => ({
      ...r,
      minutes: i < rows.length - 1 ? per : targetMinutes - per * (rows.length - 1),
    }));
  }
  const scaled = rows.map((r) => ({
    ...r,
    minutes: Math.max(15, Math.round((r.minutes / sum) * targetMinutes / 15) * 15),
  }));
  const scaledSum = scaled.reduce((s, r) => s + r.minutes, 0);
  scaled[scaled.length - 1].minutes = Math.max(15, scaled[scaled.length - 1].minutes + (targetMinutes - scaledSum));
  return scaled;
}

function rebalanceAllocations80_20(allocations, targetMinutes = WORKDAY_HOURS * 60) {
  const clientTarget = Math.round(targetMinutes * CLIENT_SHARE);
  const internalTarget = targetMinutes - clientTarget;
  let clientRows = allocations.filter((r) => !isInternalDossier(r.signal.dossier));
  let internalRows = allocations.filter((r) => isInternalDossier(r.signal.dossier));

  if (!clientRows.length) {
    clientRows = [
      {
        signal: {
          type: "placeholder",
          dossier: "Klantwerk (reconstructie)",
          title: "Diverse klant-/projectactiviteiten",
          confidence: 0.45,
          source: "timesheet-builder",
          detail: "Geen klant-evidence — vul aan uit documenten/Kanban/mail",
        },
        minutes: clientTarget,
        basis: "80/20-doel klant",
      },
    ];
  }
  if (!internalRows.length) {
    internalRows = [
      {
        signal: {
          type: "placeholder",
          dossier: "Algemeen / intern",
          title: "Intern / administratie / planning",
          confidence: 0.45,
          source: "timesheet-builder",
          detail: "Overig blok 20%",
        },
        minutes: internalTarget,
        basis: "80/20-doel overig",
      },
    ];
  }

  const result = [
    ...rescaleAllocationRows(clientRows, clientTarget),
    ...rescaleAllocationRows(internalRows, internalTarget),
  ];
  const total = result.reduce((s, r) => s + r.minutes, 0);
  if (total !== targetMinutes && result.length) {
    result[result.length - 1].minutes = Math.max(15, result[result.length - 1].minutes + (targetMinutes - total));
  }
  return result;
}

function allocateEmptyDay(targetMinutes = WORKDAY_HOURS * 60) {
  return rebalanceAllocations80_20([], targetMinutes);
}

function allocateDayHours(signals, targetHours = WORKDAY_HOURS) {
  const targetMinutes = targetHours * 60;
  const weighted = signals.map((s) => ({
    signal: s,
    weight: estimateMinutes(s) * (s.confidence ?? 0.7),
  }));
  const fixed = weighted.filter((w) => w.signal.type === "calendar");
  const fixedMinutes = fixed.reduce((sum, w) => sum + estimateMinutes(w.signal), 0);
  let remaining = Math.max(0, targetMinutes - fixedMinutes);
  const variable = weighted.filter((w) => w.signal.type !== "calendar");
  const totalWeight = variable.reduce((sum, w) => sum + w.weight, 0) || 1;

  const allocations = [];
  for (const w of fixed) {
    allocations.push({ signal: w.signal, minutes: estimateMinutes(w.signal), basis: "agenda-duur" });
  }
  for (const w of variable) {
    const share = totalWeight > 0 ? (w.weight / totalWeight) * remaining : remaining / Math.max(1, variable.length);
    allocations.push({
      signal: w.signal,
      minutes: Math.max(10, Math.round(share / 5) * 5),
      basis: "evidence-verdeling",
    });
  }

  const sum = allocations.reduce((acc, row) => acc + row.minutes, 0);
  const delta = targetMinutes - sum;
  if (delta !== 0 && allocations.length) {
    allocations[allocations.length - 1].minutes = Math.max(10, allocations[allocations.length - 1].minutes + delta);
  }
  return rebalanceAllocations80_20(allocations, targetMinutes);
}

function buildDayActivities(allocations) {
  return allocations.map((row, index) => ({
    index: index + 1,
    minutes: row.minutes,
    dossier: row.signal.dossier || "Algemeen / intern",
    title: row.signal.title || "Activiteit",
    detail: row.signal.detail || "",
    source: row.signal.source || "",
    basis: row.basis || "",
    isInternal: isInternalDossier(row.signal.dossier),
  }));
}

function summarizeClientInternal(allocations) {
  let clientMinutes = 0;
  let internalMinutes = 0;
  for (const row of allocations) {
    if (isInternalDossier(row.signal.dossier)) internalMinutes += row.minutes;
    else clientMinutes += row.minutes;
  }
  const total = clientMinutes + internalMinutes;
  return {
    clientMinutes,
    internalMinutes,
    clientShare: total > 0 ? clientMinutes / total : CLIENT_SHARE,
    internalShare: total > 0 ? internalMinutes / total : INTERNAL_SHARE,
  };
}

/**
 * @param {{ fromDate?: string; toDate?: string; includeCalendar?: boolean; includeOutlookMail?: boolean }} input
 * @param {object} deps
 */
export async function buildTimesheetEvidence(input = {}, deps = {}) {
  const range = parseDateRange(input.fromDate, input.toDate);
  const weekdays = listWeekdays(range.from, range.to);
  const sourcesUsed = [];
  const allSignals = [];

  if (deps.readActivityLogs) {
    const logs = deps.readActivityLogs({
      fromDate: range.from,
      toDate: range.to,
      limit: 500,
    });
    allSignals.push(...collectActivityLogSignals(logs?.entries || [], range));
    sourcesUsed.push("agent-activity-logs");
  }

  if (deps.listKanbanTasks) {
    const kanban = deps.listKanbanTasks({
      query: "",
      since: range.from,
      limit: 300,
      eventLimit: 200,
    });
    allSignals.push(...collectKanbanSignals(kanban, range));
    sourcesUsed.push("kanban");
  }

  if (deps.searchEmailMemory) {
    const emails = deps.searchEmailMemory({ query: "", limit: 120 }).results || [];
    allSignals.push(...collectEmailSignals(emails, range));
    sourcesUsed.push("email-memory");
  }

  if (input.includeCalendar !== false && deps.searchOutlookCalendar) {
    try {
      const cal = await deps.searchOutlookCalendar({
        fromDate: `${range.from}T00:00:00`,
        toDate: `${range.to}T23:59:59`,
        limit: 80,
      });
      if (cal?.ok && Array.isArray(cal.items)) {
        allSignals.push(...collectCalendarSignals(cal.items, range));
        sourcesUsed.push("outlook-calendar");
      }
    } catch {
      /* optional */
    }
  }

  if (input.includeCalendar !== false && deps.searchManagedCalendar) {
    try {
      const cal2 = await deps.searchManagedCalendar({
        fromDate: `${range.from}T00:00:00`,
        toDate: `${range.to}T23:59:59`,
        limit: 80,
      });
      if (cal2?.ok && Array.isArray(cal2.items)) {
        allSignals.push(...collectCalendarSignals(cal2.items, range));
        sourcesUsed.push("2ndbrain-calendar");
      }
    } catch {
      /* optional */
    }
  }

  if (input.includeOutlookMail !== false && deps.searchOutlookMail) {
    for (const folder of ["inbox", "sent"]) {
      try {
        const mail = await deps.searchOutlookMail({
          folder,
          fromDate: `${range.from}T00:00:00`,
          toDate: `${range.to}T23:59:59`,
          limit: 25,
        });
        if (mail?.ok && Array.isArray(mail.items)) {
          allSignals.push(...collectOutlookMailSignals(mail.items, range, folder));
          sourcesUsed.push(`outlook-mail-${folder}`);
        }
      } catch {
        /* optional */
      }
    }
  }

  const dayBuckets = {};
  for (const signal of allSignals) pushSignal(dayBuckets, signal);

  const days = {};
  const dossierTotals = {};
  for (const date of weekdays.length ? weekdays : Object.keys(dayBuckets).sort()) {
    const bucket = dayBuckets[date] || { signals: [], byDossier: {} };
    const allocations = bucket.signals.length ? allocateDayHours(bucket.signals) : allocateEmptyDay();
    const split = summarizeClientInternal(allocations);
    const activities = buildDayActivities(allocations);
    const byDossier = {};
    for (const row of allocations) {
      const dossier = row.signal.dossier || "Algemeen / intern";
      if (!byDossier[dossier]) byDossier[dossier] = { minutes: 0, lines: [] };
      byDossier[dossier].minutes += row.minutes;
      byDossier[dossier].lines.push({
        minutes: row.minutes,
        title: row.signal.title,
        detail: row.signal.detail,
        basis: row.basis,
        confidence: row.signal.confidence,
        source: row.signal.source,
      });
      dossierTotals[dossier] = (dossierTotals[dossier] || 0) + row.minutes;
    }
    days[date] = {
      signals: bucket.signals,
      allocations,
      activities,
      clientMinutes: split.clientMinutes,
      internalMinutes: split.internalMinutes,
      clientShare: split.clientShare,
      internalShare: split.internalShare,
      byDossier,
      totalMinutes: allocations.reduce((sum, row) => sum + row.minutes, 0),
      evidenceCount: bucket.signals.length,
    };
  }

  return {
    ok: true,
    range,
    weekdays,
    days,
    dossierTotals,
    sourcesUsed,
    signalCount: allSignals.length,
    allocationPolicy: {
      hoursPerWorkday: WORKDAY_HOURS,
      clientShareTarget: CLIENT_SHARE,
      internalShareTarget: INTERNAL_SHARE,
    },
    note:
      "Evidence-first concept: agenda, Outlook inbox/sent, activity logs, Kanban, e-mailmemory, dossier-regels. " +
      "Per werkdag 8,0 u met doelverdeling 80% klant / 20% overig. Elke activiteit staat op een eigen regel.",
  };
}

function formatHours(minutes) {
  return (minutes / 60).toFixed(1).replace(".", ",");
}

const WEEKDAY_NAMES = ["zondag", "maandag", "dinsdag", "woensdag", "donderdag", "vrijdag", "zaterdag"];

export function formatTimesheetDraftMarkdown(evidence) {
  if (!evidence?.days) return "";
  const lines = [
    "## Urenregistratie-concept (server-gegenereerd)",
    "",
    `Periode: **${evidence.range.from}** t/m **${evidence.range.to}**`,
    `Bronnen: ${(evidence.sourcesUsed || []).join(", ") || "geen"}`,
    `Signalen: ${evidence.signalCount ?? 0}`,
    "",
    evidence.note || "",
    "",
  ];

  for (const date of evidence.weekdays?.length ? evidence.weekdays : Object.keys(evidence.days).sort()) {
    const day = evidence.days[date];
    if (!day) continue;
    const weekday = WEEKDAY_NAMES[new Date(`${date}T12:00:00`).getDay()];
    lines.push(
      `### ${weekday.charAt(0).toUpperCase() + weekday.slice(1)} ${date} (${formatHours(day.totalMinutes || 0)} uur)`,
    );
    lines.push(
      `- Klant: **${formatHours(day.clientMinutes || 0)} u** (${Math.round((day.clientShare || 0) * 100)}%) · Overig: **${formatHours(day.internalMinutes || 0)} u** (${Math.round((day.internalShare || 0) * 100)}%)`,
    );
    if (!day.activities?.length) {
      lines.push("- *(geen activiteiten — vul aan via macro-bronnen)*");
      lines.push("");
      continue;
    }
    for (const act of day.activities) {
      const dossier = act.isInternal ? `${act.dossier} [overig]` : act.dossier;
      const detail = act.detail ? ` — ${act.detail.slice(0, 120)}` : "";
      lines.push(
        `${act.index}. **${formatHours(act.minutes)} u** · ${dossier} · ${act.title}${detail} _[${act.source}]_`,
      );
    }
    lines.push("");
  }

  if (evidence.dossierTotals && Object.keys(evidence.dossierTotals).length) {
    lines.push("### Totaal per dossier (concept)");
    for (const [dossier, minutes] of Object.entries(evidence.dossierTotals).sort((a, b) => b[1] - a[1])) {
      lines.push(`- ${dossier}: **${formatHours(minutes)} u**`);
    }
  }

  return lines.join("\n");
}

export async function buildTimesheetDraftPayload(input = {}, deps = {}) {
  const evidence = await buildTimesheetEvidence(input, deps);
  return {
    ...evidence,
    markdown: formatTimesheetDraftMarkdown(evidence),
  };
}
