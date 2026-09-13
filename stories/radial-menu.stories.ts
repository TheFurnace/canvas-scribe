import type { Meta, StoryObj } from "@storybook/web-components-vite";
import { resolveColor, ToolColors } from "../src/colors";
import { FavoritePens, type PenPreset } from "../src/favorite-pens";
import { createRadialPages } from "../src/radial-pages";
import { RadialSession } from "../src/radial-session";
import { renderStoryIcon } from "./story-helpers";
import type { DrawingTool } from "../src/types";
import { createCanvasControls, syncCanvasControls } from "../src/canvas-controls";
import { createPenMenu } from "../src/pen-menu";
import { PEN_PROFILES } from "../src/pen-types";
import { createColorPicker } from "../src/color-picker";

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
    let eraserMode: "stroke" | "area" = "stroke";
    const presets: Record<"pen" | "highlighter", PenPreset> = {
      pen: { tool: "pen", penType: "fountain", size: 3.5, color: null, opacity: 1 },
      highlighter: { tool: "highlighter", penType: "fountain", size: 17, color: null, opacity: 0.38 },
    };
    let enabled = true;
    let penMenu: HTMLElement | null = null;
    const closePenMenu = () => { penMenu?.remove(); penMenu = null; };
    const toolbar = createCanvasControls(document, renderStoryIcon, {
      setTool: (value) => {
        if (value === "pen" && tool === "pen") {
          if (penMenu) closePenMenu();
          else {
            penMenu = createPenMenu(document, {
              renderIcon: renderStoryIcon,
              type: presets.pen.penType, size: presets.pen.size, color: colors.current("pen", "var(--text-normal)"),
              onType: (type) => { presets.pen.penType = type; presets.pen.opacity = PEN_PROFILES[type].opacity; update(); },
              onSize: (size) => { presets.pen.size = size; update(); }, onClose: closePenMenu,
            });
            penMenu.style.cssText = "position:absolute;right:48px;top:0";
            toolbar.append(penMenu);
          }
        } else { tool = value; closePenMenu(); }
        update();
      },
      toggleColorPalette: () => {
        if (tool !== "pen" && tool !== "highlighter") return;
        closePenMenu();
        const colorTool = tool;
        const picker = createColorPicker(document, { tool: colorTool,
          current: colors.current(colorTool, defaultColor(colorTool)), defaultColor: defaultColor(colorTool), recent: colors.recent(colorTool),
          onConfirm: (color) => { colors.confirm(colorTool, color); picker.remove(); update(); }, onCancel: () => picker.remove(),
        });
        host.append(picker);
      },
      toggleEnabled: () => { enabled = !enabled; update(); }, undo: () => undefined, redo: () => undefined,
    });
    toolbar.style.cssText = "position:absolute;right:12px;top:12px;display:flex;flex-direction:column";
    host.append(toolbar);
    const colors = new ToolColors();
    for (const color of ["#754c98", "#287d76", "#2563eb", "#dc2626"]) colors.confirm("pen", color);
    for (const color of ["#c4b5fd", "#fda4af", "#67e8f9"]) colors.confirm("highlighter", color);
    colors.confirm("highlighter", null);
    const favorites = new FavoritePens(Array.from({ length: args.favoriteCount }, (_, i) => ({
      id: `favorite-${i}`, name: `Favorite ${i + 1}`, tool: i % 3 === 0 ? "highlighter" : "pen",
      penType: i % 2 === 0 ? "brush" : "fountain", size: i % 3 === 0 ? 17 : 3 + i % 5,
      opacity: i % 3 === 0 ? 0.38 : 1, color: ["#2563eb", "#dc2626", "#fde047"][i % 3],
    })));
    const defaultColor = (tool: "pen" | "highlighter") => tool === "pen" ? resolveColor(host.ownerDocument, host.ownerDocument.defaultView!.getComputedStyle(host).getPropertyValue("--text-normal").trim() || "#1f2937") : "#fde047";
    const update = () => {
      const preset = tool === "pen" || tool === "highlighter" ? presets[tool] : null;
      status.textContent = preset ? `${tool} · ${colors.current(preset.tool, defaultColor(preset.tool))} · ${preset.size}px · ${Math.round(preset.opacity * 100)}%. Favorites saved in this preview session.` : `${tool} selected`;
      syncCanvasControls(toolbar, { activeTool: tool, enabled, canUndo: false, canRedo: false,
        penType: presets.pen.penType, penColor: colors.current("pen", "var(--text-normal)"), highlighterColor: colors.current("highlighter", "#fde047"),
        penSize: presets.pen.size, penOpacity: presets.pen.opacity, highlighterSize: presets.highlighter.size, highlighterOpacity: presets.highlighter.opacity });
    };
    launch.addEventListener("click", () => {
      const document = host.ownerDocument;
      closePenMenu();
      const menu = new RadialSession(document, createRadialPages({ document, tool, colors, favorites,
        currentPreset: tool === "pen" || tool === "highlighter" ? { ...presets[tool], color: colors.selection(tool) } : null,
        penType: presets.pen.penType,
        highlighterType: presets.highlighter.highlighterType ?? "round", eraserMode,
        selectPen: (type) => { tool = "pen"; presets.pen.penType = type; presets.pen.opacity = PEN_PROFILES[type].opacity; update(); },
        selectHighlighter: (type) => { tool = "highlighter"; presets.highlighter.highlighterType = type; update(); },
        selectEraser: (mode) => { tool = "eraser"; eraserMode = mode; update(); },
        getSize: () => (tool === "pen" ? presets.pen : presets.highlighter).size,
        setSize: (size) => { (tool === "pen" ? presets.pen : presets.highlighter).size = size; update(); },
        undo: () => undefined, redo: () => undefined, canUndo: () => false, canRedo: () => false,
        getOpacity: () => (tool === "pen" ? presets.pen : presets.highlighter).opacity,
        setOpacity: (opacity) => { (tool === "pen" ? presets.pen : presets.highlighter).opacity = opacity; update(); },
        defaultColor, selectTool: (value) => { tool = value; update(); },
        applyFavorite: (value) => { presets[value.tool] = { ...value }; tool = value.tool; colors.confirm(value.tool, value.color); update(); },
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
