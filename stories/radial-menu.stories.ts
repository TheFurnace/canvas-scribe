import type { Meta, StoryObj } from "@storybook/web-components-vite";

import { icon, storyStage, type IconName } from "./story-helpers";

type Tool = "pen" | "highlighter" | "eraser";

interface RadialMenuArgs {
  activeTool: Tool;
  canUndo: boolean;
  canRedo: boolean;
}

const actions: ReadonlyArray<{ id: string; label: string; iconName: IconName }> = [
  { id: "pen", label: "Pen", iconName: "pencil" },
  { id: "highlighter", label: "Highlighter", iconName: "highlighter" },
  { id: "eraser", label: "Eraser", iconName: "eraser" },
  { id: "canvas-menu", label: "Open Canvas menu", iconName: "menu" },
  { id: "redo", label: "Redo ink", iconName: "redo" },
  { id: "undo", label: "Undo ink", iconName: "undo" },
];

function createRadialMenu(args: RadialMenuArgs): HTMLElement {
  const root = document.createElement("div");
  root.className = "canvas-scribe-radial-menu canvas-scribe-story-radial is-open";
  root.setAttribute("role", "presentation");

  const palette = document.createElement("div");
  palette.className = "canvas-scribe-radial-palette";
  palette.setAttribute("role", "menu");
  palette.setAttribute("aria-label", "Canvas Scribe pen actions");

  actions.forEach((action, index) => {
    const button = document.createElement("button");
    button.className = "canvas-scribe-radial-action";
    button.type = "button";
    button.dataset.action = action.id;
    button.setAttribute("aria-label", action.label);
    button.setAttribute("title", action.label);
    const angle = -90 + index * (360 / actions.length);
    button.style.setProperty("--canvas-scribe-radial-angle", `${angle}deg`);
    button.style.setProperty("--canvas-scribe-radial-angle-inverse", `${-angle}deg`);

    const isTool = action.id === "pen" || action.id === "highlighter" || action.id === "eraser";
    if (isTool) {
      const active = action.id === args.activeTool;
      button.setAttribute("role", "menuitemradio");
      button.setAttribute("aria-checked", String(active));
      button.classList.toggle("is-active", active);
    } else {
      button.setAttribute("role", "menuitem");
    }
    button.disabled = (action.id === "undo" && !args.canUndo) || (action.id === "redo" && !args.canRedo);
    button.append(icon(action.iconName));
    palette.append(button);
  });

  const close = document.createElement("button");
  close.className = "canvas-scribe-radial-close";
  close.type = "button";
  close.setAttribute("role", "menuitem");
  close.setAttribute("aria-label", "Close pen actions");
  close.setAttribute("title", "Close");
  close.append(icon("x"));
  palette.append(close);
  root.append(palette);
  return storyStage(root);
}

const meta: Meta<RadialMenuArgs> = {
  title: "Canvas Scribe/Radial Menu",
  tags: ["autodocs"],
  render: (args) => createRadialMenu(args),
  args: {
    activeTool: "pen",
    canUndo: true,
    canRedo: false,
  },
  argTypes: {
    activeTool: { control: "inline-radio", options: ["pen", "highlighter", "eraser"] },
  },
};

export default meta;
type Story = StoryObj<RadialMenuArgs>;

export const PenActive: Story = {};

export const EraserActive: Story = {
  args: {
    activeTool: "eraser",
  },
};

export const EmptyHistory: Story = {
  args: {
    canUndo: false,
    canRedo: false,
  },
};
