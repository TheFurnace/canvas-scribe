import { createColorPicker } from "./color-picker";
import { paletteColors, type ToolColors } from "./colors";
import { createFavoriteManager, favoritePreview } from "./favorite-manager";
import type { FavoritePens, PenPreset } from "./favorite-pens";
import type { RadialMenuAction } from "./radial-session";
import type { DrawingTool, InkTool } from "./types";
import type { PenType } from "./pen-types";
import { PEN_ICONS, toolDescription } from "./tool-indicator";
import { toolIconId } from "./tool-icons";

export interface PenActionsOptions {
  document: Document;
  tool: DrawingTool;
  colors: ToolColors;
  favorites: FavoritePens;
  currentPreset: PenPreset | null;
  penType?: PenType;
  defaultColor: (tool: InkTool) => string;
  selectTool: (tool: DrawingTool) => void;
  applyFavorite: (preset: PenPreset) => void;
  colorsChanged: () => void;
  openCanvasMenu: () => void;
}
export function createPenActions(options: PenActionsOptions): RadialMenuAction[] {
  const { document, tool, colors, favorites, defaultColor } = options;
  const colorTool = tool === "pen" || tool === "highlighter" ? tool : null;
  const penType = options.penType ?? options.currentPreset?.penType ?? "fountain";
  const confirm = (tool: InkTool, color: string | null) => { colors.confirm(tool, color); options.colorsChanged(); };
  return [
    ...(["pen", "highlighter", "eraser"] as const).map((value) => ({
      id: value, label: value === "eraser" ? "Eraser" : toolDescription(value, penType,
        colors.current(value, value === "pen" ? "var(--text-normal)" : defaultColor(value))),
      icon: value === "pen" ? PEN_ICONS[penType] : toolIconId(value === "eraser" ? "eraser-stroke" : "highlighter-round"),
      inkColor: value === "eraser" ? undefined : colors.current(value, value === "pen" ? "var(--text-normal)" : defaultColor(value)),
      active: tool === value, run: () => options.selectTool(value),
    })),
    { id: "colors", label: colorTool ? "Colors" : "Colors (select Pen or Highlighter)", icon: "palette", disabled: !colorTool,
      inkColor: colorTool ? colors.current(colorTool, colorTool === "pen" ? "var(--text-normal)" : defaultColor(colorTool)) : undefined,
      children: () => {
        if (!colorTool) return [];
        const current = colors.current(colorTool, defaultColor(colorTool));
        const swatches = [...new Set([...colors.recent(colorTool), ...paletteColors(colorTool, current)])].slice(0, 4);
        return [
          { id: "default-color", label: "Use tool default color", icon: "rotate-ccw", run: () => confirm(colorTool, null) },
          ...swatches.map((color) => ({ id: `color-${color.slice(1)}`, label: `Use ${color}`, icon: "circle", color,
            active: color.toLowerCase() === current.toLowerCase(), run: () => confirm(colorTool, color) })),
          { id: "full-picker", label: "More colors…", icon: "palette", panel: (close: () => void) => createColorPicker(document, {
            tool: colorTool, current, defaultColor: defaultColor(colorTool), recent: colors.recent(colorTool),
            onConfirm: (color) => { confirm(colorTool, color); close(); }, onCancel: close,
          }) },
        ];
      },
    },
    { id: "favorites", label: "Favorites", icon: "star", children: () => [
      { id: "manage-favorites", label: "Save / manage favorites", icon: "settings-2",
        panel: (close) => createFavoriteManager(document, favorites, options.currentPreset, (preset) => defaultColor(preset.tool), close) },
      ...favorites.list().map((preset) => ({ id: preset.id, label: `${preset.name} · ${preset.size}px`, icon: "pencil",
        preview: (document: Document) => favoritePreview(document, preset, defaultColor(preset.tool)),
        run: () => options.applyFavorite(preset) })),
    ] },
    { id: "more", label: "More", icon: "ellipsis", children: () => [
      { id: "canvas-menu", label: "Open Canvas menu", icon: "menu", run: options.openCanvasMenu },
    ] },
  ];
}
