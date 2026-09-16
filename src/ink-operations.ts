import polygonClipping, { type MultiPolygon, type Ring, type Pair } from "polygon-clipping";
import { strokeToSvgPath } from "./geometry";
import { createStrokeId, type InkStroke } from "./types";

/** Flatten only the M/L/Q/A/Z grammar emitted by our renderer, with bounded curve error. */
export function strokeOutline(stroke: InkStroke, tolerance = 0.05): MultiPolygon {
  if (stroke.outline) return stroke.outline;
  const polygons = strokeComponents(stroke, tolerance);
  let overlappingChiselNibs = 0;
  if (stroke.highlighterType === "chisel") for (let i = 1; i < stroke.points.length; i++) {
    const a = stroke.points[i - 1]!, b = stroke.points[i]!;
    if (Math.abs(a.x - b.x) < stroke.size * .3 && Math.abs(a.y - b.y) < stroke.size) overlappingChiselNibs++;
  }
  if (stroke.tool === "highlighter" && stroke.highlighterType && polygons.length > 16
    && (stroke.highlighterType === "round" || overlappingChiselNibs > (stroke.points.length - 1) / 2)) {
    // Adjacent nibs overlap heavily. Unioning the entire compound path at once
    // makes the sweep process thousands of redundant intersecting edges.
    // Merge small adjacent groups first; keep only their boundary at each level.
    let groups: MultiPolygon[] = polygons.map(polygon => [polygon]);
    while (groups.length > 1) {
      const next: MultiPolygon[] = [];
      for (let i = 0; i < groups.length; i += 4) next.push(polygonClipping.union(groups[i]!, ...groups.slice(i + 1, i + 4)));
      groups = next;
    }
    return groups[0] ?? [];
  }
  return polygons.length ? polygonClipping.union(polygons) : [];
}

/** Flattened components; bounds do not need the expensive union of overlapping nibs. */
export function strokeComponents(stroke: InkStroke, tolerance = .05): MultiPolygon {
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
  return polygons;
}

type InkBounds = { minX: number; minY: number; maxX: number; maxY: number };
type BoundsEntry = { points: InkStroke["points"]; outline: InkStroke["outline"]; key: string; bounds: InkBounds | null };
const renderedBounds = new WeakMap<InkStroke, BoundsEntry>();
const candidateBounds = new WeakMap<InkStroke, BoundsEntry>();

// Completed geometry is immutable (as required by document history). Live strokes
// append samples; include their length and pressure mode so early reads cannot go stale.
function boundsKey(stroke: InkStroke): string {
  return `${stroke.points.length}/${stroke.size}/${stroke.tool}/${stroke.penType}/${stroke.highlighterType}/${stroke.hasPressure}`;
}

export function strokeBounds(stroke: InkStroke): InkBounds | null {
  const key = boundsKey(stroke), cached = renderedBounds.get(stroke);
  if (cached && cached.points === stroke.points && cached.outline === stroke.outline && cached.key === key) return cached.bounds;
  let bounds: InkBounds | null = null;
  for (const polygon of strokeComponents(stroke)) for (const ring of polygon) for (const [x, y] of ring) {
    if (!bounds) bounds = { minX: x, minY: y, maxX: x, maxY: y };
    else { bounds.minX = Math.min(bounds.minX, x); bounds.minY = Math.min(bounds.minY, y); bounds.maxX = Math.max(bounds.maxX, x); bounds.maxY = Math.max(bounds.maxY, y); }
  }
  renderedBounds.set(stroke, { points: stroke.points, outline: stroke.outline, key, bounds });
  return bounds;
}

/** Cheap conservative bounds for rejecting remote ink, never for precise selection. */
export function strokeCandidateBounds(stroke: InkStroke): InkBounds | null {
  const key = boundsKey(stroke), cached = candidateBounds.get(stroke);
  if (cached && cached.points === stroke.points && cached.outline === stroke.outline && cached.key === key) return cached.bounds;
  let bounds: InkBounds | null = null;
  const include = (x: number, y: number) => {
    if (!bounds) bounds = { minX: x, minY: y, maxX: x, maxY: y };
    else { bounds.minX = Math.min(bounds.minX, x); bounds.minY = Math.min(bounds.minY, y); bounds.maxX = Math.max(bounds.maxX, x); bounds.maxY = Math.max(bounds.maxY, y); }
  };
  if (stroke.outline) {
    for (const polygon of stroke.outline) for (const ring of polygon) for (const [x, y] of ring) include(x, y);
  } else {
    // Includes pressure width, pencil tilt/strand spread and SVG coordinate rounding.
    const pad = stroke.size * 2 + .001;
    for (const point of stroke.points) { include(point.x - pad, point.y - pad); include(point.x + pad, point.y + pad); }
  }
  candidateBounds.set(stroke, { points: stroke.points, outline: stroke.outline, key, bounds });
  return bounds;
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
    const bounds = strokeCandidateBounds(stroke);
    if (!bounds || bounds.maxX < regionBounds.minX || bounds.minX > regionBounds.maxX
      || bounds.maxY < regionBounds.minY || bounds.minY > regionBounds.maxY) return [stroke];
    // A compound highlighter is a union of swept nibs. Deleting the stroke only
    // needs one intersecting nib, not the union of hundreds of overlapping shapes.
    // Frozen outlines still use the general path so erased gaps and holes survive.
    if (options.mode === "stroke" && !stroke.outline && stroke.tool === "highlighter" && stroke.highlighterType) {
      if (!highlighterIntersectsRegion(stroke, region, regionBounds, options.tolerance)) return [stroke];
      changed = true; return [];
    }
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

function highlighterIntersectsRegion(stroke: InkStroke, region: MultiPolygon, bounds: ReturnType<typeof coordinateBounds>, tolerance?: number): boolean {
  const radius = stroke.size / 2;
  // Chisel vertices in the renderer are rounded to 0.001 document units.
  const padX = radius * (stroke.highlighterType === "chisel" ? .3 : 1) + .001;
  const padY = radius + .001;
  for (let i = 0; i < stroke.points.length; i++) {
    const a = stroke.points[i]!, b = stroke.points[i + 1] ?? a;
    if (Math.max(a.x, b.x) + padX < bounds.minX || Math.min(a.x, b.x) - padX > bounds.maxX
      || Math.max(a.y, b.y) + padY < bounds.minY || Math.min(a.y, b.y) - padY > bounds.maxY) continue;
    // Use the existing renderer/flattening rules for exact nib shape and tolerance.
    const segment = strokeOutline({ ...stroke, points: a === b ? [a] : [a, b] }, tolerance);
    if (polygonClipping.intersection(segment, region).length) return true;
  }
  return false;
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
