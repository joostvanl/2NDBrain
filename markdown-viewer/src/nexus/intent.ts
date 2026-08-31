import type { AgentChatMode } from "../api";

export type NexusAppContext = {
  activeView: "documents" | "email" | "kanban" | string;
  hasDocument: boolean;
};

const DOCUMENT_TARGET =
  /\b(dit|deze|huidige|geopende)?\s*(document|bestand|markdown|tekst|sectie|paragraaf|alinea|hoofdstuk|pagina|passage|selectie)\b/;
const REVIEW_WORD = /\b(reviewvoorstel|wijzigingsvoorstel|redactievoorstel|aanpassing(?:en)?|wijziging(?:en)?)\b/;
const DIRECT_EDIT_VERB = /\b(pas|wijzig|verander|herschrijf|corrigeer|redigeer|vervang|vul|vullen|aanvul|aanvullen|werk\s+uit|uitwerken)\b/;
const INSERT_EDIT_VERB = /\b(voeg|plaats|zet|neem|verwerk|vul|vullen|aanvul|aanvullen)\b/;
const DOCUMENT_INSERT_PATTERN =
  /\b(voeg|plaats|zet|neem|verwerk|vul|vullen|aanvul|aanvullen)\b[\s\S]{0,160}\b(toe|in|op|aan|met)\b[\s\S]{0,120}\b(document|bestand|markdown|tekst|sectie|paragraaf|alinea|hoofdstuk|pagina|passage|selectie)\b/;
const DOCUMENT_WRITE_PATTERN =
  /\b(schrijf|maak)\b[\s\S]{0,160}\b(in|voor)\b[\s\S]{0,120}\b(document|bestand|markdown|tekst|sectie|paragraaf|alinea|hoofdstuk|pagina)\b/;
const DOCUMENT_FILL_PATTERN =
  /\b(vul|vullen|aanvul|aanvullen|werk\s+uit|uitwerken)\b[\s\S]{0,160}\b(document|bestand|markdown|tekst|pagina)\b|\b(document|bestand|markdown|tekst|pagina)\b[\s\S]{0,120}\b(vullen|aanvullen|uitwerken|vul\s+aan)\b/;

const OUTLOOK_CALENDAR_FILL =
  /\b(2ndbrain|outlook)\b[\s\S]{0,80}\b(agenda|kalender|calendar)\b|\b(agenda|kalender)\b[\s\S]{0,80}\b(2ndbrain|outlook)\b/;

export function inferOutlookCalendarFillIntent(message: string): boolean {
  const text = message.toLowerCase();
  if (!OUTLOOK_CALENDAR_FILL.test(text)) return false;
  return /\b(vul|vullen|aanvul|aanvullen|plan|planning|plannen|afspraak|afspraken|focusblok|blok)\b/.test(text);
}

export function inferDocumentChangeIntent(message: string): boolean {
  const text = message.toLowerCase();
  if (inferOutlookCalendarFillIntent(message)) return false;
  if (REVIEW_WORD.test(text)) return true;
  if (DOCUMENT_INSERT_PATTERN.test(text) || DOCUMENT_WRITE_PATTERN.test(text) || DOCUMENT_FILL_PATTERN.test(text)) return true;
  if (DIRECT_EDIT_VERB.test(text) && DOCUMENT_TARGET.test(text)) return true;

  // Korte opdrachten zoals "pas dit aan" of "herschrijf deze passage" zijn alleen
  // documentwijzigingen wanneer ze naar de actieve tekstcontext verwijzen.
  if (/\b(pas|wijzig|verander|herschrijf|corrigeer|redigeer|vervang|vul|aanvul|werk\s+uit)\b[\s\S]{0,80}\b(dit|deze|hierboven|selectie|passage|document|bestand)\b/.test(text)) {
    return true;
  }
  if (INSERT_EDIT_VERB.test(text) && /\b(toe aan dit document|in dit document|in de tekst|aan de tekst|met informatie|aan met informatie)\b/.test(text)) {
    return true;
  }
  if (/\b(bijwerk|bijwerken|update|actualiseer|actualiseren)\b[\s\S]{0,80}\b(document|bestand|markdown|pagina|tekst)\b/.test(text)) {
    return true;
  }
  if (/\b(document|bestand|markdown|pagina|tekst)\b[\s\S]{0,80}\b(bijwerk|bijwerken|update|actualiseer|actualiseren)\b/.test(text)) {
    return true;
  }
  if (/\b(werk|verwerk|zet|schrijf)\b[\s\S]{0,60}\b(uit|in|op)\b[\s\S]{0,80}\b(document|bestand|markdown|pagina|tekst)\b/.test(text)) {
    return true;
  }
  return false;
}

/** Zachte signalen: waarschijnlijk documentopdracht, maar niet hard genoeg voor automatische agent-modus. */
export function inferLikelyDocumentEditIntent(message: string): boolean {
  const text = message.toLowerCase().trim();
  if (!text || inferOutlookCalendarFillIntent(message)) return false;
  if (inferDocumentChangeIntent(message)) return true;
  if (/\b(document|bestand|markdown|pagina|tekst)\b/.test(text) && /\b(aanvul|aanvullen|uitbreid|uitbreiden|compleet|afmaken|verbeter|opschon|opschonen|structuur|formuleer|formuleren|samenvat|samenvatten)\b/.test(text)) {
    return true;
  }
  if (/\b(kun|kan)\s+je\b[\s\S]{0,120}\b(document|bestand|markdown|pagina|tekst)\b/.test(text)) return true;
  if (/\b(maak|schrijf|zet|verwerk)\b[\s\S]{0,100}\b(verslag|notitie|samenvatting|overzicht)\b[\s\S]{0,80}\b(in|naar|op)\b/.test(text)) return true;
  return false;
}

const ASSISTANT_DOCUMENT_EDIT_CLAIM =
  /\b(in het document|in dit document|in het bestand|reviewvoorstel|wijzigingsvoorstel|documentvoorstel|document staat klaar|staat (nu )?in het document|heb ik (het )?document|toegepast:?\s*\d+ patch|changes-?array|find\/replace)\b/i;

/** Nexus-antwoord suggereert dat er een documentwijziging bedoeld was. */
export function assistantSuggestsDocumentEdit(reply: string): boolean {
  const text = String(reply || "").trim();
  if (!text) return false;
  if (ASSISTANT_DOCUMENT_EDIT_CLAIM.test(text)) return true;
  if (/^#{1,3}\s+\S/m.test(text) && text.length >= 120) return true;
  if (text.includes('"changes"') && text.includes('"replace"')) return true;
  return false;
}

export type DocumentEditOfferOptions = {
  executeOnActive?: boolean;
};

/** Bied Wijzig document aan wanneer de opdracht het document raakt maar de knop uit staat. */
export function shouldOfferDocumentEditMode(
  message: string,
  context: NexusAppContext,
  assistantReply = "",
  options: DocumentEditOfferOptions = {},
): boolean {
  if (context.activeView !== "documents" || !context.hasDocument) return false;
  if (options.executeOnActive === true) return false;
  return (
    inferDocumentChangeIntent(message) ||
    inferLikelyDocumentEditIntent(message) ||
    assistantSuggestsDocumentEdit(assistantReply)
  );
}

export function inferNexusChatMode(message: string, context: NexusAppContext): AgentChatMode {
  if (context.activeView === "documents" && context.hasDocument) {
    return "ask";
  }
  return inferDocumentChangeIntent(message) ? "agent" : "ask";
}
