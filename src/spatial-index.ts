import RBush from "rbush";

export interface SpatialBounds { minX: number; minY: number; maxX: number; maxY: number; }
interface Entry<T> extends SpatialBounds { value: T; order: number; partition: number; }

/** Derived, view-owned cache. Completed objects are immutable; callers explicitly
 * refresh live ink/text after in-place edits. Never serialized or kept in history. */
export class SpatialIndex<T extends object> {
  private source: readonly T[] | null = null;
  private sourceLength = 0;
  private entries = new Map<T, Entry<T>>();
  private readonly trees = new Map<number, RBush<Entry<T>>>();
  constructor(private readonly bounds: (value: T) => SpatialBounds | null,
    private readonly partition: (value: T) => number = () => 0) {}

  /** Reconcile once per document replacement, not once per pointer sample. */
  sync(values: readonly T[], mutable?: T | null): void {
    // Live drawing appends to the same array. Do not walk completed ink at lift.
    if (this.source === values && this.sourceLength < values.length) {
      for (let order = this.sourceLength; order < values.length; order++) {
        const value = values[order]!, entry = this.entry(value, order);
        if (entry) { this.entries.set(value, entry); this.tree(entry.partition).insert(entry); }
      }
      this.sourceLength = values.length;
    } else if (this.source !== values || this.sourceLength !== values.length) {
      const next = new Map<T, Entry<T>>(), added: Entry<T>[] = [];
      values.forEach((value, order) => {
        const previous = this.entries.get(value);
        if (previous) { previous.order = order; next.set(value, previous); }
        else { const entry = this.entry(value, order); if (entry) { next.set(value, entry); added.push(entry); } }
      });
      // Reloads and large replacements benefit from a packed bulk build.
      if (!this.source || added.length > next.size / 2) {
        this.trees.clear();
        const groups = new Map<number, Entry<T>[]>();
        for (const entry of next.values()) { const group = groups.get(entry.partition) ?? []; group.push(entry); groups.set(entry.partition, group); }
        for (const [partition, entries] of groups) this.tree(partition).load(entries);
      } else {
        for (const [value, entry] of this.entries) if (!next.has(value)) this.remove(entry);
        for (const entry of added) this.tree(entry.partition).insert(entry);
      }
      this.entries = next; this.source = values; this.sourceLength = values.length;
    }
    if (mutable) this.refresh(mutable);
  }

  refresh(value: T): void {
    const old = this.entries.get(value);
    const order = old?.order ?? this.source?.indexOf(value) ?? -1;
    if (order < 0) return;
    if (old) { this.remove(old); this.entries.delete(value); }
    const entry = this.entry(value, order);
    if (entry) { this.entries.set(value, entry); this.tree(entry.partition).insert(entry); }
  }

  search(bounds: SpatialBounds, partition = 0): T[] {
    return (this.trees.get(partition)?.search(bounds) ?? []).sort((a, b) => a.order - b.order).map(entry => entry.value);
  }

  clear(): void { this.source = null; this.sourceLength = 0; this.entries.clear(); this.trees.clear(); }

  private entry(value: T, order: number): Entry<T> | null {
    const bounds = this.bounds(value);
    return bounds && [bounds.minX, bounds.minY, bounds.maxX, bounds.maxY].every(Number.isFinite)
      && bounds.minX <= bounds.maxX && bounds.minY <= bounds.maxY
      ? { ...bounds, value, order, partition: this.partition(value) } : null;
  }
  private tree(partition: number): RBush<Entry<T>> {
    let tree = this.trees.get(partition);
    if (!tree) { tree = new RBush<Entry<T>>(); this.trees.set(partition, tree); }
    return tree;
  }
  private remove(entry: Entry<T>): void {
    const tree = this.trees.get(entry.partition); tree?.remove(entry);
    if (tree && !tree.toJSON().children.length) this.trees.delete(entry.partition);
  }
}

export function polygonBounds(points: readonly { x: number; y: number }[], padding = 1e-7): SpatialBounds | null {
  if (points.length < 3) return null;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const { x, y } of points) { minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y); }
  return [minX, minY, maxX, maxY].every(Number.isFinite) ? { minX: minX - padding, minY: minY - padding, maxX: maxX + padding, maxY: maxY + padding } : null;
}

/** Replace only hits, retaining metadata, untouched identities and document order. */
export function replaceSpatialCandidates<T extends object>(values: T[], index: SpatialIndex<T>, bounds: SpatialBounds,
  replace: (value: T) => T[], partition = 0): { values: T[]; changed: boolean } {
  index.sync(values);
  const replacements = new Map<T, T[]>();
  for (const value of index.search(bounds, partition)) {
    const next = replace(value);
    if (next.length !== 1 || next[0] !== value) replacements.set(value, next);
  }
  if (!replacements.size) return { values, changed: false };
  const next = values.flatMap(value => replacements.get(value) ?? [value]);
  index.sync(next);
  return { values: next, changed: true };
}
