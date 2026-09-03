import { Notice, setIcon, type App } from "obsidian";

import type { CanvasTarget } from "./canvas-target";
import { paletteColors, type ColorTool } from "./colors";
import type { DebugLogger } from "./debug-logger";
import { strokeIntersectsCircle, strokeToSvgPath } from "./geometry";
import { loadInkData, saveInkData } from "./persistence";
import {
  isStylusContact,
  isStylusEvent,
  isTemporaryEraser,
  pointerSamples,
  pointerToInkPoint,
  shouldAppendReleasePoint,
} from "./pointer-input";
import {
  cloneStrokes,
  createEmptyInkData,
  createStrokeId,
  type CanvasInkData,
  type DrawingTool,
  type InkPoint,
  type InkStroke,
} from "./types";

const SVG_NS = "http://www.w3.org/2000/svg";
const SAVE_DELAY_MS = 250;
const MIN_SCREEN_POINT_DISTANCE = 0.35;
const RECENT_STYLUS_CONTEXT_MENU_MS = 1000;
const ERASER_SCREEN_RADIUS = 18;

interface CanvasTransform {
  screenToCanvas: DOMMatrix;
  screenScale: number;
}

export class CanvasInkLayer {
  private data: CanvasInkData = createEmptyInkData();
  private svgEl: SVGSVGElement | null = null;
  private eraserCursorEl: SVGCircleElement | null = null;
  private controlsEl: HTMLElement | null = null;
  private colorPaletteEl: HTMLElement | null = null;
  private wrapperEl: HTMLElement | null = null;
  private activeStroke: InkStroke | null = null;
  private activePathEl: SVGPathElement | null = null;
  private activePointerId: number | null = null;
  private activeTool: DrawingTool = "pen";
  private readonly selectedColors: Partial<Record<ColorTool, string>> = {};
  private temporaryTool: DrawingTool | null = null;
  private enabled = true;
  private didEraseInGesture = false;
  private barrelButtonArmed = false;
  private undoStack: InkStroke[][] = [];
  private redoStack: InkStroke[][] = [];
  private saveTimer: number | null = null;
  private renderFrame: number | null = null;
  private domFrame: number | null = null;
  private disposed = false;
  private readonly disposers: Array<() => void> = [];
  private readonly inputDisposers: Array<() => void> = [];
  private observer: MutationObserver | null = null;
  private gestureStartedAt = 0;
  private gestureTransform: CanvasTransform | null = null;
  private lastStylusEventAt = Number.NEGATIVE_INFINITY;
  private erasedStrokeCount = 0;

  constructor(
    private readonly app: App,
    readonly target: CanvasTarget,
    private readonly logger: DebugLogger,
  ) {}

  async mount(): Promise<void> {
    this.data = await loadInkData(this.app, this.target.file);
    this.logger.record("canvas", "layer_mounted", { strokeCount: this.data.strokes.length });
    if (this.disposed) return;
    this.ensureDom();
    this.observeDom();
  }

  isFor(target: CanvasTarget): boolean {
    return this.target.file.path === target.file.path && this.target.view === target.view;
  }

  setTool(tool: DrawingTool): void {
    this.activeTool = tool;
    if (tool !== "eraser") this.hideEraserCursor();
    this.closeColorPalette();
    this.logger.record("canvas", "tool_selected", { tool });
    this.syncControls();
  }

  toggleEnabled(): void {
    this.enabled = !this.enabled;
    this.logger.record("canvas", "stylus_input_toggled", { enabled: this.enabled });
    this.syncControls();
  }

  undo(): void {
    const previous = this.undoStack.pop();
    if (!previous) return;
    this.redoStack.push(cloneStrokes(this.data.strokes));
    this.data.strokes = previous;
    this.logger.record("canvas", "undo", { strokeCount: this.data.strokes.length });
    this.renderAll();
    this.scheduleSave();
    this.syncControls();
  }

  redo(): void {
    const next = this.redoStack.pop();
    if (!next) return;
    this.undoStack.push(cloneStrokes(this.data.strokes));
    this.data.strokes = next;
    this.logger.record("canvas", "redo", { strokeCount: this.data.strokes.length });
    this.renderAll();
    this.scheduleSave();
    this.syncControls();
  }

