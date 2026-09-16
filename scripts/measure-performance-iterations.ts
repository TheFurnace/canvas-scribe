import { performance } from "node:perf_hooks";
import { createHandwrittenNote, normalizeContentHeight, type HandwrittenInkObject } from "../src/handwritten-note";
import { boundsForStrokes, selectRenderedStroke } from "../src/selection";
import { eraseInk, eraserOutline } from "../src/ink-operations";

function fixture(count: number, highlighter = false): HandwrittenInkObject[] {
  return Array.from({ length: count }, (_, j) => ({ kind: "ink", id: `s${j}`, tool: highlighter ? "highlighter" : "pen", penType: "fountain", highlighterType: "round", color: "#111", size: highlighter ? 30 : 3.5,
    opacity: .38, createdAt: 1, hasPressure: true, points: Array.from({ length: highlighter ? 1000 : 80 }, (_, i) => ({ x: 30 + (j % 3) * 170 + i * .7, y: 30 + j * 30 + Math.sin(i / 8) * 8, pressure: .2 + (i % 10) / 15, time: i })) }));
}
function measure(operation: string, strokes: number, run: () => unknown): void {
  const samples: number[] = [];
  for (let i = 0; i < 4; i++) { const start = performance.now(); run(); if (i) samples.push(performance.now() - start); }
  samples.sort((a, b) => a - b);
  console.log(JSON.stringify({ operation, strokes, medianMs: samples[1], samples }));
}
console.log(JSON.stringify({ node: process.version, platform: process.platform, method: "one warmup, three samples; source operations only" }));
for (const n of [500, 3000]) {
  const strokes = fixture(n), note = { ...createHandwrittenNote(), objects: strokes };
  measure("note content sizing", n, () => normalizeContentHeight(note));
  measure("selected ink bounds", n, () => boundsForStrokes(strokes));
  const remote = eraserOutline(-100, -100, 12);
  measure("20 remote eraser samples", n, () => { for (let i = 0; i < 20; i++) eraseInk(strokes, remote, { mode: "stroke", highlighterOnly: false }); });
}
const highlighters = fixture(1, true);
measure("1000-point highlighter bounds", 1, () => boundsForStrokes(highlighters));
const remoteLasso = [{ x: -100, y: -100 }, { x: -80, y: -100 }, { x: -80, y: -80 }, { x: -100, y: -80 }];
measure("remote highlighter lasso", 1, () => selectRenderedStroke(highlighters[0]!, remoteLasso, true));
