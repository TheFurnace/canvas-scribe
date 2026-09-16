import { expect, it } from "vitest";
import { sandboxErase } from "../scripts/spatial/sandbox-adapter";
import { eraserOutline } from "../src/ink-operations";
import type { InkStroke } from "../src/types";
import type { Algorithm } from "../scripts/spatial/indexes";

const api = (globalThis as unknown as { __scribeSpatial: {
  configure(name: Algorithm, strokes: readonly InkStroke[], warm?: boolean): unknown;
  verify(): number;
  samples: { rebuilt: boolean }[];
} }).__scribeSpatial;

it.each(["scan", "rbush", "grid-256"] as const)("%s sandbox adapter preserves repeated cuts, order and history replacements", algorithm => {
  const original: InkStroke[] = [0, 8, 16, 1000].map((y, i) => ({ id: `s${i}`, tool: i === 1 ? "highlighter" : "pen", size: 4, opacity: 1, color: "#000", hasPressure: false, createdAt: 1,
    points: [{ x: 0, y, pressure: .5, time: 1 }, { x: 100, y, pressure: .5, time: 2 }],
    outline: [[[[0, y - 2], [100, y - 2], [100, y + 2], [0, y + 2], [0, y - 2]]]],
  }));
  api.configure(algorithm, original);
  const options = { mode: "area" as const, highlighterOnly: false };
  const first = sandboxErase(original, eraserOutline(25, 8, 15), options);
  expect(first.changed).toBe(true); expect(first.strokes.length).toBeGreaterThan(original.length);
  const second = sandboxErase(first.strokes, eraserOutline(65, 8, 15), options);
  expect(second.changed).toBe(true); expect(second.strokes[second.strokes.length - 1]).toBe(original[original.length - 1]);
  expect(api.verify()).toBe(2);
  // Undo swaps back to the original array; external reload creates new objects.
  sandboxErase(original, eraserOutline(25, 8, 15), options);
  if (algorithm !== "scan") expect(api.samples[api.samples.length - 1]!.rebuilt).toBe(true);
  const reload = structuredClone(second.strokes);
  const filtered = sandboxErase(reload, eraserOutline(80, 8, 15), { mode: "stroke", highlighterOnly: true });
  expect(filtered.strokes.filter(s => s.tool === "pen")).toEqual(reload.filter(s => s.tool === "pen"));
  expect(api.verify()).toBe(2);
});
