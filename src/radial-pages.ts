import { createPenActions, type PenActionsOptions } from "./pen-actions";
import { PEN_PROFILES, PEN_TYPES, type PenType } from "./pen-types";
import { HIGHLIGHTER_TYPES, type HighlighterType } from "./highlighter-types";
import { toolIconId } from "./tool-icons";
import type { RadialMenuAction } from "./radial-session";
import { createCircularSize } from "./circular-size";
import { paletteColors } from "./colors";
import { createColorPicker } from "./color-picker";

export function createRadialPages(options: PenActionsOptions & {
  highlighterType: HighlighterType; eraserMode: "stroke" | "area";
  selectPen: (type: PenType) => void; selectHighlighter: (type: HighlighterType) => void;
  selectEraser: (mode: "stroke" | "area") => void;
  setSize: (value: number) => void; getSize: () => number;
  undo: () => void; redo: () => void; canUndo: () => boolean; canRedo: () => boolean;
  getOpacity: () => number; setOpacity: (value: number) => void;
}): RadialMenuAction[] {
  const existing = createPenActions({ ...options, quickColorCount: 7 });
  const hero = () => ({
    icon: toolIconId(options.tool === "pen" ? options.penType ?? "fountain" : options.tool === "highlighter" ? `highlighter-${options.highlighterType}` : options.tool === "eraser" ? `eraser-${options.eraserMode}` : "lasso", "full"),
    label: options.tool === "pen" ? PEN_PROFILES[options.penType ?? "fountain"].label : options.tool === "highlighter" ? "Highlighter" : options.tool === "eraser" ? "Eraser" : "Selection",
    color: options.tool === "pen" || options.tool === "highlighter" ? options.colors.current(options.tool, options.defaultColor(options.tool)) : undefined,
  });
  const colorTool = options.tool === "pen" || options.tool === "highlighter" ? options.tool : null;
  let originalColor = "", originalSelection: string | null = null, swatches: string[] = [];
  const confirmColor = (color: string | null) => {
    if (colorTool) { options.colors.confirm(colorTool, color); options.colorsChanged(); }
  };
  const circularControl = (opacity: boolean) => createCircularSize(options.document, {
    half: options.tool === "highlighter" ? opacity ? "right" : "left" : undefined,
    embedded: true, label: opacity ? "Tool opacity" : "Tool thickness", unit: opacity ? "%" : "px",
    value: opacity ? Math.round(options.getOpacity() * 100) : options.getSize(),
    min: opacity ? 5 : options.tool === "pen" ? 1 : 2,
    max: opacity ? 100 : options.tool === "pen" ? 20 : 60,
    step: opacity ? 5 : options.tool === "pen" ? 0.5 : 1,
    onChange: opacity ? (value) => options.setOpacity(value / 100) : options.setSize,
    onBack: () => undefined, onClose: () => undefined,
    preview: () => options.document.createElement("span"),

  });
  return [
    { id: "quick-page", pageId: "quick", label: "Quick tools", icon: "pencil", hero, children: () => [
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
    { id: "settings-page", pageId: "settings", label: "Settings", icon: "sliders-horizontal", hero, children: () => [
      { id: "colors", label: "Colors", icon: "palette", color: hero().color, disabled: !colorTool,
        onEnter: () => {
          originalColor = hero().color!; originalSelection = options.colors.selection(colorTool!);
          swatches = [...new Set([originalColor, ...options.colors.recent(colorTool!), ...paletteColors(colorTool!, originalColor)].map((color) => color.toLowerCase()))].slice(0, 8);
        },
        children: () => [
          ...swatches.map((color, index) => ({ id: `color-${color.slice(1)}`, label: index === 0 ? `Original color ${color}` : `Use ${color}`,
            icon: "circle", color, active: color === hero().color?.toLowerCase(), keepOpen: true,
            run: () => confirmColor(index === 0 ? originalSelection : color) })),
          { id: "full-picker", label: "More colors...", icon: "palette", panel: (close, back) => createColorPicker(options.document, {
            tool: colorTool!, current: hero().color!, defaultColor: options.defaultColor(colorTool!), recent: options.colors.recent(colorTool!),
            onConfirm: (color) => { confirmColor(color); (back ?? close)(); }, onCancel: close,
          }) },
        ],
      },
      { id: "size", label: options.tool === "highlighter" ? "Width and opacity" : "Thickness", icon: "sliders-horizontal", disabled: !options.currentPreset,
        preview: options.currentPreset ? (document) => {
          const node = document.createElement("span"); node.className = "canvas-scribe-radial-size-value";
          const dot = document.createElement("span"); dot.className = "canvas-scribe-size-dot";
          dot.style.width = dot.style.height = `${Math.min(30, Math.max(4, 4 + 26 * options.getSize() / (options.tool === "pen" ? 20 : 60)))}px`;
          dot.style.backgroundColor = hero().color!; dot.style.opacity = String(options.getOpacity());
          node.append(dot); return node;
        } : undefined,
        content: () => {
          const controls = options.document.createElement("div"); controls.className = "canvas-scribe-radial-adjustments";
          controls.append(circularControl(false));
          if (options.tool === "highlighter") controls.append(circularControl(true));
          return controls;
        },
      },
      { id: "undo", label: "Undo ink", icon: "undo-2", disabled: !options.canUndo(), keepOpen: true, run: options.undo },
      { id: "redo", label: "Redo ink", icon: "redo-2", disabled: !options.canRedo(), keepOpen: true, run: options.redo },
      { id: "canvas-menu", label: "Open Canvas menu", icon: "menu", run: options.openCanvasMenu },
    ] },
    { ...existing.find((item) => item.id === "favorites")!, pageId: "favorites", hero },
  ];
}
