import { Notice, setIcon, TextFileView, type TFile, type WorkspaceLeaf } from "obsidian";
import { HandwrittenNoteEditor } from "./handwritten-note-editor";
import { createHandwrittenNote, parseHandwrittenNote, serializeHandwrittenNote, UnsupportedHandwrittenNoteError } from "./handwritten-note";

export const HANDWRITTEN_NOTE_VIEW_TYPE = "canvas-scribe-handwritten-note";

export class HandwrittenNoteView extends TextFileView {
  private editor: HandwrittenNoteEditor | null = null;
  private error: HTMLElement | null = null;
  private rawData = serializeHandwrittenNote(createHandwrittenNote());

  constructor(leaf: WorkspaceLeaf) { super(leaf); }
  getViewType(): string { return HANDWRITTEN_NOTE_VIEW_TYPE; }
  getDisplayText(): string { return this.file?.basename ?? "Handwritten note"; }
  getIcon(): string { return "pencil"; }
  getViewData(): string { return this.editor ? serializeHandwrittenNote(this.editor.getDocument()) : this.rawData; }

  setViewData(data: string, clear: boolean): void {
    this.rawData = data;
    try {
      const note = parseHandwrittenNote(data);
      this.error?.remove(); this.error = null;
      if (this.editor) this.editor.setDocument(note, clear);
      else {
        this.editor = new HandwrittenNoteEditor(this.contentEl.ownerDocument, note, (changed) => { this.rawData = serializeHandwrittenNote(changed); this.requestSave(); }, setIcon);
        this.contentEl.replaceChildren(this.editor.root);
      }
    } catch (error) { this.showError(error); }
  }

  clear(): void { this.editor?.destroy(); this.editor = null; this.error?.remove(); this.error = null; this.contentEl.replaceChildren(); }
  onResize(): void { /* Logical coordinates remain stable; Fit is an explicit user action. */ }

  private showError(error: unknown): void {
    this.editor?.destroy(); this.editor = null; this.contentEl.replaceChildren();
    const state = this.contentEl.ownerDocument.createElement("div");
    state.className = "canvas-scribe-note-error";
    const title = this.contentEl.ownerDocument.createElement("h3");
    title.textContent = error instanceof UnsupportedHandwrittenNoteError ? "Unsupported handwritten note" : "Could not open handwritten note";
    const message = this.contentEl.ownerDocument.createElement("p"); message.textContent = error instanceof Error ? error.message : "The file was preserved unchanged.";
    const detail = this.contentEl.ownerDocument.createElement("p"); detail.textContent = "Canvas Scribe will not modify this file. Update the plugin or restore a valid copy to continue.";
    state.append(title, message, detail); this.contentEl.append(state); this.error = state;
    new Notice(title.textContent);
  }
}

export async function createNewHandwrittenNoteFile(create: (path: string, data: string) => Promise<TFile>, exists: (path: string) => boolean): Promise<TFile> {
  let index = 0, path = "Untitled.scribe";
  while (exists(path)) { index += 1; path = `Untitled ${index}.scribe`; }
  return create(path, serializeHandwrittenNote(createHandwrittenNote()));
}
