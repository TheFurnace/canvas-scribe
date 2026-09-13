// @vitest-environment happy-dom
import { afterEach, expect, it } from "vitest";
import { HandwrittenNoteEditor } from "../src/handwritten-note-editor";
import { createHandwrittenNote, parseHandwrittenNote, serializeHandwrittenNote } from "../src/handwritten-note";
import { FavoritePens } from "../src/favorite-pens";

const editors: HandwrittenNoteEditor[] = [];
afterEach(() => { editors.forEach(editor => editor.destroy()); editors.length = 0; document.body.replaceChildren(); });
function setup(favorites = new FavoritePens()) {
  const note = createHandwrittenNote();
  const editor = new HandwrittenNoteEditor(document, note, () => undefined, () => undefined, false, favorites);
  editors.push(editor); document.body.append(editor.root);
  const viewport = editor.root.querySelector<HTMLElement>(".canvas-scribe-note-viewport")!;
  const pointer = (type: string, x: number, y: number, button = 0) => {
    const event = new PointerEvent(type, { bubbles: true, cancelable: true, pointerType: "pen", pointerId: 1, clientX: x, clientY: y, pressure: .5, button, buttons: button === 2 ? 2 : 1 });
    viewport.dispatchEvent(event); return event;
  };
  const tool = (name: string) => editor.root.querySelector<HTMLElement>(`[data-action="${name}"]`)!.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
  const stroke = () => { pointer("pointerdown", 100, 100); pointer("pointermove", 200, 100); pointer("pointerup", 200, 100); };
  const radial = () => viewport.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: 300, clientY: 300 }));
  return { note, editor, viewport, pointer, tool, stroke, radial };
}
function click(selector: string) { const button = document.querySelector<HTMLButtonElement>(selector); expect(button, selector).not.toBeNull(); button!.click(); }
function input(label: string, value: string) {
  const control = document.querySelector<HTMLInputElement>(`input[aria-label="${label}"]`)!;
  expect(control, label).not.toBeNull(); control.value = value; control.dispatchEvent(new Event("input", { bubbles: true })); control.dispatchEvent(new Event("change", { bubbles: true }));
}

it("applies pen menu type, size and color to saved strokes and dismisses on drawing", () => {
  const { note, tool, stroke } = setup();
  tool("pen"); click('[data-pen-type="ballpoint"]'); input("Pen thickness", "8"); click('[aria-label="Use #dc2626"]');
  stroke(); expect(document.querySelector(".canvas-scribe-tool-menu")).toBeNull();
  const saved = parseHandwrittenNote(serializeHandwrittenNote(note));
  expect(saved.objects[0]).toMatchObject({ kind: "ink", penType: "ballpoint", size: 8, color: "#dc2626" });
});

it("opens one radial for barrel input without ink and selects a highlighter", () => {
  const { note, pointer, viewport, stroke } = setup();
  expect(pointer("pointerdown", 300, 300, 2).defaultPrevented).toBe(true);
  pointer("pointerup", 300, 300, 2);
  const original = document.querySelector(".canvas-scribe-radial-menu");
  viewport.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true }));
  expect(document.querySelector(".canvas-scribe-radial-menu")).toBe(original);
  expect(note.objects).toHaveLength(0);
  click('.canvas-scribe-radial-tabs [data-tab="0"]'); click('[data-action="highlighter-chisel"]');
  stroke(); expect(note.objects[0]).toMatchObject({ tool: "highlighter", highlighterType: "chisel" });
});

it("applies area/highlighter-only erasing, preserves text, and restores through undo", () => {
  const { note, tool, stroke, pointer } = setup();
  stroke(); tool("highlighter"); stroke();
  note.objects.push({ kind: "text", id: "text", x: 400, y: 400, width: 200, fontSize: 18, color: "#111111", align: "left", text: "Keep me" });
  tool("eraser"); tool("eraser"); click('[data-eraser-mode="area"]');
  const filter = document.querySelector<HTMLInputElement>('.canvas-scribe-tool-menu input[type="checkbox"]')!;
  filter.checked = true; filter.dispatchEvent(new Event("change"));
  pointer("pointerdown", 150, 100); pointer("pointerup", 150, 100);
  expect(note.objects.find(object => object.kind === "ink" && object.tool === "pen")).not.toHaveProperty("outline");
  expect(note.objects.some(object => object.kind === "ink" && object.tool === "highlighter" && object.outline)).toBe(true);
  expect(note.objects.find(object => object.kind === "text")).toMatchObject({ text: "Keep me" });
  parseHandwrittenNote(serializeHandwrittenNote(note));
  tool("undo"); expect(note.objects).toHaveLength(3);
  expect(note.objects.some(object => object.kind === "ink" && object.outline)).toBe(false);
});

it("uses rectangle selection settings to scale selected ink with undo", () => {
  const { note, tool, stroke, pointer } = setup(); stroke();
  tool("lasso"); tool("lasso"); click('[data-selection-mode="rectangle"]');
  pointer("pointerdown", 60, 60); pointer("pointermove", 240, 140); pointer("pointerup", 240, 140);
  tool("lasso"); input("Selection scale", "200");
  const scale = Array.from(document.querySelectorAll<HTMLButtonElement>("button")).find(button => button.textContent === "Apply scale")!;
  expect(scale.disabled).toBe(false); scale.click();
  expect(note.objects[0]).toMatchObject({ size: 7 });
  tool("undo"); expect(note.objects[0]).toMatchObject({ size: 3.5 });
});

it("uses shared favorites and cleans up menus and radials on destroy", () => {
  const favorites = new FavoritePens();
  favorites.add({ tool: "pen", penType: "pencil", color: "#16a34a", size: 6, opacity: .7 });
  const { note, editor, tool, stroke, radial } = setup(favorites);
  radial(); click('.canvas-scribe-radial-tabs [data-tab="2"]'); click(`[data-action="${favorites.list()[0]!.id}"]`); stroke();
  expect(note.objects[0]).toMatchObject({ penType: "pencil", color: "#16a34a", size: 6, opacity: .7 });
  tool("pen"); expect(document.querySelector(".canvas-scribe-tool-menu")).not.toBeNull();
  radial(); expect(document.querySelector(".canvas-scribe-tool-menu")).toBeNull();
  editor.destroy(); expect(document.querySelector(".canvas-scribe-radial-menu")).toBeNull();
});

it("applies the color picker transaction and radial history actions to the note", () => {
  const { note, tool, stroke, radial } = setup();
  tool("color"); click('[aria-label="Use #ff4d4d"]');
  Array.from(document.querySelectorAll<HTMLButtonElement>("button")).find(button => button.textContent === "Done")!.click();
  stroke(); expect(note.objects[0]).toMatchObject({ color: "#ff4d4d" });
  radial(); click('.canvas-scribe-radial-tabs [data-tab="1"]');
  expect(document.querySelector('[data-action="canvas-menu"]')).toBeNull();
  click('.canvas-scribe-radial-menu [data-action="undo"]'); expect(note.objects).toHaveLength(0);
  click('.canvas-scribe-radial-menu [data-action="redo"]'); expect(note.objects).toHaveLength(1);
  click('[data-action="tool-settings"]'); expect(document.querySelector('[aria-label="Pen settings"]')).not.toBeNull();
});
