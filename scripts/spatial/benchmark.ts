import { performance } from "node:perf_hooks";
import { cpus, platform, arch } from "node:os";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { algorithms, createIndex, type Algorithm, type CandidateIndex, type Item } from "./indexes";
import { fixture, queries, scenes, editBatch, type Scene } from "./fixtures";
import { eraseInk, eraserOutline, strokeCandidateBounds } from "../../src/ink-operations";
import type { InkStroke } from "../../src/types";

const arg = (name: string, fallback: string) => process.argv.find(v => v.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;
const quick = process.argv.includes("--quick");
const sizes = arg("sizes", quick ? "100,3000" : "100,1000,3000,10000").split(",").map(Number);
if (sizes.some(n => !Number.isSafeInteger(n) || n < 10 || n > 100000)) throw Error("Sizes must be integers from 10 to 100000");
const passes = quick ? 3 : 5;
const stats = (samples: number[]) => {
  const sorted = [...samples].sort((a, b) => a - b);
  return { medianMs: sorted[Math.floor(sorted.length / 2)]!, p95Ms: sorted[Math.ceil(sorted.length * .95) - 1]!, maxMs: sorted.at(-1)!, samples: sorted.length };
};
function same(actual: readonly Item[], expected: readonly Item[], label: string): void {
  if (actual.length !== expected.length || actual.some((item, i) => item.stroke !== expected[i]!.stroke)) throw Error(`Candidate/order mismatch: ${label}`);
}
function check(index: CandidateIndex, items: readonly Item[], label: string): void {
  const oracle = createIndex("scan"); oracle.load(items);
  for (const q of queries(items, 32)) same(index.search(q.box, q.highlighterOnly), oracle.search(q.box, q.highlighterOnly), label);
}

// Separate child-process mode: document and common bounds are live before the
// baseline. Measure only retained index overhead, not stroke points or cache storage.
if (process.argv.includes("--memory")) {
  if (!global.gc) throw Error("Memory measurement requires --expose-gc");
  const algorithm = arg("algorithm", "scan") as Algorithm, scene = arg("scene", "canvas") as Scene;
  if (!algorithms.includes(algorithm) || !scenes.includes(scene)) throw Error("Invalid memory case");
  const items = fixture(scene, sizes[0]!); items.forEach(i => strokeCandidateBounds(i.stroke));
  const samples: number[] = [];
  const holder: { index: CandidateIndex | null } = { index: null };
  for (let i = 0; i < 3; i++) {
    holder.index = null; global.gc(); const before = process.memoryUsage().heapUsed;
    holder.index = createIndex(algorithm); holder.index.load(items); global.gc();
    samples.push(process.memoryUsage().heapUsed - before);
  }
  console.log(JSON.stringify({ algorithm, scene, strokes: items.length, heapBytes: samples.sort((a, b) => a - b)[1], samplesBytes: samples, stats: holder.index!.stats() }));
} else {
  const results: unknown[] = [];
  let caseNumber = 0, checksum = 0;
  for (const scene of scenes) for (const count of sizes) {
    const items = fixture(scene, count), requests = queries(items, quick ? 128 : 256);
    const oracle = createIndex("scan"); oracle.load(items);
    const expected = requests.map(q => oracle.search(q.box, q.highlighterOnly));
    // Rotate implementation order across cases to reduce systematic order bias.
    const rotation = caseNumber++ % algorithms.length;
    const order = [...algorithms.slice(rotation), ...algorithms.slice(0, rotation)];
    for (const algorithm of order) {
      let index = createIndex(algorithm);
      const builds: number[] = [];
      for (let i = 0; i < passes; i++) { const start = performance.now(); index.load(items); builds.push(performance.now() - start); }
      requests.forEach((q, i) => same(index.search(q.box, q.highlighterOnly), expected[i]!, `${scene}/${count}/${algorithm}`));
      for (let warm = 0; warm < 2; warm++) for (const q of requests) checksum += index.search(q.box, q.highlighterOnly).length;
      const timings = { eraser: [] as number[], empty: [] as number[], lasso: [] as number[], viewport: [] as number[] };
      for (let pass = 0; pass < passes; pass++) for (const q of requests) {
        const start = performance.now(); const found = index.search(q.box, q.highlighterOnly); const elapsed = performance.now() - start;
        timings[q.kind].push(elapsed); checksum += found.length;
      }
      const editTotals: number[] = [], editAndQuery: number[] = [], indexUpdates: number[] = [], undos: number[] = [];
      for (let i = 0; i < passes; i++) {
        index.load(items);
        const start = performance.now(), edit = editBatch(items), updateStart = performance.now();
        index.update(edit.next, edit.removed, edit.added);
        const end = performance.now(); editTotals.push(end - start); indexUpdates.push(end - updateStart);
        checksum += index.search(requests[0]!.box, false).length;
        editAndQuery.push(performance.now() - start); // Include the scan's lazy new-bounds work.
        check(index, edit.next, `${algorithm}/edit`);
        const undoStart = performance.now(); index.update(items, edit.added, edit.removed); undos.push(performance.now() - undoStart);
        check(index, items, `${algorithm}/undo`);
      }
      const cold: number[] = [];
      for (let i = 0; i < 3; i++) {
        // New identities force cold production bounds; cloning/deserialization is excluded.
        const fresh = structuredClone(items); index = createIndex(algorithm);
        const start = performance.now(); index.load(fresh); checksum += index.search(requests[0]!.box, false).length; cold.push(performance.now() - start);
        index = createIndex(algorithm); global.gc?.();
      }
      index.load(items);
      results.push({ scene, strokes: count, algorithm, warmBuild: stats(builds), coldBuildAndFirstQuery: stats(cold), query: Object.fromEntries(Object.entries(timings).map(([kind, list]) => [kind, stats(list)])),
        candidates: Object.fromEntries(Object.keys(timings).map(kind => { const counts = requests.flatMap((q, i) => q.kind === kind ? [expected[i]!.length] : []); return [kind, { mean: counts.reduce((a, b) => a + b, 0) / counts.length, max: Math.max(...counts) }]; })),
        edit5Percent: stats(editTotals), editAndFirstQuery: stats(editAndQuery), indexUpdateOnly: stats(indexUpdates), undoIndexOnly: stats(undos), indexStats: index.stats() });
      console.error(`${scene} / ${count} / ${algorithm}: verified`);
    }
    global.gc?.();
  }

  // Candidate query + real shared clipping + immutable ordered-array reconciliation.
  // Scanning is the unmodified production eraseInk call; indexes do not hide the
  // O(N) document-array reconciliation or per-candidate precise geometry work.
  const eraseResults: unknown[] = [];
  for (const count of [1000, 10000]) {
    const items = fixture("canvas", count), strokes = items.map(i => i.stroke);
    const target = strokes[1]!.points[40]!, region = eraserOutline(target.x, target.y, 18);
    const box = { minX: target.x - 18, minY: target.y - 18, maxX: target.x + 18, maxY: target.y + 18 };
    for (const mode of ["stroke", "area"] as const) {
      const expected = eraseInk(strokes, region, { mode, highlighterOnly: false });
      const geometry = (stroke: InkStroke) => JSON.stringify({ ...stroke, id: undefined });
      const samples = new Map(algorithms.map(name => [name, [] as number[]]));
      const indexes = new Map(algorithms.map(name => [name, createIndex(name)]));
      // Interleave and rotate algorithms after ten warmup rounds so shared geometry
      // JIT warmup cannot systematically favor the last implementation.
      for (let i = 0; i < 25; i++) {
        const rotation = i % algorithms.length;
        for (const algorithm of [...algorithms.slice(rotation), ...algorithms.slice(0, rotation)]) {
          const index = indexes.get(algorithm)!;
          index.load(items);
          const start = performance.now();
          let next: typeof strokes;
          if (algorithm === "scan") next = eraseInk(strokes, region, { mode, highlighterOnly: false }).strokes;
          else {
            const candidates = index.search(box), replacements = new Map<InkStroke, InkStroke[]>();
            for (const item of candidates) { const result = eraseInk([item.stroke], region, { mode, highlighterOnly: false }); if (result.changed) replacements.set(item.stroke, result.strokes); }
            next = strokes.flatMap(stroke => replacements.get(stroke) ?? [stroke]);
            const removed = candidates.filter(item => replacements.has(item.stroke));
            const added = removed.flatMap(item => replacements.get(item.stroke)!.map((stroke, j): Item => ({ stroke, order: item.order + j / (replacements.get(item.stroke)!.length + 1) })));
            index.update([], removed, added);
          }
          const elapsed = performance.now() - start;
          if (i >= 10) samples.get(algorithm)!.push(elapsed);
          if (next.length !== expected.strokes.length || next.some((stroke, j) => stroke !== expected.strokes[j] && geometry(stroke) !== geometry(expected.strokes[j]!))) throw Error(`Erase geometry mismatch ${algorithm}/${mode}`);
          checksum += next.length;
        }
      }
      for (const algorithm of algorithms) eraseResults.push({ algorithm, strokes: count, mode, pipeline: stats(samples.get(algorithm)!) });
    }
  }
  const out = arg("out", "dist/spatial-comparison/results.json"); mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, JSON.stringify({ metadata: { timestamp: new Date().toISOString(), node: process.version, platform: platform(), arch: arch(), cpu: cpus()[0]?.model, rbush: "4.0.1", passes, queryWarmups: 2, sizes, seed: 91, units: "milliseconds", baseline: "5ef5044", quick }, results, eraseResults, checksum }, null, 2) + "\n");
  console.log(out);
}
