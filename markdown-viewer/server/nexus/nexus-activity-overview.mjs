/**
 * Deterministic activity overview builder for planning questions.
 * @param {object} deps injected server helpers
 */
export function buildActivityOverview({ from, to, message = "" }, deps) {
  const since = deriveSince(from, to);
  const factual = [];
  const inferred = [];
  const confidenceById = {};

  if (deps.readActivityLogs) {
    try {
      const logs = deps.readActivityLogs({ from, to, query: message, limit: 120 });
      for (const row of logs?.entries || logs?.items || []) {
        const id = `log:${row.id || row.ts || factual.length}`;
        factual.push({
          id,
          type: "activity_log",
          title: row.title || row.summary || row.activity || "Activiteit",
          ts: row.ts || row.timestamp || "",
          detail: row.detail || row.note || "",
        });
        confidenceById[id] = 0.95;
      }
    } catch {
      /* optional */
    }
  }

  if (deps.listKanbanTasks) {
    const payload = deps.listKanbanTasks({ query: message, since, limit: 80 });
    for (const task of payload.tasks || []) {
      const id = `kanban:${task.id}`;
      factual.push({
        id,
        type: "kanban_task",
        title: task.title,
        status: task.status,
        project: task.project,
        dueDate: task.dueDate,
        nextAction: task.nextAction,
      });
      confidenceById[id] = 0.9;
    }
    for (const ev of payload.recentEvents || []) {
      const id = `kanban-event:${ev.id || ev.ts || inferred.length}`;
      factual.push({
        id,
        type: "kanban_event",
        title: ev.note || ev.title || ev.event,
        ts: ev.ts || ev.timestamp,
      });
      confidenceById[id] = 0.85;
    }
  }

  if (deps.searchEmailMemory) {
    const emails = deps.searchEmailMemory({ query: message, limit: 20 }).results || [];
    for (const mail of emails) {
      const id = `email:${mail.notificationId || mail.subject || inferred.length}`;
      const requiresAction = mail.requiresAction === true || mail.status === "action_required";
      const row = {
        id,
        type: "email_memory",
        title: mail.subject,
        mailDate: mail.mailDate,
        action: mail.action,
        summary: mail.summary,
      };
      if (requiresAction) {
        inferred.push({ ...row, confidence: 0.7 });
        confidenceById[id] = 0.7;
      } else {
        factual.push(row);
        confidenceById[id] = 0.75;
      }
    }
  }

  return { factual, inferred, confidenceById, range: { from, to, since } };
}

function deriveSince(from, to) {
  if (from && to) {
    const start = new Date(from);
    const end = new Date(to);
    if (!Number.isNaN(start.getTime()) && !Number.isNaN(end.getTime())) {
      const days = Math.max(1, Math.ceil((end - start) / 86400000));
      return `${days}d`;
    }
  }
  return "7d";
}

export function formatActivityOverviewMarkdown(overview) {
  if (!overview) return "";
  const lines = ["## Activiteitenoverzicht (server-gegenereerd)", ""];
  if (overview.factual?.length) {
    lines.push("### Feitelijke activiteiten");
    for (const row of overview.factual.slice(0, 20)) {
      lines.push(`- **${row.title || row.type}**${row.ts ? ` (${row.ts})` : ""}${row.status ? ` [${row.status}]` : ""}`);
    }
  }
  if (overview.inferred?.length) {
    lines.push("", "### Waarschijnlijke vervolgacties");
    for (const row of overview.inferred.slice(0, 12)) {
      const conf = overview.confidenceById?.[row.id];
      lines.push(`- ${row.title}${conf != null ? ` (confidence ${Math.round(conf * 100)}%)` : ""}`);
    }
  }
  return lines.join("\n");
}
