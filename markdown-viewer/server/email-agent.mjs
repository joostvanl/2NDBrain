import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { readOutlookMailPayload, searchOutlookMailPayload } from "./outlook-tools.mjs";

const DEFAULT_CONFIG = {
  enabled: false,
  intervalMinutes: 30,
  scanWindowHours: 24,
  maxPerFolder: 20,
  folders: ["inbox", "sent"],
  classifyWithLlm: true,
};

const MAX_NOTIFICATIONS = 500;
const MAX_PROCESSED_KEYS = 2000;
const DIGEST_RELATIVE_DIR = "email-agent/digests";

function nowIso() {
  return new Date().toISOString();
}

function startOfLocalToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function validDateOrFallback(value, fallback) {
  const d = new Date(value);
  return Number.isFinite(d.getTime()) ? d : fallback;
}

function intervalWindowStart(to, intervalMinutes) {
  const minutes = clampNumber(intervalMinutes, 5, 120, DEFAULT_CONFIG.intervalMinutes) * 2;
  return new Date(to.getTime() - minutes * 60 * 1000);
}

function clampNumber(value, min, max, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(n)));
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function readJsonFile(filePath, fallback) {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    const raw = fs.readFileSync(filePath, "utf8");
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : fallback;
  } catch {
    return fallback;
  }
}

function writeJsonAtomic(filePath, data) {
  ensureDir(path.dirname(filePath));
  const tmp = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), "utf8");
  fs.renameSync(tmp, filePath);
}

function appendJsonl(filePath, record) {
  ensureDir(path.dirname(filePath));
  fs.appendFileSync(filePath, `${JSON.stringify(record)}\n`, "utf8");
}

function ensureLegacyEmailNotesMarker(memoryDir) {
  const root = path.join(memoryDir, "email-agent");
  if (!fs.existsSync(root)) return;
  const hasLegacyMonthDir = fs
    .readdirSync(root, { withFileTypes: true })
    .some((entry) => entry.isDirectory() && /^\d{4}-\d{2}$/.test(entry.name));
  if (!hasLegacyMonthDir) return;
  const marker = path.join(root, "LEGACY.md");
  if (fs.existsSync(marker)) return;
  fs.writeFileSync(
    marker,
    "---\n" +
      "type: email-agent-legacy-marker\n" +
      "owner: agent\n" +
      `createdAt: ${JSON.stringify(nowIso())}\n` +
      "confidence: high\n" +
      "---\n\n" +
      "# Legacy e-mailnotities\n\n" +
      "Losse per-mail Markdownbestanden onder `email-agent/YYYY-MM/` zijn legacy. " +
      "Nieuwe scans schrijven compacte JSONL-events en alleen gerichte digest/memory-updates.\n",
    "utf8",
  );
}

function normalizeConfig(raw = {}) {
  const o = raw && typeof raw === "object" ? raw : {};
  return {
    enabled: o.enabled === true,
    intervalMinutes: clampNumber(o.intervalMinutes, 5, 120, DEFAULT_CONFIG.intervalMinutes),
    scanWindowHours: clampNumber(o.scanWindowHours, 1, 168, DEFAULT_CONFIG.scanWindowHours),
    maxPerFolder: clampNumber(o.maxPerFolder, 1, 25, DEFAULT_CONFIG.maxPerFolder),
    folders: ["inbox", "sent"],
    classifyWithLlm: o.classifyWithLlm !== false,
  };
}

function defaultState() {
  return {
    version: 1,
    config: { ...DEFAULT_CONFIG },
    lastAttemptAt: "",
    lastSuccessfulScanAt: "",
    lastRunId: "",
    lastError: "",
    running: false,
    consecutiveFailures: 0,
    processedKeys: [],
    notifications: [],
  };
}

function normalizeState(raw) {
  const state = { ...defaultState(), ...(raw && typeof raw === "object" ? raw : {}) };
  state.config = normalizeConfig(state.config);
  state.processedKeys = Array.isArray(state.processedKeys)
    ? state.processedKeys.filter((s) => typeof s === "string" && s.trim()).slice(-MAX_PROCESSED_KEYS)
    : [];
  state.notifications = Array.isArray(state.notifications)
    ? state.notifications
        .filter((n) => n && typeof n === "object" && typeof n.id === "string")
        .slice(-MAX_NOTIFICATIONS)
    : [];
  return state;
}

function truncate(value, max = 800) {
  const s = String(value || "").replace(/\s+/g, " ").trim();
  return s.length > max ? `${s.slice(0, max)}...` : s;
}

