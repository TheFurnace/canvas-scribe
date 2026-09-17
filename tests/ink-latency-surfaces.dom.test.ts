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
afterEach(() => { cleanup(); frames.clear(); vi.restoreAllMocks(); vi.useRealTimers(); delete (navigator as unknown as { ink?: unknown }).ink; document.body.replaceChildren(); });
function frame() { const pending = [...frames.values()]; frames.clear(); pending.forEach(fn => fn(now)); }
function pointer(target: Element, type: string, x: number, time: number, trusted = false) {
  now = time;
  const e = new PointerEvent(type, { bubbles: true, cancelable: true, pointerId: 1, pointerType: "pen", button: 0,
    buttons: type === "pointerup" ? 0 : 1, clientX: x, clientY: 100, pressure: .7, tiltX: 25 });
  Object.defineProperty(e, "timeStamp", { value: time });
  if (trusted) Object.defineProperty(e, "isTrusted", { value: true });
  target.dispatchEvent(e); return e;
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

it.each(["canvas", "note"] as const)("%s delegates accepted actual ink while preserving geometry, save and history", async surface => {
  const update = vi.fn();
  const request = vi.fn(async () => ({ updateInkTrailStartPoint: update }));
  Object.defineProperty(navigator, "ink", { configurable: true, value: { requestPresenter: request } });
  const f = await setup(surface); f.tools.selectPen("ballpoint"); f.experiment.toggleDelegated();
  pointer(f.target, "pointerdown", 100, 100.3, true); await Promise.resolve();
  pointer(f.target, "pointermove", 110, 110.3, true);
  const last = pointer(f.target, "pointermove", 120, 120.3, true); frame();
  expect(request).toHaveBeenCalledWith({ presentationArea: f.target });
  expect(update).toHaveBeenCalledOnce(); expect(update.mock.calls[0]![0]).toBe(last);
  const stroke = f.strokes()[0]!, points = structuredClone(stroke.points);
  expect(f.path().getAttribute("d")).toBe(strokeToSvgPath(stroke, false));
  const saved = JSON.parse(f.save()); expect((saved.strokes ?? saved.objects)[0].points).toEqual(points);
  f.experiment.cyclePrediction(); // mode is frozen for this gesture
  pointer(f.target, "pointermove", 130, 130.3, true); frame(); expect(update).toHaveBeenCalledTimes(2);
  pointer(f.target, "pointerup", 130, 135, true); frame(); expect(update).toHaveBeenCalledTimes(2);
  const final = structuredClone(stroke.points); f.undo(); expect(f.strokes()).toHaveLength(0); f.redo(); expect(f.strokes()[0]!.points).toEqual(final);
  expect(f.logger.snapshot().entries.find(e => e.event === "delegated_stroke")!.data).toMatchObject({ status: "ready", updates: 2 });
  expect(f.logger.snapshot().entries.find(e => e.event === "stroke" && e.category === "ink-latency")!.data).toMatchObject({ delegated: true, horizonMs: 0, nativeFrames: 0, fallbackFrames: 0 });
});

it("Canvas does not anchor delegated ink to a filtered-out close sample", async () => {
  const update = vi.fn(); Object.defineProperty(navigator, "ink", { configurable: true, value: { requestPresenter: async () => ({ updateInkTrailStartPoint: update }) } });
  const f = await setup("canvas", false); f.experiment.toggleDelegated();
  pointer(f.target, "pointerdown", 100, 100, true); await Promise.resolve();
  const accepted = pointer(f.target, "pointermove", 110, 110, true);
  pointer(f.target, "pointermove", 110.001, 120, true); frame();
  expect(f.strokes()[0]!.points).toHaveLength(2); expect(update.mock.calls[0]![0]).toBe(accepted);
  pointer(f.target, "pointerup", 110, 125, true);
});

it.each(["canvas", "note"] as const)("%s shows cyan/yellow diagnostics, retracts yellow at a stop and saves no markers", async surface => {
  const f = await setup(surface); f.experiment.visualDiagnostics = true; f.experiment.horizonMs = 32;
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  pointer(f.target, "pointerdown", 100, 100); pointer(f.target, "pointermove", 105, 110); pointer(f.target, "pointermove", 110, 120); frame();
  const group = document.querySelector(".canvas-scribe-latency-markers")!;
  expect(group).not.toBeNull();
  const cyan = group.querySelector('[fill="#00e5ff"]')!, yellow = group.querySelector<SVGElement>('[fill="#ffea00"]')!;
  expect(cyan.getAttribute("cx")).toBe("110"); expect(yellow.getAttribute("cx")).toBe("126");
  expect(yellow.style.display).toBe("");
  expect(f.save()).not.toContain("#ffea00"); expect(f.strokes()[0]!.points).toHaveLength(3);
  now = 170; vi.advanceTimersByTime(50); frame(); expect(yellow.style.display).toBe("none");
  pointer(f.target, "pointerup", 110, 175); frame(); expect(document.querySelector(".canvas-scribe-latency-markers")).toBeNull();
  f.undo(); f.redo(); expect(document.querySelector(".canvas-scribe-latency-markers")).toBeNull();
  expect(f.logger.snapshot().entries.find(e => e.event === "stroke" && e.category === "ink-latency")!.data).toMatchObject({ visualDiagnostics: true, horizonMs: 32 });
});

it.each(["canvas", "note"] as const)("%s shows only cyan in delegated visual mode and removes it on capture loss", async surface => {
  const update = vi.fn(); Object.defineProperty(navigator, "ink", { configurable: true, value: { requestPresenter: async () => ({ updateInkTrailStartPoint: update }) } });
  const f = await setup(surface, false); f.experiment.visualDiagnostics = true; f.experiment.toggleDelegated();
  pointer(f.target, "pointerdown", 100, 100, true); await Promise.resolve();
  pointer(f.target, "pointermove", 110, 110, true); frame();
  const group = document.querySelector(".canvas-scribe-latency-markers")!;
  expect(group).not.toBeNull(); expect(group.outerHTML).not.toContain("#ff00ff");
  expect(group.querySelector<SVGElement>('[fill="#ffea00"]')!.style.display).toBe("none");
  expect(update.mock.calls[0]![1]).toEqual({ color: "#ff00ff", diameter: 16 });
  f.target.releasePointerCapture(1); frame(); expect(document.querySelector(".canvas-scribe-latency-markers")).toBeNull();
});

it.each(["canvas", "note"] as const)("%s cancels delegation on capture loss and ignores late rendering", async surface => {
  const update = vi.fn(); Object.defineProperty(navigator, "ink", { configurable: true, value: { requestPresenter: async () => ({ updateInkTrailStartPoint: update }) } });
  const f = await setup(surface, false); f.experiment.toggleDelegated();
  pointer(f.target, "pointerdown", 100, 100, true); await Promise.resolve();
  pointer(f.target, "pointermove", 110, 110, true); f.target.releasePointerCapture(1); frame();
  expect(update).not.toHaveBeenCalled(); expect(f.path().getAttribute("d")).toBe(strokeToSvgPath(f.strokes()[0]!, true));
});
