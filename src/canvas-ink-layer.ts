import { Notice, setIcon, type App } from "obsidian";

import { createCanvasControls, syncCanvasControls } from "./canvas-controls";
import type { CanvasTarget } from "./canvas-target";
import { resolveColor, type ColorTool } from "./colors";
import { createQuickColors } from "./quick-colors";
import { createColorPicker } from "./color-picker";
import type { DebugLogger } from "./debug-logger";
import { strokeToSvgPath } from "./geometry";
import { eraseInk, eraserOutline, transformInk } from "./ink-operations";
import { createEraserMenu } from "./eraser-menu";
import { createSelectionMenu } from "./selection-menu";
import { InkToolState } from "./ink-tool-state";
import { DocumentHistory } from "./document-history";
import { CanvasInkSurface, type SurfaceTransform } from "./ink-surface";
import {
  createHandwritingHint,
  isHandwritingRegionTarget,
  resolveHandwritingRegion,
} from "./handwriting-affordance";
import { PenActivationGuard } from "./pen-activation";
import { positionPopup } from "./popover";
import { createPenMenu } from "./pen-menu";
import { createHighlighterMenu } from "./highlighter-menu";
import { PEN_PROFILES } from "./pen-types";
import { boundsForStrokes, pointInBounds, selectRenderedStroke } from "./selection";
import {
  isEraserTip,
  isStylusBarrelButton,
  isStylusContact,
  isStylusEvent,
  pointerSamples,
  pointerToInkPoint,
  shouldAppendReleasePoint,
  stylusPointerDownAction,
} from "./pointer-input";
import { FavoritePens, type PenPreset } from "./favorite-pens";
import { createRadialPages } from "./radial-pages";
import { RadialMenu } from "./radial-menu";
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
const SELECTION_SCREEN_PADDING = 8;
const PALETTE_CLOSE_ANIMATION_MS = 180;

export class CanvasInkLayer {
  private readonly toolState = new InkToolState();
  private readonly history = new DocumentHistory<InkStroke>(cloneStrokes, 100);
  private readonly surface: CanvasInkSurface;
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
  private penMenuEl: HTMLElement | null = null;
  private penMenuDispose: (() => void) | null = null;
  private menuAnchor: HTMLElement | null = null;
  private colorPickerEl: HTMLElement | null = null;
  private readonly selectedStrokeIds = new Set<string>();
  private lassoPoints: InkPoint[] = [];
  private lassoMode: "select" | "move" | null = null;
  private moveOrigin: InkPoint | null = null;
  private moveStartPoints = new Map<string, InkStroke>();
  private didMoveSelection = false;
  private temporaryTool: DrawingTool | null = null;
  private enabled = true;
  private didEraseInGesture = false;
  private stylusMenuArmed = false;
  private eraserTipArmed = false;
  private previousErasePoint: InkPoint | null = null;
  private gestureRedoStack: InkStroke[][] | null = null;
  private gestureHasUndoSnapshot = false;
  private saveTimer: number | null = null;
  private colorPaletteCloseTimer: number | null = null;
  private renderFrame: number | null = null;
  private domFrame: number | null = null;
  private disposed = false;
  private loaded = false;
  private readonly disposers: Array<() => void> = [];
  private readonly inputDisposers: Array<() => void> = [];
  private observer: MutationObserver | null = null;
  private gestureStartedAt = 0;
  private gestureTransform: SurfaceTransform | null = null;
  private gestureOriginTarget: Element | null = null;
  private readonly penActivationGuard = new PenActivationGuard();
  private erasedStrokeCount = 0;
  private radialMenu: RadialMenu | null = null;
  private allowNextContextMenu = false;
  private focusedHandwritingRegion: HTMLElement | null = null;
  private hoveredHandwritingRegion: HTMLElement | null = null;
  private indicatedHandwritingRegion: HTMLElement | null = null;
  private stylusIsHovering = false;

  constructor(
    app: App,
    readonly target: CanvasTarget,
    private readonly logger: DebugLogger,
    private readonly favorites = new FavoritePens(),
  ) { this.surface = new CanvasInkSurface(app, target); }

  async mount(): Promise<void> {
    this.data = await this.surface.load();
    this.loaded = true;
    this.toolState.penType = this.data.penSettings?.type ?? "fountain";
    this.toolState.penSize = this.data.penSettings?.size ?? 3.5;
    this.toolState.highlighterType = this.data.highlighterSettings?.type ?? "round";
    this.toolState.highlighterSize = this.data.highlighterSettings?.size ?? 17;
    this.toolState.highlighterOpacity = this.data.highlighterSettings?.opacity ?? 0.38;
    this.logger.record("canvas", "layer_mounted", { strokeCount: this.data.strokes.length });
    if (this.disposed) return;
    this.ensureDom();
    this.observeDom();
  }

