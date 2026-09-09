import { performance } from "node:perf_hooks";
import { cloneStrokes, type InkStroke } from "../src/types";
import { strokeToSvgPath } from "../src/geometry";
import { eraseInk, eraserOutline } from "../src/ink-operations";

const strokes: InkStroke[] = Array.from({ length: 300 }, (_, index) => ({
  id: `bench-${index}`, tool: "pen", penType: "fountain", color: "#111111", size: 3.5,
  opacity: 1, createdAt: 1, hasPressure: true,
  points: Array.from({ length: 80 }, (_, i) => ({ x: (index % 10) * 200 + i * 2, y: Math.floor(index / 10) * 40 + Math.sin(i / 8) * 8, pressure: 0.2 + (i % 10) / 15, time: i })),
}));
function measure(name: string, run: () => unknown) {
  const samples: number[] = [];
  for (let i = 0; i < 4; i++) { const start = performance.now(); run(); const ms = performance.now() - start; if (i) samples.push(ms); }
  console.log(JSON.stringify({ operation: name, strokes: strokes.length, points: 24000, medianMs: samples.sort((a, b) => a - b)[1], samples }));
}
measure("SVG path generation (no DOM)", () => strokes.map((s) => strokeToSvgPath(s)));
measure("History snapshot", () => cloneStrokes(strokes));
measure("Area erase one footprint", () => eraseInk(strokes, eraserOutline(50, 0, 18), { mode: "area", highlighterOnly: false }));
