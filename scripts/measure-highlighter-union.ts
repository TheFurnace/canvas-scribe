import { performance } from "node:perf_hooks";
import polygonClipping from "polygon-clipping";
import { strokeComponents, strokeOutline, eraserOutline, eraseInk } from "../src/ink-operations";
import type { InkStroke } from "../src/types";

// Compare the original one-shot union with the current source on identical inputs.
for (const type of ["round", "chisel"] as const) for (const spacing of [.7, 20]) {
  const stroke: InkStroke = { id: "h", tool: "highlighter", highlighterType: type, size: 30, color: "#ff0", opacity: .38, hasPressure: false, createdAt: 1,
    points: Array.from({ length: 1000 }, (_, i) => ({ x: i * spacing, y: Math.sin(i / 8) * 8, pressure: .5, time: i })) };
  const region = eraserOutline(500 * spacing, 0, 24);
  for (const method of ["original union and cut", "bounded union and cut", "current eraseInk"] as const) {
    const samples: number[] = [];
    for (let i = 0; i < 4; i++) {
      const start = performance.now();
      if (method === "current eraseInk") eraseInk([stroke], region, { mode: "area", highlighterOnly: false });
      else polygonClipping.difference(method === "original union and cut" ? polygonClipping.union(strokeComponents(stroke)) : strokeOutline(stroke), region);
      if (i) samples.push(performance.now() - start);
    }
    samples.sort((a, b) => a - b);
    console.log(JSON.stringify({ type, spacing, method, medianMs: samples[1], samples, node: process.version }));
  }
}
