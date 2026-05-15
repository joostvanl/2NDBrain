declare module "turndown-plugin-gfm" {
  import type TurndownService from "turndown";

  export function gfm(turndown: TurndownService): void;
  export function highlightedCodeBlock(turndown: TurndownService): void;
  export function strikethrough(turndown: TurndownService): void;
  export function taskListItems(turndown: TurndownService): void;
}
