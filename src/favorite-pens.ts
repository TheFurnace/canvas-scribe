import { parseHex } from "./colors";
import { isPenType, type PenType } from "./pen-types";
import type { InkTool } from "./types";

export interface FavoritePen {
  id: string;
  name: string;
  tool: InkTool;
  penType: PenType;
  color: string | null;
  size: number;
  opacity: number;
}
export type PenPreset = Omit<FavoritePen, "id" | "name">;

export function readFavorites(value: unknown): FavoritePen[] {
  if (!Array.isArray(value)) return [];
  const ids = new Set<string>();
  return value.filter((item): item is FavoritePen => {
    if (!item || typeof item !== "object") return false;
    const valid = typeof item.id === "string" && item.id.length > 0 && !ids.has(item.id)
      && typeof item.name === "string" && item.name.trim().length > 0
      && (item.tool === "pen" || item.tool === "highlighter") && isPenType(item.penType)
      && (item.color === null || (typeof item.color === "string" && parseHex(item.color) !== null))
      && Number.isFinite(item.size) && item.size >= 1 && item.size <= (item.tool === "pen" ? 20 : 40)
      && Number.isFinite(item.opacity) && item.opacity > 0 && item.opacity <= 1;
    if (valid) ids.add(item.id);
    return valid;
  }).map((item) => ({ ...item, color: item.color === null ? null : parseHex(item.color) }));
}

/** Shared by all Canvas layers; persistence is supplied by the plugin. */
export class FavoritePens {
  private items: FavoritePen[];
  constructor(value: unknown = [], private readonly persist: (items: FavoritePen[]) => void = () => undefined) {
    this.items = readFavorites(value);
  }
  list(): FavoritePen[] { return this.items.map((item) => ({ ...item })); }
  add(preset: PenPreset): void {
    this.commit([...this.items, { ...preset, id: `favorite-${Date.now()}-${Math.random().toString(36).slice(2)}`, name: `${preset.tool === "pen" ? "Pen" : "Highlighter"} ${this.items.length + 1}` }]);
  }
  update(item: FavoritePen): void { this.commit(this.items.map((old) => old.id === item.id ? item : old)); }
  remove(id: string): void { this.commit(this.items.filter((item) => item.id !== id)); }
  move(id: string, offset: number): void {
    const items = this.list(), index = items.findIndex((item) => item.id === id), next = index + offset;
    if (index < 0 || next < 0 || next >= items.length) return;
    [items[index], items[next]] = [items[next]!, items[index]!];
    this.commit(items);
  }
  private commit(items: FavoritePen[]): void { this.items = readFavorites(items); this.persist(this.list()); }
}
