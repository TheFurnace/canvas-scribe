// @vitest-environment happy-dom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { App } from "obsidian";
import { CanvasInkLayer } from "../src/canvas-ink-layer";
import type { CanvasTarget } from "../src/canvas-target";
import { HandwrittenNoteEditor } from "../src/handwritten-note-editor";
import { createHandwrittenNote, serializeHandwrittenNote } from "../src/handwritten-note";
import { DebugLogger } from "../src/debug-logger";
import { InkLatencyExperiment } from "../src/ink-latency";
import { InkToolState } from "../src/ink-tool-state";
import { FavoritePens } from "../src/favorite-pens";
import { strokeToSvgPath } from "../src/geometry";
import type { InkStroke } from "../src/types";

let now = 100, frameId = 0;
const frames = new Map<number, FrameRequestCallback>();
let cleanup = () => {};
beforeEach(() => {
  now = 100;
  vi.spyOn(window.performance, "now").mockImplementation(() => now);
  vi.spyOn(window, "requestAnimationFrame").mockImplementation(fn => { frames.set(++frameId, fn); return frameId; });
  vi.spyOn(window, "cancelAnimationFrame").mockImplementation(id => { frames.delete(id); });
});
afterEach(() => { cleanup(); frames.clear(); vi.restoreAllMocks(); document.body.replaceChildren(); });
function frame() { const pending = [...frames.values()]; frames.clear(); pending.forEach(fn => fn(now)); }
function pointer(target: Element, type: string, x: number, time: number) {
  now = time;
  const e = new PointerEvent(type, { bubbles: true, cancelable: true, pointerId: 1, pointerType: "pen", button: 0,
    buttons: type === "pointerup" ? 0 : 1, clientX: x, clientY: 100, pressure: .7, tiltX: 25 });
  Object.defineProperty(e, "timeStamp", { value: time }); target.dispatchEvent(e);
}
async function setup(surface: "canvas" | "note", prediction = true) {
  const logger = new DebugLogger(), experiment = new InkLatencyExperiment(logger);
  experiment.horizonMs = prediction ? 16 : 0; experiment.diagnostics = true;
  const tools = new InkToolState();
  let target: HTMLElement, strokes: () => InkStroke[], undo: () => void, redo: () => void, save: () => string;
  if (surface === "note") {
    const note = createHandwrittenNote();
    const editor = new HandwrittenNoteEditor(document, note, () => {}, () => {}, false, new FavoritePens(), document.body, tools, experiment);
    document.body.append(editor.root); target = editor.root.querySelector<HTMLElement>(".canvas-scribe-note-viewport")!;
    strokes = () => note.objects.filter(o => o.kind === "ink") as InkStroke[];
    undo = () => editor.undo(); redo = () => editor.redo(); save = () => serializeHandwrittenNote(editor.getDocument()); cleanup = () => editor.destroy();
  } else {
    const container = document.createElement("div"); container.innerHTML = '<div class="canvas-wrapper"><div class="canvas"></div></div><div class="canvas-controls"></div>';
    document.body.append(container); target = container.querySelector<HTMLElement>(".canvas-wrapper")!;
    const app = { vault: { read: async () => "{}", process: async (_: unknown, update: (s: string) => string) => update("{}") } } as unknown as App;
    const layer = new CanvasInkLayer(app, { containerEl: container, file: { path: "test.canvas" }, view: {}, leaf: {} } as unknown as CanvasTarget, logger, new FavoritePens(), tools, experiment);
    await layer.mount();
    Object.defineProperty(container.querySelector(".canvas-scribe-render-layer"), "getScreenCTM", { value: () => ({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0, inverse() { return this; } }) });
    const state = layer as unknown as { data: { strokes: InkStroke[] } };
    strokes = () => state.data.strokes; undo = () => layer.undo(); redo = () => layer.redo(); save = () => JSON.stringify(state.data); cleanup = () => layer.dispose();
  }
  const captured = new Set<number>();
  target.setPointerCapture = id => { captured.add(id); }; target.hasPointerCapture = id => captured.has(id);
  target.releasePointerCapture = id => { captured.delete(id); target.dispatchEvent(new PointerEvent("lostpointercapture", { bubbles: true, pointerId: id, pointerType: "pen" })); };
  frame();
  const path = () => document.querySelector<SVGPathElement>(surface === "note" ? '.canvas-scribe-note-page path' : 'path.canvas-scribe-stroke')!;
  return { target, strokes, undo, redo, save, path, logger, experiment, tools };
}

