// @vitest-environment happy-dom
import { expect, it, vi } from "vitest";
import type { WorkspaceLeaf } from "obsidian";
vi.mock("obsidian", () => ({
  Notice: class {}, setIcon: () => undefined,
  TextFileView: class { contentEl = document.createElement("div"); requestSave = vi.fn(); },
}));
import { HandwrittenNoteView } from "../src/handwritten-note-view";
import { createHandwrittenNote, serializeHandwrittenNote } from "../src/handwritten-note";
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
