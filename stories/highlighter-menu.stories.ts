import type { Meta, StoryObj } from "@storybook/web-components-vite";
import { createHighlighterMenu } from "../src/highlighter-menu";
import { renderStoryIcon } from "./story-helpers";
import type { HighlighterType } from "../src/highlighter-types";

function preview(type: HighlighterType = "round", size = 17, opacity = 0.38) {
  const root = document.createElement("div");
  let menu: HTMLElement | null = null;
  const open = document.createElement("button"); open.textContent = "Highlighter settings";
  function show() {
    menu?.remove();
    menu = createHighlighterMenu(document, {
      type, size, opacity, color: "#fde047", renderIcon: renderStoryIcon,
      onType: (value) => { type = value; }, onSize: (value) => { size = value; },
      onOpacity: (value) => { opacity = value; }, onClose: () => { menu?.remove(); open.focus(); },
      onColors: () => { status.textContent = "Use the Quick Colors story to review the shared palette."; },
    });
    menu.style.position = "relative"; root.append(menu);
  }
  const status = document.createElement("p");
  open.addEventListener("click", show); root.append(open, status); show(); return root;
}
const meta = { title: "Canvas Scribe/Highlighter Menu", render: () => preview() } satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;
export const Round: Story = {};
export const Chisel: Story = { render: () => preview("chisel") };
export const ThickAndOpaque: Story = { render: () => preview("chisel", 60, 0.8) };
export const ThinAndTransparent: Story = { render: () => preview("round", 2, 0.05) };
export const Dark: Story = { globals: { obsidianTheme: "dark" } };
export const Tablet: Story = { globals: { obsidianPlatform: "mobile" } };
