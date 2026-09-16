import { afterEach, expect, it, vi } from "vitest";
import polygonClipping from "polygon-clipping";
import { eraseInk, eraserOutline, strokeOutline } from "../src/ink-operations";
import type { InkStroke } from "../src/types";

afterEach(() => vi.restoreAllMocks());
function highlighter(type: "round" | "chisel", points: { x: number; y: number }[]): InkStroke {
  return { id: "highlighter", tool: "highlighter", highlighterType: type, size: 18, opacity: .38, color: "#fde047", hasPressure: false, createdAt: 1,
    points: points.map((p, i) => ({ ...p, pressure: .5, time: i })) };
}

it.each(["round", "chisel"] as const)("matches the full rendered %s silhouette without unioning the whole stroke", type => {
  const fixtures = [[], [{ x: 0, y: 0 }], [{ x: 0, y: 0 }, { x: 0, y: 0 }],
    [{ x: -20, y: -20 }, { x: 20, y: 20 }, { x: -20, y: 20 }, { x: 20, y: -20 }]];
  for (const points of fixtures) {
    const stroke = highlighter(type, points), outline = strokeOutline(stroke, .1);
    for (let x = -32; x <= 32; x += 8) for (let y = -32; y <= 32; y += 8) {
      const region = eraserOutline(x + .37, y + .23, 3, .1);
      const expected = outline.length > 0 && polygonClipping.intersection(outline, region).length > 0;
      expect(eraseInk([stroke], region, { mode: "stroke", highlighterOnly: false, tolerance: .1 }).changed, `${type}, ${points.length}, ${x},${y}`).toBe(expected);
    }
  }
});

it.each(["round", "chisel"] as const)("bounds %s deletion geometry to one nearby segment", type => {
  const stroke = highlighter(type, Array.from({ length: 1000 }, (_, i) => ({ x: i, y: 0 })));
  const union = vi.spyOn(polygonClipping, "union");
  const result = eraseInk([stroke], eraserOutline(500, 0, 12), { mode: "stroke", highlighterOnly: true });
  expect(result.strokes).toHaveLength(0);
  expect(union.mock.calls.length).toBeLessThan(4);
  expect(union.mock.calls.every(args => args[0].length <= 3)).toBe(true);
  expect(stroke.points).toHaveLength(1000); expect(stroke.outline).toBeUndefined();
});

it.each(["round", "chisel"] as const)("respects previously erased gaps in %s ink", type => {
  const stroke = highlighter(type, [{ x: 0, y: 0 }, { x: 100, y: 0 }]);
  const cut = eraseInk([stroke], eraserOutline(50, 0, 20), { mode: "area", highlighterOnly: false }).strokes;
  expect(cut.length).toBeGreaterThan(1);
  const result = eraseInk(cut, eraserOutline(50, 0, 5), { mode: "stroke", highlighterOnly: false });
  expect(result.changed).toBe(false); expect(result.strokes).toEqual(cut);
  const hit = eraseInk(cut, eraserOutline(10, 0, 5), { mode: "stroke", highlighterOnly: true });
  expect(hit.changed).toBe(true); expect(hit.strokes.length).toBeLessThan(cut.length);
});
