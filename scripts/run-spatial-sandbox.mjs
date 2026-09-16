import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const name = process.argv[2];
if (!name || !/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(name)) throw Error("Supply a disposable sandbox name");
const quick = process.argv.includes("--quick");
const out = resolve(".canvas-scribe-sandbox/artifacts", name, "spatial");
mkdirSync(out, { recursive: true });
function agent(command, args = []) {
  const result = spawnSync(process.execPath, ["scripts/sandbox-agent.mjs", command, "--name", name, ...args], { encoding: "utf8", windowsHide: true, maxBuffer: 8e6 });
  if (result.status !== 0) throw Error(result.stderr || result.stdout);
  return JSON.parse(result.stdout);
}
function evaluate(fn, args = []) {
  const file = resolve(out, "eval.js"); writeFileSync(file, `(${fn.toString()})(...${JSON.stringify(args)})`);
  return agent("eval", ["--file", file]);
}
// Deliberately seed model data outside timing. Erasing itself is trusted CDP pen input.
async function prepare(algorithm, count, scenario, warm) {
  const plugin = app.plugins.plugins["canvas-scribe"];
  if (!globalThis.__scribeSpatial || !plugin) throw Error("Load the experimental sandbox build first");
  const layer = [...plugin.layers.values()][0];
  if (!layer || !layer.loaded || layer.activePointerId !== null) throw Error("Canvas not idle/ready");
  for (const node of [...layer.target.view.canvas.nodes.values()]) layer.target.view.canvas.removeNode(node);
  if (!layer.__spatialInstrumented) {
    for (const method of ["eraseSamples", "renderAll", "beginGesture", "finishGesture"]) {
      const original = layer[method];
      if (typeof original !== "function") throw Error(`Missing ${method}`);
      layer[method] = function (...args) {
        const start = performance.now();
        try { return original.apply(this, args); }
        finally { globalThis.__hostSamples?.push({ method, ms: performance.now() - start, trusted: args[0]?.isTrusted ?? null }); }
      };
    }
    layer.__spatialInstrumented = true;
  }
  const transform = layer.readCanvasTransform();
  const point = (x, y, i) => { const p = new DOMPoint(x, y).matrixTransform(transform.screenToCanvas); return { x: p.x, y: p.y, pressure: .5, time: i }; };
  const strokes = Array.from({ length: count }, (_, j) => ({
    id: `fixture-${j}`, tool: j < 2 ? "highlighter" : "pen", ...(j < 2 ? { highlighterType: j === 0 ? "round" : "chisel" } : { penType: "fountain" }),
    color: j < 2 ? "#fde047" : "#222222", size: (j < 2 ? 30 : 3.5) / transform.screenScale,
    opacity: j < 2 ? .38 : 1, hasPressure: true, createdAt: 1,
    points: Array.from({ length: j < 2 ? 1000 : 80 }, (_, i) => j < 2
      ? point(460 + i * .4, (j === 0 ? 400 : 540) + Math.sin(i / 40) * 5, i)
      : point(6000 + (j % 30) * 150 + i, 6000 + Math.floor(j / 30) * 30 + Math.sin(i / 8) * 5, i)),
  }));
  layer.data = { version: 2, strokes };
  layer.history.past = []; layer.history.future = []; layer.selectedStrokeIds.clear();
  layer.previousErasePoint = null;
  layer.sharedTools.eraserSettings = { mode: scenario.startsWith("area") ? "area" : "stroke", radius: 18, highlighterOnly: false };
  layer.setTool("eraser"); layer.renderAll(); layer.scheduleSave();
  await layer.saveNow();
  const build = globalThis.__scribeSpatial.configure(algorithm, strokes, warm);
  globalThis.__before = strokes;
  globalThis.__untouchedPath = layer.svgEl.querySelector('[data-stroke-id="fixture-1"]');
  globalThis.__hostSamples = [];
  await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  return { ...build, screenScale: transform.screenScale, paths: layer.svgEl.querySelectorAll("path.canvas-scribe-stroke").length };
}
async function collect(scenario) {
  const layer = [...app.plugins.plugins["canvas-scribe"].layers.values()][0];
  const result = { samples: [...__scribeSpatial.samples], host: [...__hostSamples], before: __before.length, after: layer.data.strokes.length,
    retainedPath: layer.svgEl.querySelector('[data-stroke-id="fixture-1"]') === __untouchedPath };
  if (!result.host.some(s => s.method === "eraseSamples" && s.trusted)) throw Error("No trusted eraser input reached Canvas");
  if (scenario !== "empty" && !result.samples.some(s => s.changed)) throw Error("Eraser did not hit target");
  if (scenario === "empty" && result.samples.some(s => s.changed)) throw Error("Empty-space gesture changed ink");
  result.verifiedCalls = __scribeSpatial.verify();
  const after = layer.data.strokes;
  if (scenario !== "empty") {
    layer.undo(); result.undo = layer.data.strokes.length;
    if (layer.data.strokes.length !== __before.length || layer.data.strokes.some((s, i) => s !== __before[i])) throw Error("Undo differs");
    layer.redo(); result.redo = layer.data.strokes.length;
    if (layer.data.strokes.length !== after.length || layer.data.strokes.some((s, i) => s !== after[i])) throw Error("Redo differs");
  }
  await layer.saveNow();
  const saved = JSON.parse(await app.vault.read(layer.target.file)).canvasScribe.strokes;
  if (JSON.stringify(saved) !== JSON.stringify(after)) throw Error("Saved geometry differs");
  result.saved = saved.length;
  return result;
}

