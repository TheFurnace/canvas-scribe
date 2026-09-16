import { performance } from "node:perf_hooks";
import { eraseInk, eraserOutline } from "../src/ink-operations";
import type { InkStroke } from "../src/types";

for (const type of ["round", "chisel"] as const) for (const count of [200, 1000]) {
  const stroke: InkStroke = { id: "hit", tool: "highlighter", highlighterType: type, size: 30, opacity: .38, color: "#fde047", hasPressure: false, createdAt: 1,
    points: Array.from({ length: count }, (_, i) => ({ x: i * .7, y: Math.sin(i / 15) * 3, pressure: .5, time: i })) };
  const region = eraserOutline(count * .35, 0, 12);
  const samples: number[] = [];
  for (let run = 0; run < 5; run++) {
    const start = performance.now();
    const result = eraseInk([stroke], region, { mode: "stroke", highlighterOnly: false, tolerance: .1 });
    if (result.strokes.length) throw Error("Expected highlighter to be deleted");
    if (run) samples.push(performance.now() - start);
  }
  samples.sort((a, b) => a - b);
  console.log(JSON.stringify({ type, points: count, medianMs: (samples[1]! + samples[2]!) / 2, samples, node: process.version }));
}
