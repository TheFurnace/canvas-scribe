import type { InkPoint, InkStroke } from "./types";

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

export function boundsForStrokes(strokes: readonly InkStroke[]): SelectionBounds | null {
  const points = strokes.flatMap((stroke) => stroke.points);
  if (points.length === 0) return null;
  return {
    minX: Math.min(...points.map((point) => point.x)),
    minY: Math.min(...points.map((point) => point.y)),
    maxX: Math.max(...points.map((point) => point.x)),
    maxY: Math.max(...points.map((point) => point.y)),
  };
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