const inspection = agent("inspect");
if (!inspection.pluginLoaded || inspection.dialogs.length) throw Error("Inspect/trust the sandbox first");
if (inspection.viewport.width !== 1024 || inspection.viewport.height !== 800) throw Error("Use the default 1024 x 800 sandbox viewport for this recorded gesture");
const results = [];
const algorithms = ["scan", "rbush", "grid-256"];
if (process.argv.includes("--lifecycle")) {
  const path = resolve(out, "gesture.json");
  writeFileSync(path, JSON.stringify({ intervalMs: 8, points: Array.from({ length: 13 }, (_, i) => ({ x: 650, y: 370 + i * 5, pressure: .5 })) }));
  for (const algorithm of algorithms) {
    const setup = evaluate(prepare, [algorithm, 10000, "stroke-round", false]);
    agent("stroke", ["--file", path]);
    results.push({ algorithm, phase: "cold-first-gesture", setup, ...evaluate(collect, ["stroke-round"]) });
    evaluate(() => {
      const layer = [...app.plugins.plugins["canvas-scribe"].layers.values()][0];
      layer.undo(); globalThis.__before = layer.data.strokes;
      __scribeSpatial.samples.length = 0; globalThis.__hostSamples = [];
      return true;
    });
    agent("stroke", ["--file", path]);
    results.push({ algorithm, phase: "erase-after-undo", ...evaluate(collect, ["stroke-round"]) });
    console.log(`${algorithm}: cold load and erase-after-undo verified`);
  }
  writeFileSync(resolve(out, "lifecycle.json"), JSON.stringify({ timestamp: new Date().toISOString(), results }, null, 2));
} else {
for (const count of quick ? [3000] : [3000, 10000]) for (const scenario of ["empty", "stroke-round", "area-round"]) {
  for (let round = 0; round < (quick ? 1 : 4); round++) {
    // First round warms the common host/geometry code; keep its results labelled.
    for (const algorithm of [...algorithms.slice(round % 3), ...algorithms.slice(0, round % 3)]) {
      const setup = evaluate(prepare, [algorithm, count, scenario, true]);
      const path = resolve(out, "gesture.json");
      writeFileSync(path, JSON.stringify({ intervalMs: 8, points: Array.from({ length: 13 }, (_, i) => ({ x: 650, y: (scenario === "empty" ? 620 : 370) + i * 5, pressure: .5 })) }));
      agent("stroke", ["--file", path]);
      const result = { algorithm, count, scenario, round, warmup: round === 0, setup, ...evaluate(collect, [scenario]) };
      results.push(result);
      writeFileSync(resolve(out, "results.json"), JSON.stringify({ timestamp: new Date().toISOString(), inspection, method: "Trusted CDP pen input; 8ms requested interval; first round labelled warmup; lookup prepared before gesture; geometry/undo/redo/save checked after timing", results }, null, 2));
      console.log(`${count}/${scenario}/${round}/${algorithm}: ${result.before} -> ${result.after}, verified ${result.verifiedCalls} calls`);
    }
  }
}
console.log(resolve(out, "results.json"));
}
