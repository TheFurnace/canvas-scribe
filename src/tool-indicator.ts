import { PEN_PROFILES, type PenType } from "./pen-types";
import type { InkTool } from "./types";

export const PEN_ICONS: Record<PenType, string> = {
  ballpoint: "pen", fountain: "pen-tool", brush: "brush", pencil: "pencil",
};

export function toolDescription(tool: InkTool, type: PenType, color: string, size?: number, opacity?: number): string {
  return [tool === "pen" ? `${PEN_PROFILES[type].label} pen` : "Highlighter",
    color.startsWith("var(") ? "Default color" : color,
    ...(size === undefined ? [] : [`${size}px`]),
    ...(opacity === undefined ? [] : [`${Math.round(opacity * 100)}% opacity`]),
  ].join(" · ");
}

export function createToolColor(document: Document, color?: string): HTMLElement {
  const swatch = document.createElement("span");
  swatch.className = "canvas-scribe-tool-color";
  swatch.setAttribute("aria-hidden", "true");
  if (color) swatch.style.setProperty("--canvas-scribe-tool-color", color);
  return swatch;
}
