import { expect, it } from "vitest";
import polygonClipping, { type MultiPolygon } from "polygon-clipping";
import { eraseInk, eraserOutline, strokeComponents, strokeOutline } from "../src/ink-operations";
import type { InkStroke } from "../src/types";

function area(polygons: MultiPolygon): number {
  return polygons.reduce((total, polygon) => total + polygon.reduce((sum, ring, r) => {
    let a = 0; for (let i = 0; i < ring.length; i++) { const p = ring[i]!, q = ring[(i + 1) % ring.length]!; a += p[0] * q[1] - q[0] * p[1]; }
    return sum + Math.abs(a / 2) * (r ? -1 : 1);
  }, 0), 0);
}
// Different union association can shift intersections by machine epsilon.
// Quantize only the comparison to avoid clipping almost coincident edges in xor.
function comparable(polygons: MultiPolygon): MultiPolygon {
  return polygons.map(polygon => polygon.map(ring => ring.map(([x, y]) => [Math.round(x * 1e7) / 1e7, Math.round(y * 1e7) / 1e7])));
}
it.each(["round", "chisel"] as const)("batched %s union and cuts preserve the original filled region", highlighterType => {
  for (const shape of ["dense", "sparse", "crossing", "dot"]) {
    const stroke: InkStroke = { id: "h", tool: "highlighter", highlighterType, size: 30, color: "#ff0", opacity: .38, hasPressure: false, createdAt: 1,
      points: Array.from({ length: 80 }, (_, i) => ({ x: shape === "dot" ? 0 : shape === "crossing" ? Math.sin(i / 7) * 50 : i * (shape === "sparse" ? 20 : .7), y: shape === "dot" ? 0 : Math.sin(i / 4) * 20, pressure: .5, time: i })) };
    const original = polygonClipping.union(strokeComponents(stroke));
    expect(area(polygonClipping.xor(comparable(original), comparable(strokeOutline(stroke))))).toBeLessThan(1e-3);
    const region = eraserOutline(30, 0, 15);
    const result = eraseInk([stroke], region, { mode: "area", highlighterOnly: false });
    const actual = result.strokes.flatMap(s => strokeOutline(s));
    expect(area(polygonClipping.xor(comparable(polygonClipping.difference(original, region)), comparable(actual)))).toBeLessThan(1e-3);
  }
});
