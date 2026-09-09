import type { InkPoint, InkStroke } from "./types";
import polygonClipping, { type Ring } from "polygon-clipping";
import { strokeOutline } from "./ink-operations";

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
  const points = strokes.flatMap((stroke) => strokeOutline(stroke).flatMap((polygon) => polygon.flatMap((ring) => ring.map(([x, y]) => ({ x, y })))));
  if (points.length === 0) return null;
  const bounds = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
  for (const { x, y } of points) { bounds.minX = Math.min(bounds.minX, x); bounds.minY = Math.min(bounds.minY, y); bounds.maxX = Math.max(bounds.maxX, x); bounds.maxY = Math.max(bounds.maxY, y); }
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
