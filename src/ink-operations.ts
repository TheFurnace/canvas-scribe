import polygonClipping, { type MultiPolygon, type Ring, type Pair } from "polygon-clipping";
import { strokeToSvgPath } from "./geometry";
import { createStrokeId, type InkStroke } from "./types";

/** Flatten only the M/L/Q/A/Z grammar emitted by our renderer, with bounded curve error. */
export function strokeOutline(stroke: InkStroke, tolerance = 0.05): MultiPolygon {
  if (stroke.outline) return stroke.outline;
  const tokens = strokeToSvgPath(stroke).match(/[MLQAZ]|[-+]?(?:\d*\.)?\d+(?:e[-+]?\d+)?/gi) ?? [];
  let index = 0, current: Pair = [0, 0], ring: Ring = [];
  const polygons: MultiPolygon = [];
  const number = () => Number(tokens[index++]);
  const point = (): Pair => [number(), number()];
  const quadratic = (a: Pair, b: Pair, c: Pair, depth = 0): void => {
    const chord = Math.hypot(c[0] - a[0], c[1] - a[1]);
    const distance = chord ? Math.abs((c[0] - a[0]) * (a[1] - b[1]) - (a[0] - b[0]) * (c[1] - a[1])) / chord : Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (distance <= tolerance || depth >= 16) { ring.push(c); return; }
    const ab: Pair = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    const bc: Pair = [(b[0] + c[0]) / 2, (b[1] + c[1]) / 2];
    const mid: Pair = [(ab[0] + bc[0]) / 2, (ab[1] + bc[1]) / 2];
    quadratic(a, ab, mid, depth + 1); quadratic(mid, bc, c, depth + 1);
  };
  while (index < tokens.length) {
    const command = tokens[index++];
    if (command === "M") { current = point(); ring = [current]; }
    else if (command === "L") { current = point(); ring.push(current); }
    else if (command === "Q") { const control = point(), end = point(); quadratic(current, control, end); current = end; }
    else if (command === "A") {
      const radius = number(); number(); number(); number(); const sweep = number(); const end = point();
      // The renderer emits two circular half-arcs, each with diametrically opposed endpoints.
      const center: Pair = [(current[0] + end[0]) / 2, (current[1] + end[1]) / 2];
      const start = Math.atan2(current[1] - center[1], current[0] - center[0]);
      const count = Math.max(4, Math.ceil(Math.PI / (2 * Math.acos(Math.max(-1, 1 - tolerance / Math.max(radius, tolerance))))));
      for (let step = 1; step <= count; step++) {
        const angle = start + (sweep ? 1 : -1) * Math.PI * step / count;
        ring.push([center[0] + Math.cos(angle) * radius, center[1] + Math.sin(angle) * radius]);
      }
      current = end;
    } else if (command === "Z") { if (ring.length >= 3) polygons.push([ring]); ring = []; }
    else throw new Error(`Unsupported ink path command: ${command}`);
  }
  return polygons.length ? polygonClipping.union(polygons) : [];
}

export function eraserOutline(x: number, y: number, radius: number, tolerance = 0.05): MultiPolygon {
  const count = Math.max(24, Math.ceil(Math.PI / Math.acos(Math.max(-1, 1 - tolerance / Math.max(radius, tolerance)))));
  return [[Array.from({ length: count }, (_, i): Pair => {
    const angle = i * Math.PI * 2 / count;
    return [x + radius * Math.cos(angle), y + radius * Math.sin(angle)];
  })]];
}

export function eraseInk(strokes: readonly InkStroke[], region: MultiPolygon, options: {
  mode: "stroke" | "area"; highlighterOnly: boolean; tolerance?: number;
}): { strokes: InkStroke[]; changed: boolean } {
  let changed = false;
  const regionPoints = region.flatMap((polygon) => polygon.flatMap((ring) => ring));
  const regionBounds = coordinateBounds(regionPoints);
  const result = strokes.flatMap((stroke) => {
    if (options.highlighterOnly && stroke.tool !== "highlighter") return [stroke];
    // Conservative broad phase avoids flattening remote strokes on every pointer sample.
    const candidates = stroke.outline ? stroke.outline.flatMap((polygon) => polygon.flatMap((ring) => ring)) : stroke.points.map(({ x, y }): Pair => [x, y]);
    const bounds = coordinateBounds(candidates), padding = stroke.outline ? 0 : stroke.size * 2;
    if (bounds.maxX + padding < regionBounds.minX || bounds.minX - padding > regionBounds.maxX
      || bounds.maxY + padding < regionBounds.minY || bounds.minY - padding > regionBounds.maxY) return [stroke];
    const outline = strokeOutline(stroke, options.tolerance);
    if (!polygonClipping.intersection(outline, region).length) return [stroke];
    changed = true;
    if (options.mode === "stroke") return [];
    const remaining = polygonClipping.difference(outline, region);
    return remaining.map((polygon, index): InkStroke => ({
      ...stroke, id: index === 0 ? stroke.id : createStrokeId(), outline: [polygon],
      points: stroke.points.map((point) => ({ ...point })),
    }));
  });
  return { strokes: result, changed };
}

function coordinateBounds(points: Pair[]) {
  const bounds = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
  for (const [x, y] of points) { bounds.minX = Math.min(bounds.minX, x); bounds.minY = Math.min(bounds.minY, y); bounds.maxX = Math.max(bounds.maxX, x); bounds.maxY = Math.max(bounds.maxY, y); }
  return bounds;
}

export function transformInk(stroke: InkStroke, transform: (x: number, y: number) => Pair, scale = 1): InkStroke {
  return {
    ...stroke, size: stroke.size * scale,
    points: stroke.points.map((point) => { const [x, y] = transform(point.x, point.y); return { ...point, x, y }; }),
    ...(stroke.outline ? { outline: stroke.outline.map((polygon) => polygon.map((ring) => ring.map(([x, y]) => transform(x, y)))) } : {}),
  };
}