  dispose(): void {
    this.disposed = true;
    if (this.saveTimer !== null) window.clearTimeout(this.saveTimer);
    if (this.renderFrame !== null) window.cancelAnimationFrame(this.renderFrame);
    if (this.domFrame !== null) window.cancelAnimationFrame(this.domFrame);
    void this.saveNow();
    for (const dispose of this.inputDisposers.splice(0)) dispose();
    for (const dispose of this.disposers.splice(0)) dispose();
    this.observer?.disconnect();
    this.observer = null;
    this.svgEl?.remove();
    this.eraserCursorEl = null;
    this.closeColorPalette();
    this.controlsEl?.remove();
    this.logger.record("canvas", "layer_disposed", { strokeCount: this.data.strokes.length });
  }

  private ensureDom(): void {
    if (this.disposed) return;
    const wrapper = this.target.containerEl.querySelector<HTMLElement>(".canvas-wrapper");
    const world = this.target.containerEl.querySelector<HTMLElement>(".canvas");
    if (!wrapper || !world) return;

    if (this.wrapperEl !== wrapper) this.bindInput(wrapper);
    if (!this.svgEl?.isConnected || this.svgEl.parentElement !== world) {
      this.svgEl?.remove();
      this.svgEl = this.target.containerEl.ownerDocument.createElementNS(SVG_NS, "svg");
      this.svgEl.classList.add("canvas-scribe-render-layer");
      this.svgEl.setAttribute("aria-hidden", "true");
      world.appendChild(this.svgEl);
      this.renderAll();
    }
    this.mountControls();
  }

  private observeDom(): void {
    this.observer = new MutationObserver(() => {
      if (this.domFrame !== null) return;
      this.domFrame = window.requestAnimationFrame(() => {
        this.domFrame = null;
        this.ensureDom();
      });
    });
    this.observer.observe(this.target.containerEl, { childList: true, subtree: true });
  }

  private bindInput(wrapper: HTMLElement): void {
    if (this.wrapperEl === wrapper) return;
    for (const dispose of this.inputDisposers.splice(0)) dispose();
    this.wrapperEl = wrapper;
    this.listen(wrapper, "pointerdown", this.onPointerDown, true, this.inputDisposers);
    this.listen(wrapper, "pointermove", this.onPointerMove, true, this.inputDisposers);
    this.listen(wrapper, "pointerup", this.onPointerUp, true, this.inputDisposers);
    this.listen(wrapper, "pointercancel", this.onPointerUp, true, this.inputDisposers);
    this.listen(wrapper, "pointerleave", this.onPointerLeave, true, this.inputDisposers);
    this.listen(wrapper, "contextmenu", this.onContextMenu, true, this.inputDisposers);
  }

  private readonly onPointerDown = (event: PointerEvent): void => {
    this.noteStylusEvent(event);
    this.updateEraserCursor(event);
    if (event.pointerType === "touch" && this.activePointerId !== null) {
      this.consume(event);
      return;
    }
    if (!this.enabled || !isStylusEvent(event) || this.activePointerId !== null || isControlTarget(event.target)) return;
    if (isTemporaryEraser(event) && !isStylusContact(event)) {
      this.barrelButtonArmed = true;
      this.consume(event);
      return;
    }
    if (!isStylusContact(event)) return;
    this.beginGesture(event, this.barrelButtonArmed ? "eraser" : undefined);
  };

  private beginGesture(event: PointerEvent, forcedTool?: DrawingTool): void {
    this.ensureDom();
    if (!this.svgEl || !this.wrapperEl) return;

    const transform = this.readCanvasTransform();
    if (!transform) {
      this.logger.record("ink", "gesture_rejected", { reason: "invalid_canvas_transform" });
      return;
    }

    this.consume(event);
    trySetPointerCapture(this.wrapperEl, event.pointerId);
    this.activePointerId = event.pointerId;
    this.gestureTransform = transform;
    this.temporaryTool = forcedTool ?? (isTemporaryEraser(event) ? "eraser" : null);
    this.barrelButtonArmed = false;
    const tool = this.temporaryTool ?? this.activeTool;
    this.gestureStartedAt = performance.now();
    this.erasedStrokeCount = 0;
    this.logger.record("ink", "gesture_started", {
      tool,
      pointerType: event.pointerType,
      button: event.button,
      buttons: event.buttons,
      pressure: Math.round(event.pressure * 1000) / 1000,
      temporaryTool: this.temporaryTool !== null,
    });
    this.pushUndoSnapshot();

    if (tool === "eraser") {
      this.didEraseInGesture = false;
      this.eraseSamples(event);
      return;
    }

    const point = this.eventToPoint(event);
    if (!point) return;
    this.activeStroke = {
      id: createStrokeId(),
      tool,
      color: this.getToolColor(tool),
      size: tool === "pen" ? 3.5 : 17,
      opacity: tool === "pen" ? 1 : 0.38,
      points: [point],
      hasPressure: event.pressure > 0 && event.pressure !== 0.5,
      createdAt: Date.now(),
    };
    this.data.strokes.push(this.activeStroke);
    this.activePathEl = this.createPath(this.activeStroke, false);
    this.activePathEl.classList.add("is-active");
    this.svgEl.appendChild(this.activePathEl);
  }

