import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
const folder = resolve(process.argv[2]);
const data = JSON.parse(readFileSync(resolve(folder, "results.json"), "utf8"));
const median = values => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
const sum = values => values.reduce((a, b) => a + b, 0);
const fixed = n => n == null ? "—" : n.toFixed(2);
const rows = [];
for (const count of [...new Set(data.results.map(r => r.count))]) for (const scenario of [...new Set(data.results.map(r => r.scenario))]) {
  for (const algorithm of ["scan", "rbush", "grid-256"]) {
    const runs = data.results.filter(r => r.count === count && r.scenario === scenario && r.algorithm === algorithm && !r.warmup);
    if (!runs.length) continue;
    const handlers = r => r.host.filter(s => s.method === "eraseSamples").map(s => s.ms);
    const total = median(runs.map(r => sum(handlers(r))));
    const peak = median(runs.map(r => Math.max(...handlers(r))));
    const first = median(runs.map(r => r.samples.find(s => s.changed)?.ms).filter(x => x != null));
    const build = median(runs.map(r => r.setup.buildMs));
    rows.push(`| ${count} | ${scenario} | ${algorithm} | ${runs.length} | ${fixed(total)} | ${fixed(peak)} | ${fixed(first)} | ${fixed(build)} |`);
  }
}
const report = `# Real Obsidian spatial comparison

${data.inspection.title}. Viewport ${data.inspection.viewport.width} × ${data.inspection.viewport.height}. Recorded ${data.timestamp}.

Three measured gestures per case after one labelled warmup; algorithm order rotates.
Each gesture has 13 trusted CDP contact samples plus release, at a requested 8 ms interval.
The Canvas interpolates these into 25 eraser operations. Fixtures have two visible
1,000-point highlighters and remaining remote 80-point fountain strokes. Every run
uses fresh stroke objects. Index preparation happens before input and is reported
separately. Bounds and geometry caches may warm during preparation/rendering.

All times below are **milliseconds**, and each cell is the median across gestures.
Handler total sums only eraseSamples calls (including synchronous DOM updates),
not nested beginGesture/renderAll timings. Peak is the median of each gesture's
slowest eraseSamples call. First hit is the first geometry-changing erase operation.
These are CPU costs, not hardware-to-display latency, frame presentation or p95.

| Strokes | Scenario | Algorithm | Gestures | Handler total | Peak handler | First hit operation | Prepare index |
| --- | --- | --- | ---: | ---: | ---: | ---: | ---: |
${rows.join("\n")}

## Correctness

${data.results.length} gestures including warmups completed. Every eraser operation
was checked against production eraseInk after timing, ignoring only newly generated
fragment IDs. Changed gestures checked undo and redo object identity. Every run
compared the complete saved geometry with the live result. Untouched chisel SVG
path retained in all runs: ${data.results.every(r => r.retainedPath)}.

The adapter changes only candidate lookup in an explicit sandbox build. Indexed
edits still reconcile the document array, restore integer ordering and update the
index. Array replacements trigger a conservative rebuild on next use. This is an
experimental Canvas adapter, not production integration across all document edits
or surfaces. No physical Galaxy/S Pen acceptance is implied.
`;
writeFileSync(resolve(folder, "report.md"), report);
console.log(report);
