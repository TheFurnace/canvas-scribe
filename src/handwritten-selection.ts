import { boundsForObjects, objectBounds, type HandwrittenObject } from "./handwritten-note";
import { transformInk } from "./ink-operations";
import { selectRenderedStroke } from "./selection";

/** Reuse the rendered-geometry predicate for text rectangles and ink. */
export function selectHandwrittenObject(object: HandwrittenObject, polygon: readonly { x: number; y: number }[], partial: boolean): boolean {
  if (object.kind === "ink") return selectRenderedStroke(object, polygon, partial);
  const b = objectBounds(object);
  return selectRenderedStroke({ id: object.id, tool: "pen", color: object.color, size: 1, opacity: 1, createdAt: 0, hasPressure: false, points: [],
    outline: [[[[b.minX, b.minY], [b.maxX, b.minY], [b.maxX, b.maxY], [b.minX, b.maxY], [b.minX, b.minY]]]] }, polygon, partial);
}

/** Clamp the whole group together so text remains valid without distorting relative scale. */
export function scaleHandwrittenSelection(objects: HandwrittenObject[], selected: ReadonlySet<string>, factor: number): HandwrittenObject[] | null {
  const chosen = objects.filter(o => selected.has(o.id)), bounds = boundsForObjects(chosen);
  if (!bounds || !Number.isFinite(factor) || factor <= 0) return null;
  let min = 0, max = Infinity;
  for (const o of chosen) if (o.kind === "text") { min = Math.max(min, 10 / o.fontSize, 80 / o.width); max = Math.min(max, 96 / o.fontSize); }
  factor = Math.max(min, Math.min(max, factor));
  if (factor === 1) return null;
  const cx = (bounds.minX + bounds.maxX) / 2, cy = (bounds.minY + bounds.maxY) / 2;
  return objects.map(o => !selected.has(o.id) ? o : o.kind === "ink"
    ? { ...transformInk(o, (x, y) => [cx + (x - cx) * factor, cy + (y - cy) * factor], factor), kind: "ink" }
    : { ...o, x: cx + (o.x - cx) * factor, y: cy + (o.y - cy) * factor, width: o.width * factor, fontSize: o.fontSize * factor });
}
