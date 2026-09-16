import type { InkPoint, InkStroke } from "./types";
import polygonClipping, { type Ring } from "polygon-clipping";
import { strokeBounds, strokeOutline } from "./ink-operations";

export interface SelectionBounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export function pointInPolygon(point: Pick<InkPoint, "x" | "y">, polygon: readonly Pick<InkPoint, "x" | "y">[]): boolean {
  if (polygon.length < 3) return false;
  let inside = false;
  for (let current = 0, previous = polygon.length - 1; current < polygon.length; previous = current, current += 1) {
    const a = polygon[current];
    const b = polygon[previous];
    if (!a || !b) continue;
    const crosses = a.y > point.y !== b.y > point.y;
    if (crosses && point.x < ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

export function strokeInsidePolygon(stroke: InkStroke, polygon: readonly Pick<InkPoint, "x" | "y">[]): boolean {
  return stroke.points.length > 0 && stroke.points.every((point) => pointInPolygon(point, polygon));
}

/** Closed boundary: touching ink is included; full selection includes the ink width. */
export function selectRenderedStroke(stroke: InkStroke, polygon: readonly Pick<InkPoint, "x" | "y">[], partial: boolean): boolean {
  if (polygon.length < 3) return false;
  const ring: Ring = polygon.map(({ x, y }) => [x, y]);
  const outline = strokeOutline(stroke);
  if (!outline.length) return false;
  if (!partial) return polygonClipping.difference(outline, [ring]).length === 0;
  if (polygonClipping.intersection(outline, [ring]).length > 0) return true;
  const onSegment = (p: number[], a: number[], b: number[]) => {
    const cross = (p[0]! - a[0]!) * (b[1]! - a[1]!) - (p[1]! - a[1]!) * (b[0]! - a[0]!);
    return Math.abs(cross) < 1e-7 && p[0]! >= Math.min(a[0]!, b[0]!) - 1e-7 && p[0]! <= Math.max(a[0]!, b[0]!) + 1e-7
      && p[1]! >= Math.min(a[1]!, b[1]!) - 1e-7 && p[1]! <= Math.max(a[1]!, b[1]!) + 1e-7;
  };
  return outline.some((shape) => shape.some((edge) => edge.some((p, index) => ring.some((q, other) =>
    onSegment(p, q, ring[(other + 1) % ring.length]!) || onSegment(q, p, edge[(index + 1) % edge.length]!),
  ))));
}

export function boundsForStrokes(strokes: readonly InkStroke[]): SelectionBounds | null {
  let bounds: SelectionBounds | null = null;
  for (const stroke of strokes) {
    const next = strokeBounds(stroke); if (!next) continue;
    if (!bounds) bounds = { ...next };
    else { bounds.minX = Math.min(bounds.minX, next.minX); bounds.minY = Math.min(bounds.minY, next.minY); bounds.maxX = Math.max(bounds.maxX, next.maxX); bounds.maxY = Math.max(bounds.maxY, next.maxY); }
  }
  return bounds;
}

export function pointInBounds(
  point: Pick<InkPoint, "x" | "y">,
  bounds: SelectionBounds,
  padding = 0,
): boolean {
  return (
    point.x >= bounds.minX - padding &&
    point.x <= bounds.maxX + padding &&
    point.y >= bounds.minY - padding &&
    point.y <= bounds.maxY + padding
  );
}

export function translatePoints(points: readonly InkPoint[], deltaX: number, deltaY: number): InkPoint[] {
  return points.map((point) => ({ ...point, x: point.x + deltaX, y: point.y + deltaY }));
}
