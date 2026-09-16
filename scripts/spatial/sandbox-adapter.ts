// Imported only by the explicit sandbox experiment build, never by src/main.ts.
import { eraseInk } from "../../src/ink-operations";
import type { InkStroke } from "../../src/types";
import { createIndex, type Algorithm, type Item } from "./indexes";

type Args = Parameters<typeof eraseInk>;
let algorithm: Algorithm = "scan";
let index = createIndex(algorithm);
let current: readonly InkStroke[] | null = null;
let items: Item[] = [];
let samples: { ms: number; candidates: number; changed: boolean; rebuilt: boolean }[] = [];
let checks: { before: readonly InkStroke[]; region: Args[1]; options: Args[2]; after: InkStroke[] }[] = [];

function load(strokes: readonly InkStroke[]) {
  items = strokes.map((stroke, order) => ({ stroke, order }));
  index.load(items); current = strokes;
}
const api = {
  configure(name: Algorithm, strokes: readonly InkStroke[], warm = true) {
    algorithm = name; index = createIndex(name); current = null; samples = []; checks = [];
    const start = performance.now();
    if (warm && name !== "scan") load(strokes);
    return { buildMs: performance.now() - start };
  },
  get samples() { return samples; },
  verify() {
    const canonical = ({ id: _id, ...stroke }: InkStroke) => JSON.stringify(stroke);
    for (const check of checks) {
      const expected = eraseInk(check.before, check.region, check.options);
      if (expected.strokes.length !== check.after.length || expected.strokes.some((stroke, i) => stroke !== check.after[i] && canonical(stroke) !== canonical(check.after[i]!))) throw Error("Sandbox eraser geometry differs from current system");
    }
    const count = checks.length; checks = []; return count;
  },
};
Object.assign(globalThis, { __scribeSpatial: api });

export function sandboxErase(...[strokes, region, options]: Args): ReturnType<typeof eraseInk> {
  const start = performance.now();
  let result: ReturnType<typeof eraseInk>, candidates = strokes.length, rebuilt = false;
  if (algorithm === "scan") result = eraseInk(strokes, region, options);
  else {
    if (current !== strokes) { load(strokes); rebuilt = true; }
    const points = region.flat(2);
    const box = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
    for (const [x, y] of points) { box.minX = Math.min(box.minX, x!); box.minY = Math.min(box.minY, y!); box.maxX = Math.max(box.maxX, x!); box.maxY = Math.max(box.maxY, y!); }
    const found = index.search(box, options.highlighterOnly); candidates = found.length;
    const replacements = new Map<InkStroke, InkStroke[]>();
    for (const item of found) { const cut = eraseInk([item.stroke], region, options); if (cut.changed) replacements.set(item.stroke, cut.strokes); }
    if (!replacements.size) result = { strokes: strokes as InkStroke[], changed: false };
    else {
      const removed = found.filter(item => replacements.has(item.stroke));
      const next = strokes.flatMap(stroke => replacements.get(stroke) ?? [stroke]);
      const oldItems = new Map(items.map(item => [item.stroke, item]));
      const added: Item[] = [];
      items = next.map((stroke, order) => {
        const item = oldItems.get(stroke);
        if (item) { item.order = order; return item; }
        const fresh = { stroke, order }; added.push(fresh); return fresh;
      });
      index.update([], removed, added); current = next;
      result = { strokes: next, changed: true };
    }
  }
  const ms = performance.now() - start;
  samples.push({ ms, candidates, changed: result.changed, rebuilt });
  checks.push({ before: strokes, region, options, after: result.strokes });
  return result;
}
