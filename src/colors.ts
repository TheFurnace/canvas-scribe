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

export function parseHex(value: string): string | null {
  const hex = value.trim().replace(/^#/, "");
  if (/^[\da-f]{3}$/i.test(hex)) return `#${[...hex].map((c) => c + c).join("").toLowerCase()}`;
  return /^[\da-f]{6}$/i.test(hex) ? `#${hex.toLowerCase()}` : null;
}

export function rgbToHex(channels: readonly number[]): string | null {
  if (channels.length !== 3 || channels.some((c) => !Number.isInteger(c) || c < 0 || c > 255)) return null;
  return `#${channels.map((c) => c.toString(16).padStart(2, "0")).join("")}`;
}

export function hexToRgb(hex: string): number[] {
  const normalized = parseHex(hex);
  if (!normalized) throw new Error("Invalid color");
  return [1, 3, 5].map((offset) => parseInt(normalized.slice(offset, offset + 2), 16));
}

export function hsvToHex(h: number, s: number, v: number): string {
  const channel = (n: number) => {
    const k = (n + h / 60) % 6;
    return Math.round(255 * (v - v * s * Math.max(0, Math.min(k, 4 - k, 1))));
  };
  return rgbToHex([channel(5), channel(3), channel(1)])!;
}

export function hexToHsv(hex: string): [number, number, number] {
  const [r, g, b] = hexToRgb(hex).map((c) => c / 255);
  const max = Math.max(r, g, b), min = Math.min(r, g, b), delta = max - min;
  const hue = delta === 0 ? 0 : max === r ? ((g - b) / delta + 6) % 6 : max === g ? (b - r) / delta + 2 : (r - g) / delta + 4;
  return [hue * 60, max === 0 ? 0 : delta / max, max];
}

/** Resolve theme CSS colors through the owning document, including rgb() and named colors. */
export function resolveColor(document: Document, color: string): string {
  const hex = parseHex(color);
  if (hex) return hex;
  const context = document.createElement("canvas").getContext("2d");
  if (context) {
    context.fillStyle = color;
    context.fillRect(0, 0, 1, 1);
    return rgbToHex(Array.from(context.getImageData(0, 0, 1, 1).data).slice(0, 3))!;
  }
  return "#1f2937";
}

export class ToolColors {
  private selected: Partial<Record<ColorTool, string>> = {};
  private history: Record<ColorTool, string[]> = { pen: [], highlighter: [] };

  selection(tool: ColorTool): string | null { return this.selected[tool] ?? null; }
  current(tool: ColorTool, defaultColor: string): string { return this.selected[tool] ?? defaultColor; }
  recent(tool: ColorTool): readonly string[] { return [...this.history[tool]]; }
  confirm(tool: ColorTool, color: string | null, remember = true): void {
    if (color === null) { delete this.selected[tool]; return; }
    const normalized = parseHex(color);
    if (!normalized) return;
    this.selected[tool] = normalized;
    if (remember) this.history[tool] = [normalized, ...this.history[tool].filter((c) => c !== normalized)].slice(0, 6);
  }
}

export const CURATED_SWATCHES = [
  ...[1, 0.86, 0.72].flatMap((value) => [0, 30, 60, 120, 180, 220, 270, 320].map((hue) => hsvToHex(hue, 0.7, value))),
  ...[255, 219, 183, 146, 110, 73, 37, 0].map((c) => rgbToHex([c, c, c])!),
];
