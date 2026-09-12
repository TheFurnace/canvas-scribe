import { createCanvasControls, syncCanvasControls, type IconRenderer } from "./canvas-controls";
import { createPenMenu } from "./pen-menu";
import { createHighlighterMenu } from "./highlighter-menu";
import { createEraserMenu } from "./eraser-menu";
import { createSelectionMenu } from "./selection-menu";
import { createColorPicker } from "./color-picker";
import { createAction } from "./ui-controls";
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
  readonly state = new InkToolState();
  private controls: HTMLElement;
  private menu: HTMLElement | null = null;
  private count = 0;
  private canClear = false;
  constructor(private readonly document: Document, private readonly icons: IconRenderer, private readonly actions: PdfToolActions, private readonly favorites: FavoritePens) {
    this.root = document.createElement("div"); this.root.className = "canvas-scribe-pdf-tools";
    this.controls = createCanvasControls(document, icons, {
      setTool: tool => { const same = this.state.activeTool === tool; this.state.activeTool = tool; this.close(); actions.changed(); if (same) this.settings(); },
      toggleColorPalette: () => this.colors(), toggleEnabled: actions.toggle, undo: actions.undo, redo: actions.redo,
    });
    const settings = createAction(document, "Tool settings", () => this.settings());
    const favoritesButton = createAction(document, "Favorites", () => this.showFavorites());
    this.root.append(this.controls, settings, favoritesButton);
  }
  color(): string { const tool = this.state.activeTool === "highlighter" ? "highlighter" : "pen"; return this.state.toolColors.current(tool, tool === "pen" ? "#1f2937" : "#fde047"); }
  sync(enabled: boolean, undo: boolean, redo: boolean, count: number, canClear: boolean): void {
    this.count = count; this.canClear = canClear;
    syncCanvasControls(this.controls, { activeTool: this.state.activeTool, enabled, canUndo: undo, canRedo: redo,
      penType: this.state.penType, highlighterType: this.state.highlighterType, penSize: this.state.penSize, highlighterSize: this.state.highlighterSize,
      penOpacity: this.state.penOpacity ?? PEN_PROFILES[this.state.penType].opacity, highlighterOpacity: this.state.highlighterOpacity,
      penColor: this.state.toolColors.current("pen", "#1f2937"), highlighterColor: this.state.toolColors.current("highlighter", "#fde047") });
  }
  close(): void { this.menu?.remove(); this.menu = null; }
  private show(menu: HTMLElement): void { this.close(); this.menu = menu; menu.classList.add("canvas-scribe-pdf-menu"); this.root.append(menu); }
  settings(): void {
    const s = this.state, changed = () => this.actions.changed(), onClose = () => this.close();
    if (s.activeTool === "pen") this.show(createPenMenu(this.document, { onColor: color => { s.toolColors.confirm("pen", color); changed(); }, onColors: () => this.colors(), renderIcon: this.icons, type: s.penType, size: s.penSize, color: this.color(), onType: type => { s.penType = type; changed(); }, onSize: size => { s.penSize = size; changed(); }, onClose }));
    else if (s.activeTool === "highlighter") this.show(createHighlighterMenu(this.document, { onColor: color => { s.toolColors.confirm("highlighter", color); changed(); }, renderIcon: this.icons, type: s.highlighterType, size: s.highlighterSize, opacity: s.highlighterOpacity, color: this.color(),
      onType: type => { s.highlighterType = type; changed(); }, onSize: size => { s.highlighterSize = size; changed(); }, onOpacity: value => { s.highlighterOpacity = value; changed(); }, onColors: () => this.colors(), onClose }));
    else if (s.activeTool === "eraser") this.show(createEraserMenu(this.document, { renderIcon: this.icons, settings: s.eraserSettings, onChange: value => { s.eraserSettings = value; changed(); }, canClear: this.canClear, onClear: this.actions.clear, onClose,
      clearLabel: "Erase all Scribe ink on this page…", clearMessage: "Erase Scribe pen and highlighter ink on this page? The original PDF stays unchanged. You can undo this." }));
    else {
      const menu = createSelectionMenu(this.document, { renderIcon: this.icons, settings: s.selectionSettings, count: this.count, onChange: value => { s.selectionSettings = value; }, onScale: this.actions.scale, onRecolor: () => this.colors(true), onClose });
      const remove = createAction(this.document, "Delete selected ink", () => { this.actions.remove(); this.close(); }); remove.disabled = !this.count; menu.append(remove); this.show(menu);
    }
  }
  private colors(selection = false): void {
    const tool = this.state.activeTool === "highlighter" ? "highlighter" : "pen";
    this.show(createColorPicker(this.document, { tool, current: this.color(), defaultColor: tool === "pen" ? "#1f2937" : "#fde047", recent: this.state.toolColors.recent(tool), onConfirm: color => {
      this.state.toolColors.confirm(tool, color); if (selection) this.actions.recolor(this.color()); this.close(); this.actions.changed();
    }, onCancel: () => this.close() }));
  }
  private showFavorites(): void {
    const menu = this.document.createElement("div"); menu.className = "canvas-scribe-tool-menu";
    menu.append(createAction(this.document, "Close", () => this.close()));
    for (const favorite of this.favorites.list()) menu.append(createAction(this.document, favorite.name, () => {
      const s = this.state; s.activeTool = favorite.tool; s.toolColors.confirm(favorite.tool, favorite.color);
      if (favorite.tool === "pen") { s.penType = favorite.penType; s.penSize = favorite.size; s.penOpacity = favorite.opacity; }
      else { s.highlighterType = favorite.highlighterType ?? "round"; s.highlighterSize = favorite.size; s.highlighterOpacity = favorite.opacity; }
      this.close(); this.actions.changed();
    }));
    if (this.state.activeTool === "pen" || this.state.activeTool === "highlighter") menu.append(createAction(this.document, "Save current tool", () => {
      const s = this.state, tool = s.activeTool === "highlighter" ? "highlighter" : "pen";
      this.favorites.add({ tool, penType: s.penType, highlighterType: s.highlighterType, size: tool === "pen" ? s.penSize : s.highlighterSize,
        color: this.color(), opacity: tool === "pen" ? s.penOpacity ?? PEN_PROFILES[s.penType].opacity : s.highlighterOpacity }); this.showFavorites();
    }));
    this.show(menu);
  }
}