  isFor(target: CanvasTarget): boolean {
    return this.target.file.path === target.file.path && this.target.view === target.view;
  }

  setTool(tool: DrawingTool): void {
    this.closePenMenu();
    this.toolState.activeTool = tool;
    if (tool !== "eraser") this.hideEraserCursor();
    if (tool !== "lasso") this.clearSelection();
    this.closeColorPalette();
    this.logger.record("canvas", "tool_selected", { tool });
    this.syncControls();
  }

  toggleEnabled(): void {
    this.closePenMenu();
    this.enabled = !this.enabled;
    if (!this.enabled) this.hideEraserCursor();
    if (!this.enabled) this.penActivationGuard.reset();
    this.logger.record("canvas", "stylus_input_toggled", { enabled: this.enabled });
    this.syncControls();
  }

  undo(): void {
    const previous = this.history.undo(this.data.strokes);
    if (!previous) return;
    this.data.strokes = previous;
    this.logger.record("canvas", "undo", { strokeCount: this.data.strokes.length });
    this.renderAll();
    this.scheduleSave();
    this.syncControls();
  }

  redo(): void {
    const next = this.history.redo(this.data.strokes);
    if (!next) return;
    this.data.strokes = next;
    this.logger.record("canvas", "redo", { strokeCount: this.data.strokes.length });
    this.renderAll();
    this.scheduleSave();
    this.syncControls();
  }

  dispose(): void {
    this.closePenMenu();
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
    this.setIndicatedHandwritingRegion(null);
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
    this.syncHandwritingFocus();
    this.mountControls();
  }

  private observeDom(): void {
    this.observer = new MutationObserver((mutations) => {
      const canvasStructureOrEditingStateChanged = mutations.some(
        (mutation) =>
          mutation.type === "childList" ||
          (mutation.target instanceof Element && mutation.target.classList.contains("canvas-node")),
      );
      if (!canvasStructureOrEditingStateChanged) return;
      if (this.domFrame !== null) return;
      this.domFrame = window.requestAnimationFrame(() => {
        this.domFrame = null;
        this.ensureDom();
      });
    });
    this.observer.observe(this.target.containerEl, {
      attributes: true,
      attributeFilter: ["class"],
      childList: true,
      subtree: true,
    });
  }

  private bindInput(wrapper: HTMLElement): void {
    if (this.wrapperEl === wrapper) return;
    for (const dispose of this.inputDisposers.splice(0)) dispose();
    this.wrapperEl = wrapper;
    const pointerRoot = wrapper.ownerDocument.defaultView ?? wrapper;
    this.listen(pointerRoot, "pointerdown", this.onPointerDown, true, this.inputDisposers);
    this.listen(pointerRoot, "pointermove", this.onPointerMove, true, this.inputDisposers);
    this.listen(pointerRoot, "pointerup", this.onPointerUp, true, this.inputDisposers);
    this.listen(pointerRoot, "pointercancel", this.onPointerUp, true, this.inputDisposers);
    this.listen(pointerRoot, "pointerleave", this.onPointerLeave, true, this.inputDisposers);
    this.listen(pointerRoot, "click", this.onActivation, true, this.inputDisposers);
    this.listen(pointerRoot, "dblclick", this.onActivation, true, this.inputDisposers);
    this.listen(wrapper, "contextmenu", this.onContextMenu, true, this.inputDisposers);
    this.listen(wrapper, "focusin", this.onFocusIn, true, this.inputDisposers);
    this.listen(wrapper, "focusout", this.onFocusOut, true, this.inputDisposers);
  }

