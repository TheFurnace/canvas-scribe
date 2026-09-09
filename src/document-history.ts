/** Ordered object snapshots shared by ink-only and mixed-object documents. */
export class DocumentHistory<T extends { id: string }> {
  past: T[][] = [];
  future: T[][] = [];
  constructor(private readonly copy: (objects: readonly T[]) => T[] = (objects) => structuredClone([...objects]), private readonly limit = 50) {}
  checkpoint(objects: readonly T[]): void {
    const ids = new Set(objects.map((object) => object.id));
    if (ids.size !== objects.length) throw new Error("Document objects must have unique IDs.");
    this.past.push(this.copy(objects));
    if (this.past.length > this.limit) this.past.shift();
    this.future = [];
  }
  undo(objects: readonly T[]): T[] | null {
    const previous = this.past.pop(); if (!previous) return null;
    this.future.push(this.copy(objects)); return previous;
  }
  redo(objects: readonly T[]): T[] | null {
    const next = this.future.pop(); if (!next) return null;
    this.past.push(this.copy(objects)); return next;
  }
}
