import { createPenActions, type PenActionsOptions } from "./pen-actions";
import { PEN_PROFILES, PEN_TYPES, type PenType } from "./pen-types";
import { HIGHLIGHTER_TYPES, type HighlighterType } from "./highlighter-types";
import { toolIconId, toolIconSvg } from "./tool-icons";
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
  const existing = createPenActions({ ...options, quickColorCount: 7 });
  const hero = () => ({
    icon: toolIconId(options.tool === "pen" ? options.penType ?? "fountain" : options.tool === "highlighter" ? `highlighter-${options.highlighterType}` : options.tool === "eraser" ? `eraser-${options.eraserMode}` : "lasso", "full"),
    label: options.tool === "pen" ? PEN_PROFILES[options.penType ?? "fountain"].label : options.tool === "highlighter" ? "Highlighter" : options.tool === "eraser" ? "Eraser" : "Selection",
    color: options.tool === "pen" || options.tool === "highlighter" ? options.colors.current(options.tool, options.defaultColor(options.tool)) : undefined,
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
    { id: "settings-page", pageId: "settings", label: "Settings", icon: "settings", hero, children: () => [
      { ...existing.find((item) => item.id === "colors")!, color: hero().color },
      { id: "size", label: "Thickness", icon: "sliders-horizontal", disabled: !options.currentPreset,
        preview: options.currentPreset ? (document) => {
          const node = document.createElement("span"); node.className = "canvas-scribe-radial-size-value";
          const dot = document.createElement("span"); dot.className = "canvas-scribe-size-dot";
          dot.style.width = dot.style.height = `${Math.min(18, Math.max(3, options.getSize()))}px`;
          node.append(dot, String(options.getSize())); return node;
        } : undefined,
        panel: (close, back) => createCircularSize(options.document, {
          label: "Tool thickness", value: options.getSize(), min: options.tool === "pen" ? 1 : 2,
          max: options.tool === "pen" ? 20 : 60, step: options.tool === "pen" ? 0.5 : 1,
          onChange: options.setSize, onBack: back ?? close, onClose: close,
          preview: (size) => favoritePreview(options.document, { ...options.currentPreset!, size }, options.defaultColor(options.currentPreset!.tool)),
          hero: (document) => {
            const node = document.createElement("div"); node.className = "canvas-scribe-size-tool";
            const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg"); svg.setAttribute("viewBox", "0 0 100 100");
            svg.innerHTML = toolIconSvg(options.tool === "pen" ? options.penType ?? "fountain" : `highlighter-${options.highlighterType}`, "full");
            node.style.setProperty("--canvas-scribe-tool-color", hero().color!); svg.setAttribute("aria-hidden", "true"); node.append(svg); return node;
          },
        }),
      },
      { id: "undo", label: "Undo ink", icon: "undo-2", disabled: !options.canUndo(), keepOpen: true, run: options.undo },
      { id: "redo", label: "Redo ink", icon: "redo-2", disabled: !options.canRedo(), keepOpen: true, run: options.redo },
      { id: "tool-settings", label: "Tool settings", icon: "settings-2", run: options.openSettings },
      { id: "canvas-menu", label: "Open Canvas menu", icon: "menu", run: options.openCanvasMenu },
    ] },
    { ...existing.find((item) => item.id === "favorites")!, pageId: "favorites", hero },
  ];
}
