import type { IconRenderer } from "./canvas-controls";

import { TOOL_ARTWORK, toolIconId, type ToolIcon, type ToolIconStyle } from "./tool-icons";

/** Shared artwork/state specimen, also available to future shared controls (FER-51). */
export function createToolIconButton(document: Document, renderIcon: IconRenderer, options: {
  tool: ToolIcon; style?: ToolIconStyle; color?: string; selected?: boolean;
  disabled?: boolean; onSelect?: () => void;
}): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "canvas-scribe-icon-button";
  button.dataset.artwork = options.style ?? "silhouette";
  const inkLabel = options.color?.startsWith("var(") ? "Default color" : options.color;
  button.setAttribute("aria-label", `${TOOL_ARTWORK[options.tool].label}${inkLabel && TOOL_ARTWORK[options.tool].color ? ` · ${inkLabel}` : ""}`);
  button.setAttribute("aria-pressed", String(options.selected ?? false));
  button.disabled = options.disabled ?? false;
  const artwork = document.createElement("span");
  artwork.className = "canvas-scribe-tool-icon";
  artwork.setAttribute("aria-hidden", "true");
  renderIcon(artwork, toolIconId(options.tool, options.style));
  button.append(artwork);
  if (options.color && TOOL_ARTWORK[options.tool].color) button.style.setProperty("--canvas-scribe-tool-color", options.color);
  button.addEventListener("click", () => options.onSelect?.());
  return button;
}
