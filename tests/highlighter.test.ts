import { describe, expect, it } from "vitest";
import type { App, TFile } from "obsidian";
import { loadInkData, saveInkData } from "../src/persistence";
import { strokeToSvgPath } from "../src/geometry";
import type { CanvasInkData, InkStroke } from "../src/types";

const legacy: InkStroke = {
  id: "legacy", tool: "highlighter", size: 17, color: "#fde047", opacity: 0.38,
  createdAt: 1, hasPressure: false,
  points: [{ x: 0, y: 0, pressure: 0.5, time: 0 }, { x: 100, y: 0, pressure: 0.5, time: 1 }],
};
describe("highlighter compatibility", () => {
  it("round trips both new tips and legacy appearance without changing old strokes", async () => {
    const originalPath = strokeToSvgPath(legacy);
    const data: CanvasInkData = {
      version: 1, highlighterSettings: { type: "chisel", size: 40, opacity: 0.25 },
      strokes: [legacy, { ...legacy, id: "round", highlighterType: "round" }, { ...legacy, id: "chisel", highlighterType: "chisel" }],
    };
    let raw = '{"nodes":[{"id":"card"}]}';
    const app = { vault: { read: async () => raw, process: async (_: unknown, update: (raw: string) => string) => { raw = update(raw); } } } as unknown as App;
    await saveInkData(app, {} as TFile, data);
    const loaded = await loadInkData(app, {} as TFile);
    expect(loaded).toEqual({ ...data, version: 2 });
    expect(strokeToSvgPath(loaded.strokes[0]!)).toBe(originalPath);
    expect(new Set(loaded.strokes.map((stroke) => strokeToSvgPath(stroke))).size).toBe(3);
    expect(JSON.parse(raw).nodes).toEqual([{ id: "card" }]);
  });
  it.each(["round", "chisel"] as const)("keeps %s geometry independent of opacity and pressure", (highlighterType) => {
    const stroke = { ...legacy, highlighterType };
    expect(strokeToSvgPath(stroke)).toBe(strokeToSvgPath({ ...stroke, opacity: 0.8, hasPressure: true, points: stroke.points.map((point) => ({ ...point, pressure: 0.1 })) }));
    expect(strokeToSvgPath({ ...stroke, size: 40 })).not.toBe(strokeToSvgPath(stroke));
    expect(strokeToSvgPath({ ...stroke, points: [] })).toBe("");
    expect(strokeToSvgPath({ ...stroke, points: [stroke.points[0]!] })).not.toContain("NaN");
  });
});
