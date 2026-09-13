import { ToolColors } from "./colors";
import type { DrawingTool } from "./types";
import { isPenType, PEN_PROFILES, type PenType } from "./pen-types";
import { isHighlighterType, type HighlighterType } from "./highlighter-types";
import type { PenPreset } from "./favorite-pens";
import type { EraserSettings } from "./eraser-menu";
import type { SelectionSettings } from "./selection-menu";

/** One observable preference store per plugin; editors may snapshot it for a gesture. */
export class InkToolState {
  activeTool: DrawingTool = "pen";
  penType: PenType = "fountain";
  penSize = 3.5;
  penOpacity: number | null = null;
  highlighterType: HighlighterType = "round";
  highlighterSize = 17;
  highlighterOpacity = 0.38;
  readonly toolColors = new ToolColors(undefined, () => this.notify());
  eraserSettings: EraserSettings = { mode: "stroke", highlighterOnly: false, radius: 18 };
  selectionSettings: SelectionSettings = { mode: "lasso", partial: true };
  private readonly listeners = new Set<() => void>();
  private queued = false;
  constructor(value?: unknown) {
    const x = value && typeof value === "object" ? value as Record<string, unknown> : {};
    if (["pen", "highlighter", "eraser", "lasso"].includes(String(x.activeTool))) this.activeTool = x.activeTool as DrawingTool;
    if (isPenType(x.penType)) this.penType = x.penType;
    if (isHighlighterType(x.highlighterType)) this.highlighterType = x.highlighterType;
    const number = (v: unknown, min: number, max: number, fallback: number) => typeof v === "number" && Number.isFinite(v) && v >= min && v <= max ? v : fallback;
    this.penSize = number(x.penSize, 1, 20, this.penSize);
    this.highlighterSize = number(x.highlighterSize, 2, 60, this.highlighterSize);
    this.penOpacity = x.penOpacity == null ? null : number(x.penOpacity, .05, 1, PEN_PROFILES[this.penType].opacity);
    this.highlighterOpacity = number(x.highlighterOpacity, .05, 1, this.highlighterOpacity);
    if (x.eraserSettings && typeof x.eraserSettings === "object") {
      const e = x.eraserSettings as Record<string, unknown>;
      this.eraserSettings = { mode: e.mode === "area" ? "area" : "stroke", highlighterOnly: e.highlighterOnly === true, radius: number(e.radius, 1, 200, 18) };
    }
    if (x.selectionSettings && typeof x.selectionSettings === "object") {
      const s = x.selectionSettings as Record<string, unknown>;
      this.selectionSettings = { mode: s.mode === "rectangle" ? "rectangle" : "lasso", partial: s.partial !== false };
    }
    this.toolColors.restore(x.colors);
    const preferences = new Set(["activeTool", "penType", "penSize", "penOpacity", "highlighterType", "highlighterSize", "highlighterOpacity", "eraserSettings", "selectionSettings"]);
    return new Proxy(this, { set: (target, key, next) => {
      const changed = Reflect.get(target, key) !== next;
      Reflect.set(target, key, next);
      if (changed && preferences.has(String(key))) target.notify();
      return true;
    } });
  }
  subscribe(listener: () => void): () => void { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; }
  private notify(): void {
    if (this.queued) return;
    this.queued = true;
    queueMicrotask(() => { this.queued = false; for (const listener of this.listeners) listener(); });
  }
  serialize() {
    return { activeTool: this.activeTool, penType: this.penType, penSize: this.penSize, penOpacity: this.penOpacity,
      highlighterType: this.highlighterType, highlighterSize: this.highlighterSize, highlighterOpacity: this.highlighterOpacity,
      eraserSettings: { ...this.eraserSettings }, selectionSettings: { ...this.selectionSettings }, colors: this.toolColors.serialize() };
  }
  snapshot(): InkToolState { return new InkToolState(this.serialize()); }
  selectPen(type: PenType): void { this.penType = type; this.penOpacity = null; }
  opacity(tool: "pen" | "highlighter"): number { return tool === "pen" ? this.penOpacity ?? PEN_PROFILES[this.penType].opacity : this.highlighterOpacity; }
  preset(): PenPreset | null {
    const tool = this.activeTool;
    return tool === "pen" || tool === "highlighter" ? { tool, penType: this.penType, highlighterType: this.highlighterType,
      size: tool === "pen" ? this.penSize : this.highlighterSize, color: this.toolColors.selection(tool), opacity: this.opacity(tool) } : null;
  }
  applyPreset(preset: PenPreset): void {
    this.activeTool = preset.tool; this.toolColors.confirm(preset.tool, preset.color);
    if (preset.tool === "pen") { this.penType = preset.penType; this.penSize = preset.size; this.penOpacity = preset.opacity; }
    else { this.highlighterType = preset.highlighterType ?? "round"; this.highlighterSize = preset.size; this.highlighterOpacity = preset.opacity; }
  }
}
