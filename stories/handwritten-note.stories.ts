import type { Meta, StoryObj } from "@storybook/web-components-vite";
import { HandwrittenNoteEditor } from "../src/handwritten-note-editor";
import { createHandwrittenNote, type HandwrittenNoteDocument } from "../src/handwritten-note";
import { renderHandwrittenNotePage } from "../src/handwritten-note-renderer";
import { renderStoryIcon } from "./story-helpers";

function fixture(long = false): HandwrittenNoteDocument {
  const note = createHandwrittenNote();
  note.contentHeight = long ? 5200 : 1200;
  note.objects = [
    { kind: "ink", id: "ink-blue", tool: "pen", penType: "fountain", color: "#2563eb", size: 5, opacity: 1, hasPressure: false, createdAt: 1, points: Array.from({ length: 45 }, (_, i) => ({ x: 100 + i * 12, y: 180 + Math.sin(i / 4) * 26, pressure: .5, time: i })) },
    { kind: "ink", id: "ink-highlight", tool: "highlighter", highlighterType: "round", color: "#fde047", size: 24, opacity: .38, hasPressure: false, createdAt: 2, points: [{ x: 90, y: 345, pressure: .5, time: 1 }, { x: 610, y: 345, pressure: .5, time: 2 }] },
    { kind: "text", id: "text-one", x: 120, y: 300, width: 500, text: "Ordinary text stays editable. [[Link-like text]] remains plain content.", fontSize: 22, color: "var(--text-normal)", align: "left" },
  ];
  if (long) for (let i = 1; i <= 10; i += 1) note.objects.push({ kind: "text", id: `section-${i}`, x: 120, y: 400 + i * 430, width: 660, text: `Long-note section ${i}\nInk and text retain stable document coordinates while the viewport scrolls.`, fontSize: 20, color: "var(--text-normal)", align: "left" });
  return note;
}

function editorStory(long = false): HTMLElement {
  const host = document.createElement("div"); host.style.cssText = "position:absolute;inset:0;display:flex;flex-direction:column;background:var(--background-primary)";
  const note = fixture(long); const editor = new HandwrittenNoteEditor(document, note, () => undefined, renderStoryIcon, true);
  const hint = document.createElement("p"); hint.className = "canvas-scribe-story-hint"; hint.textContent = "Desktop preview: mouse gestures stand in for the stylus. Try Text, Lasso, resize, Delete, Undo, zoom, and scrolling.";
  editor.root.style.cssText = "flex:1;min-height:0;height:auto";
  host.append(hint, editor.root); return host;
}

function embedStory(): HTMLElement {
  const frame = document.createElement("section"); frame.className = "canvas-scribe-note-embed"; frame.style.cssText = "width:min(640px,calc(100% - 48px));margin:24px auto";
  const viewport = document.createElement("div"); viewport.className = "canvas-scribe-note-embed-viewport"; viewport.tabIndex = 0;
  const note = fixture(true); const page = renderHandwrittenNotePage(document, note); page.style.width = "100%"; page.style.height = "auto"; page.style.aspectRatio = `${note.logicalWidth} / ${note.contentHeight}`; viewport.append(page);
  const footer = document.createElement("footer"); footer.innerHTML = "<span>Project notebook.scribe</span><button>Open note</button>";
  frame.append(viewport, footer); return frame;
}

const meta = { title: "Canvas Scribe/Handwritten Note", parameters: { obsidian: { placement: "overlay" } }, render: () => editorStory() } satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;
export const Editor: Story = {};
export const LongDocument: Story = { render: () => editorStory(true) };
export const ReadOnlyEmbed: Story = { render: embedStory };
export const Dark: Story = { globals: { obsidianTheme: "dark" } };
export const Tablet: Story = { globals: { obsidianPlatform: "mobile" } };
