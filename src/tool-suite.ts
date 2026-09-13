import { InkToolState } from "./ink-tool-state";
import { FavoritePens } from "./favorite-pens";
import { createPenMenu } from "./pen-menu";
import { createHighlighterMenu } from "./highlighter-menu";
import { createEraserMenu } from "./eraser-menu";
import { createSelectionMenu } from "./selection-menu";
import { createRadialPages } from "./radial-pages";
import type { IconRenderer } from "./canvas-controls";
import type { DrawingTool, InkTool } from "./types";
import { createQuickColors } from "./quick-colors";
import { createColorPicker } from "./color-picker";
import { resolveColor } from "./colors";

/** Dismiss transient color previews when the host theme changes; reopened menus resolve afresh. */
export function observeToolTheme(document: Document, changed: () => void): () => void {
  const observer = new MutationObserver(changed);
  for (const target of [document.documentElement, document.body]) observer.observe(target, { attributes: true, attributeFilter: ["class", "style"] });
  return () => observer.disconnect();
}

export function createToolColors(document: Document, state: InkToolState, tool: InkTool, a: {
  defaultColor: string; mount(menu: HTMLElement): void; close(): void; changed(): void;
}): HTMLElement {
  const confirm = (color: string | null) => { state.toolColors.confirm(tool, color); a.close(); a.changed(); };
  return createQuickColors(document, { tool, current: state.toolColors.current(tool, a.defaultColor), defaultColor: a.defaultColor,
    isDefault: state.toolColors.selection(tool) === null, recent: state.toolColors.recent(tool), onSelect: confirm, onClose: a.close,
    onMore: () => a.mount(createColorPicker(document, { tool, current: resolveColor(document, state.toolColors.current(tool, a.defaultColor)),
      defaultColor: resolveColor(document, a.defaultColor), isDefault: state.toolColors.selection(tool) === null,
      recent: state.toolColors.recent(tool), onConfirm: confirm, onCancel: a.close })),
  });
}

/** View capabilities; the tools never know about note objects or host persistence. */
export interface ToolMenuActions {
  color(tool: InkTool): string;
  colors(): void;
  close(): void;
  changed(): void;
  count: number;
  scale(value: number): void;
  recolor(): void;
  clear(): void;
  canClear: boolean;
  clearLabel?: string;
  clearMessage?: string;
}

export function createToolMenu(document: Document, renderIcon: IconRenderer, state: InkToolState, a: ToolMenuActions): HTMLElement {
  const common = { renderIcon, onClose: a.close };
  const update = (run: () => void) => { run(); a.changed(); };
  const color = (tool: InkTool) => ({ color: a.color(tool), isDefault: state.toolColors.selection(tool) === null,
    onDefault: () => { state.toolColors.confirm(tool, null); a.changed(); a.close(); },
    onColor: (value: string) => update(() => state.toolColors.confirm(tool, value)), onColors: a.colors });
  switch (state.activeTool) {
    case "pen": return createPenMenu(document, { ...common, ...color("pen"), type: state.penType, size: state.penSize,
      onType: type => update(() => state.selectPen(type)), onSize: size => update(() => { state.penSize = size; }) });
    case "highlighter": return createHighlighterMenu(document, { ...common, ...color("highlighter"), type: state.highlighterType, size: state.highlighterSize, opacity: state.highlighterOpacity,
      onType: type => update(() => { state.highlighterType = type; }), onSize: size => update(() => { state.highlighterSize = size; }), onOpacity: opacity => update(() => { state.highlighterOpacity = opacity; }) });
    case "eraser": return createEraserMenu(document, { ...common, settings: state.eraserSettings,
      onChange: settings => update(() => { state.eraserSettings = settings; }), canClear: a.canClear, onClear: a.clear,
      clearLabel: a.clearLabel, clearMessage: a.clearMessage });
    case "lasso": return createSelectionMenu(document, { ...common, settings: state.selectionSettings,
      onChange: settings => update(() => { state.selectionSettings = settings; }), count: a.count, onScale: a.scale, onRecolor: a.recolor });
  }
}

export function createToolRadial(document: Document, state: InkToolState, favorites: FavoritePens, a: {
  selectTool(tool: DrawingTool): void;
  changed(): void;
  defaultColor(tool: InkTool): string;
  undo(): void; redo(): void; canUndo(): boolean; canRedo(): boolean;
  contextMenu?: (anchor?: { x: number; y: number }) => void;
}) {
  const tool = state.activeTool;
  return createRadialPages({ document, tool, colors: state.toolColors, favorites, currentPreset: state.preset(),
    penType: state.penType, highlighterType: state.highlighterType, eraserMode: state.eraserSettings.mode,
    selectTool: a.selectTool,
    selectPen: type => { state.selectPen(type); a.selectTool("pen"); },
    selectHighlighter: type => { state.highlighterType = type; a.selectTool("highlighter"); },
    selectEraser: mode => { state.eraserSettings = { ...state.eraserSettings, mode }; a.selectTool("eraser"); },
    getSize: () => tool === "pen" ? state.penSize : state.highlighterSize,
    setSize: value => { if (tool === "pen") state.penSize = value; else state.highlighterSize = value; a.changed(); },
    getOpacity: () => state.opacity(tool === "pen" ? "pen" : "highlighter"),
    setOpacity: value => { if (tool === "pen") state.penOpacity = value; else state.highlighterOpacity = value; a.changed(); },
    undo: a.undo, redo: a.redo, canUndo: a.canUndo, canRedo: a.canRedo,
    defaultColor: a.defaultColor, colorsChanged: a.changed,
    applyFavorite: preset => { state.applyPreset(preset); a.selectTool(preset.tool); },
    openCanvasMenu: a.contextMenu ?? (() => undefined),
    ...(a.contextMenu ? { contextAction: { id: "canvas-menu", label: "Native context menu", icon: "menu", run: a.contextMenu } } : { contextAction: null }),
  });
}
