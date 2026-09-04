import { Notice, setIcon, type App } from "obsidian";

import type { CanvasTarget } from "./canvas-target";
import { paletteColors, type ColorTool } from "./colors";
import type { DebugLogger } from "./debug-logger";
import { strokeIntersectsCircle, strokeToSvgPath } from "./geometry";
import { loadInkData, saveInkData } from "./persistence";
import { positionPopup } from "./popover";
import { boundsForStrokes, pointInBounds, strokeInsidePolygon, translatePoints } from "./selection";
import {
  isEraserTip,
  isStylusBarrelButton,
  isStylusContact,
  isStylusEvent,
  pointerSamples,
  pointerToInkPoint,
  shouldAppendReleasePoint,
} from "./pointer-input";
import { RadialMenu, type RadialMenuAction } from "./radial-menu";
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
const ERASER_SCREEN_RADIUS = 18;
const SELECTION_SCREEN_PADDING = 8;

interface CanvasTransform {
  screenToCanvas: DOMMatrix;
  screenScale: number;
}

export class CanvasInkLayer {
  private data: CanvasInkData = createEmptyInkData();
  private svgEl: SVGSVGElement | null = null;
  private eraserCursorEl: SVGCircleElement | null = null;
  private lassoPathEl: SVGPathElement | null = null;
  private selectionRectEl: SVGRectElement | null = null;
  private controlsEl: HTMLElement | null = null;
  private colorPaletteEl: HTMLElement | null = null;
  private wrapperEl: HTMLElement | null = null;
  private activeStroke: InkStroke | null = null;
  private activePathEl: SVGPathElement | null = null;
  private activePointerId: number | null = null;
  private activeTool: DrawingTool = "pen";
  private readonly selectedColors: Partial<Record<ColorTool, string>> = {};
  private readonly selectedStrokeIds = new Set<string>();
  private lassoPoints: InkPoint[] = [];
  private lassoMode: "select" | "move" | null = null;
  private moveOrigin: InkPoint | null = null;
  private moveStartPoints = new Map<string, InkPoint[]>();
  private didMoveSelection = false;
  private temporaryTool: DrawingTool | null = null;
  private enabled = true;
  private didEraseInGesture = false;
  private stylusMenuArmed = false;
  private eraserTipArmed = false;
  private undoStack: InkStroke[][] = [];
  private redoStack: InkStroke[][] = [];
  private gestureRedoStack: InkStroke[][] | null = null;
  private gestureHasUndoSnapshot = false;
  private saveTimer: number | null = null;
  private renderFrame: number | null = null;
  private domFrame: number | null = null;
  private disposed = false;
  private readonly disposers: Array<() => void> = [];
  private readonly inputDisposers: Array<() => void> = [];
  private observer: MutationObserver | null = null;
  private gestureStartedAt = 0;
  private gestureTransform: CanvasTransform | null = null;
  private erasedStrokeCount = 0;
  private radialMenu: RadialMenu | null = null;
  private allowNextContextMenu = false;

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
    if (tool !== "lasso") this.clearSelection();
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
    this.lassoPathEl = null;
    this.selectionRectEl = null;
    this.closeColorPalette();
    this.controlsEl?.remove();
    this.closeRadialMenu();
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
    this.updateEraserCursor(event);
    if (event.pointerType === "touch" && this.activePointerId !== null) {
      this.consume(event);
      return;
    }
    if (
      !isStylusEvent(event) ||
      this.activePointerId !== null ||
      isControlTarget(event.target) ||
      isEditableTarget(event.target)
    ) {
      return;
    }
    if (isStylusBarrelButton(event)) {
      this.stylusMenuArmed = true;
      this.consume(event);
      return;
    }
    if (!this.enabled) return;
    if (isEraserTip(event) && !isStylusContact(event)) {
      this.eraserTipArmed = true;
      this.consume(event);
      return;
    }
    if (!isStylusContact(event)) return;
    this.closeRadialMenu();
    this.beginGesture(event, this.eraserTipArmed ? "eraser" : undefined);
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
    this.temporaryTool = forcedTool ?? (isEraserTip(event) ? "eraser" : null);
    this.eraserTipArmed = false;
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
    this.gestureRedoStack = this.redoStack;
    this.gestureHasUndoSnapshot = false;
    if (tool === "eraser") {
      this.pushUndoSnapshot();
      this.gestureHasUndoSnapshot = true;
      this.didEraseInGesture = false;
      this.eraseSamples(event);
      return;
    }

