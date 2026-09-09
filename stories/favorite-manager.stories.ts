import type { Meta, StoryObj } from "@storybook/web-components-vite";
import { createFavoriteManager } from "../src/favorite-manager";
import { FavoritePens } from "../src/favorite-pens";

function preview(empty = false, edit = false, large = false) {
  const root = document.createElement("div");
  const store = new FavoritePens();
  const preset = { tool: "highlighter", penType: "fountain", highlighterType: "chisel", size: 60, opacity: 0.38, color: null } as const;
  if (!empty) store.add(preset);
  const open = document.createElement("button"); open.textContent = "Manage favorites";
  const show = () => {
    const panel = createFavoriteManager(document, store, preset, () => "#fde047", () => { panel.remove(); open.focus(); });
    if (large) panel.querySelector<HTMLElement>("section")!.style.fontSize = "24px";
    root.append(panel);
    if (edit) Array.from(panel.querySelectorAll("button")).find((button) => button.textContent === "Edit")?.click();
  };
  open.addEventListener("click", show); root.append(open); show(); return root;
}
const meta = { title: "Canvas Scribe/Favorite Manager", render: () => preview(), parameters: { obsidian: { placement: "content" } } } satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;
export const Saved: Story = {};
export const Empty: Story = { render: () => preview(true) };
export const EditHighlighter: Story = { render: () => preview(false, true) };
export const Dark: Story = { render: () => preview(false, true), globals: { obsidianTheme: "dark" } };
export const Tablet: Story = { render: () => preview(false, true), globals: { obsidianPlatform: "mobile" } };
export const LargeText: Story = { render: () => preview(false, true, true) };
