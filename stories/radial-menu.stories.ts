import type { Meta, StoryObj } from "@storybook/web-components-vite";

import { createRadialMenuView, type RadialMenuItem } from "../src/radial-menu-view";
import { renderStoryIcon } from "./story-helpers";

type Tool = "pen" | "highlighter" | "eraser";

interface RadialMenuArgs {
  activeTool: Tool;
  canUndo: boolean;
  canRedo: boolean;
}

const actions: ReadonlyArray<Omit<RadialMenuItem, "active" | "disabled">> = [
  { id: "pen", label: "Pen", icon: "pencil" },
  { id: "highlighter", label: "Highlighter", icon: "highlighter" },
  { id: "eraser", label: "Eraser", icon: "eraser" },
  { id: "canvas-menu", label: "Open Canvas menu", icon: "menu" },
  { id: "redo", label: "Redo ink", icon: "redo-2" },
  { id: "undo", label: "Undo ink", icon: "undo-2" },
];

function createRadialMenu(args: RadialMenuArgs): HTMLElement {
  const items = actions.map<RadialMenuItem>((action) => {
    const tool = action.id === "pen" || action.id === "highlighter" || action.id === "eraser";
    return {
      ...action,
      active: tool ? action.id === args.activeTool : undefined,
      disabled: (action.id === "undo" && !args.canUndo) || (action.id === "redo" && !args.canRedo),
    };
  });
  const view = createRadialMenuView(document, items, renderStoryIcon, () => undefined, () => undefined);
  view.palette.style.left = "50%";
  view.palette.style.top = "50%";
  view.root.classList.add("is-open");
  return view.root;
}

const meta: Meta<RadialMenuArgs> = {
  title: "Canvas Scribe/Radial Menu",
  tags: ["autodocs"],
  parameters: {
    obsidian: { placement: "overlay" },
    docs: {
      description: {
        component: "The production radial-menu view mounted over an Obsidian Canvas host.",
      },
    },
  },
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
