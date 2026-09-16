import { afterEach, expect, it, vi } from "vitest";
import polygonClipping from "polygon-clipping";
import * as geometry from "../src/geometry";
import { strokeBounds, strokeCandidateBounds, strokeOutline, transformInk, eraseInk, eraserOutline } from "../src/ink-operations";
import { boundsForStrokes, selectRenderedStroke } from "../src/selection";
import { createHandwrittenNote, normalizeContentHeight, type HandwrittenInkObject } from "../src/handwritten-note";
import { PEN_PROFILES } from "../src/pen-types";

afterEach(() => vi.restoreAllMocks());
function ink(): HandwrittenInkObject {
  return { kind: "ink", id: "s", tool: "pen", penType: "fountain", size: 16, color: "#111", opacity: 1, hasPressure: true, createdAt: 1,
    points: Array.from({ length: 15 }, (_, i) => ({ x: i * 6, y: 1500 + Math.sin(i) * 12, pressure: .2 + i / 20, time: i, tiltX: 40, tiltY: -25 })) };
}
function oracle(stroke: HandwrittenInkObject) {
  const points = strokeOutline(stroke).flat(2);
  return points.length ? { minX: Math.min(...points.map(p => p[0])), minY: Math.min(...points.map(p => p[1])), maxX: Math.max(...points.map(p => p[0])), maxY: Math.max(...points.map(p => p[1])) } : null;
}
const styles = [undefined, ...Object.keys(PEN_PROFILES)] as const;
it.each(styles)("bounds match union extrema for %s pen", type => {
  const stroke = { ...ink(), penType: type as HandwrittenInkObject["penType"] };
  const expected = oracle(stroke), actual = strokeBounds(stroke);
  for (const key of ["minX", "minY", "maxX", "maxY"] as const) expect(actual![key]).toBeCloseTo(expected![key], 6);
  const broad = strokeCandidateBounds(stroke)!;
  expect(broad.minX).toBeLessThanOrEqual(actual!.minX); expect(broad.minY).toBeLessThanOrEqual(actual!.minY);
  expect(broad.maxX).toBeGreaterThanOrEqual(actual!.maxX); expect(broad.maxY).toBeGreaterThanOrEqual(actual!.maxY);
});
it("rejects distant lasso and eraser candidates without rendering or rescanning samples", () => {
  const stroke = { ...ink(), tool: "highlighter" as const, highlighterType: "round" as const };
  const points = vi.spyOn(stroke.points, Symbol.iterator), render = vi.spyOn(geometry, "strokeToSvgPath");
  const polygon = [{ x: -100, y: -100 }, { x: -80, y: -100 }, { x: -80, y: -80 }, { x: -100, y: -80 }];
  for (let i = 0; i < 20; i++) {
    expect(selectRenderedStroke(stroke, polygon, i % 2 === 0)).toBe(false);
    expect(eraseInk([stroke], eraserOutline(-100, -100, 12), { mode: "stroke", highlighterOnly: false }).changed).toBe(false);
  }
  expect(render).not.toHaveBeenCalled(); expect(points).toHaveBeenCalledTimes(1);
  stroke.points.push({ x: -90, y: -90, pressure: .5, time: 20 });
  expect(selectRenderedStroke(stroke, polygon, true)).toBe(true);
  expect(eraseInk([stroke], eraserOutline(-90, -90, 12), { mode: "stroke", highlighterOnly: false }).changed).toBe(true);
});
it.each(["round", "chisel"] as const)("highlighter bounds need no union: %s", highlighterType => {
  const stroke = { ...ink(), tool: "highlighter" as const, highlighterType };
  const expected = oracle(stroke), union = vi.spyOn(polygonClipping, "union");
  const actual = strokeBounds(stroke);
  expect(union).not.toHaveBeenCalled();
  for (const key of ["minX", "minY", "maxX", "maxY"] as const) expect(actual![key]).toBeCloseTo(expected![key], 6);
});
it("reuses completed geometry while detecting append, pressure mode, style and replacement", () => {
  const stroke = ink(), render = vi.spyOn(geometry, "strokeToSvgPath"), note = { ...createHandwrittenNote(), objects: [stroke] };
  normalizeContentHeight(note); const first = note.contentHeight;
  normalizeContentHeight(note); boundsForStrokes([stroke]);
  expect(render).toHaveBeenCalledTimes(1);
  stroke.points.push({ x: 90, y: 2200, pressure: .8, time: 20 });
  normalizeContentHeight(note); expect(note.contentHeight).toBeGreaterThan(first);
  stroke.hasPressure = false; strokeBounds(stroke);
  stroke.size = 60; strokeBounds(stroke);
  stroke.points = stroke.points.slice(0, 5); strokeBounds(stroke);
  expect(render).toHaveBeenCalledTimes(5);
  const moved = transformInk(stroke, (x, y) => [x + 100, y + 200]);
  expect(strokeBounds(moved)!.minY).toBeCloseTo(strokeBounds(stroke)!.minY + 200, 6);
  expect(strokeBounds(stroke)).toEqual(oracle(stroke));
});
it("handles empty strokes and frozen fragments without contaminating source bounds", () => {
  expect(strokeBounds({ ...ink(), points: [] })).toBeNull();
  const stroke = ink(), original = strokeBounds(stroke);
  const fragments = eraseInk([stroke], eraserOutline(40, 1500, 20), { mode: "area", highlighterOnly: false }).strokes;
  for (const fragment of fragments) expect(strokeBounds(fragment)).toEqual(oracle({ ...fragment, kind: "ink" }));
  expect(strokeBounds(stroke)).toEqual(original);
});
