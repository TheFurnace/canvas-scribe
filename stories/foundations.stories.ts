import type { Meta, StoryObj } from "@storybook/web-components-vite";
import { createCanvasControls, syncCanvasControls } from "../src/canvas-controls";
import { createPenMenu } from "../src/pen-menu";
import { createColorPicker } from "../src/color-picker";
import type { PenType } from "../src/pen-types";
import type { DrawingTool } from "../src/types";
import { renderStoryIcon } from "./story-helpers";
import "./foundations.css";

function foundations() {
  const root = document.createElement("section");
  root.className = "scribe-foundations";
  root.setAttribute("aria-label", "Canvas Scribe foundations draft");
  const heading = document.createElement("h1");
  heading.textContent = "Foundations · FER-46 draft";
  const intro = document.createElement("p");
  intro.textContent = "Current production components for review. The approved direction is silhouettes in compact controls and illustrated tips in expanded settings. Final artwork and three-page radial navigation are pending FER-49/51.";
  root.append(heading, intro);
  const tokens = document.createElement("div");
  tokens.className = "scribe-foundations-tokens";
  for (const [label, variable] of [
    ["Surface", "--background-primary"], ["Secondary", "--background-secondary"],
    ["Text", "--text-normal"], ["Border", "--background-modifier-border"],
    ["Selected / focus", "--interactive-accent"],
  ]) {
    const item = document.createElement("div");
    const sample = document.createElement("span");
    sample.style.background = `var(${variable})`;
    sample.setAttribute("aria-hidden", "true");
    item.append(sample, document.createTextNode(label!));
    tokens.append(item);
  }
  root.append(tokens);
  const grid = document.createElement("div");
  grid.className = "scribe-foundations-grid";
  const controlsPanel = document.createElement("section");
  const title = document.createElement("h2");
  title.textContent = "Toolbar · current icons";
  controlsPanel.append(title);
  const slot = document.createElement("div");
  slot.className = "canvas-controls scribe-foundations-controls";
  let activeTool: DrawingTool = "pen";
  let type: PenType = "fountain";
  let size = 3.5;
  let color = "#287bc1";
  let highlighterColor = "#fde047";
  let enabled = true;
  const menuPanel = document.createElement("section");
  const menuTitle = document.createElement("h2");
  menuTitle.textContent = "Pen settings · production baseline";
  const menuSlot = document.createElement("div");
  const status = document.createElement("p");
  status.setAttribute("aria-live", "polite");
  const reopen = document.createElement("button");
  reopen.type = "button";
  reopen.textContent = "Open pen settings";
  reopen.onclick = () => { activeTool = "pen"; showMenu(); sync(); };
  menuPanel.append(menuTitle, reopen, menuSlot, status);
  const group = createCanvasControls(document, renderStoryIcon, {
    setTool: (tool) => {
      if (tool === "pen" && activeTool === "pen") {
        if (menuSlot.childElementCount) menuSlot.replaceChildren(); else showMenu();
      } else { activeTool = tool; menuSlot.replaceChildren(); }
      sync();
    },
    toggleColorPalette: () => {
      if (activeTool !== "pen" && activeTool !== "highlighter") return;
      const tool = activeTool;
      const defaultColor = tool === "pen" ? getComputedStyle(root).getPropertyValue("--text-normal").trim() : "#fde047";
      const picker = createColorPicker(document, {
        tool, current: tool === "pen" ? color : highlighterColor, defaultColor, recent: [],
        onConfirm: (value) => {
          if (tool === "pen") color = value ?? defaultColor; else highlighterColor = value ?? defaultColor;
          picker.remove(); if (menuSlot.childElementCount) showMenu(); sync();
        },
        onCancel: () => picker.remove(),
      });
      root.append(picker);
    },
    undo: () => undefined, redo: () => undefined,
    toggleEnabled: () => { enabled = !enabled; sync(); },
  });
  function sync() {
    syncCanvasControls(group, { activeTool, enabled, penType: type, penColor: color,
      highlighterColor, penSize: size, canUndo: false, canRedo: false });
    status.textContent = `${type} · ${size} canvas units`;
  }
  function showMenu() {
    menuSlot.replaceChildren(createPenMenu(document, {
      type, size, color,
      onType: (value) => { type = value; sync(); },
      onSize: (value) => { size = value; sync(); },
      onClose: () => { menuSlot.replaceChildren(); reopen.focus(); },
    }));
  }
  slot.append(group);
  controlsPanel.append(slot);
  const note = document.createElement("p");
  note.textContent = "Undo/redo are disabled: this fixture has no document history. Color opens the production picker; its sample color is local to this review.";
  controlsPanel.append(note);
  grid.append(controlsPanel, menuPanel);
  root.append(grid);
  const rules = document.createElement("p");
  rules.textContent = "Confirmed radial contract: Quick tools / Settings / Favorites; tabs + swipe; variant selection closes; circular size slider stays open after release; radial quick color closes; reopen the last top-level page across documents within this session.";
  root.append(rules);
  showMenu(); sync();
  return root;
}

const meta = {
  title: "Canvas Scribe/Foundations",
  parameters: { obsidian: { placement: "overlay" } },
  render: foundations,
} satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;
export const Overview: Story = {};
export const Dark: Story = { globals: { obsidianTheme: "dark" } };
export const Tablet: Story = { globals: { obsidianPlatform: "mobile" } };
export const TabletDark: Story = { globals: { obsidianPlatform: "mobile", obsidianTheme: "dark" } };