  private readonly onPointerDown = (event: PointerEvent): void => {
    if (!this.isPointerEventForLayer(event)) return;
    this.updateHandwritingHover(event);
    this.updateEraserCursor(event);
    if (event.pointerType === "touch" && this.activePointerId !== null) {
      this.consume(event);
      return;
    }
    if (event.pointerType !== "pen") this.penActivationGuard.recordNonPenPointerDown();
    if (!isControlTarget(event.target)) {
      this.closeRadialMenu();
      // This capture handler consumes pen input before the document's later
      // outside-dismiss listener can see it. Dismiss here without stealing focus.
      this.closePenMenu();
    }
    const action = stylusPointerDownAction(event, {
      enabled: this.enabled,
      gestureActive: this.activePointerId !== null,
      controlTarget: isControlTarget(event.target),
    });
    if (action === "ignore") return;
    if (action === "consume") {
      this.consume(event);
      return;
    }
    if (action === "barrel-button") {
      this.stylusMenuArmed = true;
      this.consume(event);
      return;
    }
    if (action === "eraser-tip") {
      this.eraserTipArmed = true;
      this.consume(event);
      return;
    }
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
    this.gestureOriginTarget = asElement(event.target);
    this.temporaryTool = forcedTool ?? (isEraserTip(event) ? "eraser" : null);
    this.eraserTipArmed = false;
    const tool = this.temporaryTool ?? this.toolState.activeTool;
    this.gestureStartedAt = performance.now();
    this.erasedStrokeCount = 0;
    this.previousErasePoint = null;
    this.logger.record("ink", "gesture_started", {
      tool,
      pointerType: event.pointerType,
      button: event.button,
      buttons: event.buttons,
      pressure: Math.round(event.pressure * 1000) / 1000,
      temporaryTool: this.temporaryTool !== null,
    });
    this.gestureRedoStack = this.history.future;
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
      ...(tool === "pen" ? { penType: this.toolState.penType } : {}),
      ...(tool === "highlighter" ? { highlighterType: this.toolState.highlighterType } : {}),
      size: tool === "pen" ? this.toolState.penSize : this.toolState.highlighterSize,
      opacity: tool === "pen" ? (this.toolState.penOpacity ?? PEN_PROFILES[this.toolState.penType].opacity) : this.toolState.highlighterOpacity,
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
    if (!this.isPointerEventForLayer(event)) return;
    this.updateHandwritingHover(event);
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

    const tool = this.temporaryTool ?? this.toolState.activeTool;
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
    if (!this.isPointerEventForLayer(event)) return;
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
    const tool = this.temporaryTool ?? this.toolState.activeTool;
    if (tool === "lasso" && shouldAppendReleasePoint(event)) {
      this.updateLassoGesture(event);
    } else if (tool !== "eraser" && shouldAppendReleasePoint(event)) {
      this.appendReleasePoint(event);
    }
    if (this.wrapperEl?.hasPointerCapture(event.pointerId)) this.wrapperEl.releasePointerCapture(event.pointerId);
    if (event.type === "pointerup") {
      this.penActivationGuard.recordPenRelease(event.pointerId, this.gestureOriginTarget, performance.now());
    } else {
      this.penActivationGuard.recordPenCancellation();
    }
    this.finishGesture();
  };

  private readonly onPointerLeave = (event: PointerEvent): void => {
    if (isStylusEvent(event)) {
      this.stylusIsHovering = false;
      this.hoveredHandwritingRegion = null;
      this.syncHandwritingAffordance();
    }
    if (event.pointerId !== this.activePointerId) this.hideEraserCursor();
  };

  private readonly onFocusIn = (event: FocusEvent): void => {
    this.focusedHandwritingRegion = handwritingRegionFromTarget(event.target);
    this.syncHandwritingAffordance();
  };

  private readonly onFocusOut = (event: FocusEvent): void => {
    this.focusedHandwritingRegion = handwritingRegionFromTarget(event.relatedTarget);
    this.syncHandwritingAffordance();
  };

  private updateHandwritingHover(event: PointerEvent): void {
    if (!isStylusEvent(event)) return;
    this.stylusIsHovering = !isStylusContact(event);
    this.hoveredHandwritingRegion = this.stylusIsHovering ? handwritingRegionFromTarget(event.target) : null;
    this.syncHandwritingAffordance();
  }

  private syncHandwritingFocus(): void {
    this.focusedHandwritingRegion = handwritingRegionFromTarget(this.target.containerEl.ownerDocument.activeElement);
    this.syncHandwritingAffordance();
  }

  private syncHandwritingAffordance(): void {
    if (this.focusedHandwritingRegion && !this.focusedHandwritingRegion.isConnected) {
      this.focusedHandwritingRegion = null;
    }
    if (this.hoveredHandwritingRegion && !this.hoveredHandwritingRegion.isConnected) {
      this.hoveredHandwritingRegion = null;
    }
    this.setIndicatedHandwritingRegion(
      resolveHandwritingRegion(
        this.stylusIsHovering,
        this.hoveredHandwritingRegion,
        this.focusedHandwritingRegion,
      ),
    );
  }

  private setIndicatedHandwritingRegion(region: HTMLElement | null): void {
    if (this.indicatedHandwritingRegion === region) {
      this.ensureHandwritingHint(region);
      return;
    }
    this.indicatedHandwritingRegion?.classList.remove("canvas-scribe-handwriting-region");
    this.indicatedHandwritingRegion
      ?.querySelector(":scope > .canvas-scribe-handwriting-hint")
      ?.remove();
    this.indicatedHandwritingRegion = region;
    region?.classList.add("canvas-scribe-handwriting-region");
    this.ensureHandwritingHint(region);
  }

  private ensureHandwritingHint(region: HTMLElement | null): void {
    if (!region || region.querySelector(":scope > .canvas-scribe-handwriting-hint")) return;
    region.appendChild(createHandwritingHint(region.ownerDocument));
  }

