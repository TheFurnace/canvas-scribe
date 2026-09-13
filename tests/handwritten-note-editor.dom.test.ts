// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { HandwrittenNoteEditor } from "../src/handwritten-note-editor";
import { createHandwrittenNote, objectBounds, serializeHandwrittenNote } from "../src/handwritten-note";

afterEach(() => document.body.replaceChildren());
function setup() {
  const note = createHandwrittenNote();
  const editor = new HandwrittenNoteEditor(document, note, () => undefined, () => undefined);
  document.body.append(editor.root);
  const viewport = editor.root.querySelector<HTMLElement>(".canvas-scribe-note-viewport")!;
  const pointer = (type: string, pointerType: string, pointerId: number, x: number, y: number) => {
    const event = new PointerEvent(type, { bubbles: true, cancelable: true, pointerType, pointerId, clientX: x, clientY: y, pressure: .5 });
    viewport.dispatchEvent(event); return event;
  };
  return { note, viewport, pointer };
}
describe("handwritten note gesture ownership", () => {
  it("keeps pen ink stationary and blocks simultaneous finger panning", () => {
    const { note, viewport, pointer } = setup();
    viewport.scrollTop = 100;
    expect(pointer("pointerdown", "pen", 1, 100, 100).defaultPrevented).toBe(true);
    pointer("pointerdown", "touch", 2, 100, 100);
    pointer("pointermove", "touch", 2, 100, 50);
    expect(pointer("pointermove", "pen", 1, 150, 150).defaultPrevented).toBe(true);
    pointer("pointerup", "pen", 1, 150, 150);
    expect(viewport.scrollTop).toBe(100);
    expect(note.objects).toHaveLength(1);
    expect(note.objects[0]?.kind === "ink" && note.objects[0].points.length).toBe(2);
  });
  it("pans with fingers without creating ink and ends on cancellation", () => {
    const { note, viewport, pointer } = setup();
    viewport.scrollTop = 100;
    pointer("pointerdown", "touch", 2, 100, 100);
    pointer("pointermove", "touch", 2, 80, 50);
    expect(viewport.scrollTop).toBe(150);
    expect(viewport.scrollLeft).toBe(20);
    pointer("pointercancel", "touch", 2, 80, 50);
    pointer("pointermove", "touch", 2, 80, 0);
    expect(viewport.scrollTop).toBe(150);
    expect(note.objects).toHaveLength(0);
  });
  it("lets pen contact take over a finger pan and recovers after lost capture", () => {
    const { note, viewport, pointer } = setup();
    pointer("pointerdown", "touch", 2, 100, 100);
    pointer("pointerdown", "pen", 1, 100, 100);
    pointer("pointermove", "touch", 2, 100, 50);
    expect(viewport.scrollTop).toBe(0);
    pointer("lostpointercapture", "pen", 1, 100, 100);
    pointer("pointerdown", "pen", 3, 150, 150);
    pointer("pointerup", "pen", 3, 150, 150);
    expect(note.objects).toHaveLength(2);
  });
  it("leaves mouse navigation alone in the production editor", () => {
    const { note, pointer } = setup();
    expect(pointer("pointerdown", "mouse", 1, 100, 100).defaultPrevented).toBe(false);
    expect(note.objects).toHaveLength(0);
  });
});

it("continues text resize across renders and undoes the whole drag", () => {
  const { note, viewport, pointer } = setup();
  document.querySelector<HTMLButtonElement>(".canvas-scribe-note-text-tool")!.click();
  pointer("pointerdown", "pen", 1, 100, 100);
  const handle = document.querySelector(".canvas-scribe-note-resize")!;
  handle.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, cancelable: true, pointerType: "pen", pointerId: 2, clientX: 400, clientY: 100 }));
  pointer("pointermove", "pen", 2, 450, 100);
  expect(handle.isConnected).toBe(false);
  pointer("pointermove", "pen", 2, 500, 100);
  pointer("pointerup", "pen", 2, 500, 100);
  expect(note.objects[0]?.kind === "text" && note.objects[0].width).toBe(400);
  document.querySelector<HTMLElement>('[data-action="undo"]')!.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
  expect(note.objects[0]?.kind === "text" && note.objects[0].width).toBe(300);
  expect(viewport.scrollTop).toBe(0);
});

it("sizes multiline input and width/font/zoom reflow without replacing the focused textarea", () => {
  // happy-dom has no text layout; expose browser-like measurements to verify synchronization.
  const metrics = vi.spyOn(HTMLTextAreaElement.prototype, "scrollHeight", "get").mockImplementation(function(this: HTMLTextAreaElement) {
    const columns = Math.max(1, Math.floor((parseFloat(this.style.width) - 14) / (parseFloat(this.style.fontSize) * .55)));
    const rows = this.value.split("\n").reduce((sum, line) => sum + Math.max(1, Math.ceil(line.length / columns)), 0);
    return Math.ceil(rows * parseFloat(this.style.fontSize) * 1.35 + 12);
  });
  try {
    const { note, pointer } = setup();
    document.querySelector<HTMLButtonElement>(".canvas-scribe-note-text-tool")!.click(); pointer("pointerdown", "pen", 1, 100, 1100);
    const textarea = document.querySelector<HTMLTextAreaElement>("textarea")!; textarea.focus();
    textarea.value = ("A long wrapped line with words and IME 漢字 text. ").repeat(10) + "\nLast visible line";
    textarea.dispatchEvent(new InputEvent("input", { bubbles: true, isComposing: true }));
    expect(document.activeElement).toBe(textarea); expect(textarea.isConnected).toBe(true);
    const object = note.objects[0]!; if (object.kind !== "text") throw Error("fixture");
    const originalHeight = parseFloat(textarea.style.height);
    const checkBounds = () => {
      const current = document.querySelector<HTMLTextAreaElement>("textarea")!;
      expect(parseFloat(current.style.height)).toBe(current.scrollHeight + 2);
      expect(objectBounds(object).maxY - object.y).toBe(parseFloat(current.style.height));
      expect(parseFloat(document.querySelector<HTMLElement>(".canvas-scribe-note-selection")!.style.height)).toBe(parseFloat(current.style.height));
      expect(note.contentHeight).toBeGreaterThan(objectBounds(object).maxY);
      return parseFloat(current.style.height);
    };
    checkBounds();
    const resize = (delta: number) => {
      document.querySelector(".canvas-scribe-note-resize")!.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, pointerType: "pen", pointerId: 2, clientX: 400 }));
      pointer("pointermove", "pen", 2, 400 + delta, 0); pointer("pointerup", "pen", 2, 400 + delta, 0);
    };
    resize(-150); expect(checkBounds()).toBeGreaterThan(originalHeight); expect(object.fontSize).toBe(18);
    resize(150); expect(checkBounds()).toBe(originalHeight);
    document.querySelector<HTMLButtonElement>('[aria-label="Zoom in"]')!.click(); expect(checkBounds()).toBe(originalHeight);
    const size = document.querySelector<HTMLInputElement>('[aria-label="Text size"]')!; size.value = "30"; size.dispatchEvent(new Event("change"));
    expect(checkBounds()).toBeGreaterThan(originalHeight);
    expect(JSON.parse(serializeHandwrittenNote(note)).objects[0]).not.toHaveProperty("height");
  } finally { metrics.mockRestore(); }
});
