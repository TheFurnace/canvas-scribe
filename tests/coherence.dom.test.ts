// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from "vitest";
import { InkToolState } from "../src/ink-tool-state";
import { FavoritePens } from "../src/favorite-pens";
import { PdfTools } from "../src/pdf-tools";
import { HandwrittenNoteEditor } from "../src/handwritten-note-editor";
import { createHandwrittenNote, parseHandwrittenNote, serializeHandwrittenNote, type HandwrittenObject } from "../src/handwritten-note";
import { scaleHandwrittenSelection, selectHandwrittenObject } from "../src/handwritten-selection";
import { createColorPicker } from "../src/color-picker";
import { createToolRadial } from "../src/tool-suite";
import { CanvasInkLayer } from "../src/canvas-ink-layer";
import { DebugLogger } from "../src/debug-logger";
import type { App } from "obsidian";
import type { CanvasTarget } from "../src/canvas-target";

const dispose: (() => void)[] = [];
afterEach(() => { dispose.splice(0).forEach(fn => fn()); document.body.replaceChildren(); });
const flush = async () => { await Promise.resolve(); await Promise.resolve(); };
it("dismisses stale theme previews while preserving semantic Default", async () => {
  const { state, pdf, tool } = fixtures();
  tool("color"); pdf.openRadial(120, 120);
  expect(document.querySelector(".canvas-scribe-quick-colors")).not.toBeNull();
  document.body.classList.add("theme-dark");
  await new Promise(resolve => setTimeout(resolve, 10));
  expect(document.querySelector(".canvas-scribe-quick-colors")).toBeNull();
  expect(document.querySelector(".canvas-scribe-radial-menu")).toBeNull();
  expect(state.toolColors.selection("pen")).toBeNull();
  document.body.classList.remove("theme-dark");
});
function button(label: string) { const b = Array.from(document.querySelectorAll<HTMLButtonElement>("button")).find(x => x.textContent === label); expect(b, label).toBeTruthy(); return b!; }
function fixtures(state = new InkToolState(), favorites = new FavoritePens()) {
  const note = createHandwrittenNote();
  const editor = new HandwrittenNoteEditor(document, note, () => {}, () => {}, false, favorites, document.body, state);
  document.body.append(editor.root); dispose.push(() => editor.destroy());
  let pdf: PdfTools;
  const sync = () => pdf.sync(true, false, false, 0, false);
  pdf = new PdfTools(document, () => {}, { changed: sync, toggle: () => {}, undo: () => {}, redo: () => {}, clear: () => {}, scale: () => {}, recolor: () => {}, remove: () => {} }, favorites, state);
  document.body.append(pdf.root); sync(); dispose.push(() => pdf.destroy());
  const viewport = editor.root.querySelector<HTMLElement>(".canvas-scribe-note-viewport")!;
  const pointer = (type: string, x = 100, y = 100) => viewport.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, pointerType: "pen", pointerId: 1, pressure: .5, button: 0, buttons: 1, clientX: x, clientY: y }));
  const tool = (name: string) => editor.root.querySelector<HTMLElement>(`[data-action="${name}"]`)!.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
  return { state, note, editor, pdf, tool, pointer };
}

it("restores validated global choices and semantic Default independently of fixed color history", async () => {
  const state = new InkToolState(), notify = vi.fn(); state.subscribe(notify);
  state.applyPreset({ tool: "pen", penType: "pencil", size: 6, opacity: .4, color: null });
  state.toolColors.confirm("pen", "#123456"); state.toolColors.confirm("pen", null);
  state.eraserSettings = { mode: "area", radius: 30, highlighterOnly: true };
  state.selectionSettings = { mode: "rectangle", partial: false }; await flush();
  expect(notify).toHaveBeenCalledOnce();
  const restored = new InkToolState(JSON.parse(JSON.stringify(state.serialize())));
  expect(restored.preset()).toMatchObject({ penType: "pencil", size: 6, opacity: .4, color: null });
  expect(restored.toolColors.recent("pen")).toEqual(["#123456"]);
  expect(restored.toolColors.current("pen", "#ffffff")).toBe("#ffffff");
  expect(restored.selectionSettings).toEqual({ mode: "rectangle", partial: false });
  expect(restored.eraserSettings).toEqual({ mode: "area", radius: 30, highlighterOnly: true });
  const invalid = new InkToolState({ activeTool: "text", penSize: -20, penOpacity: 99, highlighterSize: Infinity, colors: { selected: { pen: "junk" }, history: { pen: ["#abc", "#aabbcc", null, "junk"] } } });
  expect(invalid.activeTool).toBe("pen"); expect(invalid.penSize).toBe(3.5); expect(invalid.toolColors.selection("pen")).toBeNull(); expect(invalid.toolColors.recent("pen")).toEqual(["#aabbcc"]);
});

