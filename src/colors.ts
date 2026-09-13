import type { InkTool } from "./types";

export type ColorTool = InkTool;

export const defaultColorLabel = (tool: ColorTool): string => tool === "pen" ? "Theme" : "Default";
export const defaultColorDescription = (tool: ColorTool): string => tool === "pen" ? "Follow the theme ink color" : "Follow the highlighter default";

export function paletteColors(tool: ColorTool, currentColor: string): string[] {
  const pinned = toolSwatches(tool).slice(0, 5);
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
  constructor(value?: unknown, private readonly changed: () => void = () => undefined) { this.restore(value); }
  restore(value: unknown): void {
    if (!value || typeof value !== "object") return;
    const x = value as { selected?: Partial<Record<ColorTool, unknown>>; history?: Partial<Record<ColorTool, unknown>> };
    for (const tool of ["pen", "highlighter"] as const) {
      const selected = x.selected?.[tool];
      if (typeof selected === "string" && parseHex(selected)) this.selected[tool] = parseHex(selected)!;
      const recent = x.history?.[tool];
      if (Array.isArray(recent)) this.history[tool] = [...new Set(recent.flatMap(c => typeof c === "string" && parseHex(c) ? [parseHex(c)!] : []))].slice(0, 6);
    }
  }
  serialize() { return { selected: { ...this.selected }, history: { pen: [...this.history.pen], highlighter: [...this.history.highlighter] } }; }

  selection(tool: ColorTool): string | null { return this.selected[tool] ?? null; }
  current(tool: ColorTool, defaultColor: string): string { return this.selected[tool] ?? defaultColor; }
  recent(tool: ColorTool): readonly string[] { return [...this.history[tool]]; }
  confirm(tool: ColorTool, color: string | null, remember = true): void {
    if (color === null) { delete this.selected[tool]; this.changed(); return; }
    const normalized = parseHex(color);
    if (!normalized) return;
    this.selected[tool] = normalized;
    if (remember) this.history[tool] = [normalized, ...this.history[tool].filter((c) => c !== normalized)].slice(0, 6);
    this.changed();
  }
}

/** Approved per-tool collections; menus may present subsets of this shared source. */
export const TOOL_SWATCHES: Readonly<Record<ColorTool, readonly string[]>> = {
  pen: [
    "#dc2626", "#ea580c", "#ca8a04", "#16a34a", "#0d9488", "#2563eb", "#9333ea", "#db2777",
    "#f87171", "#fb923c", "#facc15", "#4ade80", "#2dd4bf", "#60a5fa", "#c084fc", "#f472b6",
    "#000000", "#374151", "#6b7280", "#d1d5db", "#ffffff", "#78350f", "#a16207", "#a8a29e",
  ],
  highlighter: [
    "#fde047", "#fb923c", "#fb7185", "#e879f9", "#a78bfa", "#38bdf8", "#22d3ee", "#4ade80",
    "#fef08a", "#fed7aa", "#fecdd3", "#f5d0fe", "#ddd6fe", "#bae6fd", "#a5f3fc", "#bbf7d0",
  ],
};

export function toolSwatches(tool: ColorTool): readonly string[] { return TOOL_SWATCHES[tool]; }

export function recentColors(selected: string | null, history: readonly string[], limit = 3): string[] {
  return [...new Set([...(selected ? [selected] : []), ...history].flatMap(color => parseHex(color) ?? []))].slice(0, limit);
}

/** Color distance is only for navigation; it never changes selection or merges colors. */
export function nearestSwatch(colors: readonly string[], selected: string | null): number {
  if (!selected || !colors.length) return 0;
  const rgb = hexToRgb(selected);
  let best = 0, distance = Infinity;
  colors.forEach((color, index) => {
    const next = hexToRgb(color).reduce((sum, value, channel) => sum + (value - rgb[channel]!) ** 2, 0);
    if (next < distance) { best = index; distance = next; }
  });
  return best;
}
