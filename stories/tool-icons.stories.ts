import type { Meta, StoryObj } from "@storybook/web-components-vite";
import { TOOL_ARTWORK, type ToolIcon } from "../src/tool-icons";
import { createToolIconButton } from "../src/tool-icon-button";
import { createPenMenu } from "../src/pen-menu";
import { createCanvasControls, syncCanvasControls } from "../src/canvas-controls";
import type { PenType } from "../src/pen-types";
import type { DrawingTool } from "../src/types";
import { renderStoryIcon } from "./story-helpers";
import "./tool-icons.css";

function gallery() {
  const root = document.createElement("section");
  root.className = "scribe-icon-review";
  root.setAttribute("aria-label", "Tool icon family review");
  const text = (tag: string, value: string, parent: HTMLElement = root) => {
    const node = document.createElement(tag); node.textContent = value; parent.append(node); return node;
  };
  text("p", "CANVAS SCRIBE / TOOL FAMILY", root).className = "scribe-icon-eyebrow";
  text("h1", "A tip for every tool");
  text("p", "Original upright silhouettes at 24 px. Matching illustrated tips at 48 px. Select a sample to inspect its state; Tab through to inspect focus.");
  const grid = document.createElement("div"); grid.className = "scribe-icon-grid"; root.append(grid);
  const status = document.createElement("p"); status.setAttribute("aria-live", "polite");
  status.textContent = "Artwork review · planned variants are samples, not drawing controls.";
  for (const tool of Object.keys(TOOL_ARTWORK) as ToolIcon[]) {
    const card = document.createElement("section"); card.className = "scribe-icon-card";
    text("h2", TOOL_ARTWORK[tool].label, card);
    const row = document.createElement("div"); row.className = "scribe-icon-samples";
    for (const style of ["silhouette", "tip"] as const) {
      const button = createToolIconButton(document, renderStoryIcon, { tool, style, color: "#287bc1",
        onSelect: () => {
          button.setAttribute("aria-pressed", String(button.getAttribute("aria-pressed") !== "true"));
          status.textContent = `${TOOL_ARTWORK[tool].label} ${style} ${button.getAttribute("aria-pressed") === "true" ? "selected" : "unselected"}.`;
        },
      });
      row.append(button);
    }
    card.append(row); grid.append(card);
  }
  root.append(status);
  const states = document.createElement("section"); text("h2", "Selection, contrast & touch", states);
  const stateRow = document.createElement("div"); stateRow.className = "scribe-icon-states";
  for (const [label, color, selected, disabled] of [
    ["Default", "var(--text-normal)", false, false], ["Selected", "#287bc1", true, false],
    ["Black ink", "#000000", false, false], ["White ink", "#ffffff", false, false],
    ["Disabled", "#287bc1", false, true],
  ] as const) {
    const sample = document.createElement("div");
    sample.append(createToolIconButton(document, renderStoryIcon, { tool: "fountain", color, selected, disabled }));
    text("span", label, sample); stateRow.append(sample);
  }
  states.append(stateRow); root.append(states);
  text("p", "Selection adds a check and inset border. Ink stays in the separate bordered swatch. Desktop targets are 36 px; tablet targets are 44 px.", states);
  const context = document.createElement("section"); context.className = "scribe-icon-context";
  const toolbarPanel = document.createElement("div"); text("h2", "In the toolbar", toolbarPanel);
  const slot = document.createElement("div"); slot.className = "canvas-controls scribe-icon-toolbar";
  let penType: PenType = "fountain"; let activeTool: DrawingTool = "pen"; let enabled = true;
  const toolbar = createCanvasControls(document, renderStoryIcon, {
    setTool: (tool) => { activeTool = tool; sync(); }, toggleColorPalette: () => undefined,
    undo: () => undefined, redo: () => undefined, toggleEnabled: () => { enabled = !enabled; sync(); },
  });
  function sync() { syncCanvasControls(toolbar, { activeTool, penType, enabled, penColor: "#287bc1", highlighterColor: "#fde047", canUndo: false, canRedo: false }); }
  sync(); slot.append(toolbar); toolbarPanel.append(slot);
  const menuPanel = document.createElement("div"); text("h2", "In pen settings", menuPanel);
  const menu = createPenMenu(document, { renderIcon: renderStoryIcon, type: penType, size: 3.5, color: "#287bc1",
    onType: (value) => { penType = value; activeTool = "pen"; sync(); }, onSize: () => undefined,
    onClose: () => { menu.hidden = true; reopen.hidden = false; },
  });
  const reopen = document.createElement("button"); reopen.textContent = "Open pen settings"; reopen.hidden = true;
  reopen.onclick = () => { menu.hidden = false; reopen.hidden = true; };
  menuPanel.append(menu, reopen); context.append(toolbarPanel, menuPanel); root.append(context);
  return root;
}

const meta = { title: "Canvas Scribe/Tool Icons", parameters: { obsidian: { placement: "overlay" } }, render: gallery } satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;
export const Family: Story = {};
export const Dark: Story = { globals: { obsidianTheme: "dark" } };
export const Tablet: Story = { globals: { obsidianPlatform: "mobile" } };
