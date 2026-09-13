// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from "vitest";
import type { Plugin } from "obsidian";
import { TFile } from "obsidian";
import { registerHandwrittenNoteEmbeds } from "../src/handwritten-note-embeds";
import { createHandwrittenNote, serializeHandwrittenNote } from "../src/handwritten-note";
vi.mock("obsidian", () => ({ TFile: class TFile { path = "note.scribe"; basename = "note"; } }));
const disposers: (() => void)[] = [];
afterEach(() => { disposers.splice(0).forEach(fn => fn()); document.body.replaceChildren(); });
it("mounts only embed surfaces and refreshes existing frames once per file event", async () => {
  const file = new TFile();
  const note = createHandwrittenNote();
  let exists = true;
  const handlers = new Map<string, (...args: any[]) => void>();
  const read = vi.fn(async () => serializeHandwrittenNote(note));
  document.body.innerHTML = '<div class="nav-file" data-path="note.scribe">note</div><div class="internal-embed" src="note.scribe"></div><div class="internal-embed" src="note.scribe"></div>';
  const plugin = { app: { vault: { getAbstractFileByPath: () => exists ? file : null, cachedRead: read, on: (name: string, fn: (...args: any[]) => void) => handlers.set(name, fn) }, metadataCache: { getFirstLinkpathDest: () => exists ? file : null }, workspace: { getActiveFile: () => null, getLeavesOfType: () => [] } }, registerMarkdownPostProcessor: vi.fn(), register: (fn: () => void) => disposers.push(fn), registerEvent: vi.fn() } as unknown as Plugin;
  registerHandwrittenNoteEmbeds(plugin);
  await vi.waitFor(() => expect(document.querySelectorAll('.canvas-scribe-note-embed footer')).toHaveLength(2));
  expect(document.querySelector('.nav-file')?.textContent).toBe('note');
  read.mockClear();
  note.objects.push({ kind: 'text', id: 't', x: 1, y: 2, width: 300, fontSize: 18, color: 'var(--text-normal)', align: 'left', text: 'Updated text' });
  handlers.get('modify')!(file);
  await vi.waitFor(() => expect(document.querySelectorAll('.canvas-scribe-note-text-readonly')).toHaveLength(2));
  expect(read).toHaveBeenCalledTimes(2);
  // Obsidian finishes its generic embed renderer after the postprocessor.
  document.querySelector('.internal-embed')!.textContent = 'Native fallback';
  await vi.waitFor(() => expect(document.querySelectorAll('.canvas-scribe-note-embed footer')).toHaveLength(2));
  file.path = 'renamed.scribe';
  handlers.get('rename')!(file, 'note.scribe');
  await vi.waitFor(() => expect(Array.from(document.querySelectorAll('.canvas-scribe-note-embed')).every(e => (e as HTMLElement).dataset.path === 'renamed.scribe')).toBe(true));
  let finishRead!: (raw: string) => void;
  read.mockImplementationOnce(() => new Promise<string>(resolve => { finishRead = resolve; }));
  handlers.get('modify')!(file);
  exists = false;
  handlers.get('delete')!(file);
  finishRead(serializeHandwrittenNote(note));
  await Promise.resolve();
  await Promise.resolve();
  expect(document.querySelectorAll('.canvas-scribe-note-embed strong')).toHaveLength(2);
});

it("keeps an inactive split's canonical preview and Open note target through renderer replacement and rename", async () => {
  const a = Object.assign(new TFile(), { path: "folder-a/drawing.scribe", basename: "drawing" });
  const b = Object.assign(new TFile(), { path: "folder-b/drawing.scribe", basename: "drawing" });
  const files = new Map([[a.path, a], [b.path, b]]);
  const handlers = new Map<string, (...args: any[]) => void>();
  const openFile = vi.fn();
  const active = vi.fn(() => ({ path: "folder-b/owner.md" }));
  const owner = document.createElement("div"); document.body.append(owner);
  owner.innerHTML = '<div class="internal-embed" src="drawing.scribe"></div>';
  const read = vi.fn(async (file: TFile) => {
    const note = createHandwrittenNote();
    note.objects.push({ kind: "text", id: "text", x: 10, y: 10, width: 300, text: file === a ? "Original A" : "Wrong B", fontSize: 18, color: "#000000", align: "left" });
    return serializeHandwrittenNote(note);
  });
  let postprocess!: (el: HTMLElement, context: any) => void;
  const plugin = { app: {
    vault: { getAbstractFileByPath: (path: string) => files.get(path), cachedRead: read, on: (name: string, fn: (...args: any[]) => void) => handlers.set(name, fn) },
    metadataCache: { getFirstLinkpathDest: (_path: string, source: string) => source.startsWith("folder-a/") ? a : b },
    workspace: { getActiveFile: active, getLeavesOfType: () => [], getLeaf: () => ({ openFile }) },
  }, registerMarkdownPostProcessor: (fn: typeof postprocess) => { postprocess = fn; }, register: (fn: () => void) => disposers.push(fn), registerEvent: vi.fn() } as unknown as Plugin;
  registerHandwrittenNoteEmbeds(plugin);
  postprocess(owner, { sourcePath: "folder-a/owner.md" });
  const check = async () => {
    await vi.waitFor(() => expect(owner.querySelector(".canvas-scribe-note-text-readonly")?.textContent).toBe("Original A"));
    owner.querySelector<HTMLButtonElement>("button")!.click(); expect(openFile).toHaveBeenLastCalledWith(a);
  };
  await check();
  owner.querySelector(".internal-embed")!.replaceChildren(); await check();
  // Replacement of the entire native host recovers its owning postprocessor context.
  owner.innerHTML = '<div class="internal-embed" src="drawing.scribe"></div>'; await check();
  files.delete(a.path); a.path = "folder-a/renamed.scribe"; files.set(a.path, a); handlers.get("rename")!(a, "folder-a/drawing.scribe");
  owner.querySelector(".internal-embed")!.replaceChildren(); await check();
  expect(active).not.toHaveBeenCalled(); expect(read.mock.calls.every(([file]) => file === a)).toBe(true);
});
