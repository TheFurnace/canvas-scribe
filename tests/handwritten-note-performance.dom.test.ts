// @vitest-environment happy-dom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import * as geometry from "../src/geometry";
import { HandwrittenNoteEditor } from "../src/handwritten-note-editor";
import { createHandwrittenNote, NOTE_SPARE_HEIGHT, snapshotHandwrittenObjects, type HandwrittenInkObject } from "../src/handwritten-note";
import { DocumentHistory } from "../src/document-history";

const frames = new Map<number, FrameRequestCallback>();
let nextFrame = 0;
let editor: HandwrittenNoteEditor;
beforeEach(() => {
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => { frames.set(++nextFrame, callback); return nextFrame; });
  vi.stubGlobal("cancelAnimationFrame", (id: number) => frames.delete(id));
});
afterEach(() => { editor?.destroy(); frames.clear(); vi.restoreAllMocks(); vi.unstubAllGlobals(); document.body.replaceChildren(); });
function frame() { const callbacks = [...frames.values()]; frames.clear(); callbacks.forEach(callback => callback(0)); }
function setup(count = 0) {
  const note = createHandwrittenNote();
  note.objects = Array.from({ length: count }, (_, i): HandwrittenInkObject => ({
    kind: "ink", id: `existing-${i}`, tool: "pen", penType: "fountain", color: "#123456", opacity: 1, size: 3,
    points: Array.from({ length: 60 }, (_, p) => ({ x: p, y: i + p, pressure: .5, time: p })), hasPressure: true, createdAt: 0,
  }));
  note.objects.push({ kind: "text", id: "text", x: 20, y: 30, width: 200, text: "Keep this text", fontSize: 18, color: "#000", align: "left" });
  const changed = vi.fn();
  editor = new HandwrittenNoteEditor(document, note, changed, () => undefined);
  document.body.append(editor.root); frame();
  const viewport = editor.root.querySelector<HTMLElement>(".canvas-scribe-note-viewport")!;
  const pointer = (type: string, x = 100, y = 100, samples?: PointerEvent[]) => {
    const event = new PointerEvent(type, { bubbles: true, pointerType: "pen", pointerId: 1, clientX: x, clientY: y, pressure: .5 });
    if (samples) Object.defineProperty(event, "getCoalescedEvents", { value: () => samples });
    viewport.dispatchEvent(event);
  };
  return { note, changed, viewport, pointer };
}

it.each([0, 10, 100, 500])("updates only live ink with %i existing strokes and retains mixed content DOM", count => {
  const { note, changed, viewport, pointer } = setup(count);
  const page = viewport.querySelector(".canvas-scribe-note-page")!;
  const existing = Array.from(page.children);
  const paths = geometry.strokeToSvgPath;
  const render = vi.spyOn(geometry, "strokeToSvgPath");
  pointer("pointerdown");
  expect(render).toHaveBeenCalledTimes(1);
  render.mockClear();
  const layout = vi.spyOn(HTMLTextAreaElement.prototype, "scrollHeight", "get");
  for (let i = 0; i < 20; i++) pointer("pointermove", 100 + i, 100 + i);
  expect(render).not.toHaveBeenCalled();
  frame();
  expect(render).toHaveBeenCalledTimes(1);
  expect(layout).not.toHaveBeenCalled();
  expect(changed).not.toHaveBeenCalled();
  expect(viewport.querySelector(".canvas-scribe-note-page")).toBe(page);
  expect(Array.from(page.children).slice(0, existing.length)).toEqual(existing);
  const ink = note.objects[note.objects.length - 1] as HandwrittenInkObject;
  expect(ink.points).toHaveLength(21);
  const path = page.querySelectorAll("path")[count]!;
  expect(path.getAttribute("d")).toBe(paths(ink, false));
  expect((path.parentElement as unknown as SVGSVGElement).style.zIndex).toBe(String(count + 2));
  pointer("pointerup");
  // One live frame, one completed path and one bounds calculation for the new ink.
  // Existing completed geometry must not be regenerated at lift.
  expect(render).toHaveBeenCalledTimes(3);
  expect(path.getAttribute("d")).toBe(paths(ink, true));
  expect(changed).toHaveBeenCalledTimes(1);
  expect(existing.every(element => element.isConnected)).toBe(true);
  editor.undo(); expect(note.objects).toHaveLength(count + 1);
  editor.redo(); expect(note.objects).toHaveLength(count + 2);
});