  private readonly onPointerMove = (event: PointerEvent): void => {
    this.noteStylusEvent(event);
    this.updateEraserCursor(event);
    if (event.pointerType === "touch" && this.activePointerId !== null) {
      this.consume(event);
      return;
    }
    if (
      this.activePointerId === null &&
      this.enabled &&
      this.barrelButtonArmed &&
      isStylusEvent(event) &&
      isStylusContact(event)
    ) {
      this.beginGesture(event, "eraser");
      return;
    }
    if (event.pointerId !== this.activePointerId) return;
    this.consume(event);

    const tool = this.temporaryTool ?? this.activeTool;
    if (tool === "eraser") {
      this.eraseSamples(event);
      return;
    }
    if (!this.activeStroke) return;
    for (const sample of pointerSamples(event)) {
      const point = this.eventToPoint(sample);
      if (!point || !this.shouldAppendPoint(this.activeStroke, point)) continue;
      this.activeStroke.points.push(point);
      if (sample.pressure > 0 && sample.pressure !== 0.5) this.activeStroke.hasPressure = true;
    }
    this.scheduleActiveRender();
  };

  private readonly onPointerUp = (event: PointerEvent): void => {
    this.noteStylusEvent(event);
    if (event.pointerType === "touch" && this.activePointerId !== null) {
      this.consume(event);
      return;
    }
    if (this.activePointerId === null && this.barrelButtonArmed && isStylusEvent(event)) {
      this.barrelButtonArmed = false;
      this.consume(event);
      return;
    }
    if (event.pointerId !== this.activePointerId) return;
    this.consume(event);
    if ((this.temporaryTool ?? this.activeTool) !== "eraser" && shouldAppendReleasePoint(event)) {
      this.appendReleasePoint(event);
    }
    if (this.wrapperEl?.hasPointerCapture(event.pointerId)) this.wrapperEl.releasePointerCapture(event.pointerId);
    this.finishGesture();
  };

  private readonly onPointerLeave = (event: PointerEvent): void => {
    if (event.pointerId !== this.activePointerId) this.hideEraserCursor();
  };

  private readonly onContextMenu = (event: MouseEvent): void => {
    const followsStylusInput = event.timeStamp - this.lastStylusEventAt <= RECENT_STYLUS_CONTEXT_MENU_MS;
    if (this.activePointerId !== null || this.barrelButtonArmed || (this.enabled && followsStylusInput)) this.consume(event);
  };

  private finishGesture(): void {
    if (this.renderFrame !== null) {
      window.cancelAnimationFrame(this.renderFrame);
      this.renderFrame = null;
    }
    const completedStroke = this.activeStroke;
    const completedTool = this.temporaryTool ?? this.activeTool;
    if (this.activeStroke) {
      if (this.activeStroke.points.length === 1) {
        const first = this.activeStroke.points[0];
        if (first) this.activeStroke.points.push({ ...first, x: first.x + 0.01, time: first.time + 1 });
      }
      this.activePathEl?.replaceWith(this.createPath(this.activeStroke, true));
      this.scheduleSave();
    } else if (this.didEraseInGesture) {
      this.scheduleSave();
    } else {
      this.undoStack.pop();
    }
    this.logger.record("ink", "gesture_finished", {
      tool: completedTool,
      durationMs: Math.round(performance.now() - this.gestureStartedAt),
      pointCount: completedStroke?.points.length ?? 0,
      erasedStrokeCount: this.erasedStrokeCount,
      pressureDetected: completedStroke?.hasPressure ?? false,
    });
    this.activeStroke = null;
    this.activePathEl = null;
    this.activePointerId = null;
    this.gestureTransform = null;
    this.temporaryTool = null;
    this.didEraseInGesture = false;
    if (this.activeTool !== "eraser") this.hideEraserCursor();
    this.syncControls();
  }