  private isPointerEventForLayer(event: PointerEvent): boolean {
    if (event.pointerId === this.activePointerId) return true;
    const wrapper = this.wrapperEl;
    if (!wrapper) return false;
    if (typeof event.composedPath === "function" && event.composedPath().includes(wrapper)) return true;
    const target = asElement(event.target);
    return target !== null && wrapper.contains(target);
  }

  private readonly onActivation = (event: MouseEvent): void => {
    if (!this.enabled || isControlTarget(event.target) || !this.isEventForLayer(event)) return;
    const now = performance.now();
    const pointerType = "pointerType" in event && typeof event.pointerType === "string" ? event.pointerType : "";
    const pointerId = "pointerId" in event && typeof event.pointerId === "number" ? event.pointerId : null;
    const shouldSuppress = this.penActivationGuard.shouldSuppress(
      {
        detail: event.detail,
        kind: event.type === "dblclick" ? "dblclick" : "click",
        pointerId,
        pointerType,
        target: event.target,
        timestamp: now,
      },
      clickTargetsMatch,
    );
    if (!shouldSuppress) return;
    this.consume(event);
  };

  private isEventForLayer(event: Event): boolean {
    const wrapper = this.wrapperEl;
    if (!wrapper) return false;
    if (typeof event.composedPath === "function" && event.composedPath().includes(wrapper)) return true;
    const target = asElement(event.target);
    return target !== null && wrapper.contains(target);
  }

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
      const previous = this.history.past.pop();
      if (previous) this.data.strokes = previous;
    }
    if (this.gestureRedoStack) this.history.future = this.gestureRedoStack;
    this.gestureRedoStack = null;
    this.gestureHasUndoSnapshot = false;
    this.activeStroke = null;
    this.activePathEl = null;
    this.activePointerId = null;
    this.gestureTransform = null;
    this.gestureOriginTarget = null;
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
    this.hideEraserCursor();
  }

  private finishGesture(): void {
    if (this.renderFrame !== null) {
      window.cancelAnimationFrame(this.renderFrame);
      this.renderFrame = null;
    }
    const completedStroke = this.activeStroke;
    const completedTool = this.temporaryTool ?? this.toolState.activeTool;
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
      this.history.past.pop();
      if (this.gestureRedoStack) this.history.future = this.gestureRedoStack;
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
    this.gestureOriginTarget = null;
    this.temporaryTool = null;
    this.didEraseInGesture = false;
    this.gestureRedoStack = null;
    this.gestureHasUndoSnapshot = false;
    this.lassoMode = null;
    this.lassoPoints = [];
    this.moveOrigin = null;
    this.moveStartPoints.clear();
    this.didMoveSelection = false;
    this.hideEraserCursor();
    this.syncControls();
  }

  private eraseSamples(event: PointerEvent): void {
    for (const sample of pointerSamples(event)) {
      const point = this.eventToPoint(sample);
      if (!point) continue;
      const screenScale = this.getScreenScale();
      const radius = this.toolState.eraserSettings.radius / screenScale;
      const before = this.data.strokes.length;
      const previous = this.previousErasePoint ?? point;
      const distance = Math.hypot(point.x - previous.x, point.y - previous.y);
      const steps = Math.max(1, Math.ceil(distance / (radius * 0.3)));
      let changed = false;
      for (let step = 1; step <= steps; step++) {
        const x = previous.x + (point.x - previous.x) * step / steps;
        const y = previous.y + (point.y - previous.y) * step / steps;
        const result = eraseInk(this.data.strokes, eraserOutline(x, y, radius, 0.1 / screenScale), {
          ...this.toolState.eraserSettings, tolerance: 0.1 / screenScale,
        });
        changed ||= result.changed; this.data.strokes = result.strokes;
      }
      this.previousErasePoint = point;
      if (changed) {
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

  private readCanvasTransform(): SurfaceTransform | null {
    return this.surface.transform(this.svgEl);
  }

  private showRadialMenu(clientX: number, clientY: number, contextTarget: EventTarget | null): void {
    this.closeRadialMenu();
    this.closeColorPalette();
    this.closePenMenu();
    const document = this.target.containerEl.ownerDocument;
    const actions = createRadialPages({
      document, tool: this.toolState.activeTool, colors: this.toolState.toolColors, favorites: this.favorites,
      currentPreset: this.currentPenPreset(),
      penType: this.toolState.penType,
      highlighterType: this.toolState.highlighterType, eraserMode: this.toolState.eraserSettings.mode,
      selectPen: (type) => { this.setTool("pen"); this.toolState.penType = type; this.toolState.penOpacity = null; this.data.penSettings = { type, size: this.toolState.penSize }; this.scheduleSave(); this.syncControls(); },
      selectHighlighter: (type) => { this.setTool("highlighter"); this.toolState.highlighterType = type; this.data.highlighterSettings = { type, size: this.toolState.highlighterSize, opacity: this.toolState.highlighterOpacity }; this.scheduleSave(); this.syncControls(); },
      selectEraser: (mode) => { this.setTool("eraser"); this.toolState.eraserSettings.mode = mode; },
      getSize: () => this.toolState.activeTool === "pen" ? this.toolState.penSize : this.toolState.highlighterSize,
      setSize: (size) => {
        if (this.toolState.activeTool === "pen") { this.toolState.penSize = size; this.data.penSettings = { type: this.toolState.penType, size }; }
        else { this.toolState.highlighterSize = size; this.data.highlighterSettings = { type: this.toolState.highlighterType, size, opacity: this.toolState.highlighterOpacity }; }
        this.scheduleSave(); this.syncControls();
      },
      undo: () => this.undo(), redo: () => this.redo(), canUndo: () => this.history.past.length > 0, canRedo: () => this.history.future.length > 0,
      openSettings: () => this.togglePenMenu(),
      defaultColor: (tool) => resolveColor(document, this.getToolDefault(tool)),
      selectTool: (tool) => this.setTool(tool),
      applyFavorite: (preset) => this.applyFavorite(preset),
      colorsChanged: () => this.syncControls(),
      openCanvasMenu: () => this.openCanvasContextMenu(contextTarget, clientX, clientY),
    });
    this.logger.record("canvas", "radial_menu_opened", { activeTool: this.toolState.activeTool });
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

  private currentPenPreset(): PenPreset | null {
    const tool = this.toolState.activeTool;
    if (tool !== "pen" && tool !== "highlighter") return null;
    return { tool, penType: this.toolState.penType, color: this.toolState.toolColors.selection(tool),
      ...(tool === "highlighter" ? { highlighterType: this.toolState.highlighterType } : {}),
      size: tool === "pen" ? this.toolState.penSize : this.toolState.highlighterSize,
      opacity: tool === "pen" ? (this.toolState.penOpacity ?? PEN_PROFILES[this.toolState.penType].opacity) : this.toolState.highlighterOpacity };
  }

  private applyFavorite(preset: PenPreset): void {
    this.setTool(preset.tool);
    this.toolState.toolColors.confirm(preset.tool, preset.color);
    if (preset.tool === "pen") {
      this.toolState.penType = preset.penType; this.toolState.penSize = preset.size; this.toolState.penOpacity = preset.opacity;
      this.data.penSettings = { type: this.toolState.penType, size: this.toolState.penSize };
      this.scheduleSave();
    } else {
      this.toolState.highlighterType = preset.highlighterType ?? "round";
      this.toolState.highlighterSize = preset.size; this.toolState.highlighterOpacity = preset.opacity;
      this.data.highlighterSettings = { type: this.toolState.highlighterType, size: this.toolState.highlighterSize, opacity: this.toolState.highlighterOpacity };
      this.scheduleSave();
    }
    this.syncControls();
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
        cloneStrokes(this.selectedStrokes()).map((stroke) => [stroke.id, stroke]),
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
        if (this.toolState.selectionSettings.mode === "rectangle") this.lassoPoints = [this.lassoPoints[0]!, point];
        else this.lassoPoints.push(point);
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
    this.data.strokes = this.data.strokes.map((stroke) => {
      const original = this.moveStartPoints.get(stroke.id);
      return original ? transformInk(original, (x, y) => [x + deltaX, y + deltaY]) : stroke;
    });
    this.renderAll();
  }

  private finishLassoGesture(): void {
    if (this.lassoMode === "select") {
      this.selectedStrokeIds.clear();
      for (const stroke of this.data.strokes) {
        if (selectRenderedStroke(stroke, this.selectionPolygon(), this.toolState.selectionSettings.partial)) this.selectedStrokeIds.add(stroke.id);
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
      this.history.past.pop();
      if (this.gestureRedoStack) this.history.future = this.gestureRedoStack;
    }
  }

  private getToolColor(tool: ColorTool): string {
    return this.toolState.toolColors.current(tool, this.getToolDefault(tool));
  }

  private getToolDefault(tool: ColorTool): string {
    return tool === "pen" ? this.getDefaultPenColor() : "#fde047";
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
    this.history.checkpoint(this.data.strokes);
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
    if (!this.loaded) return;
    if (this.saveTimer !== null) {
      window.clearTimeout(this.saveTimer);
      this.saveTimer = null;
    }
    try {
      await this.surface.save(this.data);
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
    const group = createCanvasControls(this.target.containerEl.ownerDocument, setIcon, {
      setTool: (tool) => {
        if (this.toolState.activeTool === tool) this.togglePenMenu();
        else this.setTool(tool);
      },
      toggleColorPalette: () => this.toggleColorPalette(),
      undo: () => this.undo(),
      redo: () => this.redo(),
      toggleEnabled: () => this.toggleEnabled(),
    });
    canvasControls.prepend(group);
    this.controlsEl = group;
    this.syncControls();
  }

  private syncControls(): void {
    if (!this.controlsEl) return;
    const colorTool: ColorTool | null =
      this.toolState.activeTool === "pen" || this.toolState.activeTool === "highlighter" ? this.toolState.activeTool : null;
    syncCanvasControls(this.controlsEl, {
      activeTool: this.toolState.activeTool,
      activeColor: colorTool ? this.getToolColor(colorTool) : undefined,
      penType: this.toolState.penType,
      penColor: this.toolState.toolColors.current("pen", "var(--text-normal)"),
      highlighterColor: this.getToolColor("highlighter"),
      penSize: this.toolState.penSize,
      penOpacity: this.toolState.penOpacity ?? PEN_PROFILES[this.toolState.penType].opacity,
      highlighterSize: this.toolState.highlighterSize,
      highlighterType: this.toolState.highlighterType,
      highlighterOpacity: this.toolState.highlighterOpacity,
      paletteOpen: this.colorPaletteEl !== null || this.colorPickerEl !== null,
      enabled: this.enabled,
      canUndo: this.history.past.length > 0,
      canRedo: this.history.future.length > 0,
    });
  }

  private ensureEraserCursor(): void {
    if (!this.svgEl) return;
    if (!this.eraserCursorEl) {
      this.eraserCursorEl = this.target.containerEl.ownerDocument.createElementNS(SVG_NS, "circle");
      this.eraserCursorEl.classList.add("canvas-scribe-eraser-cursor");
      this.eraserCursorEl.setAttribute("vector-effect", "non-scaling-stroke");
    }
    this.eraserCursorEl.setAttribute("r", (this.toolState.eraserSettings.radius / this.getScreenScale()).toString());
    this.svgEl.appendChild(this.eraserCursorEl);
  }

  private updateEraserCursor(event: PointerEvent): void {
    if (!this.enabled || !isStylusEvent(event) || isControlTarget(event.target) || isEditableTarget(event.target)) {
      this.hideEraserCursor();
      return;
    }
    const tool = this.activePointerId === null ? this.toolState.activeTool : (this.temporaryTool ?? this.toolState.activeTool);
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
    const polygon = this.selectionPolygon();
    const commands = polygon.map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`);
    if (polygon.length > 2) commands.push("Z");
    this.lassoPathEl.setAttribute("d", commands.join(" "));
  }

  private selectionPolygon(): Pick<InkPoint, "x" | "y">[] {
    if (this.toolState.selectionSettings.mode !== "rectangle" || this.lassoPoints.length < 2) return this.lassoPoints;
    const first = this.lassoPoints[0]!, last = this.lassoPoints[this.lassoPoints.length - 1]!;
    return [{ x: first.x, y: first.y }, { x: last.x, y: first.y }, { x: last.x, y: last.y }, { x: first.x, y: last.y }];
  }

  private changeSelectedInk(update: (stroke: InkStroke) => InkStroke): void {
    if (!this.selectedStrokes().length) return;
    this.pushUndoSnapshot();
    this.data.strokes = this.data.strokes.map((stroke) => this.selectedStrokeIds.has(stroke.id) ? update(stroke) : stroke);
    this.renderAll(); this.scheduleSave(); this.syncControls();
  }

  private recolorSelection(): void {
    const first = this.selectedStrokes()[0]; if (!first) return;
    this.closePenMenu();
    const document = this.target.containerEl.ownerDocument;
    this.colorPickerEl = createColorPicker(document, {
      tool: first.tool, current: resolveColor(document, first.color), defaultColor: this.getToolDefault(first.tool), recent: this.toolState.toolColors.recent(first.tool),
      onConfirm: (color) => {
        this.changeSelectedInk((stroke) => ({ ...stroke, color: color ?? this.getToolDefault(stroke.tool) }));
        this.closeColorPalette(); this.controlsEl?.querySelector<HTMLElement>('[data-action="lasso"]')?.focus();
      },
      onCancel: () => { this.closeColorPalette(); this.controlsEl?.querySelector<HTMLElement>('[data-action="lasso"]')?.focus(); },
    });
    document.body.append(this.colorPickerEl); this.colorPickerEl.querySelector<HTMLElement>("button")?.focus();
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
    this.closePenMenu();
    if (this.colorPaletteEl || this.colorPickerEl) {
      this.closeColorPalette();
      this.syncControls();
      return;
    }
    if (!this.controlsEl || (this.toolState.activeTool !== "pen" && this.toolState.activeTool !== "highlighter")) return;
    const colorButton = this.controlsEl.querySelector<HTMLElement>("[data-action=color]");
    if (!colorButton) return;
    const tool = this.toolState.activeTool;
    const document = this.target.containerEl.ownerDocument;
    const palette = createQuickColors(document, {
      tool, current: this.getToolColor(tool), defaultColor: this.getToolDefault(tool),
      isDefault: this.toolState.toolColors.selection(tool) === null, recent: this.toolState.toolColors.recent(tool),
      onSelect: (color) => {
        this.toolState.toolColors.confirm(tool, color); this.closeColorPalette(); this.syncControls(); colorButton.focus();
      },
      onClose: () => { this.closeColorPalette(); this.syncControls(); colorButton.focus(); },
      onMore: () => {
      this.closeColorPalette();
      this.colorPickerEl = createColorPicker(document, {
        tool,
        current: resolveColor(document, this.getToolColor(tool)),
        defaultColor: resolveColor(document, this.getToolDefault(tool)),
        recent: this.toolState.toolColors.recent(tool),
        onConfirm: (color) => {
          this.toolState.toolColors.confirm(tool, color);
          this.closeColorPalette();
          this.syncControls();
          colorButton.focus();
        },
        onCancel: () => { this.closeColorPalette(); this.syncControls(); colorButton.focus(); },
      });
      document.body.append(this.colorPickerEl);
      this.colorPickerEl.querySelector<HTMLElement>("button")?.focus();
      this.syncControls();
      },
    });
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

  private togglePenMenu(): void {
    if (this.penMenuEl) { this.closePenMenu(true); return; }
    const anchor = this.controlsEl?.querySelector<HTMLElement>(`[data-action="${this.toolState.activeTool}"]`);
    if (!anchor) return;
    this.closeColorPalette();
    const document = anchor.ownerDocument;
    const remember = () => {
      this.data.penSettings = { type: this.toolState.penType, size: this.toolState.penSize };
      this.syncControls();
      this.scheduleSave();
    };
    const rememberHighlighter = () => {
      this.data.highlighterSettings = { type: this.toolState.highlighterType, size: this.toolState.highlighterSize, opacity: this.toolState.highlighterOpacity };
      this.syncControls(); this.scheduleSave();
    };
    const menu = this.toolState.activeTool === "lasso" ? createSelectionMenu(document, { renderIcon: setIcon,
      settings: this.toolState.selectionSettings, count: this.selectedStrokes().length,
      onChange: (settings) => { this.toolState.selectionSettings = settings; }, onRecolor: () => this.recolorSelection(),
      onScale: (scale) => {
        const bounds = boundsForStrokes(this.selectedStrokes()); if (!bounds || scale === 1) return;
        const cx = (bounds.minX + bounds.maxX) / 2, cy = (bounds.minY + bounds.maxY) / 2;
        this.changeSelectedInk((stroke) => transformInk(stroke, (x, y) => [cx + (x - cx) * scale, cy + (y - cy) * scale], scale));
      }, onClose: () => this.closePenMenu(true),
    }) : this.toolState.activeTool === "eraser" ? createEraserMenu(document, { renderIcon: setIcon,
      settings: this.toolState.eraserSettings, onChange: (settings) => { this.toolState.eraserSettings = settings; this.hideEraserCursor(); },
      canClear: this.data.strokes.length > 0,
      onClear: () => { this.pushUndoSnapshot(); this.data.strokes = []; this.clearSelection(); this.renderAll(); this.scheduleSave(); this.syncControls(); },
      onClose: () => this.closePenMenu(true),
    }) : this.toolState.activeTool === "highlighter" ? createHighlighterMenu(document, {
      onColor: color => { this.toolState.toolColors.confirm("highlighter", color); rememberHighlighter(); },
      renderIcon: setIcon, type: this.toolState.highlighterType, size: this.toolState.highlighterSize,
      opacity: this.toolState.highlighterOpacity, color: this.getToolColor("highlighter"),
      onType: (value) => { this.toolState.highlighterType = value; rememberHighlighter(); },
      onSize: (value) => { this.toolState.highlighterSize = value; rememberHighlighter(); },
      onOpacity: (value) => { this.toolState.highlighterOpacity = value; rememberHighlighter(); },
      onColors: () => this.toggleColorPalette(), onClose: () => this.closePenMenu(true),
    }) : createPenMenu(document, {
      onColor: color => { this.toolState.toolColors.confirm("pen", color); remember(); }, onColors: () => this.toggleColorPalette(),
      renderIcon: setIcon,
      type: this.toolState.penType, size: this.toolState.penSize, color: this.getToolColor("pen"),
      onType: (type) => { this.toolState.penType = type; this.toolState.penOpacity = null; remember(); },
      onSize: (size) => { this.toolState.penSize = size; remember(); },
      onClose: () => this.closePenMenu(true),
    });
    document.body.append(menu);
    this.penMenuEl = menu;
    this.menuAnchor = anchor;
    anchor.setAttribute("aria-expanded", "true");
    anchor.setAttribute("aria-haspopup", "dialog");
    const position = () => {
      const viewport = document.defaultView;
      const point = positionPopup(anchor.getBoundingClientRect(), menu.getBoundingClientRect(),
        viewport?.innerWidth ?? document.documentElement.clientWidth,
        viewport?.innerHeight ?? document.documentElement.clientHeight);
      menu.style.left = `${point.left}px`; menu.style.top = `${point.top}px`;
    };
    const dismiss = (event: Event) => {
      if (!menu.contains(event.target as Node) && !anchor.contains(event.target as Node)) this.closePenMenu();
    };
    document.addEventListener("pointerdown", dismiss, true);
    document.defaultView?.addEventListener("resize", position);
    this.penMenuDispose = () => {
      document.removeEventListener("pointerdown", dismiss, true);
      document.defaultView?.removeEventListener("resize", position);
    };
    position();
    menu.querySelector<HTMLElement>('[aria-pressed="true"]')?.focus();
    this.syncControls();
  }

  private closePenMenu(focus = false): void {
    this.penMenuDispose?.();
    this.penMenuDispose = null;
    this.penMenuEl?.remove();
    this.penMenuEl = null;
    const anchor = this.menuAnchor;
    this.menuAnchor = null;
    anchor?.setAttribute("aria-expanded", "false");
    if (focus) anchor?.focus();
  }

  private closeColorPalette(animate = false): void {
    this.colorPickerEl?.remove();
    this.colorPickerEl = null;
    if (this.colorPaletteCloseTimer !== null) {
      window.clearTimeout(this.colorPaletteCloseTimer);
      this.colorPaletteCloseTimer = null;
    }
    const palette = this.colorPaletteEl;
    if (!palette) return;
    const prefersReducedMotion =
      palette.ownerDocument.defaultView?.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    if (!animate || prefersReducedMotion) {
      palette.remove();
      this.colorPaletteEl = null;
      return;
    }
    palette.classList.add("is-closing");
    this.colorPaletteCloseTimer = window.setTimeout(() => {
      this.colorPaletteCloseTimer = null;
      palette.remove();
      if (this.colorPaletteEl === palette) this.colorPaletteEl = null;
      this.syncControls();
    }, PALETTE_CLOSE_ANIMATION_MS);
  }

  private listen<K extends keyof HTMLElementEventMap>(
    element: EventTarget,
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
  return Boolean(asElement(target)?.closest(".canvas-controls, .canvas-menu, .canvas-card-menu, .canvas-scribe-radial-menu, .canvas-scribe-picker-backdrop, .canvas-scribe-pen-menu, .canvas-scribe-tool-menu, .canvas-scribe-color-palette"));
}

function isEditableTarget(target: EventTarget | null): boolean {
  return Boolean(asElement(target)?.closest('input, textarea, [contenteditable]:not([contenteditable="false"]), .cm-content'));
}

function clickTargetsMatch(origin: EventTarget | null, target: EventTarget | null): boolean {
  const originElement = asElement(origin);
  const targetElement = asElement(target);
  if (!originElement || !targetElement) return false;
  const originCard = originElement.closest(".canvas-node");
  const targetCard = targetElement.closest(".canvas-node");
  if (originCard && targetCard) return originCard === targetCard;
  if (originCard && targetElement.contains(originCard)) return true;
  if (targetCard && originElement.contains(targetCard)) return true;
  return originElement === targetElement || originElement.contains(targetElement) || targetElement.contains(originElement);
}

export function asElement(target: EventTarget | null): Element | null {
  if (!target || typeof target !== "object" || !("ownerDocument" in target)) return null;
  const ownerDocument = (target as Node).ownerDocument;
  const ElementConstructor = ownerDocument?.defaultView?.Element;
  return ElementConstructor && target instanceof ElementConstructor ? (target as Element) : null;
}

function handwritingRegionFromTarget(target: EventTarget | null): HTMLElement | null {
  const targetElement = asElement(target);
  if (!targetElement) return null;
  const region = targetElement.closest<HTMLElement>(".canvas-node");
  if (!region) return null;
  const targetIsEmbeddedEditor = Boolean(targetElement.closest("iframe, .markdown-embed"));
  return isHandwritingRegionTarget(
    isEditableTarget(targetElement),
    region.classList.contains("is-editing"),
    targetIsEmbeddedEditor,
  )
    ? region
    : null;
}

function trySetPointerCapture(element: Element, pointerId: number): void {
  try {
    element.setPointerCapture(pointerId);
  } catch (error) {
    if (!(error instanceof DOMException && error.name === "NotFoundError")) throw error;
  }
}