it.each(["pointerup", "pointercancel", "lostpointercapture"])("flushes samples and grows the page on %s before an ink frame runs", end => {
  const { note, pointer, viewport } = setup();
  pointer("pointerdown");
  const samples = [1300, 1400].map((y, i) => new PointerEvent("pointermove", { clientX: 120 + i, clientY: y, pressure: .2 + i * .4, tiltX: 30, tiltY: -20 }));
  pointer("pointermove", 121, 1400, samples);
  const ink = note.objects[note.objects.length - 1] as HandwrittenInkObject;
  expect(ink.points.map(p => p.y)).toEqual([100, 1300, 1400]);
  expect(ink.points[2]).toMatchObject({ pressure: samples[1]!.pressure, tiltX: 30, tiltY: -20 });
  pointer(end);
  expect(frames.size).toBe(0);
  expect(viewport.querySelector("path")!.getAttribute("d")).toBe(geometry.strokeToSvgPath(ink, true));
  expect(note.contentHeight).toBeGreaterThan(1400);
  expect(viewport.querySelector<HTMLElement>(".canvas-scribe-note-page")!.style.height).toBe(`${note.contentHeight + NOTE_SPARE_HEIGHT}px`);
  pointer("pointerdown"); pointer("pointerup"); expect(note.objects).toHaveLength(3);
});

it.each(["replace", "undo", "destroy"])("cancels pending ink work on %s", action => {
  const { pointer } = setup(); pointer("pointerdown"); pointer("pointermove", 120, 130);
  const render = vi.spyOn(geometry, "strokeToSvgPath");
  if (action === "replace") editor.setDocument(createHandwrittenNote());
  else if (action === "undo") editor.undo();
  else editor.destroy();
  render.mockClear(); frame(); pointer("pointermove", 150, 160); frame();
  expect(render).not.toHaveBeenCalled();
  if (action !== "destroy") {
    pointer("pointerdown"); pointer("pointerup");
    expect(editor.getDocument().objects.filter(object => object.kind === "ink")).toHaveLength(1);
  }
});

it("shares completed ink across 100 checkpoints while protecting mutable text and live ink", () => {
  const { note } = setup(100), ink = note.objects[0] as HandwrittenInkObject;
  const history = new DocumentHistory(snapshotHandwrittenObjects, 100);
  for (let i = 0; i < 100; i++) history.checkpoint(note.objects);
  expect(new Set(history.past.map(snapshot => snapshot[0]))).toEqual(new Set([ink]));
  const text = note.objects[100]!; if (text.kind !== "text") throw Error("fixture");
  text.text = "Changed";
  expect(history.past[0]![100]).toMatchObject({ text: "Keep this text" });
  const activeSnapshot = snapshotHandwrittenObjects([ink], ink)[0] as HandwrittenInkObject;
  ink.points.push({ x: 100, y: 100, pressure: .5, time: 99 });
  expect(activeSnapshot.points).toHaveLength(60);
});

it("retains unaffected ink and focused text through erasing, undo and further text input", () => {
  const { note, pointer } = setup(2);
  const ink = note.objects[1] as HandwrittenInkObject;
  // Put the second stroke beyond the eraser footprint.
  note.objects[1] = { ...ink, points: ink.points.map(p => ({ ...p, x: p.x + 500 })) };
  editor.setDocument(note); frame();
  const text = editor.root.querySelector<HTMLTextAreaElement>("textarea")!;
  const second = editor.root.querySelector('[data-object-id="existing-1"]');
  text.focus(); text.value = "First edit"; text.dispatchEvent(new InputEvent("input"));
  editor.undo();
  expect(editor.root.querySelector("textarea")).toBe(text);
  text.value = "After undo"; text.dispatchEvent(new InputEvent("input"));
  editor.undo(); expect(note.objects[2]).toMatchObject({ text: "Keep this text" });
  editor.setTool("eraser"); pointer("pointerdown", 20, 20); pointer("pointerup", 20, 20);
  expect(note.objects.some(o => o.id === "existing-0")).toBe(false);
  expect(editor.root.querySelector('[data-object-id="existing-1"]')).toBe(second);
  expect(editor.root.querySelector("textarea")).toBe(text);
  editor.undo(); expect(note.objects.filter(o => o.kind === "ink")).toHaveLength(2);
  editor.redo(); expect(note.objects.filter(o => o.kind === "ink")).toHaveLength(1);
});

it("keeps remote ink identities during area erasing and restores the original outline on undo", () => {
  const { note, pointer } = setup(2);
  const remote = note.objects[1] as HandwrittenInkObject;
  note.objects[1] = { ...remote, points: remote.points.map(p => ({ ...p, x: p.x + 500 })) };
  editor.setDocument(note); frame();
  const retained = note.objects[1], svg = editor.root.querySelector('[data-object-id="existing-1"]');
  const original = structuredClone(note.objects[0]);
  editor.setTool("eraser");
  // Configure the production tool state as the settings menu does.
  const state = (editor as unknown as { sharedTools: { eraserSettings: { mode: string; radius: number; highlighterOnly: boolean } } }).sharedTools;
  state.eraserSettings = { mode: "area", radius: 5, highlighterOnly: false };
  pointer("pointerdown", 20, 20); pointer("pointerup", 20, 20);
  expect(note.objects.find(o => o.id === "existing-1")).toBe(retained);
  expect(editor.root.querySelector('[data-object-id="existing-1"]')).toBe(svg);
  editor.undo(); expect(note.objects[0]).toEqual(original);
});
