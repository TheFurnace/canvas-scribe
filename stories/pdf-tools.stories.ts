import type { Meta, StoryObj } from "@storybook/web-components-vite";
import { PdfTools } from "../src/pdf-tools";
import { FavoritePens } from "../src/favorite-pens";
import { renderStoryIcon } from "./story-helpers";

const meta: Meta = { title: "PDF/Annotation tools", parameters: { layout: "fullscreen" } };
export default meta;
type Story = StoryObj;
function preview(width: number, error = false) {
  const root = document.createElement("div"); root.style.cssText = `position:relative;width:${width}px;max-width:100%;height:700px;background:var(--background-primary);padding:24px`;
  const note = document.createElement("p"); note.textContent = error ? "Source changed. Annotations remain preserved for review." : "PDF annotation controls. Tool menus use production components. Host interaction is validated separately in real Obsidian.";
  root.append(note);
  let enabled = !error;
  const tools = new PdfTools(document, renderStoryIcon, { changed: () => sync(), toggle: () => { if (!error) enabled = !enabled; sync(); }, undo: () => {}, redo: () => {}, clear: () => {}, scale: () => {}, recolor: () => {}, remove: () => {} }, new FavoritePens());
  root.append(tools.root);
  function sync() { tools.sync(enabled, !error, false, 0, !error); }
  sync(); return root;
}
export const Desktop: Story = { render: () => preview(1000) };
export const Narrow: Story = { render: () => preview(400) };
export const SourceChanged: Story = { render: () => preview(700, true) };