it("updates both view toolbars while keeping an in-progress note stroke stable", async () => {
  const { state, note, editor, pdf, pointer } = fixtures();
  pointer("pointerdown");
  pdf.setTool("eraser"); state.penSize = 8; state.toolColors.confirm("pen", "#dc2626"); await flush();
  for (const root of [editor.root, pdf.root]) expect(root.querySelector('[data-action="eraser"]')?.getAttribute("aria-pressed")).toBe("true");
  pointer("pointermove", 180); pointer("pointerup", 180);
  expect(note.objects[0]).toMatchObject({ kind: "ink", tool: "pen", size: 3.5, color: "var(--text-normal)" });
  pdf.setTool("pen"); await flush(); pointer("pointerdown", 100, 200); pointer("pointerup", 180, 200);
  expect(note.objects[1]).toMatchObject({ tool: "pen", size: 8, color: "#dc2626" });
});

it("does not let a legacy Canvas replace global preferences or save tool changes into the document", async () => {
  const state = new InkToolState({ penType: "pencil", penSize: 8 }), f = fixtures(state);
  const canvas = document.createElement("div"); canvas.innerHTML = '<div class="canvas-wrapper"><div class="canvas"></div></div><div class="canvas-controls"></div>'; document.body.append(canvas);
  const process = vi.fn(), app = { vault: { read: async () => JSON.stringify({ canvasScribe: { version: 1, penSettings: { type: "ballpoint", size: 2 }, strokes: [] } }), process } } as unknown as App;
  const layer = new CanvasInkLayer(app, { containerEl: canvas, file: { path: "legacy.canvas" }, view: {}, leaf: {} } as unknown as CanvasTarget, new DebugLogger(), new FavoritePens(), state);
  await layer.mount(); dispose.push(() => layer.dispose());
  expect(state.penType).toBe("pencil"); expect(state.penSize).toBe(8);
  f.pdf.setTool("highlighter"); await flush();
  expect(canvas.querySelector('[data-action="highlighter"]')?.getAttribute("aria-pressed")).toBe("true");
  layer.setTool("pen"); canvas.querySelector<HTMLElement>('[data-action="pen"]')!.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
  document.querySelector<HTMLElement>('[data-pen-type="ballpoint"]')!.click(); await flush();
  expect(f.pdf.state.penType).toBe("ballpoint"); expect(process).not.toHaveBeenCalled();
});

it("preserves note-only text mode when global colors change without changing the active tool", async () => {
  const { state, editor, pointer, note } = fixtures();
  editor.root.querySelector<HTMLButtonElement>(".canvas-scribe-note-text-tool")!.click();
  state.toolColors.confirm("pen", "#112233"); await flush(); pointer("pointerdown");
  expect(note.objects[0]?.kind).toBe("text");
});

it("uses the same preset and pen-type opacity transitions in PDF and notes", async () => {
  const favorites = new FavoritePens(); favorites.add({ tool: "pen", penType: "pencil", size: 6, opacity: .25, color: null });
  const f = fixtures(new InkToolState(), favorites);
  f.pdf.openRadial(300, 300); document.querySelector<HTMLElement>('[data-tab="2"]')!.click();
  document.querySelector<HTMLElement>(`[data-action="${favorites.list()[0]!.id}"]`)!.click(); await flush();
  expect(f.state.penOpacity).toBe(.25); expect(f.state.toolColors.selection("pen")).toBeNull();
  f.pdf.settings(); document.querySelector<HTMLElement>('[data-pen-type="ballpoint"]')!.click(); await flush();
  expect(f.state.penOpacity).toBeNull(); expect(f.editor.root.querySelector('[data-action="pen"]')?.getAttribute("aria-label")).toContain("Theme");
});

it("distinguishes Default from an identical fixed swatch and preserves it on Done", () => {
  const confirm = vi.fn();
  const picker = createColorPicker(document, { tool: "pen", current: "#1f2937", defaultColor: "#1f2937", isDefault: true, recent: ["#1f2937"], onConfirm: confirm, onCancel: () => {} });
  document.body.append(picker);
  expect(picker.querySelector(".canvas-scribe-picker-default")?.getAttribute("aria-pressed")).toBe("true");
  expect(picker.querySelector('[aria-label="Use #1f2937"]')?.getAttribute("aria-pressed")).toBe("false");
  button("Done").click(); expect(confirm).toHaveBeenLastCalledWith(null);
  picker.querySelector<HTMLButtonElement>('[aria-label="Use #1f2937"]')!.click(); button("Done").click(); expect(confirm).toHaveBeenLastCalledWith("#1f2937");
});

