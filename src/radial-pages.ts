import { createPenActions, type PenActionsOptions } from "./pen-actions";
import { PEN_PROFILES, PEN_TYPES, type PenType } from "./pen-types";
import { HIGHLIGHTER_TYPES, type HighlighterType } from "./highlighter-types";
import { toolIconId } from "./tool-icons";
import type { RadialMenuAction } from "./radial-session";
import { createCircularSize } from "./circular-size";
import { defaultColorLabel } from "./colors";
import { createRadialColors, RadialColors } from "./radial-colors";
import { createColorPicker } from "./color-picker";
import type { InkTool } from "./types";

export function createRadialPages(options: PenActionsOptions & {
  contextAction?: RadialMenuAction | null;
  highlighterType: HighlighterType; eraserMode: "stroke" | "area";
  selectionMode?: "lasso" | "rectangle";
  selectPen: (type: PenType) => void; selectHighlighter: (type: HighlighterType) => void;
  selectEraser: (mode: "stroke" | "area") => void;
  setSize: (value: number) => void; getSize: () => number;
  undo: () => void; redo: () => void; canUndo: () => boolean; canRedo: () => boolean;
  getOpacity: () => number; setOpacity: (value: number) => void;
}): RadialMenuAction[] {
  const selectionIcon = () => options.selectionMode === "rectangle" ? "selection-rectangle" : "lasso";
  const hero = () => ({
    icon: toolIconId(options.tool === "pen" ? options.penType ?? "fountain" : options.tool === "highlighter" ? `highlighter-${options.highlighterType}` : options.tool === "eraser" ? `eraser-${options.eraserMode}` : selectionIcon(), "full"),
    label: options.tool === "pen" ? PEN_PROFILES[options.penType ?? "fountain"].label : options.tool === "highlighter" ? "Highlighter" : options.tool === "eraser" ? "Eraser" : "Selection",
    color: options.tool === "pen" || options.tool === "highlighter" ? options.colors.current(options.tool, options.defaultColor(options.tool)) : undefined,
  });
  const colorTool = () => options.tool === "pen" || options.tool === "highlighter" ? options.tool : null;
  const colorModels = new Map<InkTool, RadialColors>();
  const confirmColor = (color: string | null) => {
    const tool = colorTool();
    if (tool) { options.colors.confirm(tool, color, false); options.colorsChanged(); }
  };
  const circularControl = (opacity: boolean) => createCircularSize(options.document, {
    half: options.tool === "highlighter" ? opacity ? "right" : "left" : undefined,
    inkColor: hero().color,
    embedded: true, label: opacity ? "Tool opacity" : "Tool thickness", unit: opacity ? "%" : "px",
    value: opacity ? Math.round(options.getOpacity() * 100) : options.getSize(),
    min: opacity ? 5 : options.tool === "pen" ? 1 : 2,
    max: opacity ? 100 : options.tool === "pen" ? 20 : 60,
    step: opacity ? 5 : options.tool === "pen" ? 0.5 : 1,
    onChange: opacity ? (value) => options.setOpacity(value / 100) : options.setSize,
    onBack: () => undefined, onClose: () => undefined,
    preview: (value) => {
      const dot = options.document.createElement("span"); dot.className = "canvas-scribe-size-dot";
      const size = opacity ? 18 : 4 + 18 * value / (options.tool === "pen" ? 20 : 60);
      dot.style.width = dot.style.height = `${size}px`; dot.style.backgroundColor = hero().color!;
      dot.style.opacity = String(opacity ? value / 100 : 1); return dot;
    },

  });
  return [
    { id: "quick-page", pageId: "quick", label: "Quick tools", icon: "pencil", hero, children: () => [
      ...PEN_TYPES.map((type) => ({ id: `pen-${type}`, label: PEN_PROFILES[type].label, icon: toolIconId(type),
        longPress: true,
        active: options.tool === "pen" && options.penType === type,
        inkColor: options.colors.current("pen", options.defaultColor("pen")), run: () => options.selectPen(type) })),
      ...HIGHLIGHTER_TYPES.map((type) => ({ id: `highlighter-${type}`, label: `${type === "round" ? "Round" : "Chisel"} highlighter`, icon: toolIconId(`highlighter-${type}`),
        longPress: true,
        active: options.tool === "highlighter" && options.highlighterType === type,
        inkColor: options.colors.current("highlighter", options.defaultColor("highlighter")), run: () => options.selectHighlighter(type) })),
      ...(["stroke", "area"] as const).map((mode) => ({ id: `eraser-${mode}`, label: `${mode === "stroke" ? "Stroke" : "Area"} eraser`, icon: toolIconId(`eraser-${mode}`),
        longPress: true,
        active: options.tool === "eraser" && options.eraserMode === mode, run: () => options.selectEraser(mode) })),
      { id: "lasso", label: "Select ink", icon: toolIconId(selectionIcon()), longPress: true, active: options.tool === "lasso", run: () => options.selectTool("lasso") },
    ] },
    { id: "settings-page", pageId: "settings", label: "Settings", icon: "sliders-horizontal", hero,
      onDismiss: () => {
        for (const tool of colorModels.keys()) options.colors.confirm(tool, options.colors.selection(tool));
        colorModels.clear();
      }, children: () => {
        const tool = colorTool();
        return [
      { id: "colors", label: tool && options.colors.selection(tool) === null ? `Colors · ${defaultColorLabel(tool)}` : "Colors", icon: "palette", color: hero().color, disabled: !tool,
        onEnter: () => {
          if (tool && !colorModels.has(tool)) colorModels.set(tool, new RadialColors(tool, options.colors.selection(tool), options.colors.recent(tool)));
        },
        content: (openPanel) => createRadialColors(options.document, colorModels.get(tool!)!, {
          defaultColor: options.defaultColor(tool!), selection: () => options.colors.selection(tool!), onSelect: confirmColor,
          onMore: () => openPanel({ id: "full-picker", label: "More colors…", icon: "palette", panel: (close, back) => createColorPicker(options.document, {
            tool: tool!, isDefault: options.colors.selection(tool!) === null, current: hero().color!, defaultColor: options.defaultColor(tool!), recent: options.colors.recent(tool!),
            onConfirm: (color) => { confirmColor(color); (back ?? close)(); }, onCancel: back ?? close,
          }) }),
        }),
      },
      { id: "size", label: options.tool === "highlighter" ? "Width and opacity" : "Thickness", icon: "sliders-horizontal", disabled: !options.currentPreset,
        preview: options.currentPreset ? (document) => {
          const node = document.createElement("span"); node.className = "canvas-scribe-radial-size-value";
          if (options.tool === "highlighter") node.classList.add("has-transparency");
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
      ...(options.contextAction === null ? [] : [options.contextAction ?? { id: "canvas-menu", label: "Open Canvas menu", icon: "menu", run: options.openCanvasMenu }]),
    ]; } },
    { id: "favorites", label: "Favorites", icon: "star", pageId: "favorites", hero,
      children: () => createPenActions({ ...options, quickColorCount: 7 }).find(item => item.id === "favorites")!.children!() },
  ];
}
