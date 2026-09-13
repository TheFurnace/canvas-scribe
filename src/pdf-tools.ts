import { createToolColors, createToolMenu, createToolRadial, observeToolTheme } from "./tool-suite";
import { RadialSession } from "./radial-session";
import { positionPopup } from "./popover";
import type { DrawingTool } from "./types";
import { createCanvasControls, syncCanvasControls, type IconRenderer } from "./canvas-controls";
import { createColorPicker } from "./color-picker";
import { InkToolState } from "./ink-tool-state";
import { PEN_PROFILES } from "./pen-types";
import { type FavoritePens } from "./favorite-pens";

export interface PdfToolActions {
  changed(): void; toggle(): void; undo(): void; redo(): void; clear(): void;
  scale(value: number): void; recolor(color: string): void; remove(): void;
}
/** Host-free composition of production tool menus, colors, and saved favorites. */
export class PdfTools {
  readonly root: HTMLElement;
  private radial: RadialSession | null = null;
  private disposeMenu: (() => void) | null = null;
  private unsubscribe: () => void;
  private unsubscribeTheme: () => void;
  private canUndo = false;
  private canRedo = false;
  private controls: HTMLElement;
  private menu: HTMLElement | null = null;
  private count = 0;
  private canClear = false;
  constructor(private readonly document: Document, private readonly icons: IconRenderer, private readonly actions: PdfToolActions, private readonly favorites: FavoritePens, readonly state = new InkToolState()) {
    this.root = document.createElement("div"); this.root.className = "canvas-scribe-pdf-tools";
    this.controls = createCanvasControls(document, icons, {
      setTool: tool => { const same = this.state.activeTool === tool; this.state.activeTool = tool; this.close(); actions.changed(); if (same) this.settings(); },
      toggleColorPalette: () => this.colors(), toggleEnabled: actions.toggle, undo: actions.undo, redo: actions.redo,
    });
    this.root.append(this.controls);
    this.unsubscribe = state.subscribe(() => actions.changed());
    this.unsubscribeTheme = observeToolTheme(document, () => { this.close(); actions.changed(); });
  }
  setTool(tool: DrawingTool): void { this.state.activeTool = tool; this.close(); this.actions.changed(); }
  destroy(): void { this.close(); this.unsubscribeTheme(); this.unsubscribe(); this.root.remove(); }
  color(): string { const tool = this.state.activeTool === "highlighter" ? "highlighter" : "pen"; return this.state.toolColors.current(tool, tool === "pen" ? "#1f2937" : "#fde047"); }
  sync(enabled: boolean, undo: boolean, redo: boolean, count: number, canClear: boolean): void {
    this.count = count; this.canClear = canClear; this.canUndo = undo; this.canRedo = redo;
    syncCanvasControls(this.controls, { activeTool: this.state.activeTool, penDefault: this.state.toolColors.selection("pen") === null, highlighterDefault: this.state.toolColors.selection("highlighter") === null, enabled, canUndo: undo, canRedo: redo,
      penType: this.state.penType, highlighterType: this.state.highlighterType, penSize: this.state.penSize, highlighterSize: this.state.highlighterSize,
      penOpacity: this.state.penOpacity ?? PEN_PROFILES[this.state.penType].opacity, highlighterOpacity: this.state.highlighterOpacity,
      penColor: this.state.toolColors.current("pen", "#1f2937"), highlighterColor: this.state.toolColors.current("highlighter", "#fde047") });
  }
  close(): void { this.disposeMenu?.(); this.disposeMenu = null; this.menu?.remove(); this.menu = null; this.radial?.close(false); this.radial = null; }
  private show(menu: HTMLElement): void {
    this.close(); this.menu = menu;
    const anchor = this.controls.querySelector<HTMLElement>(`[data-action="${this.state.activeTool}"]`) ?? this.controls;
    this.document.body.append(menu); anchor.setAttribute("aria-expanded", "true");
    const position = () => { if (menu.classList.contains("canvas-scribe-picker-backdrop")) return;
      const p = positionPopup(anchor.getBoundingClientRect(), menu.getBoundingClientRect(), this.document.defaultView!.innerWidth, this.document.defaultView!.innerHeight);
      menu.style.left = `${p.left}px`; menu.style.top = `${p.top}px`; };
    const dismiss = (e: Event) => { if (!menu.contains(e.target as Node) && !anchor.contains(e.target as Node)) this.close(); };
    this.document.addEventListener("pointerdown", dismiss, true); this.document.defaultView?.addEventListener("resize", position);
    this.disposeMenu = () => { this.document.removeEventListener("pointerdown", dismiss, true); this.document.defaultView?.removeEventListener("resize", position); anchor.setAttribute("aria-expanded", "false"); };
    position(); menu.querySelector<HTMLElement>("button,input")?.focus();
  }
  settings(): void {
    this.show(createToolMenu(this.document, this.icons, this.state, {
      color: tool => this.state.toolColors.current(tool, tool === "pen" ? "#1f2937" : "#fde047"), colors: () => this.colors(), close: () => this.close(), changed: this.actions.changed,
      count: this.count, canClear: this.canClear, scale: this.actions.scale, recolor: () => this.colors(true), clear: this.actions.clear,
      clearLabel: "Erase all Scribe ink on this page…", clearMessage: "Erase Scribe pen and highlighter ink on this page? The original PDF stays unchanged. You can undo this.",
    }));
  }
  openRadial(x: number, y: number, contextMenu?: () => void): void {
    this.close();
    this.radial = new RadialSession(this.document, createToolRadial(this.document, this.state, this.favorites, {
      selectTool: tool => this.setTool(tool), changed: this.actions.changed, defaultColor: tool => tool === "pen" ? "#1f2937" : "#fde047",
      undo: this.actions.undo, redo: this.actions.redo, canUndo: () => this.canUndo, canRedo: () => this.canRedo, contextMenu,
    }), () => { this.radial = null; }, this.icons);
    this.radial.open(x, y);
  }
  private colors(selection = false): void {
    const tool = this.state.activeTool === "highlighter" ? "highlighter" : "pen";
    if (!selection) {
      this.show(createToolColors(this.document, this.state, tool, { defaultColor: tool === "pen" ? "#1f2937" : "#fde047",
        mount: menu => this.show(menu), close: () => this.close(), changed: this.actions.changed }));
      return;
    }
    this.show(createColorPicker(this.document, { tool, isDefault: !selection && this.state.toolColors.selection(tool) === null, current: this.color(), defaultColor: tool === "pen" ? "#1f2937" : "#fde047", recent: this.state.toolColors.recent(tool), onConfirm: color => {
      if (selection) this.actions.recolor(color ?? (tool === "pen" ? "#1f2937" : "#fde047")); else this.state.toolColors.confirm(tool, color); this.close(); this.actions.changed();
    }, onCancel: () => this.close() }));
  }
}
