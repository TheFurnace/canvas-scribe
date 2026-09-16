// @vitest-environment happy-dom
import { expect, it, vi } from "vitest";
import type { WorkspaceLeaf } from "obsidian";
vi.mock("obsidian", () => ({
  Notice: class {}, setIcon: () => undefined,
  TextFileView: class { contentEl = document.createElement("div"); requestSave = vi.fn(); },
}));
import { HandwrittenNoteView } from "../src/handwritten-note-view";
import { createHandwrittenNote, serializeHandwrittenNote } from "../src/handwritten-note";
import * as noteModule from "../src/handwritten-note";
it.each([
  { objects: {} }, { objects: [{ kind: "text", id: "broken", x: "oops" }] },
  { objects: [{ kind: "ink", id: "broken", tool: "pen", points: [{}] }] },
  { viewport: { zoom: 0, scrollTop: 0 } }, { logicalWidth: null },
])("preserves rejected bytes across reload, incidental save and clear: %j", patch => {
  const view = new HandwrittenNoteView({} as WorkspaceLeaf);
  view.setViewData(serializeHandwrittenNote(createHandwrittenNote()), true);
  const staleZoom = view.contentEl.querySelector<HTMLButtonElement>('[aria-label="Zoom in"]')!;
  const raw = "  " + JSON.stringify({ ...createHandwrittenNote(), ...patch }) + "\n\n";
  view.setViewData(raw, false);
  expect(view.contentEl.querySelector("textarea, .canvas-scribe-note-editor")).toBeNull();
  expect(view.contentEl.querySelector(".canvas-scribe-note-error")).not.toBeNull();
  staleZoom.click();
  expect(view.getViewData()).toBe(raw);
  view.clear();
  expect(view.getViewData()).toBe(raw);
  expect(view.requestSave).not.toHaveBeenCalled();
});

it("serializes once on demand after edit bursts and includes viewport changes", () => {
  const note = createHandwrittenNote();
  note.objects.push({ kind: "text", id: "text", text: "initial", x: 20, y: 20, width: 200, fontSize: 18, color: "#000", align: "left" });
  const view = new HandwrittenNoteView({} as WorkspaceLeaf);
  view.setViewData(serializeHandwrittenNote(note), true); view.getViewData();
  const serialize = vi.spyOn(noteModule, "serializeHandwrittenNote");
  const input = view.contentEl.querySelector<HTMLTextAreaElement>("textarea")!;
  for (let i = 0; i < 10; i++) { input.value = `edit-${i}`; input.dispatchEvent(new InputEvent("input")); }
  expect(serialize).not.toHaveBeenCalled();
  // TextFileView owns a runtime `dirty` flag which it clears around saving.
  (view as unknown as { dirty: boolean }).dirty = false;
  expect(JSON.parse(view.getViewData()).objects[0].text).toBe("edit-9");
  view.getViewData(); expect(serialize).toHaveBeenCalledTimes(1);
  const viewport = view.contentEl.querySelector<HTMLElement>(".canvas-scribe-note-viewport")!;
  viewport.scrollTop = 123; viewport.dispatchEvent(new Event("scroll"));
  expect(JSON.parse(view.getViewData()).viewport.scrollTop).toBe(123);
  expect(serialize).toHaveBeenCalledTimes(2);
  input.value = "before close"; input.dispatchEvent(new InputEvent("input")); view.clear();
  expect(JSON.parse(view.getViewData()).objects[0].text).toBe("before close"); serialize.mockRestore();
});

it("reads current live ink even after a cached save, then persists the final stroke", () => {
  const view = new HandwrittenNoteView({} as WorkspaceLeaf);
  view.setViewData(serializeHandwrittenNote(createHandwrittenNote()), true); view.getViewData();
  const viewport = view.contentEl.querySelector<HTMLElement>(".canvas-scribe-note-viewport")!;
  const pointer = (type: string, x: number) => viewport.dispatchEvent(new PointerEvent(type, { bubbles: true, pointerType: "pen", pointerId: 1, clientX: x, clientY: 100, pressure: .5 }));
  pointer("pointerdown", 100); expect(JSON.parse(view.getViewData()).objects[0].points).toHaveLength(1);
  pointer("pointermove", 120); expect(JSON.parse(view.getViewData()).objects[0].points).toHaveLength(2);
  pointer("pointerup", 120); const saved = view.getViewData(); view.clear();
  view.setViewData(saved, true); expect(JSON.parse(view.getViewData()).objects[0].points).toHaveLength(2); view.clear();
});
