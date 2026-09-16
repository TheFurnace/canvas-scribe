import { afterEach, expect, it, vi } from "vitest";
import polygonClipping, { type Ring } from "polygon-clipping";
import { strokeOutline } from "../src/ink-operations";
import { selectRenderedStroke } from "../src/selection";
import type { InkStroke } from "../src/types";
import { PEN_PROFILES } from "../src/pen-types";

afterEach(() => vi.restoreAllMocks());
const base: InkStroke = { id: "s", tool: "pen", size: 12, color: "#111", opacity: 1, hasPressure: true, createdAt: 1,
  points: Array.from({ length: 20 }, (_, i) => ({ x: Math.sin(i / 3) * 30, y: Math.sin(i / 2) * 30, pressure: .2 + i / 30, time: i, tiltX: 80, tiltY: -60 })) };
const styles: Partial<InkStroke>[] = [{}, ...Object.keys(PEN_PROFILES).map(penType => ({ penType: penType as InkStroke["penType"] })), { tool: "highlighter", highlighterType: "round" }, { tool: "highlighter", highlighterType: "chisel" },
  { outline: [[[[-30, -30], [30, -30], [30, 30], [-30, 30]], [[-10, -10], [-10, 10], [10, 10], [10, -10]]]] }];
it.each(styles)("component selection matches union oracle: %j", style => {
  const stroke = { ...base, ...style }, outline = strokeOutline(stroke);
  const polygons: Ring[] = [
    [[-80, -80], [80, -80], [80, 80], [-80, 80]],
    [[-40, -40], [40, -40], [40, 40], [0, 0], [-40, 40]],
    ...Array.from({ length: 12 }, (_, i): Ring => { const x = -50 + i * 8.31, y = -20 + i * 2.13; return [[x, y], [x + 13, y], [x + 13, y + 17], [x, y + 17]]; }),
  ];
  for (const ring of polygons) for (const partial of [false, true]) {
    const expected = partial ? polygonClipping.intersection(outline, [ring]).length > 0 : polygonClipping.difference(outline, [ring]).length === 0;
    expect(selectRenderedStroke(stroke, ring.map(([x, y]) => ({ x, y })), partial)).toBe(expected);
  }
});
it("selects overlapping highlighters without a union and preserves closed-boundary hits", () => {
  const union = vi.spyOn(polygonClipping, "union");
  const stroke = { ...base, tool: "highlighter" as const, highlighterType: "chisel" as const, points: [{ x: 0, y: 0, pressure: .5, time: 0 }] };
  expect(selectRenderedStroke(stroke, [{ x: -2, y: 6 }, { x: 2, y: 6 }, { x: 2, y: 8 }, { x: -2, y: 8 }], true)).toBe(true);
  expect(selectRenderedStroke(stroke, [{ x: -20, y: -20 }, { x: 20, y: -20 }, { x: 20, y: 20 }, { x: -20, y: 20 }], false)).toBe(true);
  expect(union).not.toHaveBeenCalled();
});
