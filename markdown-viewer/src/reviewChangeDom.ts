/** CSS-klassen voor agent diff (main.ts buildChangeMarkedHtml / stripChangeMarkers). */
export const MV_CHANGE_OLD_CLASS = "mv-change-old";
export const MV_CHANGE_NEW_CLASS = "mv-change-new";

/**
 * Zet diff-markering van een fenced `pre` over op een wrapper (Chart.js / Mermaid) vóór `pre.replaceWith(wrap)`.
 * Anders verliezen wrappers `mv-change-old` / `mv-change-new` en blijven oude én nieuwe diagrammen in de DOM.
 */
export function inheritAgentDiffMarkersFromFencePre(pre: HTMLElement, wrapper: HTMLElement): void {
  for (const c of pre.classList) {
    wrapper.classList.add(c);
  }
  if (pre.dataset.changeKind) {
    wrapper.dataset.changeKind = pre.dataset.changeKind;
  }
  const aria = pre.getAttribute("aria-label");
  if (aria) wrapper.setAttribute("aria-label", aria);
  if (pre.classList.contains(MV_CHANGE_OLD_CLASS)) {
    wrapper.contentEditable = "false";
  }
}