    const point = this.eventToPoint(event);
    if (!point) return;
    if (tool === "lasso") {
      this.beginLassoGesture(point);
      return;
    }
    this.pushUndoSnapshot();
    this.gestureHasUndoSnapshot = true;
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
    this.updateEraserCursor(event);
    if (event.pointerType === "touch" && this.activePointerId !== null) {
      this.consume(event);
      return;
    }
    if (event.pointerId === this.activePointerId && isStylusEvent(event) && isStylusBarrelButton(event)) {
      this.consume(event);
      this.cancelGesture("barrel_button");
      this.stylusMenuArmed = true;
      return;
    }
    if (this.activePointerId === null && this.stylusMenuArmed && isStylusEvent(event)) {
      this.consume(event);
      return;
    }
    if (this.activePointerId === null && this.enabled && this.eraserTipArmed && isStylusEvent(event) && isStylusContact(event)) {
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
    if (tool === "lasso") {
      this.updateLassoGesture(event);
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
    if (event.pointerType === "touch" && this.activePointerId !== null) {
      this.consume(event);
      return;
    }
    if (this.activePointerId === null && this.stylusMenuArmed && isStylusEvent(event)) {
      this.stylusMenuArmed = false;
      this.consume(event);
      return;
    }
    if (this.activePointerId === null && this.eraserTipArmed && isStylusEvent(event)) {
      this.eraserTipArmed = false;
      this.consume(event);
      return;
    }
    if (event.pointerId !== this.activePointerId) return;
    this.consume(event);
    const tool = this.temporaryTool ?? this.activeTool;
    if (tool === "lasso" && shouldAppendReleasePoint(event)) {
      this.updateLassoGesture(event);
    } else if (tool !== "eraser" && shouldAppendReleasePoint(event)) {
      this.appendReleasePoint(event);
    }
    if (this.wrapperEl?.hasPointerCapture(event.pointerId)) this.wrapperEl.releasePointerCapture(event.pointerId);
    this.finishGesture();
  };

  private readonly onPointerLeave = (event: PointerEvent): void => {
    if (event.pointerId !== this.activePointerId) this.hideEraserCursor();
  };

  private readonly onContextMenu = (event: MouseEvent): void => {
    if (this.allowNextContextMenu) {
      this.allowNextContextMenu = false;
      return;
    }
    if (isEditableTarget(event.target)) return;
    if (!this.enabled) return;
    this.consume(event);
    if (this.activePointerId !== null) this.cancelGesture("context_menu");
    this.stylusMenuArmed = false;
    this.showRadialMenu(event.clientX, event.clientY, event.target);
  };

  private cancelGesture(reason: string): void {
    if (this.renderFrame !== null) {
      window.cancelAnimationFrame(this.renderFrame);
      this.renderFrame = null;
    }
    const pointerId = this.activePointerId;
    if (pointerId !== null && this.wrapperEl?.hasPointerCapture(pointerId)) this.wrapperEl.releasePointerCapture(pointerId);
    if (this.gestureHasUndoSnapshot) {
      const previous = this.undoStack.pop();
      if (previous) this.data.strokes = previous;
    }
    if (this.gestureRedoStack) this.redoStack = this.gestureRedoStack;
    this.gestureRedoStack = null;
    this.gestureHasUndoSnapshot = false;
    this.activeStroke = null;
    this.activePathEl = null;
    this.activePointerId = null;
    this.gestureTransform = null;
    this.temporaryTool = null;
    this.didEraseInGesture = false;
    this.erasedStrokeCount = 0;
    this.lassoPathEl?.remove();
    this.lassoPathEl = null;
    this.lassoMode = null;
    this.lassoPoints = [];
    this.moveOrigin = null;
    this.moveStartPoints.clear();
    this.didMoveSelection = false;
    this.renderAll();
    this.syncControls();
    this.logger.record("ink", "gesture_cancelled", { reason });
  }

  private finishGesture(): void {
    if (this.renderFrame !== null) {
      window.cancelAnimationFrame(this.renderFrame);
      this.renderFrame = null;
    }
    const completedStroke = this.activeStroke;
    const completedTool = this.temporaryTool ?? this.activeTool;
    if (completedTool === "lasso") {
      this.finishLassoGesture();
    } else if (this.activeStroke) {
      if (this.activeStroke.points.length === 1) {
        const first = this.activeStroke.points[0];
        if (first) this.activeStroke.points.push({ ...first, x: first.x + 0.01, time: first.time + 1 });
      }
      this.activePathEl?.replaceWith(this.createPath(this.activeStroke, true));
      this.scheduleSave();
    } else if (this.didEraseInGesture) {
      this.scheduleSave();
    } else if (this.gestureHasUndoSnapshot) {
      this.undoStack.pop();
      if (this.gestureRedoStack) this.redoStack = this.gestureRedoStack;
    }
    this.logger.record("ink", "gesture_finished", {
      tool: completedTool,
      durationMs: Math.round(performance.now() - this.gestureStartedAt),
      pointCount: completedStroke?.points.length ?? this.lassoPoints.length,
      erasedStrokeCount: this.erasedStrokeCount,
      pressureDetected: completedStroke?.hasPressure ?? false,
    });
    this.activeStroke = null;
    this.activePathEl = null;
    this.activePointerId = null;
    this.gestureTransform = null;
    this.temporaryTool = null;
    this.didEraseInGesture = false;
    this.gestureRedoStack = null;
    this.gestureHasUndoSnapshot = false;
    this.lassoMode = null;
    this.lassoPoints = [];
    this.moveOrigin = null;
    this.moveStartPoints.clear();
    this.didMoveSelection = false;
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

  private showRadialMenu(clientX: number, clientY: number, contextTarget: EventTarget | null): void {
    this.closeRadialMenu();
    const actions: RadialMenuAction[] = [
      this.radialToolAction("pen", "pencil", "Pen"),
      this.radialToolAction("highlighter", "highlighter", "Highlighter"),
      this.radialToolAction("eraser", "eraser", "Eraser"),
      {
        id: "canvas-menu",
        label: "Open Canvas menu",
        icon: "menu",
        run: () => this.openCanvasContextMenu(contextTarget, clientX, clientY),
      },
      {
        id: "redo",
        label: "Redo ink",
        icon: "redo-2",
        disabled: this.redoStack.length === 0,
        run: () => this.redo(),
      },
      {
        id: "undo",
        label: "Undo ink",
        icon: "undo-2",
        disabled: this.undoStack.length === 0,
        run: () => this.undo(),
      },
    ];
    this.logger.record("canvas", "radial_menu_opened", { activeTool: this.activeTool });
    this.radialMenu = new RadialMenu(this.target.containerEl.ownerDocument, actions, () => {
      this.radialMenu = null;
    });
    this.radialMenu.open(clientX, clientY);
  }

  private openCanvasContextMenu(target: EventTarget | null, clientX: number, clientY: number): void {
    const document = this.target.containerEl.ownerDocument;
    const view = document.defaultView;
    const NodeConstructor = view?.Node;
    const connectedTarget = NodeConstructor && target instanceof NodeConstructor && target.isConnected ? target : this.wrapperEl;
    if (!view || !connectedTarget) return;

    this.allowNextContextMenu = true;
    connectedTarget.dispatchEvent(new view.MouseEvent("contextmenu", {
      bubbles: true,
      cancelable: true,
      view,
      clientX,
      clientY,
      button: 2,
    }));
    this.allowNextContextMenu = false;
    this.logger.record("canvas", "native_context_menu_requested");
  }

  private radialToolAction(tool: DrawingTool, icon: string, label: string): RadialMenuAction {
    return {
      id: tool,
      label,
      icon,
      active: this.enabled && this.activeTool === tool,
      run: () => {
        if (!this.enabled) this.toggleEnabled();
        this.setTool(tool);
      },
    };
  }

  private closeRadialMenu(): void {
    const menu = this.radialMenu;
    this.radialMenu = null;
    menu?.close();
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
    this.updateSelectionRect();
    this.ensureEraserCursor();
  }

  private beginLassoGesture(point: InkPoint): void {
    const bounds = boundsForStrokes(this.selectedStrokes());
    const padding = SELECTION_SCREEN_PADDING / this.getScreenScale();
    if (bounds && pointInBounds(point, bounds, padding)) {
      this.lassoMode = "move";
      this.moveOrigin = point;
      this.moveStartPoints = new Map(
        this.selectedStrokes().map((stroke) => [stroke.id, stroke.points.map((candidate) => ({ ...candidate }))]),
      );
      this.pushUndoSnapshot();
      this.gestureHasUndoSnapshot = true;
      return;
    }

    this.clearSelection();
    this.lassoMode = "select";
    this.lassoPoints = [point];
    this.ensureLassoPath();
    this.updateLassoPath();
  }

  private updateLassoGesture(event: PointerEvent): void {
    if (this.lassoMode === "select") {
      for (const sample of pointerSamples(event)) {
        const point = this.eventToPoint(sample);
        const previous = this.lassoPoints[this.lassoPoints.length - 1];
        if (!point || (previous && Math.hypot(point.x - previous.x, point.y - previous.y) < 1 / this.getScreenScale())) {
          continue;
        }
        this.lassoPoints.push(point);
      }
      this.updateLassoPath();
      return;
    }
    if (this.lassoMode !== "move" || !this.moveOrigin) return;
    const samples = pointerSamples(event);
    const point = this.eventToPoint(samples[samples.length - 1] ?? event);
    if (!point) return;
    const deltaX = point.x - this.moveOrigin.x;
    const deltaY = point.y - this.moveOrigin.y;
    this.didMoveSelection = this.didMoveSelection || Math.hypot(deltaX, deltaY) >= 1 / this.getScreenScale();
    for (const stroke of this.data.strokes) {
      const startPoints = this.moveStartPoints.get(stroke.id);
      if (startPoints) stroke.points = translatePoints(startPoints, deltaX, deltaY);
    }
    this.renderAll();
  }

  private finishLassoGesture(): void {
    if (this.lassoMode === "select") {
      this.selectedStrokeIds.clear();
      for (const stroke of this.data.strokes) {
        if (strokeInsidePolygon(stroke, this.lassoPoints)) this.selectedStrokeIds.add(stroke.id);
      }
      this.logger.record("ink", "lasso_selected", { strokeCount: this.selectedStrokeIds.size });
      this.lassoPathEl?.remove();
      this.lassoPathEl = null;
      this.renderAll();
      return;
    }
    if (this.lassoMode === "move" && this.didMoveSelection) {
      this.logger.record("ink", "lasso_moved", { strokeCount: this.selectedStrokeIds.size });
      this.scheduleSave();
    } else if (this.lassoMode === "move") {
      this.undoStack.pop();
      if (this.gestureRedoStack) this.redoStack = this.gestureRedoStack;
    }
  }

  private getToolColor(tool: ColorTool): string {
    return this.selectedColors[tool] ?? (tool === "pen" ? this.getDefaultPenColor() : "#fde047");
  }

  private createPath(stroke: InkStroke, complete: boolean): SVGPathElement {
    const path = this.target.containerEl.ownerDocument.createElementNS(SVG_NS, "path");
    path.classList.add("canvas-scribe-stroke", `is-${stroke.tool}`);
    path.classList.toggle("is-selected", this.selectedStrokeIds.has(stroke.id));
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
      this.controlButton("lasso-select", "Lasso ink", "lasso", () => this.setTool("lasso")),
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
    for (const tool of ["pen", "highlighter", "eraser", "lasso"] as const) {
      const button = this.controlsEl.querySelector<HTMLElement>(`[data-action="${tool}"]`);
      button?.classList.toggle("is-active", this.activeTool === tool && this.enabled);
      button?.setAttribute("aria-pressed", String(this.activeTool === tool && this.enabled));
    }
    const toggle = this.controlsEl.querySelector<HTMLElement>("[data-action=toggle]");
    toggle?.classList.toggle("is-active", this.enabled);
    toggle?.setAttribute("aria-pressed", String(this.enabled));
    const color = this.controlsEl.querySelector<HTMLElement>("[data-action=color]");
    const colorTool: ColorTool | null =
      this.activeTool === "pen" || this.activeTool === "highlighter" ? this.activeTool : null;
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
    if (!this.enabled || !isStylusEvent(event) || isControlTarget(event.target) || isEditableTarget(event.target)) {
      this.hideEraserCursor();
      return;
    }
    const tool = this.activePointerId === null ? this.activeTool : (this.temporaryTool ?? this.activeTool);
    if (tool !== "eraser" && !isEraserTip(event) && !this.eraserTipArmed) {
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

  private ensureLassoPath(): void {
    if (!this.svgEl) return;
    if (!this.lassoPathEl) {
      this.lassoPathEl = this.target.containerEl.ownerDocument.createElementNS(SVG_NS, "path");
      this.lassoPathEl.classList.add("canvas-scribe-lasso-path");
      this.lassoPathEl.setAttribute("vector-effect", "non-scaling-stroke");
    }
    this.svgEl.appendChild(this.lassoPathEl);
  }

  private updateLassoPath(): void {
    this.ensureLassoPath();
    if (!this.lassoPathEl) return;
    const commands = this.lassoPoints.map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`);
    if (this.lassoPoints.length > 2) commands.push("Z");
    this.lassoPathEl.setAttribute("d", commands.join(" "));
  }

  private selectedStrokes(): InkStroke[] {
    return this.data.strokes.filter((stroke) => this.selectedStrokeIds.has(stroke.id));
  }

  private updateSelectionRect(): void {
    if (!this.svgEl) return;
    const bounds = boundsForStrokes(this.selectedStrokes());
    if (!bounds) {
      this.selectionRectEl?.remove();
      this.selectionRectEl = null;
      return;
    }
    if (!this.selectionRectEl) {
      this.selectionRectEl = this.target.containerEl.ownerDocument.createElementNS(SVG_NS, "rect");
      this.selectionRectEl.classList.add("canvas-scribe-selection-box");
      this.selectionRectEl.setAttribute("vector-effect", "non-scaling-stroke");
    }
    const padding = SELECTION_SCREEN_PADDING / this.getScreenScale();
    this.selectionRectEl.setAttribute("x", (bounds.minX - padding).toString());
    this.selectionRectEl.setAttribute("y", (bounds.minY - padding).toString());
    this.selectionRectEl.setAttribute("width", (bounds.maxX - bounds.minX + padding * 2).toString());
    this.selectionRectEl.setAttribute("height", (bounds.maxY - bounds.minY + padding * 2).toString());
    this.svgEl.appendChild(this.selectionRectEl);
  }

  private clearSelection(): void {
    if (this.selectedStrokeIds.size === 0 && !this.selectionRectEl) return;
    this.selectedStrokeIds.clear();
    this.selectionRectEl?.remove();
    this.selectionRectEl = null;
    this.renderAll();
  }

  private toggleColorPalette(): void {
    if (this.colorPaletteEl) {
      this.closeColorPalette();
      this.syncControls();
      return;
    }
    if (!this.controlsEl || (this.activeTool !== "pen" && this.activeTool !== "highlighter")) return;
    const colorButton = this.controlsEl.querySelector<HTMLElement>("[data-action=color]");
    if (!colorButton) return;
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
    document.body.appendChild(palette);
    const viewport = document.defaultView;
    const position = positionPopup(
      colorButton.getBoundingClientRect(),
      palette.getBoundingClientRect(),
      viewport?.innerWidth ?? document.documentElement.clientWidth,
      viewport?.innerHeight ?? document.documentElement.clientHeight,
    );
    palette.style.left = `${position.left}px`;
    palette.style.top = `${position.top}px`;
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
  return target instanceof Element && Boolean(target.closest(".canvas-controls, .canvas-menu, .canvas-card-menu, .canvas-scribe-radial-menu"));
}

function isEditableTarget(target: EventTarget | null): boolean {
  return (
    target instanceof Element &&
    Boolean(target.closest('input, textarea, [contenteditable]:not([contenteditable="false"]), .cm-content'))
  );
}

function trySetPointerCapture(element: Element, pointerId: number): void {
  try {
    element.setPointerCapture(pointerId);
  } catch (error) {
    if (!(error instanceof DOMException && error.name === "NotFoundError")) throw error;
  }
}
