import type { Meta, StoryObj } from "@storybook/web-components-vite";

import { icon, storyCard, storyStage, type IconName } from "./story-helpers";

type Tool = "pen" | "highlighter" | "eraser";

interface ToolbarArgs {
  activeTool: Tool;
  enabled: boolean;
  canUndo: boolean;
  canRedo: boolean;
}

const controls: ReadonlyArray<{ action: string; label: string; iconName: IconName }> = [
  { action: "pen", label: "Pen", iconName: "pencil" },
  { action: "highlighter", label: "Highlighter", iconName: "highlighter" },
  { action: "eraser", label: "Eraser", iconName: "eraser" },
  { action: "undo", label: "Undo ink", iconName: "undo" },
  { action: "redo", label: "Redo ink", iconName: "redo" },
  { action: "toggle", label: "Toggle pen input", iconName: "pen-tool" },
];

function createToolbar(args: ToolbarArgs): HTMLElement {
  const canvasControls = document.createElement("div");
  canvasControls.className = "canvas-controls canvas-scribe-story-toolbar";

  const group = document.createElement("div");
  group.className = "canvas-control-group mod-raised canvas-scribe-controls";
  group.setAttribute("aria-label", "Canvas Scribe tools");

  for (const control of controls) {
    const button = document.createElement("div");
    button.className = "canvas-control-item canvas-scribe-control-item";
    button.dataset.action = control.action;
    button.setAttribute("aria-label", control.label);
    button.setAttribute("role", "button");
    button.setAttribute("title", control.label);
    button.tabIndex = 0;

    const isTool = control.action === "pen" || control.action === "highlighter" || control.action === "eraser";
    const active = (isTool && args.enabled && control.action === args.activeTool) || (control.action === "toggle" && args.enabled);
    if (active) button.classList.add("is-active");
    if (isTool || control.action === "toggle") button.setAttribute("aria-pressed", String(active));
    if ((control.action === "undo" && !args.canUndo) || (control.action === "redo" && !args.canRedo)) {
      button.classList.add("is-disabled");
      button.setAttribute("aria-disabled", "true");
    }

    button.append(icon(control.iconName));
    group.append(button);
  }

  canvasControls.append(group);
  return storyStage(
    storyCard(
      "Canvas toolbar",
      "The compact control group injected into Obsidian Canvas. Use the controls panel to preview tool and history states.",
      canvasControls,
    ),
  );
}

const meta: Meta<ToolbarArgs> = {
  title: "Canvas Scribe/Toolbar",
  tags: ["autodocs"],
  render: (args) => createToolbar(args),
  args: {
    activeTool: "pen",
    enabled: true,
    canUndo: true,
    canRedo: false,
  },
  argTypes: {
    activeTool: { control: "inline-radio", options: ["pen", "highlighter", "eraser"] },
  },
};

export default meta;
type Story = StoryObj<ToolbarArgs>;

export const PenActive: Story = {};

export const HighlighterActive: Story = {
  args: {
    activeTool: "highlighter",
    canRedo: true,
  },
};

export const InputDisabled: Story = {
  args: {
    enabled: false,
    canUndo: false,
  },
};