  private eraseSamples(event: PointerEvent): void {
    for (const sample of pointerSamples(event)) {
      const point = this.eventToPoint(sample);
      if (!point) continue;
      const screenScale = this.getScreenScale();
      const radius = ERASER_SCREEN_RADIUS / screenScale;
      const before = this.data.strokes.length;
      this.data.strokes = this.data.strokes.filter(
        (stroke) => !strokeIntersectsCircle(stroke, point.x, point.y, radius),
      );
      if (this.data.strokes.length !== before) {
        this.erasedStrokeCount += before - this.data.strokes.length;
        this.didEraseInGesture = true;
        this.renderAll();
      }
    }
  }

  private appendReleasePoint(event: PointerEvent): void {
    if (!this.activeStroke) return;
    for (const sample of pointerSamples(event)) {
      const point = this.eventToPoint(sample);
      if (point && this.shouldAppendPoint(this.activeStroke, point)) this.activeStroke.points.push(point);
    }
  }

  private eventToPoint(event: PointerEvent): InkPoint | null {
    if (!Number.isFinite(event.clientX) || !Number.isFinite(event.clientY)) return null;
    const transform = this.gestureTransform ?? this.readCanvasTransform();
    if (!transform) return null;
    const { screenToCanvas } = transform;
    const x = screenToCanvas.a * event.clientX + screenToCanvas.c * event.clientY + screenToCanvas.e;
    const y = screenToCanvas.b * event.clientX + screenToCanvas.d * event.clientY + screenToCanvas.f;
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
    return pointerToInkPoint(event, x, y);
  }

  private shouldAppendPoint(stroke: InkStroke, point: InkPoint): boolean {
    const previous = stroke.points[stroke.points.length - 1];
    if (!previous) return true;
    const minimum = MIN_SCREEN_POINT_DISTANCE / this.getScreenScale();
    return Math.hypot(point.x - previous.x, point.y - previous.y) >= minimum;
  }

  private getScreenScale(): number {
    if (this.gestureTransform) return this.gestureTransform.screenScale;
    return this.readCanvasTransform()?.screenScale ?? 1;
  }

  private readCanvasTransform(): CanvasTransform | null {
    const matrix = this.svgEl?.getScreenCTM();
    if (!matrix) return null;
    const screenScale = Math.max(Math.hypot(matrix.a, matrix.b), Math.hypot(matrix.c, matrix.d));
    if (!Number.isFinite(screenScale) || screenScale <= 0) return null;
    try {
      const screenToCanvas = matrix.inverse();
      const components = [
        screenToCanvas.a,
        screenToCanvas.b,
        screenToCanvas.c,
        screenToCanvas.d,
        screenToCanvas.e,
        screenToCanvas.f,
      ];
      return components.every(Number.isFinite) ? { screenToCanvas, screenScale } : null;
    } catch {
      return null;
    }
  }

  private noteStylusEvent(event: PointerEvent): void {
    if (isStylusEvent(event)) this.lastStylusEventAt = event.timeStamp;
  }

  private getDefaultPenColor(): string {
    const view = this.target.containerEl.ownerDocument.defaultView;
    const color = view?.getComputedStyle(this.target.containerEl).getPropertyValue("--text-normal").trim();
    return color || "#1f2937";
  }

  private scheduleActiveRender(): void {
    if (this.renderFrame !== null) return;
    this.renderFrame = window.requestAnimationFrame(() => {
      this.renderFrame = null;
      if (this.activeStroke && this.activePathEl) {
        this.activePathEl.setAttribute("d", strokeToSvgPath(this.activeStroke, false));
      }
    });
  }

  private renderAll(): void {
    if (!this.svgEl) return;
    this.svgEl.replaceChildren(...this.data.strokes.map((stroke) => this.createPath(stroke, true)));
    this.ensureEraserCursor();
  }

  private getToolColor(tool: ColorTool): string {
    return this.selectedColors[tool] ?? (tool === "pen" ? this.getDefaultPenColor() : "#fde047");
  }

