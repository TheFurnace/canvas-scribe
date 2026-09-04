import type { Meta, StoryObj } from "@storybook/web-components-vite";

import { paletteColors, type ColorTool } from "../src/colors";
import { createCanvasControls, syncCanvasControls } from "../src/canvas-controls";
import { renderStoryIcon } from "./story-helpers";

type Tool = "pen" | "highlighter" | "eraser" | "lasso";

interface ToolbarArgs {
  activeTool: Tool;
  enabled: boolean;
  activeColor: string;
  paletteOpen: boolean;
  canUndo: boolean;
  canRedo: boolean;
}

function createToolbar(args: ToolbarArgs): HTMLElement {
  const preview = document.createElement("div");
  preview.className = "canvas-scribe-story-toolbar-preview";
  const group = createCanvasControls(document, renderStoryIcon, {
    setTool: () => undefined,
    toggleColorPalette: () => undefined,
    undo: () => undefined,
    redo: () => undefined,
    toggleEnabled: () => undefined,
  });
  syncCanvasControls(group, args);
  preview.append(group);

  const colorTool = toolWithColor(args.activeTool);
  if (colorTool && args.paletteOpen) preview.append(createColorPalette(colorTool, args.activeColor));
  return preview;
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
  parameters: {
    obsidian: { placement: "controls" },
    docs: {
      description: {
        component: "The production Canvas Scribe control group mounted in Obsidian's real Canvas controls slot.",
      },
    },
  },
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
