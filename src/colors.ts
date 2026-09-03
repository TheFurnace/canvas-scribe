import type { InkTool } from "./types";

export type ColorTool = InkTool;

export const PINNED_TOOL_COLORS: Readonly<Record<ColorTool, readonly string[]>> = {
  pen: ["#1f2937", "#2563eb", "#dc2626", "#16a34a", "#9333ea"],
  highlighter: ["#fde047", "#fb7185", "#22d3ee", "#4ade80", "#fb923c"],
};

export function paletteColors(tool: ColorTool, currentColor: string): string[] {
  const pinned = PINNED_TOOL_COLORS[tool];
  return pinned.some((color) => color.toLowerCase() === currentColor.toLowerCase())
    ? [...pinned]
    : [currentColor, ...pinned];
}
