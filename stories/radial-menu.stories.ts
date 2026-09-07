import type { Meta, StoryObj } from "@storybook/web-components-vite";
import { resolveColor, ToolColors } from "../src/colors";
import { FavoritePens, type PenPreset } from "../src/favorite-pens";
import { createPenActions } from "../src/pen-actions";
import { RadialSession } from "../src/radial-session";
import { renderStoryIcon } from "./story-helpers";
import type { DrawingTool } from "../src/types";

interface Args { activeTool: DrawingTool; favoriteCount: number; }
const meta: Meta<Args> = {
  title: "Canvas Scribe/Radial Menu", tags: ["autodocs"],
  args: { activeTool: "pen", favoriteCount: 3 },
  parameters: { obsidian: { placement: "overlay" } },
  argTypes: { activeTool: { control: "inline-radio", options: ["pen", "highlighter", "eraser", "lasso"] }, favoriteCount: { control: { type: "range", min: 0, max: 20 } } },
  render: (args) => {
    const host = document.createElement("div"); host.style.padding = "24px";
    const launch = document.createElement("button"); launch.textContent = "Open pen actions";
    const status = document.createElement("p"); status.setAttribute("aria-live", "polite");
    host.append(launch, status);
    let tool = args.activeTool;
    let preset: PenPreset = { tool: "pen", penType: "fountain", size: 3.5, color: null, opacity: 1 };
    const colors = new ToolColors(); colors.confirm("pen", "#2563eb"); colors.confirm("pen", "#dc2626");
    const favorites = new FavoritePens(Array.from({ length: args.favoriteCount }, (_, i) => ({
      id: `favorite-${i}`, name: `Favorite ${i + 1}`, tool: i % 3 === 0 ? "highlighter" : "pen",
      penType: i % 2 === 0 ? "brush" : "fountain", size: i % 3 === 0 ? 17 : 3 + i % 5,
      opacity: i % 3 === 0 ? 0.38 : 1, color: ["#2563eb", "#dc2626", "#fde047"][i % 3],
    })));
    const defaultColor = (tool: "pen" | "highlighter") => tool === "pen" ? resolveColor(host.ownerDocument, host.ownerDocument.defaultView!.getComputedStyle(host).getPropertyValue("--text-normal").trim() || "#1f2937") : "#fde047";
    const update = () => { status.textContent = `${tool} · ${tool === "pen" || tool === "highlighter" ? colors.current(tool, defaultColor(tool)) : "no color"} · ${preset.size}px. Favorites saved in this preview session.`; };
    launch.addEventListener("click", () => {
      const document = host.ownerDocument;
      const menu = new RadialSession(document, createPenActions({ document, tool, colors, favorites,
        currentPreset: tool === "pen" || tool === "highlighter" ? { ...preset, tool, color: colors.selection(tool), size: tool === preset.tool ? preset.size : tool === "highlighter" ? 17 : 3.5, opacity: tool === preset.tool ? preset.opacity : tool === "highlighter" ? 0.38 : 1 } : null,
        defaultColor, selectTool: (value) => { tool = value; update(); },
        applyFavorite: (value) => { preset = value; tool = value.tool; colors.confirm(value.tool, value.color); update(); },
        colorsChanged: update, openCanvasMenu: () => { status.textContent = "Native Canvas menu requested (preview)."; },
      }), () => launch.focus(), renderStoryIcon, host);
      const bounds = host.getBoundingClientRect();
      menu.open(bounds.left + Math.max(130, bounds.width / 2), bounds.top + 230);
    });
    update();
    requestAnimationFrame(() => { if (host.isConnected) launch.click(); });
    return host;
  },
};
export default meta;
type Story = StoryObj<Args>;
export const PenActive: Story = {};
export const EraserActive: Story = { args: { activeTool: "eraser" } };
export const EmptyFavorites: Story = { args: { favoriteCount: 0 } };
export const PagedFavorites: Story = { args: { favoriteCount: 14 } };
export const HighlighterColors: Story = { args: { activeTool: "highlighter" } };
export const DarkTheme: Story = { globals: { obsidianTheme: "dark" } };
export const Tablet: Story = { globals: { obsidianPlatform: "mobile" } };
