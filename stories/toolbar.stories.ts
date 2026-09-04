import type { Meta, StoryObj } from "@storybook/web-components-vite";

import { paletteColors, type ColorTool } from "../src/colors";
import { icon, storyCard, storyStage, type IconName } from "./story-helpers";

type Tool = "pen" | "highlighter" | "eraser" | "lasso";

interface ToolbarArgs {
  activeTool: Tool;
  enabled: boolean;
  activeColor: string;
  paletteOpen: boolean;
  canUndo: boolean;
  canRedo: boolean;
}

const controls: ReadonlyArray<{ action: string; label: string; iconName: IconName }> = [
  { action: "pen", label: "Pen", iconName: "pen-tool" },
  { action: "highlighter", label: "Highlighter", iconName: "highlighter" },
  { action: "eraser", label: "Eraser", iconName: "eraser" },
  { action: "lasso", label: "Lasso ink", iconName: "lasso-select" },
  { action: "color", label: "Choose pen color", iconName: "palette" },
  { action: "undo", label: "Undo ink", iconName: "undo-2" },
  { action: "redo", label: "Redo ink", iconName: "redo-2" },
  { action: "toggle", label: "Toggle stylus input", iconName: "pencil" },
];

function createToolbar(args: ToolbarArgs): HTMLElement {
  const preview = document.createElement("div");
  preview.className = "canvas-scribe-story-toolbar-preview";

  const canvasControls = document.createElement("div");
  canvasControls.className = "canvas-controls canvas-scribe-story-toolbar";

  const group = document.createElement("div");
  group.className = "canvas-control-group mod-raised canvas-scribe-controls";
  group.setAttribute("aria-label", "Canvas Scribe tools");
  const colorTool = toolWithColor(args.activeTool);

  for (const control of controls) {
    const button = document.createElement("div");
    button.className = "canvas-control-item canvas-scribe-control-item";
    button.dataset.action = control.action;
    button.setAttribute("role", "button");
    button.tabIndex = 0;

    const isTool = control.action === "pen" || control.action === "highlighter" || control.action === "eraser" || control.action === "lasso";
    const active = (isTool && args.enabled && control.action === args.activeTool) || (control.action === "toggle" && args.enabled);
    if (active) button.classList.add("is-active");
    if (isTool || control.action === "toggle") button.setAttribute("aria-pressed", String(active));

    let label = control.label;
    if (control.action === "color") {
      label = colorTool ? `Choose ${colorTool} color` : "Choose a pen or highlighter first";
      button.classList.toggle("is-disabled", colorTool === null);
      button.classList.toggle("is-active", colorTool !== null && args.paletteOpen);
      button.setAttribute("aria-disabled", String(colorTool === null));
      if (colorTool) button.style.setProperty("--canvas-scribe-active-color", args.activeColor);
    } else if ((control.action === "undo" && !args.canUndo) || (control.action === "redo" && !args.canRedo)) {
      button.classList.add("is-disabled");
      button.setAttribute("aria-disabled", "true");
    }

    button.setAttribute("aria-label", label);
    button.setAttribute("title", label);
    button.append(icon(control.iconName));
    group.append(button);
  }

  canvasControls.append(group);
  preview.append(canvasControls);
  if (colorTool && args.paletteOpen) preview.append(createColorPalette(colorTool, args.activeColor));
  return storyStage(
    storyCard(
      "Canvas toolbar",
      "The current control group with pen, highlighter, eraser, lasso, quick colors, ink history, and the stylus-input toggle.",
      preview,
    ),
  );
}

function createColorPalette(tool: ColorTool, activeColor: string): HTMLElement {
  const palette = document.createElement("div");
  palette.className = "canvas-scribe-color-palette canvas-scribe-story-color-palette";
  palette.setAttribute("role", "toolbar");
  palette.setAttribute("aria-label", `${tool} colors`);
  for (const color of paletteColors(tool, activeColor)) {
    const swatch = document.createElement("button");
    swatch.type = "button";
    swatch.className = "canvas-scribe-color-swatch";
    swatch.setAttribute("aria-label", `Use ${color} for ${tool}`);
    swatch.setAttribute("aria-pressed", String(color.toLowerCase() === activeColor.toLowerCase()));
    const colorPreview = document.createElement("span");
    colorPreview.className = "canvas-scribe-color-swatch-preview";
    colorPreview.style.backgroundColor = color;
    swatch.append(colorPreview);
    palette.append(swatch);
  }
  return palette;
}

function toolWithColor(tool: Tool): ColorTool | null {
  return tool === "pen" || tool === "highlighter" ? tool : null;
}

const meta: Meta<ToolbarArgs> = {
  title: "Canvas Scribe/Toolbar",
  tags: ["autodocs"],
  render: (args) => createToolbar(args),
  args: {
    activeTool: "pen",
    enabled: true,
    activeColor: "#2563eb",
    paletteOpen: false,
    canUndo: true,
    canRedo: false,
  },
  argTypes: {
    activeTool: { control: "inline-radio", options: ["pen", "highlighter", "eraser", "lasso"] },
    activeColor: { control: "color" },
  },
};

export default meta;
type Story = StoryObj<ToolbarArgs>;

export const PenActive: Story = {};

export const PaletteOpen: Story = {
  args: {
    paletteOpen: true,
    canRedo: true,
  },
};

export const HighlighterActive: Story = {
  args: {
    activeTool: "highlighter",
    activeColor: "#fde047",
    canRedo: true,
  },
};

export const LassoActive: Story = {
  args: {
    activeTool: "lasso",
  },
};

export const InputDisabled: Story = {
  args: {
    enabled: false,
    canUndo: false,
  },
};