it("only adds native context passthrough when the surface supplies it", () => {
  const base = { selectTool: () => {}, changed: () => {}, defaultColor: () => "#111111", undo: () => {}, redo: () => {}, canUndo: () => false, canRedo: () => false };
  const a = createToolRadial(document, new InkToolState(), new FavoritePens(), base);
  expect(a.find(p => p.pageId === "settings")?.children?.().some(p => p.id === "canvas-menu")).toBe(false);
  const pass = vi.fn(), b = createToolRadial(document, new InkToolState(), new FavoritePens(), { ...base, contextMenu: pass });
  b.find(p => p.pageId === "settings")?.children?.().find(p => p.id === "canvas-menu")?.run?.({ x: 10, y: 20 });
  expect(pass).toHaveBeenCalledWith({ x: 10, y: 20 });
});

const objects = (): HandwrittenObject[] => [
  { kind: "ink", id: "ink", tool: "pen", size: 3, color: "#111111", opacity: 1, hasPressure: false, createdAt: 1, points: [{ x: 110, y: 110, pressure: .5, time: 0 }, { x: 150, y: 110, pressure: .5, time: 1 }] },
  { kind: "text", id: "text", x: 160, y: 100, width: 160, fontSize: 18, text: "Hello", align: "left", color: "#111111" },
  { kind: "text", id: "outside", x: 800, y: 800, width: 160, fontSize: 18, text: "Unchanged", align: "left", color: "#111111" },
];
it("scales ink and text as one group within format limits and preserves unselected objects", () => {
  const before = objects(), selected = new Set(["ink", "text"]), next = scaleHandwrittenSelection(before, selected, 2)!;
  expect(next[0]).toMatchObject({ size: 6 }); expect(next[1]).toMatchObject({ fontSize: 36, width: 320 }); expect(next[2]).toBe(before[2]);
  const note = createHandwrittenNote(); note.objects = next; expect(() => parseHandwrittenNote(serializeHandwrittenNote(note))).not.toThrow();
  const small = scaleHandwrittenSelection(before, selected, .01)!;
  expect(small[1]).toMatchObject({ fontSize: 10 }); expect((small[0] as { size: number }).size).toBeCloseTo(3 * 10 / 18);
});

it("uses full enclosure versus intersection for text, including crossing edges with no enclosed corners", () => {
  const text = objects()[1]!;
  const crossing = [{ x: 100, y: 115 }, { x: 400, y: 115 }, { x: 400, y: 125 }, { x: 100, y: 125 }];
  expect(selectHandwrittenObject(text, crossing, true)).toBe(true); expect(selectHandwrittenObject(text, crossing, false)).toBe(false);
  const enclosing = [{ x: 100, y: 80 }, { x: 400, y: 80 }, { x: 400, y: 300 }, { x: 100, y: 300 }];
  expect(selectHandwrittenObject(text, enclosing, false)).toBe(true);
});

it("applies mixed resize and recolor through the note toolbar with document undo", async () => {
  const f = fixtures(); f.note.objects = objects(); f.editor.setDocument(f.note); f.state.selectionSettings = { mode: "rectangle", partial: false };
  f.editor.setTool("lasso"); await flush(); f.pointer("pointerdown", 70, 70); f.pointer("pointermove", 400, 300); f.pointer("pointerup", 400, 300);
  f.tool("lasso");
  const scale = document.querySelector<HTMLInputElement>('input[aria-label="Selection scale"]')!;
  scale.value = "200"; scale.dispatchEvent(new Event("input", { bubbles: true })); scale.dispatchEvent(new Event("change", { bubbles: true })); button("Apply scale").click();
  expect(f.note.objects[1]).toMatchObject({ fontSize: 36, width: 320 });
  button("Recolor selection…").click();
  const hex = document.querySelector<HTMLInputElement>('.canvas-scribe-picker-inputs input');
  expect(hex).toBeTruthy(); hex!.value = "#123456"; hex!.dispatchEvent(new Event("input", { bubbles: true })); button("Done").click();
  expect(f.note.objects.slice(0, 2).map(o => o.color)).toEqual(["#123456", "#123456"]); expect(f.note.objects[2]).toMatchObject({ color: "#111111", fontSize: 18 });
  f.editor.undo(); expect(f.note.objects[1]).toMatchObject({ color: "#111111", fontSize: 36 });
  f.editor.undo(); expect(f.note.objects[1]).toMatchObject({ fontSize: 18, width: 160 });
  f.editor.redo(); expect(f.note.objects[1]).toMatchObject({ fontSize: 36 });
});
