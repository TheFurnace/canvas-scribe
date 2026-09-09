import { createPenActions, type PenActionsOptions } from "./pen-actions";
import { PEN_PROFILES, PEN_TYPES, type PenType } from "./pen-types";
import { HIGHLIGHTER_TYPES, type HighlighterType } from "./highlighter-types";
import { toolIconId } from "./tool-icons";
import type { RadialMenuAction } from "./radial-session";
import { createCircularSize } from "./circular-size";
import { favoritePreview } from "./favorite-manager";

export function createRadialPages(options: PenActionsOptions & {
  highlighterType: HighlighterType; eraserMode: "stroke" | "area";
  selectPen: (type: PenType) => void; selectHighlighter: (type: HighlighterType) => void;
  selectEraser: (mode: "stroke" | "area") => void;
  setSize: (value: number) => void; getSize: () => number;
  undo: () => void; redo: () => void; canUndo: () => boolean; canRedo: () => boolean;
  openSettings: () => void;
}): RadialMenuAction[] {
  const existing = createPenActions(options);
  return [
    { id: "quick-page", pageId: "quick", label: "Quick tools", icon: "pencil", children: () => [
      ...PEN_TYPES.map((type) => ({ id: `pen-${type}`, label: PEN_PROFILES[type].label, icon: toolIconId(type),
        active: options.tool === "pen" && options.penType === type,
        inkColor: options.colors.current("pen", options.defaultColor("pen")), run: () => options.selectPen(type) })),
      ...HIGHLIGHTER_TYPES.map((type) => ({ id: `highlighter-${type}`, label: `${type === "round" ? "Round" : "Chisel"} highlighter`, icon: toolIconId(`highlighter-${type}`),
        active: options.tool === "highlighter" && options.highlighterType === type,
        inkColor: options.colors.current("highlighter", options.defaultColor("highlighter")), run: () => options.selectHighlighter(type) })),
      ...(["stroke", "area"] as const).map((mode) => ({ id: `eraser-${mode}`, label: `${mode === "stroke" ? "Stroke" : "Area"} eraser`, icon: toolIconId(`eraser-${mode}`),
        active: options.tool === "eraser" && options.eraserMode === mode, run: () => options.selectEraser(mode) })),
      { id: "lasso", label: "Select ink", icon: toolIconId("lasso"), active: options.tool === "lasso", run: () => options.selectTool("lasso") },
    ] },
    { id: "settings-page", pageId: "settings", label: "Settings", icon: "settings", children: () => [
      existing.find((item) => item.id === "colors")!,
      { id: "size", label: "Thickness", icon: "sliders-horizontal", disabled: !options.currentPreset,
        panel: (close, back) => createCircularSize(options.document, {
          label: "Tool thickness", value: options.getSize(), min: options.tool === "pen" ? 1 : 2,
          max: options.tool === "pen" ? 20 : 60, step: options.tool === "pen" ? 0.5 : 1,
          onChange: options.setSize, onBack: back ?? close, onClose: close,
          preview: (size) => favoritePreview(options.document, { ...options.currentPreset!, size }, options.defaultColor(options.currentPreset!.tool)),
        }),
      },
      { id: "undo", label: "Undo ink", icon: "undo-2", disabled: !options.canUndo(), keepOpen: true, run: options.undo },
      { id: "redo", label: "Redo ink", icon: "redo-2", disabled: !options.canRedo(), keepOpen: true, run: options.redo },
      { id: "tool-settings", label: "Tool settings", icon: "settings-2", run: options.openSettings },
      { id: "canvas-menu", label: "Open Canvas menu", icon: "menu", run: options.openCanvasMenu },
    ] },
    { ...existing.find((item) => item.id === "favorites")!, pageId: "favorites" },
  ];
}
