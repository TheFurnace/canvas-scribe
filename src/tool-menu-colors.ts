import { paletteColors } from "./colors";
import type { InkTool } from "./types";
import { createAction, createSwatch } from "./ui-controls";

/** Immediate quick choices; the full picker keeps its separate Done/Cancel transaction. */
export function createToolMenuColors(document: Document, options: {
  tool: InkTool; color: string; isDefault?: boolean; onDefault?: () => void; onColor: (color: string) => void; onColors?: () => void;
}): HTMLElement {
  const root = document.createElement("div"); root.className = "canvas-scribe-menu-colors";
  root.setAttribute("role", "group"); root.setAttribute("aria-label", "Quick ink colors");
  const colors = [...new Set([options.color, ...paletteColors(options.tool, options.color)])].slice(0, options.onColors ? options.onDefault ? 4 : 5 : 6);
  const buttons = colors.map(color => createSwatch(document, { color, label: color.startsWith("var(") ? "Use theme ink color" : `Use ${color}`,
    selected: !options.isDefault && color === options.color, onSelect: () => {
      root.querySelector('[data-default-choice]')?.setAttribute("aria-pressed", "false");
      buttons.forEach((button, index) => button.setAttribute("aria-pressed", String(colors[index] === color)));
      options.onColor(color);
    },
  }));
  if (options.onDefault) {
    const choice = createAction(document, "Default", options.onDefault);
    choice.dataset.defaultChoice = "true";
    choice.setAttribute("aria-pressed", String(options.isDefault === true)); choice.title = "Use theme-adaptive default ink";
    root.append(choice);
  }
  root.append(...buttons);
  if (options.onColors) { const more = createAction(document, "+", options.onColors); more.setAttribute("aria-label", "More colors…"); root.append(more); }
  return root;
}
