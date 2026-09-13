import type { Meta, StoryObj } from "@storybook/web-components-vite";
import { InkToolState } from "../src/ink-tool-state";
import { FavoritePens } from "../src/favorite-pens";
import { HandwrittenNoteEditor } from "../src/handwritten-note-editor";
import { createHandwrittenNote } from "../src/handwritten-note";
import { PdfTools } from "../src/pdf-tools";
import { renderStoryIcon } from "./story-helpers";

export function createSharedToolsPreview(): HTMLElement {
  const root = document.createElement("section"); root.style.cssText = "position:absolute;inset:0;overflow:auto;background:var(--background-primary);padding:20px;display:flex;flex-wrap:wrap;align-content:flex-start;gap:16px";
  const hint = document.createElement("p"); hint.textContent = "Shared tools: change a pen or color in either view. Default follows each surface. Right-click the note or PDF preview for the same radial. Mouse drawing is enabled in the note preview.";
  hint.style.width = "100%"; root.append(hint);
  const state = new InkToolState(), favorites = new FavoritePens();
  favorites.add({ tool: "pen", penType: "pencil", color: null, size: 6, opacity: .7 });
  const pdfPage = document.createElement("section"); pdfPage.style.cssText = "position:relative;min-width:0;max-width:100%;flex:1 1 400px;height:550px;background:white;color:#1f2937;border:1px solid #888;padding:20px";
  const caption = document.createElement("p"); caption.textContent = "PDF page preview · default ink remains dark on white paper"; pdfPage.append(caption);
  let enabled = true;
  const pdf = new PdfTools(document, renderStoryIcon, { changed: () => sync(), toggle: () => { enabled = !enabled; sync(); }, undo: () => {}, redo: () => {}, clear: () => {}, scale: () => {}, recolor: () => {}, remove: () => {} }, favorites, state);
  pdfPage.append(pdf.root); pdfPage.addEventListener("contextmenu", e => { e.preventDefault(); pdf.openRadial(e.clientX, e.clientY); }); root.append(pdfPage);
  function sync() { pdf.sync(enabled, false, false, 0, false); }
  sync();
  const note = createHandwrittenNote();
  note.objects = [
    { kind: "text", id: "text", x: 160, y: 100, width: 300, fontSize: 24, text: "Select this text and the ink together", align: "left", color: "var(--text-normal)" },
    { kind: "ink", id: "ink", tool: "pen", color: "#2563eb", size: 5, opacity: 1, hasPressure: false, createdAt: 1, points: [{ x: 70, y: 120, time: 0, pressure: .5 }, { x: 140, y: 150, time: 1, pressure: .5 }] },
  ];
  const editor = new HandwrittenNoteEditor(document, note, () => {}, renderStoryIcon, true, favorites, document.body, state);
  editor.root.style.cssText = "height:550px;min-height:400px;min-width:0;max-width:100%;flex:1 1 400px"; root.append(editor.root);
  let mounted = false;
  const cleanup = new MutationObserver(() => { if (root.isConnected) mounted = true; else if (mounted) { cleanup.disconnect(); pdf.destroy(); editor.destroy(); } });
  cleanup.observe(document.body, { childList: true, subtree: true });
  return root;
}
const meta = { title: "Canvas Scribe/Shared Tools", excludeStories: ["createSharedToolsPreview"], parameters: { obsidian: { placement: "overlay" } }, render: createSharedToolsPreview } satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;
export const Desktop: Story = {};
export const Dark: Story = { globals: { obsidianTheme: "dark" } };
export const Tablet: Story = { globals: { obsidianPlatform: "mobile" } };
