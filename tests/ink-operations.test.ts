import { describe, expect, it } from "vitest";
import type { App, TFile } from "obsidian";
import polygonClipping from "polygon-clipping";
import { eraseInk, eraserOutline, strokeOutline, transformInk } from "../src/ink-operations";
import { cloneStrokes, type InkStroke } from "../src/types";
import { loadInkData, saveInkData } from "../src/persistence";
import { selectRenderedStroke } from "../src/selection";

const stroke: InkStroke = {
  id: "ink", tool: "highlighter", highlighterType: "chisel", size: 12,
  color: "#fde047", opacity: 0.3, createdAt: 1, hasPressure: false,
  points: [{ x: 0, y: 0, pressure: 0.5, time: 0 }, { x: 100, y: 0, pressure: 0.5, time: 1 }],
};
const square = (left: number, top: number, right: number, bottom: number) => [
  { x: left, y: top }, { x: right, y: top }, { x: right, y: bottom }, { x: left, y: bottom },
];

describe("rendered ink operations", () => {
  it.each(["stroke", "area"] as const)("filters %s erasing by highlighter tool identity", (mode) => {
    const pen: InkStroke = { ...stroke, id: "pen", tool: "pen", penType: "pencil", highlighterType: undefined };
    const result = eraseInk([pen, stroke], eraserOutline(50, 0, 20), { mode, highlighterOnly: true });
    expect(result.changed).toBe(true);
    expect(result.strokes[0]).toBe(pen);
    expect(result.strokes.filter((s) => s.tool === "highlighter")).toHaveLength(mode === "area" ? 2 : 0);
  });
  it("cuts sparse strokes across their rendered width, retaining styles and unique IDs", () => {
    const region = eraserOutline(50, 0, 20);
    const result = eraseInk([stroke], region, { mode: "area", highlighterOnly: false });
    expect(result.strokes).toHaveLength(2);
    expect(new Set(result.strokes.map((s) => s.id)).size).toBe(2);
    for (const fragment of result.strokes) {
      expect(fragment).toMatchObject({ color: stroke.color, opacity: stroke.opacity, highlighterType: "chisel", size: 12 });
      expect(polygonClipping.intersection(strokeOutline(fragment), region)).toHaveLength(0);
    }
    expect(stroke.outline).toBeUndefined();
    expect(eraseInk(result.strokes, region, { mode: "area", highlighterOnly: false }).changed).toBe(false);
  });
  it("accounts for thick rendered ink, closed boundaries, and erased gaps when selecting", () => {
    expect(selectRenderedStroke(stroke, square(40, 5, 60, 8), true)).toBe(true);
    expect(selectRenderedStroke(stroke, square(-10, -5, 110, 5), false)).toBe(false);
    expect(selectRenderedStroke(stroke, square(-10, -6, 110, 6), false)).toBe(true);
    expect(selectRenderedStroke(stroke, square(40, 6, 60, 8), true)).toBe(true);
    const cut = eraseInk([stroke], eraserOutline(50, 0, 20), { mode: "area", highlighterOnly: false });
    expect(cut.strokes.some((s) => selectRenderedStroke(s, square(45, -2, 55, 2), true))).toBe(false);
  });
  it("preserves cutouts through transforms, history snapshots, and save/reload", async () => {
    const cut = eraseInk([stroke], eraserOutline(50, 0, 20), { mode: "area", highlighterOnly: false }).strokes;
    const snapshot = cloneStrokes(cut);
    const moved = cut.map((s) => transformInk(s, (x, y) => [x * 2 + 30, y * 2 + 40], 2));
    expect(moved[0]!.size).toBe(24);
    expect(snapshot[0]!.outline).toEqual(cut[0]!.outline);
    expect(snapshot[0]!.outline).not.toBe(cut[0]!.outline);
    expect(moved.some((s) => selectRenderedStroke(s, square(120, 36, 140, 44), true))).toBe(false);
    let raw = "{}";
    const app = { vault: { read: async () => raw, process: async (_: unknown, update: (raw: string) => string) => { raw = update(raw); } } } as unknown as App;
    await saveInkData(app, {} as TFile, { version: 1, strokes: moved });
    expect((await loadInkData(app, {} as TFile)).strokes).toEqual(moved);
  });
});
