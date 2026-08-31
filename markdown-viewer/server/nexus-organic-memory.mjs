/**
 * Organische long-term memory: wanneer Nexus stilletjes context vastlegt zonder de chat te blokkeren.
 */

export function looksLikeOrganicMemoryContext(message, context = {}) {
  const text = String(message || "").toLowerCase();
  const reply = String(context.reply || "").toLowerCase();
  const documentPath = String(context.documentPath || "").replace(/\\/g, "/").toLowerCase();
  const combined = `${text}\n${reply}`;
  if (!text.trim() && !reply.trim()) return false;

  const projectSignal =
    /\b(project|klant|dossier|sla|managed services|overeenkomst|contract|rca|governance|offerte|rfp|triage|beheerovereenkomst)\b/.test(
      combined,
    ) || /\/(02-projecten|01-managed-services|onderwerpen)\//.test(documentPath);
  const personSignal =
    /\b(collega|contactpersoon|accountmanager|projectleider|stakeholder|gesprekspartner|manager|lead)\b/.test(
      combined,
    ) || /\b(personen_iO|personen\/|personen_klanten\/)\b/.test(combined);
  const decisionSignal =
    /\b(afspraak|besluit|besloten|afgesproken|deadline|risico|scope|milestone|statusupdate|voortgang)\b/.test(
      combined,
    );
  const explicitMemory =
    /\b(in je geheugen|long[-\s]?term|\.memory|onthoud dit|voor later|naslag|geheugen bijwerken)\b/.test(combined);

  const tooShort = text.trim().length < 36 && !explicitMemory && reply.trim().length < 80;
  const ephemeralOnly =
    /\b(vandaag|straks|nu even|zo meteen)\b/.test(text) &&
    !decisionSignal &&
    !explicitMemory &&
    !projectSignal;

  return (projectSignal || personSignal || decisionSignal || explicitMemory) && !tooShort && !ephemeralOnly;
}

export function organicMemoryBootstrapHint() {
  return (
    "## Organische memory-hint\n\n" +
    "Als dit gesprek duurzame project-, klant-, persoons- of werkwijze-informatie bevat die later nuttig is, " +
    "werk dan passende bestanden onder Files/.memory/ bij (projectdossier, personenprofiel, onderwerpen/, voorkeuren/). " +
    "Lees bestaande memory eerst; maak alleen nieuwe documenten aan als er nog geen passend dossier is. " +
    "Geen housekeeping-melding in de reply."
  );
}

/**
 * @param {{
 *   message?: string;
 *   reply?: string;
 *   mode?: string;
 *   weekPlan2ndbrain?: boolean;
 *   executedMemoryCount?: number;
 *   durableSignal?: boolean;
 *   organicSignal?: boolean;
 *   documentPath?: string;
 * }} opts
 */
export function shouldRunOrganicMemoryReflection(opts = {}) {
  if (opts.weekPlan2ndbrain) return false;
  if ((opts.executedMemoryCount || 0) > 0) return false;
  if (opts.durableSignal || opts.organicSignal) return true;
  const doc = String(opts.documentPath || "").replace(/\\/g, "/");
  if (opts.mode === "agent" && /\/(02-projecten|01-managed-services)\//.test(doc)) return true;
  const message = String(opts.message || "").trim();
  const reply = String(opts.reply || "").trim();
  const substantive = message.length >= 100 && reply.length >= 160;
  return substantive && looksLikeOrganicMemoryContext(message, { reply, documentPath: doc });
}

export function createOrganicMemoryScheduler({ runReflection, log = () => {} }) {
  const minIntervalMs = Math.max(30_000, Number(process.env.ORGANIC_MEMORY_MIN_INTERVAL_MS || 120_000) || 120_000);
  const lastByChat = new Map();
  let chain = Promise.resolve();

  function schedule(payload) {
    const chatKey = String(payload.chatId || "global");
    const now = Date.now();
    const last = lastByChat.get(chatKey) || 0;
    if (now - last < minIntervalMs) {
      return { scheduled: false, reason: "rate_limited" };
    }
    lastByChat.set(chatKey, now);
    chain = chain
      .then(() => new Promise((resolve) => setImmediate(resolve)))
      .then(() => runReflection(payload))
      .then((result) => {
        log("organic_memory_reflection_done", {
          chatId: chatKey,
          executed: result?.executedMemoryActions?.length || 0,
          targetPath: result?.targetPath || "",
        });
        return result;
      })
      .catch((e) => {
        log("organic_memory_reflection_error", { chatId: chatKey, error: String(e?.message || e) });
        return null;
      });
    return { scheduled: true };
  }

  return { schedule };
}

export function startOrganicStaleChatScheduler({ readChats, promoteStaleChat, log = () => {} }) {
  if (process.env.ORGANIC_MEMORY_STALE_PROMOTE === "0") return () => {};
  const hours = Math.max(1, Number(process.env.ORGANIC_STALE_CHAT_PROMOTE_HOURS || 6) || 6);
  const intervalMs = hours * 60 * 60 * 1000;
  let busy = false;

  const tick = async () => {
    if (busy) return;
    busy = true;
    try {
      const payload = readChats();
      const stale = (payload.sessions || []).filter((s) => s.lifecycleStatus === "stale");
      if (!stale.length) return;
      const session = stale[0];
      const result = await promoteStaleChat(session.id);
      log("organic_stale_chat_promoted", {
        chatId: session.id,
        title: session.title,
        ok: result?.ok === true,
      });
    } catch (e) {
      log("organic_stale_chat_promote_error", { error: String(e?.message || e) });
    } finally {
      busy = false;
    }
  };

  const timer = setInterval(() => void tick(), intervalMs);
  if (typeof timer.unref === "function") timer.unref();
  setTimeout(() => void tick(), Math.min(15 * 60 * 1000, intervalMs));
  return () => clearInterval(timer);
}