  private createPath(stroke: InkStroke, complete: boolean): SVGPathElement {
    const path = this.target.containerEl.ownerDocument.createElementNS(SVG_NS, "path");
    path.classList.add("canvas-scribe-stroke", `is-${stroke.tool}`);
    path.dataset.strokeId = stroke.id;
    path.setAttribute("d", strokeToSvgPath(stroke, complete));
    path.setAttribute("fill", stroke.color);
    path.setAttribute("opacity", stroke.opacity.toString());
    return path;
  }

  private pushUndoSnapshot(): void {
    this.undoStack.push(cloneStrokes(this.data.strokes));
    if (this.undoStack.length > 100) this.undoStack.shift();
    this.redoStack = [];
    this.syncControls();
  }

  private scheduleSave(): void {
    if (this.saveTimer !== null) window.clearTimeout(this.saveTimer);
    this.saveTimer = window.setTimeout(() => {
      this.saveTimer = null;
      void this.saveNow();
    }, SAVE_DELAY_MS);
  }

  private async saveNow(): Promise<void> {
    if (this.saveTimer !== null) {
      window.clearTimeout(this.saveTimer);
      this.saveTimer = null;
    }
    try {
      await saveInkData(this.app, this.target.file, this.data);
      this.logger.record("storage", "ink_saved", { strokeCount: this.data.strokes.length });
    } catch (error) {
      this.logger.recordError("ink_save_failed", error);
      console.error("Canvas Scribe could not save ink", error);
      new Notice("Canvas Scribe could not save ink. See the developer console.");
    }
  }

  private mountControls(): void {
    const canvasControls = this.target.containerEl.querySelector<HTMLElement>(".canvas-controls");
    if (!canvasControls) return;
    if (this.controlsEl?.isConnected && this.controlsEl.parentElement === canvasControls) {
      this.syncControls();
      return;
    }
    this.controlsEl?.remove();
    const document = this.target.containerEl.ownerDocument;
    const group = document.createElement("div");
    group.className = "canvas-control-group mod-raised canvas-scribe-controls";
    group.append(
      this.controlButton("pen-tool", "Pen", "pen", () => this.setTool("pen")),
      this.controlButton("highlighter", "Highlighter", "highlighter", () => this.setTool("highlighter")),
      this.controlButton("eraser", "Eraser", "eraser", () => this.setTool("eraser")),
      this.controlButton("palette", "Choose pen color", "color", () => this.toggleColorPalette()),
      this.controlButton("undo-2", "Undo ink", "undo", () => this.undo()),
      this.controlButton("redo-2", "Redo ink", "redo", () => this.redo()),
      this.controlButton("pencil", "Toggle stylus input", "toggle", () => this.toggleEnabled()),
    );
    canvasControls.prepend(group);
    this.controlsEl = group;
    this.syncControls();
  }

