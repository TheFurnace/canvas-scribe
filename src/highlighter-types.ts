export const HIGHLIGHTER_TYPES = ["round", "chisel"] as const;
export type HighlighterType = typeof HIGHLIGHTER_TYPES[number];
export function isHighlighterType(value: unknown): value is HighlighterType {
  return value === "round" || value === "chisel";
}
export function clampHighlighterSize(value: number): number {
  return Number.isFinite(value) ? Math.max(2, Math.min(60, value)) : 17;
}
