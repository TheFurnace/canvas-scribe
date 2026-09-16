import RBush from "rbush";
import { strokeCandidateBounds } from "../../src/ink-operations";
import type { InkStroke } from "../../src/types";

export interface Box { minX: number; minY: number; maxX: number; maxY: number; }
export interface Item { stroke: InkStroke; order: number; }
interface Entry extends Box { item: Item; }
export interface CandidateIndex {
  load(items: readonly Item[]): void;
  update(next: readonly Item[], removed: readonly Item[], added: readonly Item[]): void;
  search(box: Box, highlighterOnly?: boolean): Item[];
  stats(): Record<string, number>;
}
export const algorithms = ["scan", "rbush", "grid-64", "grid-256", "grid-1024"] as const;
export type Algorithm = typeof algorithms[number];
export function overlaps(a: Box, b: Box): boolean {
  return a.maxX >= b.minX && a.minX <= b.maxX && a.maxY >= b.minY && a.minY <= b.maxY;
}
function entry(item: Item): Entry | null { const bounds = strokeCandidateBounds(item.stroke); return bounds ? { ...bounds, item } : null; }
function ordered(entries: Iterable<Entry>, box: Box, highlighterOnly: boolean): Item[] {
  const result: Item[] = [];
  for (const e of entries) if ((!highlighterOnly || e.item.stroke.tool === "highlighter") && overlaps(e, box)) result.push(e.item);
  return result.sort((a, b) => a.order - b.order);
}
class Scan implements CandidateIndex {
  private items: readonly Item[] = [];
  load(items: readonly Item[]): void { this.items = items; }
  update(next: readonly Item[]): void { this.items = next; }
  search(box: Box, highlighterOnly = false): Item[] {
    const result: Item[] = [];
    for (const item of this.items) {
      if (highlighterOnly && item.stroke.tool !== "highlighter") continue;
      const bounds = strokeCandidateBounds(item.stroke);
      if (bounds && overlaps(bounds, box)) result.push(item);
    }
    return result;
  }
  stats() { return { strokes: this.items.length }; }
}
class Tree implements CandidateIndex {
  private tree = new RBush<Entry>();
  private entries = new Map<InkStroke, Entry>();
  load(items: readonly Item[]): void {
    this.tree.clear(); this.entries.clear();
    for (const item of items) { const e = entry(item); if (e) this.entries.set(item.stroke, e); }
    this.tree.load([...this.entries.values()]);
  }
  update(_next: readonly Item[], removed: readonly Item[], added: readonly Item[]): void {
    for (const item of removed) { const e = this.entries.get(item.stroke); if (e) { this.tree.remove(e); this.entries.delete(item.stroke); } }
    for (const item of added) { const e = entry(item); if (e) { this.entries.set(item.stroke, e); this.tree.insert(e); } }
  }
  search(box: Box, highlighterOnly = false): Item[] { return ordered(this.tree.search(box), box, highlighterOnly); }
  stats() { return { entries: this.entries.size }; }
}
class Grid implements CandidateIndex {
  private cells = new Map<string, Set<Entry>>();
  private entries = new Map<InkStroke, { entry: Entry; keys: string[] | null }>();
  private oversized = new Set<Entry>();
  // Avoid an unbounded cell explosion for huge strokes or region queries.
  private readonly maxQueryCells = 4096;
  private readonly maxStrokeCells = 64;
  constructor(private readonly cellSize: number) {}
  private keys(box: Box, limit = this.maxQueryCells): string[] | null {
    const x0 = Math.floor(box.minX / this.cellSize), x1 = Math.floor(box.maxX / this.cellSize);
    const y0 = Math.floor(box.minY / this.cellSize), y1 = Math.floor(box.maxY / this.cellSize);
    if ((x1 - x0 + 1) * (y1 - y0 + 1) > limit) return null;
    const keys: string[] = [];
    for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) keys.push(`${x},${y}`);
    return keys;
  }
  private insert(item: Item): void {
    const e = entry(item); if (!e) return;
    const keys = this.keys(e, this.maxStrokeCells); this.entries.set(item.stroke, { entry: e, keys });
    if (!keys) { this.oversized.add(e); return; }
    for (const key of keys) { let cell = this.cells.get(key); if (!cell) { cell = new Set(); this.cells.set(key, cell); } cell.add(e); }
  }
  load(items: readonly Item[]): void { this.cells.clear(); this.entries.clear(); this.oversized.clear(); for (const item of items) this.insert(item); }
  update(_next: readonly Item[], removed: readonly Item[], added: readonly Item[]): void {
    for (const item of removed) {
      const record = this.entries.get(item.stroke); if (!record) continue;
      if (record.keys) for (const key of record.keys) { const cell = this.cells.get(key)!; cell.delete(record.entry); if (!cell.size) this.cells.delete(key); }
      else this.oversized.delete(record.entry);
      this.entries.delete(item.stroke);
    }
    for (const item of added) this.insert(item);
  }
  search(box: Box, highlighterOnly = false): Item[] {
    const keys = this.keys(box);
    if (!keys) return ordered(Array.from(this.entries.values(), value => value.entry), box, highlighterOnly);
    const found = new Set(this.oversized);
    for (const key of keys) for (const e of this.cells.get(key) ?? []) found.add(e);
    return ordered(found, box, highlighterOnly);
  }
  stats() {
    let references = 0; for (const cell of this.cells.values()) references += cell.size;
    return { entries: this.entries.size, cells: this.cells.size, references, oversized: this.oversized.size, cellSize: this.cellSize, maxStrokeCells: this.maxStrokeCells, maxQueryCells: this.maxQueryCells };
  }
}
export function createIndex(name: Algorithm): CandidateIndex {
  return name === "scan" ? new Scan() : name === "rbush" ? new Tree() : new Grid(Number(name.slice(5)));
}
