import { expect, it, vi } from "vitest";
import { SpatialIndex, polygonBounds, replaceSpatialCandidates } from "../src/spatial-index";
import { strokeCandidateBounds, eraseInk, eraserOutline, transformInk } from "../src/ink-operations";
import { eraseIndexedInk } from "../src/indexed-ink";
import { selectRenderedStroke } from "../src/selection";
import { handwrittenCandidateBounds } from "../src/handwritten-selection";
import { strokeIntersectsCircle } from "../src/geometry";
import { fixture, scenes } from "../scripts/spatial/fixtures";
import type { InkStroke } from "../src/types";

it("reconciles changes by identity, preserves order, and does not rescan bounds on queries", () => {
  const values = Array.from({ length: 100 }, (_, i) => ({ minX: i, minY: 0, maxX: i + 1, maxY: 1, page: i % 2 }));
  const bounds = vi.fn(value => value), index = new SpatialIndex<(typeof values)[number]>(bounds, value => value.page);
  index.sync(values); expect(bounds).toHaveBeenCalledTimes(100); bounds.mockClear();
  for (let i = 0; i < 20; i++) { index.sync(values); expect(index.search({ minX: 40, minY: 0, maxX: 41, maxY: 1 }, 0)).toEqual([values[40]]); }
  expect(bounds).not.toHaveBeenCalled();
  const appended = { minX: 200, minY: 0, maxX: 201, maxY: 1, page: 0 }; values.push(appended); index.sync(values);
  expect(index.search({ minX: 200, minY: 0, maxX: 201, maxY: 1 })).toEqual([appended]);
  expect(bounds).toHaveBeenCalledTimes(1); bounds.mockClear();
  const moved = { ...values[40]!, minX: -200, maxX: -199 }, next = values.map((v, i) => i === 40 ? moved : v).reverse();
  index.sync(next); expect(bounds).toHaveBeenCalledTimes(1);
  expect(index.search({ minX: -500, minY: 0, maxX: 500, maxY: 1 }, 0)).toEqual(next.filter(v => v.page === 0));
  index.sync(values); expect(index.search({ minX: -200, minY: 0, maxX: -199, maxY: 1 }, 0)).toEqual([]);
  index.clear(); expect(index.search({ minX: 0, minY: 0, maxX: 100, maxY: 1 })).toEqual([]);
});

it("refreshes live append, initially empty objects and changed partitions", () => {
  const ink = fixture("canvas", 1)[0]!.stroke;
  const live = { ...ink, outline: undefined, points: [] as InkStroke["points"], page: 0 };
  const values = [live], index = new SpatialIndex<typeof live>(strokeCandidateBounds, s => s.page);
  index.sync(values); live.points.push({ x: 100, y: 100, pressure: .5, time: 0 }); index.sync(values, live);
  expect(index.search({ minX: 99, minY: 99, maxX: 101, maxY: 101 })).toEqual([live]);
  live.points.push({ x: 500, y: 500, pressure: .5, time: 1 }); live.page = 1; index.refresh(live);
  expect(index.search({ minX: 499, minY: 499, maxX: 501, maxY: 501 }, 1)).toEqual([live]);
  expect(index.search({ minX: 99, minY: 99, maxX: 101, maxY: 101 }, 0)).toEqual([]);
});

it.each(scenes)("%s selection candidates retain scan results for partial and full selection", scene => {
  const strokes = fixture(scene, 40).map(i => i.stroke), index = new SpatialIndex<InkStroke>(strokeCandidateBounds);
  index.sync(strokes);
  for (const stroke of strokes.slice(0, 6)) {
    const b = strokeCandidateBounds(stroke)!;
    const x = (b.minX + b.maxX) / 2, y = (b.minY + b.maxY) / 2;
    const polygon = [{ x: x - 100, y: y - 100 }, { x: x + 100, y: y - 100 }, { x: x + 100, y: y + 100 }, { x: x - 100, y: y + 100 }];
    for (const partial of [false, true]) expect(index.search(polygonBounds(polygon)!).filter(s => selectRenderedStroke(s, polygon, partial)))
      .toEqual(strokes.filter(s => selectRenderedStroke(s, polygon, partial)));
  }
});

it("keeps touching selection boundaries and rejects invalid polygons", () => {
  const index = new SpatialIndex<{ minX: number; minY: number; maxX: number; maxY: number }>(v => v);
  const value = { minX: 10 + 5e-8, minY: 0, maxX: 20, maxY: 10 }; index.sync([value]);
  index.sync([{ minX: NaN, minY: 0, maxX: 20, maxY: 10 }, value, { minX: 30, minY: 0, maxX: 20, maxY: 10 }]);
  expect(index.search(polygonBounds([{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }])!)).toEqual([value]);
  expect(polygonBounds([])).toBeNull(); expect(polygonBounds([{ x: NaN, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }])).toBeNull();
});

it("preserves page metadata, interleaved order, precise cuts and repeated edits through reload/undo", () => {
  const base = fixture("canvas", 1)[0]!.stroke;
  const original: (InkStroke & { page: number })[] = [0, 1, 0].map((page, i) => ({ ...base, id: `p${i}`, page, points: [{ x: 0, y: 0, pressure: .5, time: 0 }, { x: 100, y: 0, pressure: .5, time: 1 }],
    outline: [[[[0, -5], [100, -5], [100, 5], [0, 5], [0, -5]]]] as InkStroke["outline"] }));
  const index = new SpatialIndex<(typeof original)[number]>(strokeCandidateBounds, s => s.page);
  const canonical = (s: InkStroke) => ({ ...s, id: undefined });
  let current = original; index.sync(current);
  for (const x of [25, 65]) {
    const region = eraserOutline(x, 0, 10), options = { mode: "area" as const, highlighterOnly: false };
    const expected = current.flatMap(s => s.page === 0 ? eraseInk([s], region, options).strokes : [s]);
    const result = eraseIndexedInk(current, index, region, options, 0);
    expect(result.strokes.map(canonical)).toEqual(expected.map(canonical));
    expect(result.strokes.find(s => s.id === "p1")).toBe(original[1]);
    expect(result.strokes.every(s => Number.isInteger(s.page))).toBe(true);
    current = result.strokes;
  }
  index.sync(original); index.sync(structuredClone(current));
  const moved = current.map(s => ({ ...transformInk(s, (x, y) => [x + 1000, y]), page: s.page }));
  index.sync(moved);
  expect(eraseIndexedInk(moved, index, eraserOutline(50, 0, 10), { mode: "stroke", highlighterOnly: false }, 0).changed).toBe(false);
});

it("retains the note stroke-eraser sample-path policy on cut ink", () => {
  const base = fixture("canvas", 1)[0]!.stroke;
  const ink = { ...base, kind: "ink" as const, points: [{ x: 0, y: 0, pressure: .5, time: 0 }, { x: 100, y: 0, pressure: .5, time: 1 }],
    outline: [[[[80, -2], [100, -2], [100, 2], [80, 2], [80, -2]]]] as InkStroke["outline"] };
  const index = new SpatialIndex<typeof ink>(handwrittenCandidateBounds);
  const result = replaceSpatialCandidates([ink], index, { minX: 19, minY: -1, maxX: 21, maxY: 1 }, s => strokeIntersectsCircle(s, 20, 0, 1) ? [] : [s]);
  expect(result.values).toEqual([]);
});