  private controlButton(icon: string, label: string, action: string, callback: () => void): HTMLElement {
    const button = this.target.containerEl.ownerDocument.createElement("div");
    button.className = "canvas-control-item canvas-scribe-control-item";
    button.dataset.action = action;
    button.setAttribute("aria-label", label);
    button.setAttribute("role", "button");
    button.tabIndex = 0;
    setIcon(button, icon);
    const activate = (event: Event) => {
      event.preventDefault();
      event.stopPropagation();
      callback();
    };
    button.addEventListener("pointerdown", activate);
    button.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") activate(event);
    });
    return button;
  }

  private syncControls(): void {
    if (!this.controlsEl) return;
    for (const tool of ["pen", "highlighter", "eraser"] as const) {
      const button = this.controlsEl.querySelector<HTMLElement>(`[data-action="${tool}"]`);
      button?.classList.toggle("is-active", this.activeTool === tool && this.enabled);
      button?.setAttribute("aria-pressed", String(this.activeTool === tool && this.enabled));
    }
    const toggle = this.controlsEl.querySelector<HTMLElement>("[data-action=toggle]");
    toggle?.classList.toggle("is-active", this.enabled);
    toggle?.setAttribute("aria-pressed", String(this.enabled));
    const color = this.controlsEl.querySelector<HTMLElement>("[data-action=color]");
    const colorTool = this.activeTool === "eraser" ? null : this.activeTool;
    color?.classList.toggle("is-disabled", colorTool === null);
    color?.classList.toggle("is-active", this.colorPaletteEl !== null);
    color?.setAttribute("aria-disabled", String(colorTool === null));
    color?.setAttribute("aria-label", colorTool ? `Choose ${colorTool} color` : "Choose a pen or highlighter first");
    if (colorTool) color?.style.setProperty("--canvas-scribe-active-color", this.getToolColor(colorTool));
    this.controlsEl.querySelector<HTMLElement>("[data-action=undo]")?.classList.toggle("is-disabled", this.undoStack.length === 0);
    this.controlsEl.querySelector<HTMLElement>("[data-action=redo]")?.classList.toggle("is-disabled", this.redoStack.length === 0);
  }

  private ensureEraserCursor(): void {
    if (!this.svgEl) return;
    if (!this.eraserCursorEl) {
      this.eraserCursorEl = this.target.containerEl.ownerDocument.createElementNS(SVG_NS, "circle");
      this.eraserCursorEl.classList.add("canvas-scribe-eraser-cursor");
      this.eraserCursorEl.setAttribute("vector-effect", "non-scaling-stroke");
    }
    this.eraserCursorEl.setAttribute("r", (ERASER_SCREEN_RADIUS / this.getScreenScale()).toString());
    this.svgEl.appendChild(this.eraserCursorEl);
  }

  private updateEraserCursor(event: PointerEvent): void {
    if (!this.enabled || !isStylusEvent(event) || isControlTarget(event.target)) return;
    const tool = this.activePointerId === null ? this.activeTool : (this.temporaryTool ?? this.activeTool);
    if (tool !== "eraser" && !isTemporaryEraser(event) && !this.barrelButtonArmed) {
      this.hideEraserCursor();
      return;
    }
    const point = this.eventToPoint(event);
    if (!point) return;
    this.ensureEraserCursor();
    this.eraserCursorEl?.setAttribute("cx", point.x.toString());
    this.eraserCursorEl?.setAttribute("cy", point.y.toString());
    this.eraserCursorEl?.classList.add("is-visible");
  }

  private hideEraserCursor(): void {
    this.eraserCursorEl?.classList.remove("is-visible");
  }

  private toggleColorPalette(): void {
    if (this.colorPaletteEl) {
      this.closeColorPalette();
      this.syncControls();
      return;
    }
    if (!this.controlsEl || this.activeTool === "eraser") return;
    const tool = this.activeTool;
    const document = this.target.containerEl.ownerDocument;
    const palette = document.createElement("div");
    palette.className = "canvas-scribe-color-palette";
    palette.setAttribute("role", "toolbar");
    palette.setAttribute("aria-label", `${tool} colors`);
    for (const color of paletteColors(tool, this.getToolColor(tool))) {
      const swatch = document.createElement("button");
      swatch.type = "button";
      swatch.className = "canvas-scribe-color-swatch";
      swatch.style.setProperty("--canvas-scribe-swatch-color", color);
      swatch.setAttribute("aria-label", `Use ${color} for ${tool}`);
      swatch.setAttribute("aria-pressed", String(color.toLowerCase() === this.getToolColor(tool).toLowerCase()));
      swatch.addEventListener("pointerdown", (event) => {
        this.consume(event);
        this.selectedColors[tool] = color;
        this.logger.record("canvas", "color_selected", { tool, color });
        this.closeColorPalette();
        this.syncControls();
      });
      palette.appendChild(swatch);
    }
    this.controlsEl.appendChild(palette);
    this.colorPaletteEl = palette;
    this.syncControls();
  }

  private closeColorPalette(): void {
    this.colorPaletteEl?.remove();
    this.colorPaletteEl = null;
  }

  private listen<K extends keyof HTMLElementEventMap>(
    element: HTMLElement,
    type: K,
    listener: (event: HTMLElementEventMap[K]) => void,
    capture = false,
    registry = this.disposers,
  ): void {
    element.addEventListener(type, listener as EventListener, capture);
    registry.push(() => element.removeEventListener(type, listener as EventListener, capture));
  }

  private consume(event: Event): void {
    if (event.cancelable) event.preventDefault();
    event.stopImmediatePropagation();
  }
}

function isControlTarget(target: EventTarget | null): boolean {
  return target instanceof Element && Boolean(target.closest(".canvas-controls, .canvas-menu, .canvas-card-menu"));
}

function trySetPointerCapture(element: Element, pointerId: number): void {
  try {
    element.setPointerCapture(pointerId);
  } catch (error) {
    if (!(error instanceof DOMException && error.name === "NotFoundError")) throw error;
  }
}
