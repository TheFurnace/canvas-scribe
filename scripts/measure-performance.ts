import { performance } from "node:perf_hooks";
import { DocumentHistory } from "../src/document-history";
import { strokeToSvgPath } from "../src/geometry";
import { clipPdfInk } from "../src/pdf-document";
import { snapshotHandwrittenObjects, type HandwrittenInkObject } from "../src/handwritten-note";

// Bundle with esbuild --bundle --platform=node --format=esm; run with node --expose-gc.
// These measure source operations, not browser paint, vault I/O or device latency.
function fixture(n: number): (HandwrittenInkObject & { page: number })[] {
  return Array.from({ length: n }, (_, j) => ({ kind: "ink", id: `s${j}`, page: 0, tool: "pen", penType: "fountain", color: "#111111", size: 3.5,
    opacity: 1, createdAt: 1, hasPressure: true, points: Array.from({ length: 80 }, (_, i) => ({ x: 30 + (j % 3) * 170 + i * 1.5, y: 30 + (j % 20) * 30 + Math.sin(i / 8) * 8, pressure: .2 + (i % 10) / 15, time: i })) }));
}
function measure(operation: string, strokes: number, run: () => unknown): void {
  const samples: number[] = [];
  for (let i = 0; i < 9; i++) { const start = performance.now(); run(); if (i > 1) samples.push(performance.now() - start); }
  samples.sort((a, b) => a - b);
  console.log(JSON.stringify({ operation, strokes, medianMs: samples[3], minMs: samples[0], maxMs: samples[6] }));
}
console.log(JSON.stringify({ node: process.version, platform: process.platform, method: "2 warmups, 7 samples; source operations only" }));
for (const n of [100, 500, 3000]) {
  const before = fixture(n), added = { ...fixture(1)[0]!, id: "added" }, working = [...before, added];
  measure("one live SVG path", n, () => strokeToSvgPath(added, false));
  // The layer preserves old identities and clips only changed values at pen-up.
  measure("PDF changed-only pen-up geometry and identity comparison", n, () => {
    const previous = new Set(before);
    const next = working.flatMap(s => { const clipped = previous.has(s) ? s : clipPdfInk(s, { box: [0, 0, 612, 792], rotation: 0 }); return clipped ? [clipped] : []; });
    return next.length !== before.length || next.some((s, i) => s !== before[i]);
  });
  measure("shared ink history snapshot", n, () => snapshotHandwrittenObjects(before));
}
for (const n of [500, 3000]) {
  const strokes = fixture(n); global.gc?.(); const baseline = process.memoryUsage().heapUsed;
  const history = new DocumentHistory(snapshotHandwrittenObjects, 100);
  const start = performance.now(); for (let i = 0; i < 100; i++) history.checkpoint(strokes);
  const totalMs = performance.now() - start; global.gc?.();
  console.log(JSON.stringify({ operation: "100 retained shared snapshots", strokes: n, heapDeltaMiB: (process.memoryUsage().heapUsed - baseline) / 1048576, totalMs, snapshots: history.past.length }));
  history.past = [];
}
