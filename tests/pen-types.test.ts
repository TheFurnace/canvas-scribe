import { describe, expect, it } from "vitest";
import { getStroke } from "perfect-freehand";
import { outlineToSvgPath, strokeToSvgPath } from "../src/geometry";
import { PEN_TYPES, penPressure, pencilTilt } from "../src/pen-types";
import { penPreviewStroke } from "../src/pen-menu";
import { loadInkData, saveInkData } from "../src/persistence";
import type { App, TFile } from "obsidian";

describe("pen rendering", () => {
  it("keeps ballpoint geometry constant across pressure changes", () => {
    const stroke = penPreviewStroke("ballpoint", 8, "#333333");
    const path = strokeToSvgPath(stroke);
    stroke.points.forEach((point) => { point.pressure = 1 - point.pressure; });
    expect(strokeToSvgPath(stroke)).toBe(path);
    expect(penPressure("ballpoint", 0)).toBe(penPressure("ballpoint", 1));
  });
  it("maps pressure monotonically with distinct fountain, brush and pencil curves", () => {
    for (const type of ["fountain", "brush", "pencil"] as const) {
      expect(penPressure(type, 0.1)).toBeLessThan(penPressure(type, 0.9));
      expect(penPressure(type, 0.9, false)).toBe(0.5);
      expect(Number.isFinite(penPressure(type, NaN))).toBe(true);
    }
    expect(penPressure("brush", 0.2)).toBeLessThan(penPressure("fountain", 0.2));
    expect(new Set(PEN_TYPES.map(type => strokeToSvgPath(penPreviewStroke(type, 8, "#333333")))).size).toBe(4);
  });
  it("renders deterministic pencil texture with safe optional tilt", () => {
    const upright = penPreviewStroke("pencil", 8, "#333333");
    const tilted = penPreviewStroke("pencil", 8, "#333333", true);
    expect(strokeToSvgPath(upright)).not.toBe(strokeToSvgPath(tilted));
    expect(strokeToSvgPath(tilted)).toBe(strokeToSvgPath(JSON.parse(JSON.stringify(tilted))));
    expect(pencilTilt({})).toBe(0);
    expect(pencilTilt({ tiltX: NaN, tiltY: Infinity })).toBe(0);
    expect(pencilTilt({ tiltX: 900 })).toBe(1);
  });
  it("leaves legacy pressure and simulated-pressure rendering unchanged", () => {
    for (const hasPressure of [true, false]) {
      const stroke = penPreviewStroke("fountain", 8, "#333333");
      delete stroke.penType;
      stroke.hasPressure = hasPressure;
      const expected = outlineToSvgPath(getStroke(stroke.points.map(p => [p.x, p.y, p.pressure]), {
        size: 8, thinning: 0.62, smoothing: 0.58, streamline: 0.34, simulatePressure: !hasPressure,
        start: { cap: true, taper: 1.5 }, end: { cap: true, taper: 1.5 }, last: true,
      }));
      expect(strokeToSvgPath(stroke)).toBe(expected);
    }
  });
  it("round trips known types, preserves absent legacy types, and rejects future types", async () => {
    let raw = "{}";
    const app = { vault: {
      read: async () => raw,
      process: async (_: unknown, update: (value: string) => string) => { raw = update(raw); },
    } } as unknown as App;
    const file = {} as TFile;
    const strokes = PEN_TYPES.map(type => ({ ...penPreviewStroke(type, 8, "#333333"), id: type, createdAt: 1 }));
    await saveInkData(app, file, { version: 1, strokes, penSettings: { type: "pencil", size: 7 } });
    expect(await loadInkData(app, file)).toEqual({ version: 1, strokes, penSettings: { type: "pencil", size: 7 } });
    raw = JSON.stringify({ canvasScribe: { version: 1, strokes: [{ ...strokes[0], penType: "future" }, { ...strokes[0], penType: undefined }] } });
    const unsupported = raw;
    await expect(loadInkData(app, file)).rejects.toThrow("unsupported ink tool");
    await expect(saveInkData(app, file, { version: 1, strokes: [] })).rejects.toThrow("unsupported ink tool");
    expect(raw).toBe(unsupported);
    raw = JSON.stringify({ canvasScribe: { version: 1, strokes: [{ ...strokes[0], penType: undefined }] } });
    const loaded = await loadInkData(app, file);
    expect(loaded.strokes[0]!.penType).toBeUndefined();
    expect(strokeToSvgPath(loaded.strokes[0]!)).toBe(strokeToSvgPath({ ...strokes[0]!, penType: undefined }));
  });
});
