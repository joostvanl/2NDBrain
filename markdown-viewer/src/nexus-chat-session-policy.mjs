/**
 * When the Nexus chat session may absorb review-sidecar turns from a document.
 * Document open/load must never replace or merge into the active session.
 */

/** @typedef {"document-load" | "agent-run"} DocumentChatMergeReason */

/**
 * @param {DocumentChatMergeReason} reason
 * @returns {boolean}
 */
export function shouldMergeDocumentChatIntoSession(reason) {
  return reason === "agent-run";
}