function normalizeUserContext(value, max = 4000) {
  const s = String(value || "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .trim();
  return s.length > max ? s.slice(0, max).trimEnd() : s;
}

function markdownEscape(value) {
  return String(value || "").replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim();
}

function yamlString(value) {
  return JSON.stringify(String(value || ""));
}

function safeSlug(value, fallback = "email") {
  const slug = String(value || "")
    .normalize("NFKD")
    .replace(/[^\w\s.-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^\.+|\.+$/g, "")
    .slice(0, 70)
    .trim();
  return slug || fallback;
}

function messageKey(mail, folder) {
  const entry = `${mail?.entryId || ""}|${mail?.storeId || ""}`.trim();
  if (entry !== "|") return entry;
  return `${folder}|${mail?.subject || ""}|${mail?.receivedTime || mail?.sentOn || ""}|${mail?.senderEmail || ""}`;
}

function stableMailDateKey(value) {
  const d = new Date(value || "");
  if (!Number.isFinite(d.getTime())) return String(value || "").slice(0, 32);
  d.setSeconds(0, 0);
  return d.toISOString();
}

function threadCounterparty(mail, folder) {
  if (folder === "sent") {
    return extractEmail(mail?.to || "");
  }
  return extractEmail(mail?.senderEmail || mail?.senderName || mail?.from || "");
}

function threadKeyFromParts({ conversationId, folder, subject, counterparty }) {
  const conv = String(conversationId || "").trim().toLowerCase();
  if (conv) return `conv|${conv}`;
  const subj = normalizeSubjectForThread(subject);
  const cp = extractEmail(counterparty);
  const f = String(folder || "inbox").trim().toLowerCase();
  if (!subj || !cp) return "";
  return `thread|${f}|${subj}|${cp}`;
}

function mailThreadKey(mail, folder) {
  return threadKeyFromParts({
    conversationId: mail?.conversationId,
    folder,
    subject: mail?.subject,
    counterparty: threadCounterparty(mail, folder),
  });
}

function notificationThreadKey(notification) {
  if (typeof notification?.threadKey === "string" && notification.threadKey.trim()) {
    return notification.threadKey.trim();
  }
  return threadKeyFromParts({
    conversationId: notification?.conversationId,
    folder: notification?.folder,
    subject: notification?.subject,
    counterparty:
      notification?.folder === "sent"
        ? extractEmail(notification?.to || "")
        : extractEmail(notification?.from || ""),
  });
}

function notificationsMatchThread(existing, mail, folder) {
  if (!existing || !mail) return false;
  if (folder === "inbox" && existing.folder !== "inbox") return false;

  const mailKey = mailThreadKey(mail, folder);
  const existingKey = notificationThreadKey(existing);
  if (mailKey && existingKey && mailKey === existingKey) return true;

  const mailConv = String(mail?.conversationId || "").trim().toLowerCase();
  const existingConv = String(existing?.conversationId || "").trim().toLowerCase();
  if (mailConv && existingConv) return mailConv === existingConv;

  const cp = threadCounterparty(mail, folder);
  const existingCp =
    existing.folder === "sent" ? extractEmail(existing?.to || "") : extractEmail(existing?.from || "");
  if (!cp || !existingCp || cp !== existingCp) return false;
  return sameThreadSubject(existing?.subject, mail?.subject);
}

function findNotificationIndexByThread(notifications, mail, folder) {
  const byExact = notifications.findIndex(
    (n) => n.messageKey === messageKey(mail, folder) || sameOutlookItem(n, mail, folder),
  );
  if (byExact >= 0) return byExact;
  if (folder !== "inbox") return -1;

  const matches = notifications
    .map((n, index) => ({ n, index }))
    .filter(({ n }) => n.folder === "inbox" && notificationsMatchThread(n, mail, folder));
  if (!matches.length) return -1;

  matches.sort((a, b) => {
    const rankDiff = statusRank(a.n.status) - statusRank(b.n.status);
    if (rankDiff !== 0) return rankDiff;
    return new Date(b.n.createdAt || 0).getTime() - new Date(a.n.createdAt || 0).getTime();
  });
  return matches[0].index;
}

function resolveStatusAfterThreadUpdate(currentStatus, classification, options = {}) {
  const requiresAction = classification?.requiresAction === true;
  const { allowReactivateArchived = false } = options;
  if (currentStatus === "archived" || currentStatus === "action_completed") {
    return allowReactivateArchived && requiresAction ? "unread" : currentStatus;
  }
  if (requiresAction && ["read", "action_completed"].includes(currentStatus)) {
    return "unread";
  }
  return currentStatus || "unread";
}

function mergeThreadNotifications(a, b) {
  const aDate = new Date(a?.mailDate || a?.updatedAt || a?.createdAt || 0).getTime();
  const bDate = new Date(b?.mailDate || b?.updatedAt || b?.createdAt || 0).getTime();
  const latest = bDate >= aDate ? b : a;
  const preferred = preferNotification(a, b);
  const ccOnly = latest.ccOnly === true || preferred.ccOnly === true;
  const automatedInfo = latest.automatedInfo === true || preferred.automatedInfo === true;
  const threadMessageCount =
    clampNumber((a?.threadMessageCount || 1) + (b?.threadMessageCount || 1), 1, 999, 2);
  const dismissed =
    preferred.status === "archived" || preferred.status === "action_completed";
  const mergedRequiresAction =
    dismissed || ccOnly || automatedInfo
      ? false
      : typeof latest.requiresAction === "boolean"
        ? latest.requiresAction
        : preferred.requiresAction;
  return {
    ...preferred,
    threadKey: notificationThreadKey(latest) || notificationThreadKey(preferred),
    conversationId: latest.conversationId || preferred.conversationId || "",
    entryId: latest.entryId || preferred.entryId,
    storeId: latest.storeId || preferred.storeId,
    messageKey: latest.messageKey || preferred.messageKey,
    subject: latest.subject || preferred.subject,
    from: latest.from || preferred.from,
    to: latest.to || preferred.to,
    cc: latest.cc || preferred.cc || "",
    ccOnly,
    automatedInfo,
    mailDate: latest.mailDate || preferred.mailDate,
    title: latest.title || preferred.title,
    summary: latest.summary || preferred.summary,
    importanceReason: latest.importanceReason || preferred.importanceReason,
    action: latest.action || preferred.action,
    requiresAction: mergedRequiresAction,
    priority: latest.priority || preferred.priority,
    tags: [...new Set([...(preferred.tags || []), ...(latest.tags || [])])].slice(0, 10),
    memoryPath: preferred.memoryPath || latest.memoryPath || "",
    kanbanTaskId: preferred.kanbanTaskId || latest.kanbanTaskId || "",
    userContext: preferred.userContext || latest.userContext || "",
    userContextUpdatedAt: preferred.userContextUpdatedAt || latest.userContextUpdatedAt || "",
    processedUserContext: preferred.processedUserContext || latest.processedUserContext || "",
    processedUserContextUpdatedAt:
      preferred.processedUserContextUpdatedAt || latest.processedUserContextUpdatedAt || "",
    threadMessageCount,
    status: dismissed
      ? preferred.status
      : resolveStatusAfterThreadUpdate(preferred.status, { requiresAction: mergedRequiresAction === true }),
    updatedAt: nowIso(),
  };
}

function consolidateThreadDuplicates(notifications) {
  const out = [];
  const threadIndex = new Map();
  for (const notification of notifications) {
    if (notification?.folder !== "inbox") {
      out.push(notification);
      continue;
    }
    const tk = notificationThreadKey(notification);
    if (!tk) {
      out.push(notification);
      continue;
    }
    if (threadIndex.has(tk)) {
      const idx = threadIndex.get(tk);
      out[idx] = mergeThreadNotifications(out[idx], notification);
      continue;
    }
    threadIndex.set(tk, out.length);
    out.push(notification);
  }
  return out;
}

function stableMailIdentityParts(input = {}) {
  const folder = String(input.folder || "").trim().toLowerCase();
  const subject = normalizeSubjectForThread(input.subject || input.title || "");
  const date = stableMailDateKey(input.mailDate || input.receivedTime || input.sentOn || "");
  const sender = extractEmail(input.from || input.senderEmail || input.senderName || "");
  if (!folder || !subject || !date || !sender) return "";
  return `${folder}|${subject}|${date}|${sender}`;
}

function notificationIdentityKeys(notification) {
  const keys = [];
  const threadKey = notificationThreadKey(notification);
  if (threadKey) keys.push(threadKey);
  if (notification?.folder && notification?.entryId) keys.push(`${notification.folder}|${notification.entryId}`);
  if (notification?.messageKey) keys.push(notification.messageKey);
  const stable = stableMailIdentityParts(notification);
  if (stable) keys.push(`stable|${stable}`);
  return [...new Set(keys.filter(Boolean))];
}

function mailIdentityKeys(mail, folder) {
  return notificationIdentityKeys({
    folder,
    entryId: mail?.entryId || "",
    messageKey: messageKey(mail, folder),
    subject: mail?.subject || "",
    mailDate: mailDate(mail),
    from: mail?.senderEmail || mail?.senderName || "",
  });
}

function sameOutlookItem(notification, mail, folder) {
  const existingKeys = new Set(notificationIdentityKeys(notification));
  return mailIdentityKeys(mail, folder).some((key) => existingKeys.has(key));
}

function mailDate(mail) {
  return mail?.receivedTime || mail?.sentOn || "";
}

function directionForFolder(folder) {
  return folder === "sent" ? "outgoing" : "incoming";
}

function normalizeSubjectForThread(subject) {
  return String(subject || "")
    .toLowerCase()
    .replace(/\[[^\]]+\]/g, " ")
    .replace(/^(\s*(re|fw|fwd|antw|doorst)\s*[:：]\s*)+/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

function extractEmail(value) {
  const s = String(value || "").toLowerCase();
  const angle = /<([^<>@\s]+@[^<>\s]+)>/.exec(s);
  if (angle?.[1]) return angle[1].trim();
  const plain = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i.exec(s);
  return plain?.[0]?.toLowerCase() || "";
}

function normalizeDisplayName(value) {
  return String(value || "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function extractAllRecipients(value) {
  return String(value || "")
    .split(/[;,]/)
    .map((part) => part.trim())
    .filter(Boolean);
}

function resolveMailboxIdentity(options = {}) {
  const emails = new Set();
  const names = new Set();

  const addEmail = (value) => {
    const email = extractEmail(value) || (String(value || "").includes("@") ? String(value).trim().toLowerCase() : "");
    if (email) emails.add(email);
  };
  const addName = (value) => {
    const name = normalizeDisplayName(value);
    if (name) names.add(name);
  };

  if (Array.isArray(options.mailboxEmails)) {
    for (const value of options.mailboxEmails) addEmail(value);
  }
  if (Array.isArray(options.mailboxDisplayNames)) {
    for (const value of options.mailboxDisplayNames) addName(value);
  }

  const envMailbox = String(process.env.EMAIL_AGENT_MAILBOX || process.env.IOMS_MAILBOX_EMAIL || "").trim();
  for (const part of envMailbox.split(/[;,]/)) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    addEmail(trimmed);
    if (!trimmed.includes("@")) addName(trimmed);
  }

  const envNames = String(process.env.EMAIL_AGENT_MAILBOX_NAMES || "").trim();
  for (const part of envNames.split(/[;,]/)) {
    const trimmed = part.trim();
    if (trimmed) addName(trimmed);
  }

  if (!emails.size && !names.size) {
    addEmail("joost.vanleeuwaarden@iodigital.com");
    addName("Joost van Leeuwaarden");
  } else if (!names.size) {
    for (const email of emails) {
      const local = email.split("@")[0] || "";
      if (local.includes(".")) {
        addName(local.split(".").map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(" "));
      }
    }
  }

  return { emails, names };
}

function recipientMatchesIdentity(recipient, identity) {
  if (!recipient || !identity) return false;
  const email = extractEmail(recipient);
  if (email && identity.emails.has(email)) return true;

  const name = normalizeDisplayName(recipient);
  if (!name) return false;
  if (identity.names.has(name)) return true;

  for (const identityName of identity.names) {
    if (name === identityName || name.includes(identityName) || identityName.includes(name)) return true;
  }
  for (const identityEmail of identity.emails) {
    const local = identityEmail.split("@")[0] || "";
    if (!local) continue;
    const compactLocal = local.replace(/\./g, "");
    const compactName = name.replace(/\s+/g, "");
    if (name.replace(/\s+/g, ".") === local || compactName === compactLocal) return true;
  }
  return false;
}

function isInboxCcOnly(mail, identity) {
  if (!identity || (!identity.emails.size && !identity.names.size)) return false;
  const ccRecipients = extractAllRecipients(mail?.cc);
  if (!ccRecipients.length) return false;
  const inCc = ccRecipients.some((recipient) => recipientMatchesIdentity(recipient, identity));
  if (!inCc) return false;
  const inTo = extractAllRecipients(mail?.to).some((recipient) => recipientMatchesIdentity(recipient, identity));
  return !inTo;
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function classificationTargetsMailbox(classification, mail, identity) {
  if (!classification || !identity) return false;
  const action = String(classification.action || "").trim();
  if (classification.requiresAction === true && action.length > 10) {
    return true;
  }
  const text = [
    mail?.subject || "",
    mail?.bodySnippet || "",
    classification.summary || "",
    classification.action || "",
    classification.importanceReason || "",
  ].join("\n");
  const actionCue =
    /(graag|kun je|kan je|wil je|actie|oppak|doorloopt|review|jouw|neergelegd|toegewezen|voor jou|pick up|take care of)/i;
  for (const name of identity.names) {
    if (!name) continue;
    if (new RegExp(`\\b${escapeRegExp(name)}\\b`, "i").test(text) && actionCue.test(text)) {
      return true;
    }
  }
  for (const email of identity.emails) {
    const local = (email.split("@")[0] || "").replace(/\./g, "");
    if (!local) continue;
    const compactText = text.toLowerCase().replace(/\s+/g, "");
    if (compactText.includes(local) && actionCue.test(text)) {
      return true;
    }
  }
  return false;
}

function applyCcOnlyPolicy(classification, mail, folder, identity) {
  if (folder !== "inbox" || !isInboxCcOnly(mail, identity)) {
    return { classification, ccOnly: false };
  }
  if (classificationTargetsMailbox(classification, mail, identity)) {
    return { classification, ccOnly: false };
  }
  return {
    ccOnly: true,
    classification: {
      ...classification,
      relevant: false,
      requiresAction: false,
      category: "cc_ter_informatie",
      action: "",
      importanceReason: "Je staat alleen in CC; geen actie vereist.",
      tags: [...new Set([...(classification.tags || []), "cc-only"])],
      classifier: `${classification.classifier || "unknown"}+cc-only`,
    },
  };
}

function detectAutomatedInformationalMail(mail) {
  const subject = String(mail?.subject || "");
  const body = String(mail?.bodySnippet || "");
  const text = `${subject}\n${body}`;
  const textLower = text.toLowerCase();
  const sender = `${mail?.senderEmail || ""} ${mail?.senderName || ""}`.toLowerCase();
  const senderEmail = extractEmail(sender) || sender;

  if (/^(accepted|declined|tentative|tentatively accepted|cancelled|canceled):\s/i.test(subject)) {
    return { kind: "calendar_response", memoryEligible: false };
  }
  if (/^(geaccepteerd|afgewezen|voorlopig geaccepteerd|geannuleerd):\s/i.test(subject)) {
    return { kind: "calendar_response", memoryEligible: false };
  }
  if (
    /(has|heeft) (accepted|declined|tentatively accepted|geaccepteerd|afgewezen).{0,60}(meeting|afspraak|uitnodiging|invitation)/i.test(
      text,
    )
  ) {
    return { kind: "calendar_response", memoryEligible: false };
  }

  if (
    /\[confluence\]|confluence:/i.test(subject) ||
    /@atlassian\.com$/i.test(senderEmail) ||
    /\bconfluence\b/i.test(sender)
  ) {
    return { kind: "confluence", memoryEligible: true };
  }
  if (
    /(mentioned you on|page updated|heeft je genoemd|pagina bijgewerkt|commented on)/i.test(textLower) &&
    /confluence|atlassian/i.test(`${textLower} ${sender}`)
  ) {
    return { kind: "confluence", memoryEligible: true };
  }

  if (/^jira updates for/i.test(subject) || (/\bjira\b/i.test(sender) && /\b(update|issue|ticket)\b/i.test(subject))) {
    return { kind: "jira_automation", memoryEligible: true };
  }

  if (/automatic reply|out of office|afwezigheid|automatisch antwoord|autoreply/i.test(`${subject}\n${body.slice(0, 600)}`)) {
    return { kind: "out_of_office", memoryEligible: false };
  }

  if (/^(no-?reply|donotreply|do-not-reply)@/i.test(senderEmail)) {
    return { kind: "system_notification", memoryEligible: false };
  }
  if (/notifications@|mailer-daemon@|postmaster@|calendar-notification@/i.test(senderEmail)) {
    return { kind: "system_notification", memoryEligible: false };
  }
  if (/recruiteemail\.com/i.test(senderEmail)) {
    return { kind: "recruitee", memoryEligible: false };
  }

  if (
    /\[teams\]|\[planner\]|\[sharepoint\]|microsoft teams|assigned you a task|heeft je een taak toegewezen/i.test(
      `${subject}\n${body.slice(0, 500)}`,
    )
  ) {
    return { kind: "microsoft_notification", memoryEligible: false };
  }

  if (/\b(unsubscribe|afmelden|uitschrijven|view in browser|bekijk online)\b/i.test(textLower)) {
    return { kind: "newsletter", memoryEligible: false };
  }

  return null;
}

function applyAutomatedInformationalPolicy(classification, mail, folder) {
  if (folder !== "inbox") return { classification, automatedInfo: false };
  const detection = detectAutomatedInformationalMail(mail);
  if (!detection) return { classification, automatedInfo: false };
  return {
    automatedInfo: true,
    classification: {
      ...classification,
      requiresAction: false,
      relevant: detection.memoryEligible,
      category: detection.kind,
      action: "",
      importanceReason: detection.memoryEligible
        ? "Automatische melding; kan nuttig zijn voor geheugen maar geen actie in het overzicht."
        : "Automatische e-mail ter informatie; geen actie nodig.",
      automatedInfo: true,
      memoryEligible: detection.memoryEligible,
      tags: [...new Set([...(classification.tags || []), "automatisch", detection.kind])],
      classifier: `${classification.classifier || "unknown"}+auto-info`,
    },
  };
}

function sentDate(mail) {
  return mail?.sentOn || mail?.receivedTime || "";
}

function sameThreadSubject(a, b) {
  const sa = normalizeSubjectForThread(a);
  const sb = normalizeSubjectForThread(b);
  if (!sa || !sb) return false;
  return sa === sb || sa.includes(sb) || sb.includes(sa);
}

function sentMailLooksLikeReply(original, sent) {
  if (!sameThreadSubject(original?.subject, sent?.subject)) return false;
  const originalSender = extractEmail(original?.senderEmail || original?.senderName || original?.from);
  const sentTo = extractEmail(`${sent?.to || ""} ${sent?.cc || ""}`);
  if (originalSender && sentTo) return sentTo === originalSender;
  return true;
}

async function findExistingSentReply(mail, runId, log) {
  const received = new Date(mailDate(mail) || Date.now());
  const now = new Date();
  const from = Number.isFinite(received.getTime()) && received <= now ? received : startOfLocalToday();
  const query = normalizeSubjectForThread(mail?.subject || "").slice(0, 120);
  if (!query) return null;
  const payload = await searchOutlookMailPayload({
    folder: "sent",
    query,
    fromDate: from.toISOString(),
    toDate: now.toISOString(),
    limit: 10,
    includeBody: false,
    bodyMaxChars: 700,
  });
  if (!payload?.ok) {
    log(runId, "email_agent_sent_reply_check_failed", { subject: truncate(mail?.subject || "", 160), error: payload?.error || "" });
    return null;
  }
  const mails = Array.isArray(payload.results) ? payload.results : Array.isArray(payload.mails) ? payload.mails : [];
  const match = mails.find((sent) => sentMailLooksLikeReply(mail, sent));
  return match || null;
}

function heuristicClassification(mail, folder) {
  const automated = folder === "inbox" ? detectAutomatedInformationalMail(mail) : null;
  if (automated) {
    return applyAutomatedInformationalPolicy(
      {
        relevant: automated.memoryEligible,
        category: automated.kind,
        requiresAction: false,
        priority: "laag",
        summary: truncate(mail?.bodySnippet || mail?.subject || "Automatische e-mail.", 450),
        keyPoints: [],
        action: "",
        deadline: "",
        tags: ["automatisch", automated.kind],
        relatedMemory: [],
        importanceReason: automated.memoryEligible
          ? "Automatische melding; kan nuttig zijn voor geheugen maar geen actie in het overzicht."
          : "Automatische e-mail ter informatie; geen actie nodig.",
        confidence: "low",
        classifier: "heuristic-auto",
      },
      mail,
      folder,
    ).classification;
  }

  const text = `${mail?.subject || ""}\n${mail?.bodySnippet || ""}`.toLowerCase();
  const requiresAction =
    folder === "inbox" &&
    /(\?|kun je|kan je|graag je|wil je|bevestig je|jouw input|jouw reactie|jouw akkoord|actie voor jou|let me know|could you|can you)/i.test(
      text,
    );
  const relevant =
    requiresAction ||
    /(deadline|besluit|managed services|contract|offerte|project|klant)/i.test(text);
  return {
    relevant,
    category: requiresAction ? "taak" : relevant ? "informatie" : "niet_relevant",
    requiresAction,
    priority: /urgent|spoed|vandaag|deadline/i.test(text) ? "hoog" : requiresAction ? "middel" : "laag",
    summary: truncate(mail?.bodySnippet || mail?.subject || "Geen samenvatting beschikbaar.", 450),
    keyPoints: [],
    action: requiresAction ? "Bekijk en beantwoord deze e-mail." : "",
    deadline: "",
    tags: [],
    relatedMemory: [],
    importanceReason: requiresAction
      ? "De e-mail lijkt een vraag of actie aan jou te bevatten."
      : relevant
        ? "De e-mail lijkt inhoudelijk relevant voor het Second Brain."
        : "Geen duidelijke actie of projectcontext gevonden.",
    confidence: "low",
    classifier: "heuristic",
  };
}

function normalizeClassification(raw, mail, folder) {
  const fallback = heuristicClassification(mail, folder);
  const o = raw && typeof raw === "object" ? raw : {};
  const relevant = typeof o.relevant === "boolean" ? o.relevant : fallback.relevant;
  const requiresAction = typeof o.requiresAction === "boolean" ? o.requiresAction : fallback.requiresAction;
  return {
    relevant,
    category: typeof o.category === "string" && o.category.trim() ? o.category.trim().slice(0, 40) : fallback.category,
    requiresAction,
    priority: ["laag", "middel", "hoog"].includes(o.priority) ? o.priority : fallback.priority,
    summary: typeof o.summary === "string" && o.summary.trim() ? truncate(o.summary, 900) : fallback.summary,
    keyPoints: Array.isArray(o.keyPoints)
      ? o.keyPoints.filter((s) => typeof s === "string" && s.trim()).map((s) => truncate(s, 240)).slice(0, 8)
      : fallback.keyPoints,
    action: typeof o.action === "string" ? truncate(o.action, 500) : fallback.action,
    deadline: typeof o.deadline === "string" ? truncate(o.deadline, 80) : "",
    tags: Array.isArray(o.tags)
      ? o.tags.filter((s) => typeof s === "string" && s.trim()).map((s) => s.trim().slice(0, 40)).slice(0, 10)
      : [],
    relatedMemory: Array.isArray(o.relatedMemory)
      ? o.relatedMemory.filter((s) => typeof s === "string" && s.trim()).map((s) => s.trim().slice(0, 160)).slice(0, 8)
      : [],
    importanceReason:
      typeof o.importanceReason === "string" && o.importanceReason.trim()
        ? truncate(o.importanceReason, 500)
        : fallback.importanceReason,
    confidence: ["low", "medium", "high"].includes(o.confidence) ? o.confidence : "medium",
    classifier: typeof o.classifier === "string" ? o.classifier : "llm",
  };
}

function notificationFromClassification(mail, folder, classification, memoryPath, options = {}) {
  const id = randomUUID();
  const createdAt = nowIso();
  const threadKey = mailThreadKey(mail, folder);
  return {
    id,
    createdAt,
    status: "unread",
    messageKey: messageKey(mail, folder),
    entryId: mail?.entryId || "",
    storeId: mail?.storeId || "",
    conversationId: mail?.conversationId || "",
    threadKey,
    threadMessageCount: 1,
    direction: directionForFolder(folder),
    folder,
    subject: mail?.subject || "(geen onderwerp)",
    from: mail?.senderEmail || mail?.senderName || "",
    to: mail?.to || "",
    cc: mail?.cc || "",
    ccOnly: options.ccOnly === true,
    automatedInfo: options.automatedInfo === true || classification.automatedInfo === true,
    mailDate: mailDate(mail),
    title: mail?.subject || "E-mail vraagt aandacht",
    summary: classification.summary,
    importanceReason: classification.importanceReason,
    action: classification.action,
    requiresAction: classification.requiresAction === true,
    priority: classification.priority,
    tags: classification.tags,
    memoryPath,
    kanbanTaskId: "",
    userContext: "",
    userContextUpdatedAt: "",
    processedUserContext: "",
    processedUserContextUpdatedAt: "",
  };
}

function eventMonth(value) {
  const d = new Date(value || Date.now());
  const safe = Number.isFinite(d.getTime()) ? d : new Date();
  return `${safe.getFullYear()}-${String(safe.getMonth() + 1).padStart(2, "0")}`;
}

function emailAgentEventRelativePath(timestamp = nowIso()) {
  return `system/email-agent-events-${eventMonth(timestamp)}.jsonl`;
}

function digestRelativePath(timestamp = nowIso()) {
  return `${DIGEST_RELATIVE_DIR}/${eventMonth(timestamp)}.md`;
}

function emailEventRecord(mail, folder, classification, notification, runId, options = {}) {
  const timestamp = mailDate(mail) || nowIso();
  return {
    version: 1,
    type: "email-agent-event",
    runId,
    processedAt: nowIso(),
    mailDate: timestamp,
    messageKey: notification?.messageKey || messageKey(mail, folder),
    entryId: mail?.entryId || "",
    direction: directionForFolder(folder),
    folder,
    subject: mail?.subject || "",
    from: mail?.senderEmail || mail?.senderName || "",
    to: mail?.to || "",
    relevant: classification.relevant === true,
    requiresAction: classification.requiresAction === true,
    priority: classification.priority || "laag",
    category: classification.category || "",
    summary: classification.summary || "",
    action: classification.action || "",
    deadline: classification.deadline || "",
    tags: classification.tags || [],
    relatedMemory: classification.relatedMemory || [],
    importanceReason: classification.importanceReason || "",
    notificationId: notification?.id || "",
    notificationStatus: notification?.status || "",
    digestPath: options.digestPath || digestRelativePath(timestamp),
    memoryUpdates: Array.isArray(options.memoryUpdates) ? options.memoryUpdates : [],
    classifier: classification.classifier || "",
    confidence: classification.confidence || "",
  };
}

function sectionBetween(markdown, heading, nextHeading = "## ") {
  const source = String(markdown || "").replace(/\r\n/g, "\n");
  const startRe = new RegExp(`^##\\s+${heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*$`, "im");
  const start = startRe.exec(source);
  if (!start) return "";
  const bodyStart = start.index + start[0].length;
  const rest = source.slice(bodyStart);
  const next = rest.search(new RegExp(`^${nextHeading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`, "m"));
  return (next >= 0 ? rest.slice(0, next) : rest).trim();
}

function actionFromMemoryMarkdown(markdown) {
  const actionSection = sectionBetween(markdown, "Actie");
  const m = /^-\s*Gevraagde actie:\s*(.+)$/im.exec(actionSection);
  if (m?.[1]) return truncate(m[1], 600);
  return "";
}

function requiresActionFromMemoryMarkdown(markdown) {
  const source = String(markdown || "");
  if (/^requiresAction:\s*true\s*$/im.test(source)) return true;
  if (/^requiresAction:\s*false\s*$/im.test(source)) return false;
  const actionSection = sectionBetween(source, "Actie");
  if (/^-\s*Actie nodig:\s*ja\s*$/im.test(actionSection)) return true;
  if (/^-\s*Actie nodig:\s*nee\s*$/im.test(actionSection)) return false;
  return false;
}

function normalizeDismissedNotifications(notifications) {
  let changed = false;
  for (const notification of notifications) {
    if (notification?.status !== "archived" && notification?.status !== "action_completed") continue;
    if (notification.requiresAction === false) continue;
    notification.requiresAction = false;
    notification.updatedAt = nowIso();
    changed = true;
  }
  return changed;
}

function notificationVisibleInActionList(notification, mailboxIdentity) {
  if (notification?.folder !== "inbox") return false;
  if (notification?.status === "archived" || notification?.status === "action_completed") return false;
  if (notification?.requiresAction !== true) return false;
  if (notification?.automatedInfo === true) return false;
  if (notification?.ccOnly === true) return false;
  if (
    mailboxIdentity &&
    isInboxCcOnly({ to: notification?.to || "", cc: notification?.cc || "" }, mailboxIdentity)
  ) {
    return false;
  }
  return true;
}

function notificationIdentity(notification) {
  return notificationIdentityKeys(notification)[0] || notification?.id || "";
}

function statusRank(status) {
  if (status === "archived") return 5;
  if (status === "unread") return 4;
  if (status === "read") return 3;
  if (status === "action_completed") return 2;
  return 0;
}

function preferNotification(next, current) {
  if (!current) return next;
  const nextUpdated = new Date(next?.updatedAt || next?.createdAt || 0).getTime();
  const currentUpdated = new Date(current?.updatedAt || current?.createdAt || 0).getTime();
  if (statusRank(next?.status) !== statusRank(current?.status)) {
    return statusRank(next?.status) > statusRank(current?.status) ? next : current;
  }
  return nextUpdated >= currentUpdated ? next : current;
}

function dedupeNotifications(notifications) {
  const byIdentity = new Map();
  const aliasToIdentity = new Map();
  for (const notification of notifications) {
    const keys = notificationIdentityKeys(notification);
    const identity = keys.map((key) => aliasToIdentity.get(key)).find(Boolean) || keys[0] || notification?.id || "";
    if (!identity) continue;
    const preferred = preferNotification(notification, byIdentity.get(identity));
    byIdentity.set(identity, preferred);
    for (const key of keys) aliasToIdentity.set(key, identity);
  }
  return [...byIdentity.values()];
}

function enrichNotificationFromMemory(notification, memoryDir) {
  if (!notification?.memoryPath) return notification;
  if (notification.importanceReason && notification.action && typeof notification.requiresAction === "boolean") return notification;
  const full = path.resolve(memoryDir, notification.memoryPath);
  const root = path.resolve(memoryDir);
  if (!full.startsWith(root + path.sep)) return notification;
  try {
    if (!fs.existsSync(full)) return notification;
    const md = fs.readFileSync(full, "utf8");
    return {
      ...notification,
      importanceReason: notification.importanceReason || truncate(sectionBetween(md, "Waarom relevant"), 700),
      action: notification.action || actionFromMemoryMarkdown(md),
      requiresAction: typeof notification.requiresAction === "boolean" ? notification.requiresAction : requiresActionFromMemoryMarkdown(md),
    };
  } catch {
    return notification;
  }
}

export function createEmailAgent(options = {}) {
  const memoryDir = options.memoryDir;
  if (!memoryDir) throw new Error("memoryDir is verplicht voor de e-mailagent.");
  const statePath = options.statePath || path.join(memoryDir, "system", "email-agent-state.json");
  const log = typeof options.log === "function" ? options.log : () => {};
  const classifyEmail = typeof options.classifyEmail === "function" ? options.classifyEmail : null;
  const processEmailMemory = typeof options.processEmailMemory === "function" ? options.processEmailMemory : null;
  const processKanbanSignal = typeof options.processKanbanSignal === "function" ? options.processKanbanSignal : null;
  const onMemoryChanged = typeof options.onMemoryChanged === "function" ? options.onMemoryChanged : null;
  const mailboxIdentity = resolveMailboxIdentity(options);
  let scanPromise = null;
  let timer = null;
  let nextRunAt = "";
  ensureLegacyEmailNotesMarker(memoryDir);

  function sanitizeCcOnlyNotifications(notifications) {
    let changed = false;
    for (const notification of notifications) {
      if (notification?.folder !== "inbox" || notification?.status === "archived") continue;
      if (!isInboxCcOnly({ to: notification?.to || "", cc: notification?.cc || "" }, mailboxIdentity)) continue;
      if (
        classificationTargetsMailbox(
          {
            requiresAction: notification.requiresAction,
            action: notification.action,
            summary: notification.summary,
            importanceReason: notification.importanceReason,
          },
          notification,
          mailboxIdentity,
        )
      ) {
        continue;
      }
      if (notification.ccOnly === true && notification.requiresAction !== true) continue;
      notification.ccOnly = true;
      notification.requiresAction = false;
      notification.updatedAt = nowIso();
      changed = true;
    }
    return changed;
  }

  function sanitizeAutomatedNotifications(notifications) {
    let changed = false;
    for (const notification of notifications) {
      if (notification?.folder !== "inbox" || notification?.status === "archived") continue;
      const detection = detectAutomatedInformationalMail({
        subject: notification?.subject || "",
        senderEmail: notification?.from || "",
        senderName: notification?.from || "",
        bodySnippet: notification?.summary || "",
      });
      if (!detection) continue;
      if (notification.automatedInfo === true && notification.requiresAction !== true) continue;
      notification.automatedInfo = true;
      notification.requiresAction = false;
      notification.updatedAt = nowIso();
      changed = true;
    }
    return changed;
  }

  function loadState() {
    const state = normalizeState(readJsonFile(statePath, defaultState()));
    const changed =
      sanitizeCcOnlyNotifications(state.notifications) ||
      sanitizeAutomatedNotifications(state.notifications) ||
      normalizeDismissedNotifications(state.notifications);
    if (changed) {
      writeJsonAtomic(statePath, state);
    }
    return state;
  }

  function saveState(state) {
    const normalized = normalizeState(state);
    writeJsonAtomic(statePath, normalized);
    return normalized;
  }

  function getConfig() {
    return loadState().config;
  }

  function updateConfig(patch = {}) {
    const state = loadState();
    state.config = normalizeConfig({ ...state.config, ...(patch && typeof patch === "object" ? patch : {}) });
    saveState(state);
    scheduleNext();
    return state.config;
  }

  function getStatus() {
    const state = loadState();
    const consolidated = consolidateThreadDuplicates(state.notifications);
    if (consolidated.length !== state.notifications.length) {
      state.notifications = consolidated.slice(-MAX_NOTIFICATIONS);
      saveState(state);
    }
    const actionNotifications = dedupeNotifications(state.notifications.map((n) => enrichNotificationFromMemory(n, memoryDir)))
      .filter((notification) => notificationVisibleInActionList(notification, mailboxIdentity));
    return {
      ok: true,
      config: state.config,
      statePath,
      running: !!scanPromise,
      lastAttemptAt: state.lastAttemptAt,
      lastSuccessfulScanAt: state.lastSuccessfulScanAt,
      lastRunId: state.lastRunId,
      lastError: state.lastError,
      consecutiveFailures: state.consecutiveFailures,
      notificationCount: actionNotifications.length,
      unreadCount: actionNotifications.filter((n) => n.status === "unread").length,
      nextRunAt,
      nextRunInMs: nextRunAt ? Math.max(0, new Date(nextRunAt).getTime() - Date.now()) : null,
    };
  }

  function listNotifications({ status, limit } = {}) {
    const state = loadState();
    const consolidated = consolidateThreadDuplicates(state.notifications);
    if (consolidated.length !== state.notifications.length) {
      state.notifications = consolidated.slice(-MAX_NOTIFICATIONS);
      saveState(state);
    }
    const max = clampNumber(limit, 1, 500, 100);
    const filterStatus = typeof status === "string" ? status.trim() : "";
    const notifications = dedupeNotifications(
      state.notifications
        .slice()
        .reverse()
        .map((n) => enrichNotificationFromMemory(n, memoryDir)),
    )
      .filter((notification) => notificationVisibleInActionList(notification, mailboxIdentity))
      .filter((n) => !filterStatus || n.status === filterStatus)
      .slice(0, max);
    return { ok: true, notifications, total: notifications.length };
  }

  function updateNotification(id, patch = {}) {
    const state = loadState();
    const item = state.notifications.find((n) => n.id === id);
    if (!item) return { ok: false, error: "Notificatie niet gevonden." };
    let changed = false;
    const nextStatus = typeof patch.status === "string" ? patch.status : "";
    if (["unread", "read", "archived", "action_completed"].includes(nextStatus)) {
      item.status = nextStatus;
      if (nextStatus === "archived" || nextStatus === "action_completed") {
        item.requiresAction = false;
      }
      changed = true;
    }
    if (Object.prototype.hasOwnProperty.call(patch, "userContext")) {
      const nextContext = normalizeUserContext(patch.userContext);
      if (nextContext !== String(item.userContext || "")) {
        item.userContext = nextContext;
        item.userContextUpdatedAt = nowIso();
        changed = true;
      }
    }
    if (typeof patch.summary === "string" && patch.summary.trim()) {
      item.summary = truncate(patch.summary, 900);
      changed = true;
    }
    if (typeof patch.importanceReason === "string" && patch.importanceReason.trim()) {
      item.importanceReason = truncate(patch.importanceReason, 500);
      changed = true;
    }
    if (typeof patch.action === "string") {
      item.action = truncate(patch.action, 500);
      changed = true;
    }
    if (typeof patch.requiresAction === "boolean") {
      item.requiresAction = patch.requiresAction;
      changed = true;
    }
    if (["laag", "middel", "hoog"].includes(patch.priority)) {
      item.priority = patch.priority;
      changed = true;
    }
    if (Array.isArray(patch.tags)) {
      item.tags = patch.tags.filter((s) => typeof s === "string" && s.trim()).map((s) => s.trim().slice(0, 40)).slice(0, 10);
      changed = true;
    }
    if (typeof patch.processedUserContext === "string") {
      item.processedUserContext = normalizeUserContext(patch.processedUserContext, 12000);
      item.processedUserContextUpdatedAt = nowIso();
      changed = true;
    }
    if (typeof patch.kanbanTaskId === "string") {
      item.kanbanTaskId = patch.kanbanTaskId.trim();
      changed = true;
    }
    if (changed) {
      item.updatedAt = nowIso();
    }
    saveState(state);
    return { ok: true, notification: item };
  }

  function getNotification(id) {
    const state = loadState();
    const item = state.notifications.find((n) => n.id === id);
    if (!item) return null;
    const notification = enrichNotificationFromMemory(item, memoryDir);
    let memoryMarkdown = "";
    if (notification.memoryPath) {
      const full = path.resolve(memoryDir, notification.memoryPath);
      const root = path.resolve(memoryDir);
      if (full.startsWith(root + path.sep) && fs.existsSync(full)) {
        try {
          memoryMarkdown = fs.readFileSync(full, "utf8");
        } catch {
          memoryMarkdown = "";
        }
      }
    }
    return { notification, memoryMarkdown };
  }

  async function classify(mail, folder, runId) {
    if (!getConfig().classifyWithLlm || !classifyEmail) return heuristicClassification(mail, folder);
    try {
      const result = await classifyEmail({ mail, folder, runId });
      return normalizeClassification(result, mail, folder);
    } catch (e) {
      log(runId, "email_agent_classify_fallback", { error: String(e?.message || e), subject: mail?.subject || "" });
      return { ...heuristicClassification(mail, folder), classifier: "heuristic-fallback" };
    }
  }

  async function processMail(mail, folder, state, runId, options = {}) {
    const key = messageKey(mail, folder);
    let existingIndex = findNotificationIndexByThread(state.notifications, mail, folder);
    let existingNotification = existingIndex >= 0 ? state.notifications[existingIndex] : null;
    if (state.processedKeys.includes(key) && !options.forceReprocess) {
      return { status: "skipped", reason: "already_processed" };
    }
    const isThreadContinuation =
      !!existingNotification &&
      !!mail?.entryId &&
      existingNotification.entryId &&
      existingNotification.entryId !== mail.entryId;
    if (
      existingNotification?.status === "archived" &&
      !isThreadContinuation &&
      !options.forceReprocess &&
      !options.reactivateActions
    ) {
      if (!options.dryRun) {
        if (!state.processedKeys.includes(key)) state.processedKeys.push(key);
        state.processedKeys = state.processedKeys.slice(-MAX_PROCESSED_KEYS);
      }
      return { status: "skipped", reason: "archived_existing" };
    }
    let fullMail = mail;
    if (mail?.entryId) {
      const readPayload = await readOutlookMailPayload({ entryId: mail.entryId, storeId: mail.storeId, bodyMaxChars: 8000 });
      if (readPayload?.ok && readPayload.item) fullMail = { ...mail, ...readPayload.item };
    }
    let classification = await classify(fullMail, folder, runId);
    const ccPolicy = applyCcOnlyPolicy(classification, fullMail, folder, mailboxIdentity);
    classification = ccPolicy.classification;
    const ccOnly = ccPolicy.ccOnly;
    if (ccOnly) {
      log(runId, "email_agent_cc_only_ignored", {
        subject: truncate(fullMail?.subject || "", 160),
        to: truncate(fullMail?.to || "", 160),
        cc: truncate(fullMail?.cc || "", 160),
      });
    }
    const autoPolicy = applyAutomatedInformationalPolicy(classification, fullMail, folder);
    classification = autoPolicy.classification;
    const automatedInfo = autoPolicy.automatedInfo;
    if (automatedInfo) {
      log(runId, "email_agent_automated_info", {
        subject: truncate(fullMail?.subject || "", 160),
        kind: classification.category || "",
        memoryEligible: classification.memoryEligible === true,
      });
    }
    let existingSentReply = null;
    if (folder === "inbox" && classification.requiresAction === true && !ccOnly && !automatedInfo) {
      existingSentReply = await findExistingSentReply(fullMail, runId, log);
      if (existingSentReply) {
        classification.requiresAction = false;
        classification.action = "Geen extra melding nodig: er is al een antwoord gevonden in Verzonden.";
        classification.importanceReason = `${classification.importanceReason || "Deze mail vroeg om opvolging."} Er is al een verzonden antwoord gevonden op ${sentDate(existingSentReply) || "een later moment"}.`;
        classification.tags = [...new Set([...(classification.tags || []), "al-beantwoord"])];
      }
    }
    if (!options.dryRun) {
      if (!state.processedKeys.includes(key)) state.processedKeys.push(key);
      state.processedKeys = state.processedKeys.slice(-MAX_PROCESSED_KEYS);
    }
    let notification = existingNotification || null;

    async function persistMemoryAndEvent(notificationRef) {
      const digestPath = digestRelativePath(mailDate(fullMail) || nowIso());
      let memoryResult = { changed: false, updates: [], digestPath };
      const baseEvent = emailEventRecord(fullMail, folder, classification, notificationRef, runId, { digestPath });
      if (processEmailMemory && classification.relevant) {
        try {
          memoryResult = await processEmailMemory({
            mail: fullMail,
            folder,
            classification,
            notification: notificationRef,
            event: baseEvent,
            digestPath,
            runId,
          });
        } catch (e) {
          log(runId, "email_agent_memory_merge_failed", {
            subject: truncate(fullMail?.subject || "", 160),
            error: String(e?.message || e),
          });
        }
      }
      const event = emailEventRecord(fullMail, folder, classification, notificationRef, runId, {
        digestPath: memoryResult?.digestPath || digestPath,
        memoryUpdates: memoryResult?.updates || [],
      });
      appendJsonl(path.join(memoryDir, emailAgentEventRelativePath(event.processedAt)), event);
      return memoryResult;
    }

    if (automatedInfo) {
      if (!options.dryRun && existingNotification && existingNotification.status !== "archived") {
        existingNotification.requiresAction = false;
        existingNotification.automatedInfo = true;
        existingNotification.updatedAt = nowIso();
        notification = existingNotification;
      }
      if (!options.dryRun) {
        const memoryResult = await persistMemoryAndEvent(notification);
        if (memoryResult?.changed && onMemoryChanged) await onMemoryChanged("email_agent_automated_memory");
      }
      return {
        status: classification.relevant ? "memory_only" : "ignored",
        classification,
        memoryChanged: !options.dryRun && classification.relevant,
      };
    }

    if (!classification.relevant) {
      if (!options.dryRun && existingNotification && existingNotification.status !== "archived") {
        existingNotification.requiresAction = false;
        if (ccOnly) {
          existingNotification.ccOnly = true;
          existingNotification.cc = fullMail?.cc || existingNotification.cc || "";
        }
        existingNotification.updatedAt = nowIso();
        notification = existingNotification;
      }
      if (!options.dryRun) {
        if (processKanbanSignal && folder === "sent") {
          try {
            await processKanbanSignal({
              mail: fullMail,
              folder,
              classification,
              notification,
              runId,
            });
          } catch (e) {
            log(runId, "email_agent_kanban_sent_ingest_failed", {
              subject: truncate(fullMail?.subject || "", 160),
              error: String(e?.message || e),
            });
          }
        }
        const event = emailEventRecord(fullMail, folder, classification, notification, runId);
        appendJsonl(path.join(memoryDir, emailAgentEventRelativePath(event.processedAt)), event);
      }
      return { status: "ignored", classification };
    }

    if (
      existingNotification?.status === "archived" &&
      !options.forceReprocess &&
      !options.reactivateActions
    ) {
      const shouldFork =
        isThreadContinuation &&
        classification.requiresAction === true &&
        !ccOnly &&
        !automatedInfo;
      if (!shouldFork) {
        if (!options.dryRun) {
          const event = emailEventRecord(fullMail, folder, classification, existingNotification, runId);
          appendJsonl(path.join(memoryDir, emailAgentEventRelativePath(event.processedAt)), event);
        }
        return { status: "skipped", reason: "archived_existing" };
      }
      existingNotification = null;
      existingIndex = -1;
    }

    const relPath = existingNotification?.memoryPath || "";
    const freshNotification = notificationFromClassification(fullMail, folder, classification, relPath, {
      ccOnly,
      automatedInfo: classification.automatedInfo === true,
    });
    notification = existingNotification
      ? {
          ...existingNotification,
          messageKey: key,
          entryId: freshNotification.entryId,
          storeId: freshNotification.storeId,
          conversationId: freshNotification.conversationId || existingNotification.conversationId || "",
          threadKey: freshNotification.threadKey || existingNotification.threadKey || "",
          threadMessageCount: isThreadContinuation
            ? clampNumber((existingNotification.threadMessageCount || 1) + 1, 1, 999, 2)
            : existingNotification.threadMessageCount || 1,
          direction: freshNotification.direction,
          folder: freshNotification.folder,
          subject: freshNotification.subject,
          from: freshNotification.from,
          to: freshNotification.to,
          cc: freshNotification.cc,
          ccOnly: freshNotification.ccOnly,
          automatedInfo: freshNotification.automatedInfo,
          mailDate: freshNotification.mailDate,
          title: freshNotification.title,
          summary: freshNotification.summary,
          importanceReason: freshNotification.importanceReason,
          action: freshNotification.action,
          requiresAction: freshNotification.requiresAction,
          priority: freshNotification.priority,
          tags: [...new Set([...(existingNotification.tags || []), ...(freshNotification.tags || [])])].slice(0, 10),
          memoryPath: relPath,
          status: resolveStatusAfterThreadUpdate(existingNotification.status, classification, {
            allowReactivateArchived: options.reactivateActions === true,
          }),
          updatedAt: nowIso(),
        }
      : freshNotification;
    if (options.dryRun) {
      return { status: "stored", classification, notification, memoryPath: relPath, dryRun: true };
    }

    const digestPath = digestRelativePath(mailDate(fullMail) || nowIso());
    let memoryResult = { changed: false, updates: [], digestPath };
    const baseEvent = emailEventRecord(fullMail, folder, classification, notification, runId, { digestPath });
    if (processEmailMemory) {
      try {
        memoryResult = await processEmailMemory({
          mail: fullMail,
          folder,
          classification,
          notification,
          event: baseEvent,
          digestPath,
          runId,
        });
      } catch (e) {
        log(runId, "email_agent_memory_merge_failed", {
          subject: truncate(fullMail?.subject || "", 160),
          error: String(e?.message || e),
        });
      }
    }
    const shouldProcessKanbanSignal =
      processKanbanSignal &&
      notification.status !== "archived" &&
      ((folder === "inbox" && classification.requiresAction === true) || (folder === "sent" && classification.relevant === true));
    if (shouldProcessKanbanSignal) {
      try {
        const kanbanResult = await processKanbanSignal({
          mail: fullMail,
          folder,
          classification,
          notification,
          runId,
        });
        if (kanbanResult?.task?.id) {
          notification.kanbanTaskId = kanbanResult.task.id;
        }
      } catch (e) {
        log(runId, "email_agent_kanban_ingest_failed", {
          subject: truncate(fullMail?.subject || "", 160),
          error: String(e?.message || e),
        });
      }
    }
    const event = emailEventRecord(fullMail, folder, classification, notification, runId, {
      digestPath: memoryResult?.digestPath || digestPath,
      memoryUpdates: memoryResult?.updates || [],
    });
    appendJsonl(path.join(memoryDir, emailAgentEventRelativePath(event.processedAt)), event);

    if (existingIndex >= 0) {
      state.notifications[existingIndex] = notification;
    } else {
      state.notifications.push(notification);
    }
    state.notifications = consolidateThreadDuplicates(state.notifications).slice(-MAX_NOTIFICATIONS);
    return { status: "stored", classification, notification, memoryPath: relPath, memoryChanged: memoryResult?.changed === true };
  }

  async function repairAutomatedInformationalNotifications(state, runId, { limit = 20 } = {}) {
    const candidates = state.notifications
      .filter(
        (notification) =>
          notification?.folder === "inbox" &&
          notification?.status !== "archived" &&
          notification?.requiresAction === true &&
          notification?.automatedInfo !== true &&
          notification?.entryId,
      )
      .slice(0, limit);
    if (!candidates.length) return 0;

    let repaired = 0;
    for (const notification of candidates) {
      const payload = await readOutlookMailPayload({
        entryId: notification.entryId,
        storeId: notification.storeId,
        includeBody: false,
        bodyMaxChars: 700,
      });
      if (!payload?.ok || !payload.item) continue;
      const detection = detectAutomatedInformationalMail(payload.item);
      if (!detection) continue;
      notification.automatedInfo = true;
      notification.requiresAction = false;
      notification.updatedAt = nowIso();
      repaired += 1;
    }
    if (repaired > 0) {
      log(runId, "email_agent_automated_info_repaired", { repaired });
    }
    return repaired;
  }

  async function repairCcOnlyNotifications(state, runId, { limit = 20 } = {}) {
    const candidates = state.notifications
      .filter(
        (notification) =>
          notification?.folder === "inbox" &&
          notification?.status !== "archived" &&
          notification?.requiresAction === true &&
          notification?.ccOnly !== true &&
          notification?.entryId,
      )
      .slice(0, limit);
    if (!candidates.length) return 0;

    let repaired = 0;
    for (const notification of candidates) {
      const payload = await readOutlookMailPayload({
        entryId: notification.entryId,
        storeId: notification.storeId,
        includeBody: false,
        bodyMaxChars: 0,
      });
      if (!payload?.ok || !payload.item) continue;
      notification.to = payload.item.to || notification.to || "";
      notification.cc = payload.item.cc || notification.cc || "";
      if (!isInboxCcOnly(payload.item, mailboxIdentity)) continue;
      if (
        classificationTargetsMailbox(
          {
            requiresAction: notification.requiresAction,
            action: notification.action,
            summary: notification.summary,
            importanceReason: notification.importanceReason,
          },
          payload.item,
          mailboxIdentity,
        )
      ) {
        continue;
      }
      notification.ccOnly = true;
      notification.requiresAction = false;
      notification.updatedAt = nowIso();
      repaired += 1;
    }
    if (repaired > 0) {
      log(runId, "email_agent_cc_only_repaired", { repaired });
    }
    return repaired;
  }

  async function repairAnsweredNotifications(state, runId, { limit = 25 } = {}) {
    const candidates = state.notifications
      .filter(
        (notification) =>
          notification?.folder === "inbox" &&
          notification?.status !== "archived" &&
          notification?.status !== "action_completed" &&
          notification?.requiresAction === true &&
          notification?.entryId &&
          !(notification.tags || []).includes("al-beantwoord"),
      )
      .sort(
        (a, b) =>
          new Date(b.mailDate || b.updatedAt || 0).getTime() - new Date(a.mailDate || a.updatedAt || 0).getTime(),
      )
      .slice(0, limit);
    if (!candidates.length) return 0;

    let repaired = 0;
    for (const notification of candidates) {
      const payload = await readOutlookMailPayload({
        entryId: notification.entryId,
        storeId: notification.storeId,
        includeBody: false,
        bodyMaxChars: 0,
      });
      const mail = payload?.ok && payload.item ? payload.item : notification;
      const sentReply = await findExistingSentReply(mail, runId, log);
      if (!sentReply) continue;
      notification.requiresAction = false;
      notification.tags = [...new Set([...(notification.tags || []), "al-beantwoord"])];
      notification.action = "Geen extra melding nodig: er is al een antwoord gevonden in Verzonden.";
      notification.updatedAt = nowIso();
      repaired += 1;
    }
    if (repaired > 0) {
      log(runId, "email_agent_answered_repaired", { repaired });
    }
    return repaired;
  }

  async function runScan(input = {}) {
    if (scanPromise) return scanPromise;
    const runId = input.runId || randomUUID();
    scanPromise = (async () => {
      const state = loadState();
      const config = normalizeConfig({ ...state.config, ...(input.configOverride || {}) });
      const startedAt = nowIso();
      const dryRun = input.dryRun === true;
      const forceReprocess = input.forceReprocess === true;
      const reactivateActions = input.reactivateActions === true;
      const useIntervalWindow = input.useIntervalWindow === true;
      if (!dryRun) {
        state.lastAttemptAt = startedAt;
        state.lastRunId = runId;
        state.lastError = "";
        saveState(state);
      }

      const defaultTo = new Date();
      const defaultFrom = useIntervalWindow ? intervalWindowStart(defaultTo, config.intervalMinutes) : startOfLocalToday();
      const from = input.fromDate ? validDateOrFallback(input.fromDate, defaultFrom) : defaultFrom;
      const to = input.toDate ? validDateOrFallback(input.toDate, defaultTo) : defaultTo;
      const stats = { candidates: 0, stored: 0, ignored: 0, skipped: 0, errors: 0 };
      const stored = [];
      const errors = [];

      try {
        for (const folder of config.folders) {
          const payload = await searchOutlookMailPayload({
            folder,
            fromDate: from.toISOString(),
            toDate: to.toISOString(),
            limit: config.maxPerFolder,
            includeBody: false,
            bodyMaxChars: 700,
          });
          if (!payload?.ok) {
            errors.push({ folder, error: payload?.error || "Outlook search failed" });
            stats.errors += 1;
            continue;
          }
          const mails = Array.isArray(payload.results) ? payload.results : Array.isArray(payload.mails) ? payload.mails : [];
          for (const mail of mails) {
            stats.candidates += 1;
            try {
              const result = await processMail(mail, folder, state, runId, { dryRun, forceReprocess, reactivateActions });
              if (result.status === "stored") {
                stats.stored += 1;
                stored.push({ ...result.notification, memoryChanged: result.memoryChanged === true });
              } else if (result.status === "ignored") {
                stats.ignored += 1;
              } else {
                stats.skipped += 1;
              }
            } catch (e) {
              stats.errors += 1;
              errors.push({ folder, subject: mail?.subject || "", error: String(e?.message || e) });
            }
          }
        }
        if (!dryRun) {
          await repairCcOnlyNotifications(state, runId);
          await repairAutomatedInformationalNotifications(state, runId);
          await repairAnsweredNotifications(state, runId);
          normalizeDismissedNotifications(state.notifications);
          state.lastSuccessfulScanAt = nowIso();
          state.consecutiveFailures = errors.length ? state.consecutiveFailures + 1 : 0;
          state.lastError = errors.length ? errors.map((e) => e.error).join("; ").slice(0, 1000) : "";
          state.notifications = consolidateThreadDuplicates(state.notifications).slice(-MAX_NOTIFICATIONS);
          saveState(state);
          if (stored.some((item) => item?.memoryChanged) && onMemoryChanged) await onMemoryChanged("email_agent_scan");
        }
        log(runId, "email_agent_scan_done", {
          fromDate: from.toISOString(),
          toDate: to.toISOString(),
          forceReprocess,
          reactivateActions,
          useIntervalWindow,
          stats,
          errors: errors.length,
        });
        return {
          ok: errors.length === 0,
          runId,
          dryRun,
          forceReprocess,
          reactivateActions,
          useIntervalWindow,
          startedAt,
          finishedAt: nowIso(),
          fromDate: from.toISOString(),
          toDate: to.toISOString(),
          stats,
          stored,
          errors,
        };
      } catch (e) {
        const errorMessage = String(e?.message || e);
        if (!dryRun) {
          state.lastError = errorMessage;
          state.consecutiveFailures += 1;
          saveState(state);
        }
        log(runId, "email_agent_scan_error", { error: errorMessage });
        return { ok: false, runId, dryRun, startedAt, finishedAt: nowIso(), stats, stored, errors: [{ error: errorMessage }] };
      }
    })();
    try {
      return await scanPromise;
    } finally {
      scanPromise = null;
      scheduleNext();
    }
  }

  function scheduleNext() {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    nextRunAt = "";
    const config = getConfig();
    if (!config.enabled) return;
    const delayMs = config.intervalMinutes * 60 * 1000;
    nextRunAt = new Date(Date.now() + delayMs).toISOString();
    timer = setTimeout(() => void runScan({ useIntervalWindow: true }).catch(() => {}), delayMs);
    timer.unref?.();
  }

  function startScheduler() {
    scheduleNext();
  }

  return {
    getConfig,
    updateConfig,
    getStatus,
    listNotifications,
    updateNotification,
    getNotification,
    runScan,
    startScheduler,
  };
}

export {
  applyAutomatedInformationalPolicy,
  applyCcOnlyPolicy,
  classificationTargetsMailbox,
  consolidateThreadDuplicates,
  dedupeNotifications,
  detectAutomatedInformationalMail,
  isInboxCcOnly,
  mailThreadKey,
  normalizeSubjectForThread,
  normalizeDismissedNotifications,
  notificationThreadKey,
  notificationVisibleInActionList,
  notificationsMatchThread,
  resolveMailboxIdentity,
  resolveStatusAfterThreadUpdate,
};