it.each(["canvas", "note"] as const)("%s shows a predicted tip but finalizes and serializes only actual ink", async surface => {
  const f = await setup(surface);
  pointer(f.target, "pointerdown", 100, 100); pointer(f.target, "pointermove", 110, 110); pointer(f.target, "pointermove", 120, 120);
  frame(); const stroke = f.strokes()[0]!;
  expect(stroke.points.map(p => p.x)).toEqual([100, 110, 120]);
  expect(f.path().getAttribute("d")).not.toBe(strokeToSvgPath(stroke, false));
  const savedDuringPreview = JSON.parse(f.save()) as { strokes?: InkStroke[]; objects?: InkStroke[] };
  expect((savedDuringPreview.strokes ?? savedDuringPreview.objects)![0]!.points.map(p => p.x)).toEqual([100, 110, 120]);
  pointer(f.target, "pointerup", 120, 125); frame();
  expect(f.path().getAttribute("d")).toBe(strokeToSvgPath(stroke, true));
  expect(stroke.points.map(p => p.x)).toEqual([100, 110, 120]);
  f.undo(); expect(f.strokes()).toHaveLength(0); f.redo(); expect(f.strokes()).toHaveLength(1);
  expect(f.path().getAttribute("d")).toBe(strokeToSvgPath(stroke, true));
  expect(f.logger.snapshot().entries.filter(e => e.category === "ink-latency")).toHaveLength(1);
});

it.each(["canvas", "note"] as const)("%s leaves baseline geometry identical with only diagnostics enabled", async surface => {
  const f = await setup(surface, false);
  pointer(f.target, "pointerdown", 100, 100); pointer(f.target, "pointermove", 110, 110); pointer(f.target, "pointermove", 120, 120); frame();
  expect(f.path().getAttribute("d")).toBe(strokeToSvgPath(f.strokes()[0]!, false));
  pointer(f.target, "pointerup", 120, 125);
  expect(f.logger.snapshot().entries.find(e => e.category === "ink-latency")!.data!.prediction).toBe(false);
});

it.each(["canvas", "note"] as const)("%s finalizes actual geometry when capture is lost", async surface => {
  const f = await setup(surface);
  pointer(f.target, "pointerdown", 100, 100); pointer(f.target, "pointermove", 110, 110); pointer(f.target, "pointermove", 120, 120); frame();
  f.target.releasePointerCapture(1); frame();
  expect(f.path().getAttribute("d")).toBe(strokeToSvgPath(f.strokes()[0]!, true));
  expect(f.logger.snapshot().entries.filter(e => e.category === "ink-latency")).toHaveLength(1);
});

it.each(["canvas", "note"] as const)("%s clears pending prediction on undo mid-stroke", async surface => {
  const f = await setup(surface);
  pointer(f.target, "pointerdown", 100, 100); pointer(f.target, "pointermove", 110, 110); pointer(f.target, "pointermove", 120, 120);
  f.undo(); frame(); expect(f.strokes()).toHaveLength(0);
  pointer(f.target, "pointermove", 140, 140); frame(); expect(f.strokes()).toHaveLength(0);
});

it.each([
  ["canvas", 24], ["canvas", 32], ["note", 24], ["note", 32],
] as const)("%s preserves real ink with the %i ms mode and snapshots mode until lift", async (surface, horizon) => {
  const f = await setup(surface); f.experiment.horizonMs = horizon;
  pointer(f.target, "pointerdown", 100, 100); pointer(f.target, "pointermove", 105, 110); pointer(f.target, "pointermove", 110, 120);
  frame(); const stroke = f.strokes()[0]!;
  expect(f.path().getAttribute("d")).not.toBe(strokeToSvgPath(stroke, false));
  f.experiment.horizonMs = 0; // applies only to the next gesture
  pointer(f.target, "pointerup", 110, 125); frame();
  expect(f.path().getAttribute("d")).toBe(strokeToSvgPath(stroke, true));
  expect(stroke.points.map(p => p.x)).toEqual([100, 105, 110]);
  const entry = f.logger.snapshot().entries.find(e => e.category === "ink-latency")!;
  expect(entry.data).toMatchObject({ horizonMs: horizon, predictionDistanceMeanCssPx: horizon * .5, predictionHorizonMeanMs: horizon });
  f.undo(); expect(f.strokes()).toHaveLength(0); f.redo(); expect(f.strokes()[0]!.points).toEqual(stroke.points);
});
