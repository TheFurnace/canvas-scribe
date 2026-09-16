import { createToolColors, createToolMenu, createToolRadial, observeToolTheme } from "./tool-suite";
import { scaleHandwrittenSelection, selectHandwrittenObject, handwrittenCandidateBounds } from "./handwritten-selection";
import { createCanvasControls, syncCanvasControls, type IconRenderer } from "./canvas-controls";
import { DocumentHistory } from "./document-history";
import { eraseInk, eraserOutline } from "./ink-operations";
import { SpatialIndex, polygonBounds, replaceSpatialCandidates } from "./spatial-index";
import { strokeIntersectsCircle, strokeToSvgPath } from "./geometry";
import { createColorPicker } from "./color-picker";
import { resolveColor } from "./colors";
import { positionPopup } from "./popover";
import { FavoritePens } from "./favorite-pens";
import { RadialSession } from "./radial-session";
import { isStylusBarrelButton } from "./pointer-input";
import type { DrawingTool, InkTool } from "./types";
import { InkToolState } from "./ink-tool-state";
import { pointInBounds } from "./selection";
import { PEN_PROFILES } from "./pen-types";
import {
  NOTE_SPARE_HEIGHT, boundsForObjects, cloneHandwrittenObjects, snapshotHandwrittenObjects, createHandwrittenObjectId,
  measureTextHeight, normalizeContentHeight, objectBounds, translateHandwrittenObject,
  type HandwrittenInkObject, type HandwrittenNoteDocument, type HandwrittenObject, type HandwrittenTextObject,
} from "./handwritten-note";
import { renderHandwrittenInk, renderHandwrittenNotePage } from "./handwritten-note-renderer";

type EditorTool = "pen" | "highlighter" | "eraser" | "lasso" | "text";

export class HandwrittenNoteEditor {
  readonly root: HTMLElement;
  private readonly history = new DocumentHistory<HandwrittenObject>(objects => snapshotHandwrittenObjects(objects, this.activeInk), 100);
  private gestureTools: InkToolState | null = null;
  private unsubscribeTools: () => void = () => undefined;
  private unsubscribeTheme: () => void;
  private get tools(): InkToolState { return this.gestureTools ?? this.sharedTools; }
  private readonly selectedIds = new Set<string>();
  private controls: HTMLElement;
  private textStyleControls: HTMLElement;
  private viewport: HTMLElement;
  private paperHost: HTMLElement;
  private note: HandwrittenNoteDocument;
  private readonly spatial = new SpatialIndex<HandwrittenObject>(handwrittenCandidateBounds);
  private tool: EditorTool = "pen";
  private enabled = true;
  private activePointer: number | null = null;
  private pan: { id: number; x: number; y: number } | null = null;
  private activeInk: HandwrittenInkObject | null = null;
  private activeInkPath: SVGPathElement | null = null;
  private inkFrame: number | null = null;
  private handleDrag: ((event: PointerEvent) => void) | null = null;
  private gesturePoints: { x: number; y: number }[] = [];
  private moveOrigin: { x: number; y: number } | null = null;
  private moveSnapshot = new Map<string, HandwrittenObject>();
  private onChange: (note: HandwrittenNoteDocument) => void;
  private readonly allowMouse: boolean;
  private readonly resizeObserver: ResizeObserver;
  private layoutFrame = 0;
  private readonly wiredTextAreas = new WeakSet<HTMLTextAreaElement>();
  private menu: HTMLElement | null = null;
  private menuDispose: (() => void) | null = null;
  private radial: RadialSession | null = null;
  private barrelPointer: number | null = null;
  private contextSuppressedUntil = 0;
  private eraserCursor: SVGSVGElement | null = null;
  private eraserPosition: { x: number; y: number } | null = null;

  constructor(document: Document, note: HandwrittenNoteDocument, onChange: (note: HandwrittenNoteDocument) => void, private readonly renderIcon: IconRenderer, allowMouse = false, private readonly favorites = new FavoritePens(), private readonly overlayMount: HTMLElement = document.body, private readonly sharedTools = new InkToolState()) {
    this.note = note; this.onChange = onChange; this.allowMouse = allowMouse;
    this.root = document.createElement("section");
    this.root.className = "canvas-scribe-note-editor";
    this.root.tabIndex = 0;
    const toolbar = document.createElement("div"); toolbar.className = "canvas-scribe-note-toolbar";
    this.controls = createCanvasControls(document, renderIcon, {
      setTool: (tool) => { if (this.tool === tool) this.toggleToolMenu(); else this.setTool(tool); },
      toggleColorPalette: () => this.openColors(),
      undo: () => this.undo(), redo: () => this.redo(),
      toggleEnabled: () => { this.closeOverlays(); this.enabled = !this.enabled; this.syncControls(); },
    });
    const textButton = document.createElement("button");
    textButton.type = "button"; textButton.className = "canvas-scribe-ui-button canvas-scribe-note-text-tool";
    textButton.textContent = "T"; textButton.title = "Add text box"; textButton.setAttribute("aria-label", "Add text box");
    textButton.addEventListener("click", () => { this.closeOverlays(); this.tool = "text"; this.render(); });
    this.textStyleControls = this.createTextStyleControls(document);
    toolbar.append(this.controls, textButton, this.textStyleControls, this.zoomControls(document));
    this.viewport = document.createElement("div"); this.viewport.className = "canvas-scribe-note-viewport"; this.viewport.tabIndex = 0;
    // Obsidian recognizes sidebar swipes through TouchEvents independently of
    // our PointerEvents. Use the same opt-out as native Canvas; fingers pan here.
    this.viewport.dataset.ignoreSwipe = "true";
    this.paperHost = document.createElement("div"); this.paperHost.className = "canvas-scribe-note-paper-host";
    this.viewport.append(this.paperHost); this.root.append(toolbar, this.viewport);
    this.viewport.addEventListener("pointerdown", (event) => this.pointerDown(event));
    this.viewport.addEventListener("pointermove", (event) => this.pointerMove(event));
    this.viewport.addEventListener("pointerup", (event) => this.pointerUp(event));
    this.viewport.addEventListener("pointercancel", (event) => this.pointerUp(event));
    this.viewport.addEventListener("lostpointercapture", (event) => this.pointerUp(event));
    this.viewport.addEventListener("pointerleave", () => this.hideEraserCursor());
    this.viewport.addEventListener("scroll", () => this.hideEraserCursor());
    this.viewport.addEventListener("contextmenu", (event) => {
      if ((event.target as Element).closest("textarea, button") || this.activePointer !== null) return;
      event.preventDefault(); event.stopPropagation();
      if (Date.now() > this.contextSuppressedUntil) this.openRadial(event.clientX, event.clientY);
    });
    this.viewport.addEventListener("scroll", () => { this.note.viewport.scrollTop = this.viewport.scrollTop / this.note.viewport.zoom; });
    this.root.addEventListener("keydown", (event) => this.keyDown(event));
    this.resizeObserver = new ResizeObserver(() => this.syncTextLayout());
    this.resizeObserver.observe(this.root);
    this.tool = this.sharedTools.activeTool;
    let lastTool = this.sharedTools.activeTool;
    this.unsubscribeTools = this.sharedTools.subscribe(() => {
      if (this.activePointer === null && this.sharedTools.activeTool !== lastTool) this.tool = this.sharedTools.activeTool;
      lastTool = this.sharedTools.activeTool; this.syncControls();
    });
    this.unsubscribeTheme = observeToolTheme(document, () => { this.closeOverlays(); this.syncControls(); });
    this.render();
    requestAnimationFrame(() => { this.viewport.scrollTop = this.note.viewport.scrollTop * this.note.viewport.zoom; });
  }

  setDocument(note: HandwrittenNoteDocument, clearHistory = true): void {
    this.closeOverlays();
    this.resetGesture();
    this.note = note; this.spatial.clear(); this.selectedIds.clear();
    if (clearHistory) { this.history.past = []; this.history.future = []; }
    this.render();
    requestAnimationFrame(() => { this.viewport.scrollTop = note.viewport.scrollTop * note.viewport.zoom; });
  }

  getDocument(): HandwrittenNoteDocument { return this.note; }
  hasActiveGesture(): boolean { return this.activePointer !== null; }
  focus(): void { this.root.focus(); }
  destroy(): void { this.resetGesture(); this.spatial.clear(); this.unsubscribeTheme(); this.unsubscribeTools(); this.closeOverlays(); this.resizeObserver.disconnect(); cancelAnimationFrame(this.layoutFrame); this.root.remove(); }

  setTool(tool: DrawingTool, keepRadial = false): void { if (!keepRadial) this.closeOverlays(); this.sharedTools.activeTool = tool; if (this.activePointer === null) this.tool = tool; this.syncControls(); }
  toggleEnabled(): void { this.closeOverlays(); this.enabled = !this.enabled; this.syncControls(); }
  private defaultColor(tool: InkTool): string { return tool === "highlighter" ? "#fde047" : resolveColor(this.root.ownerDocument, this.root.ownerDocument.defaultView!.getComputedStyle(this.root).color); }
  private closeOverlays(): void { this.closeMenu(); this.radial?.close(false); this.radial = null; }
  private closeMenu(focus = false): void {
    this.menuDispose?.(); this.menuDispose = null; this.menu?.remove(); this.menu = null;
    if (focus) this.controls.querySelector<HTMLElement>(`[data-action="${this.tool}"]`)?.focus();
  }
  private mountMenu(menu: HTMLElement): void {
    this.hideEraserCursor();
    this.closeOverlays(); this.menu = menu;
    const document = this.root.ownerDocument;
    const anchor = this.controls.querySelector<HTMLElement>(`[data-action="${this.tool}"]`) ?? this.controls;
    this.overlayMount.append(menu); anchor.setAttribute("aria-expanded", "true"); anchor.setAttribute("aria-haspopup", "dialog");
    const position = () => {
      if (menu.classList.contains("canvas-scribe-picker-backdrop")) return;
      const point = positionPopup(anchor.getBoundingClientRect(), menu.getBoundingClientRect(), document.defaultView!.innerWidth, document.defaultView!.innerHeight);
      menu.style.left = `${point.left}px`; menu.style.top = `${point.top}px`;
      if (this.overlayMount !== document.body) {
        const actual = menu.getBoundingClientRect();
        menu.style.left = `${point.left - (actual.left - point.left)}px`;
        menu.style.top = `${point.top - (actual.top - point.top)}px`;
      }
    };
    const dismiss = (event: Event) => { if (!menu.contains(event.target as Node) && !anchor.contains(event.target as Node)) this.closeMenu(); };
    document.addEventListener("pointerdown", dismiss, true); document.defaultView?.addEventListener("resize", position);
    this.menuDispose = () => {
      document.removeEventListener("pointerdown", dismiss, true); document.defaultView?.removeEventListener("resize", position);
      anchor.setAttribute("aria-expanded", "false");
    };
    position(); menu.querySelector<HTMLElement>('button[aria-pressed="true"], button, input')?.focus();
  }
  private openColors(recolor = false): void {
    if (!recolor) {
      const tool = this.sharedTools.activeTool;
      if (tool !== "pen" && tool !== "highlighter") return;
      this.mountMenu(createToolColors(this.root.ownerDocument, this.sharedTools, tool, { defaultColor: this.defaultColor(tool),
        mount: menu => this.mountMenu(menu), close: () => this.closeMenu(true), changed: () => this.syncControls() }));
      return;
    }
    const selected = this.selectedObjects(), first = selected[0];
    const tool = recolor ? first?.kind === "ink" ? first.tool : "pen" : this.sharedTools.activeTool;
    if (tool !== "pen" && tool !== "highlighter") return;
    const color = recolor ? first?.color ?? this.defaultColor(tool) : this.sharedTools.toolColors.selection(tool);
    this.mountMenu(createColorPicker(this.root.ownerDocument, {
      tool, current: resolveColor(this.root.ownerDocument, color === "var(--text-normal)" || !color ? this.defaultColor(tool) : color),
      isDefault: recolor ? color === "var(--text-normal)" : color === null,
      defaultColor: this.defaultColor(tool), recent: this.sharedTools.toolColors.recent(tool),
      onConfirm: value => {
        if (recolor && selected.length) {
          this.history.checkpoint(this.note.objects);
          this.note.objects = this.note.objects.map(object => this.selectedIds.has(object.id)
            ? { ...object, color: value ?? (object.kind === "ink" && object.tool === "highlighter" ? "#fde047" : "var(--text-normal)") } : object);
          this.changed(true);
        } else this.sharedTools.toolColors.confirm(tool, value);
        this.closeMenu(true); this.syncControls();
      }, onCancel: () => this.closeMenu(true),
    }));
  }
  private toggleToolMenu(): void {
    if (this.menu) { this.closeMenu(true); return; }
    this.mountMenu(createToolMenu(this.root.ownerDocument, this.renderIcon, this.sharedTools, {
      color: tool => this.sharedTools.toolColors.current(tool, this.defaultColor(tool)), colors: () => this.openColors(),
      close: () => this.closeMenu(true), changed: () => this.syncControls(), count: this.selectedObjects().length,
      canClear: this.note.objects.some(object => object.kind === "ink"), clearLabel: "Erase all ink in this note…",
      clearMessage: "Erase all ink in this note? Text boxes will remain. You can undo this action.",
      clear: () => { this.history.checkpoint(this.note.objects); this.note.objects = this.note.objects.filter(object => object.kind === "text"); this.selectedIds.clear(); this.closeMenu(); this.changed(true); },
      recolor: () => this.openColors(true), scale: factor => {
        const next = scaleHandwrittenSelection(this.note.objects, this.selectedIds, factor); if (!next) return;
        this.history.checkpoint(this.note.objects); this.note.objects = next; this.changed(true);
      },
    }));
  }
  private openRadial(x: number, y: number): void {
    this.hideEraserCursor();
    this.closeOverlays();
    const actions = createToolRadial(this.root.ownerDocument, this.sharedTools, this.favorites, {
      selectTool: tool => this.setTool(tool, true), changed: () => this.syncControls(), defaultColor: tool => this.defaultColor(tool),
      undo: () => this.undo(), redo: () => this.redo(), canUndo: () => this.history.past.length > 0, canRedo: () => this.history.future.length > 0,
    });
    this.radial = new RadialSession(this.root.ownerDocument, actions, () => { this.radial = null; }, this.renderIcon, this.overlayMount);
    this.radial.open(x, y);
  }

  private render(): void {
    this.spatial.sync(this.note.objects, this.activeInk);
    const page = renderHandwrittenNotePage(this.root.ownerDocument, { ...this.note, contentHeight: this.note.contentHeight + NOTE_SPARE_HEIGHT }, { interactive: true, selectedIds: this.selectedIds, page: this.paperHost.firstElementChild as HTMLElement | undefined });
    page.style.width = `${this.note.logicalWidth}px`;
    page.style.height = `${this.note.contentHeight + NOTE_SPARE_HEIGHT}px`;
    page.style.zoom = String(this.note.viewport.zoom);
    for (const textarea of Array.from(page.querySelectorAll<HTMLTextAreaElement>("textarea.canvas-scribe-note-text"))) this.wireTextArea(textarea);
    if (page.parentElement !== this.paperHost) this.paperHost.replaceChildren(page);
    this.activeInkPath = this.activeInk ? page.querySelector<SVGPathElement>(`path[data-object-id="${this.activeInk.id}"]`) : null;
    this.syncTextLayout();
    cancelAnimationFrame(this.layoutFrame);
    this.layoutFrame = requestAnimationFrame(() => this.syncTextLayout());
    this.syncControls();
  }

  private syncTextLayout(): void {
    // Ink frames only update the live path. Reflow text and document bounds at lift.
    if (this.activeInk) return;
    const page = this.paperHost.querySelector<HTMLElement>(".canvas-scribe-note-page"); if (!page) return;
    for (const textarea of Array.from(page.querySelectorAll<HTMLTextAreaElement>("textarea.canvas-scribe-note-text"))) {
      const object = this.textObject(textarea.dataset.objectId); if (!object) continue;
      textarea.style.height = "0px";
      // scrollHeight includes padding but excludes borders, and is in logical CSS pixels.
      const height = textarea.scrollHeight ? Math.max(48, textarea.scrollHeight + 2) : objectBounds(object).maxY - object.y;
      textarea.style.height = `${height}px`;
      measureTextHeight(object, height);
      this.spatial.refresh(object);
    }
    normalizeContentHeight(this.note);
    const height = this.note.contentHeight + NOTE_SPARE_HEIGHT;
    page.style.height = `${height}px`;
    page.querySelectorAll("svg.canvas-scribe-note-ink").forEach(svg => svg.setAttribute("viewBox", `0 0 ${this.note.logicalWidth} ${height}`));
    this.renderSelectionHandles(page);
  }

  private wireTextArea(textarea: HTMLTextAreaElement): void {
    if (this.wiredTextAreas.has(textarea)) return;
    this.wiredTextAreas.add(textarea);
    textarea.addEventListener("pointerdown", (event) => {
      event.stopPropagation();
      const id = textarea.dataset.objectId; if (!id) return;
      if (!this.selectedIds.has(id)) { this.selectedIds.clear(); this.selectedIds.add(id); this.renderSelectionHandles(textarea.parentElement!); this.syncControls(); }
    });
    textarea.addEventListener("focus", () => {
      if (textarea.dataset.editing !== "true") { this.history.checkpoint(this.note.objects); textarea.dataset.editing = "true"; }
      textarea.classList.add("is-editing"); this.syncControls();
    });
    textarea.addEventListener("input", () => {
      const object = this.textObject(textarea.dataset.objectId);
      if (textarea.dataset.editing !== "true") { this.history.checkpoint(this.note.objects); textarea.dataset.editing = "true"; }
      if (object) { object.text = textarea.value; this.syncTextLayout(); this.changed(false); }
    });
    textarea.addEventListener("blur", () => { textarea.classList.remove("is-editing"); delete textarea.dataset.editing; this.changed(); });
    textarea.addEventListener("keydown", (event) => { if (event.key === "Escape") { event.preventDefault(); textarea.blur(); this.root.focus(); } event.stopPropagation(); });
  }

  private pointerDown(event: PointerEvent): void {
    this.updateEraserCursor(event);
    if (event.pointerType === "pen" && isStylusBarrelButton(event) && this.activePointer === null && !(event.target as Element).closest("textarea, button")) {
      event.preventDefault(); event.stopPropagation(); this.barrelPointer = event.pointerId;
      this.viewport.setPointerCapture?.(event.pointerId);
      this.contextSuppressedUntil = Date.now() + 800;
      this.openRadial(event.clientX, event.clientY); return;
    }
    // Disable browser direct manipulation before contact; route fingers separately
    // so pen contact cannot both scroll the viewport and produce ink.
    if (event.pointerType === "touch") {
      if ((event.target as Element).closest("textarea, button")) return;
      event.preventDefault(); event.stopPropagation();
      if (this.activePointer === null && this.pan === null) {
        this.pan = { id: event.pointerId, x: event.clientX, y: event.clientY };
        this.viewport.setPointerCapture?.(event.pointerId);
      }
      return;
    }
    if (!this.enabled || (event.pointerType !== "pen" && !(this.allowMouse && event.pointerType === "mouse" && event.button === 0)) || this.activePointer !== null || (event.target as Element).closest(".canvas-scribe-note-toolbar, textarea, button")) return;
    this.closeOverlays();
    const point = this.point(event); if (!point) return;
    event.preventDefault(); event.stopPropagation(); this.pan = null; this.gestureTools = this.sharedTools.snapshot(); this.activePointer = event.pointerId; this.viewport.setPointerCapture?.(event.pointerId);
    if (this.tool === "text") { this.addText(point.x, point.y); this.activePointer = null; this.gestureTools = null; this.releasePointer(event.pointerId); return; }
    if (this.tool === "eraser") { this.eraseAt(point.x, point.y); return; }
    if (this.tool === "lasso") {
      const bounds = boundsForObjects(this.selectedObjects());
      if (bounds && pointInBounds(point, bounds, 12 / this.note.viewport.zoom)) {
        this.history.checkpoint(this.note.objects); this.moveOrigin = point;
        this.moveSnapshot = new Map(this.selectedObjects().map((object) => [object.id, cloneHandwrittenObjects([object])[0]!]));
      } else { this.selectedIds.clear(); this.gesturePoints = [point]; }
      return;
    }
    this.history.checkpoint(this.note.objects);
    this.activeInk = {
      kind: "ink", id: createHandwrittenObjectId("ink"), tool: this.tool,
      color: this.tools.toolColors.current(this.tool, this.tool === "pen" ? "var(--text-normal)" : "#fde047"),
      size: this.tool === "pen" ? this.tools.penSize : this.tools.highlighterSize,
      opacity: this.tool === "pen" ? (this.tools.penOpacity ?? PEN_PROFILES[this.tools.penType].opacity) : this.tools.highlighterOpacity,
      ...(this.tool === "pen" ? { penType: this.tools.penType } : { highlighterType: this.tools.highlighterType }),
      points: [this.inkPoint(event, point)], hasPressure: event.pressure > 0, createdAt: Date.now(),
    };
    this.note.objects.push(this.activeInk);
    const page = this.paperHost.querySelector<HTMLElement>(".canvas-scribe-note-page")!;
    const svg = renderHandwrittenInk(this.root.ownerDocument, this.activeInk, this.note.logicalWidth, this.note.contentHeight + NOTE_SPARE_HEIGHT, this.note.objects.length - 1, false, false);
    this.activeInkPath = svg.querySelector("path"); page.append(svg);
    this.syncControls();
  }

  private pointerMove(event: PointerEvent): void {
    this.updateEraserCursor(event);
    if (event.pointerId === this.barrelPointer) { event.preventDefault(); event.stopPropagation(); return; }
    if (event.pointerId === this.pan?.id) {
      event.preventDefault(); event.stopPropagation();
      this.viewport.scrollLeft += this.pan.x - event.clientX;
      this.viewport.scrollTop += this.pan.y - event.clientY;
      this.pan = { id: event.pointerId, x: event.clientX, y: event.clientY };
      return;
    }
    if (event.pointerId !== this.activePointer) return;
    event.preventDefault(); event.stopPropagation();
    if (this.handleDrag) { this.handleDrag(event); return; }
    if (this.activeInk) {
      const coalesced = event.getCoalescedEvents?.() ?? [];
      const samples = coalesced.length ? coalesced : [event];
      const rect = this.paperHost.querySelector<HTMLElement>(".canvas-scribe-note-page")!.getBoundingClientRect();
      const zoom = this.note.viewport.zoom;
      for (const sample of samples) this.activeInk.points.push(this.inkPoint(sample, { x: (sample.clientX - rect.left) / zoom, y: (sample.clientY - rect.top) / zoom }));
      this.scheduleInkRender(); return;
    }
    const point = this.point(event); if (!point) return;
    if (this.tool === "eraser") { this.eraseAt(point.x, point.y); return; }
    if (this.tool === "lasso" && this.moveOrigin) {
      const dx = point.x - this.moveOrigin.x, dy = point.y - this.moveOrigin.y;
      this.note.objects = this.note.objects.map((object) => {
        const original = this.moveSnapshot.get(object.id); return original ? translateHandwrittenObject(original, dx, dy) : object;
      }); this.render(); return;
    }
    if (this.tool === "lasso") {
      if (this.tools.selectionSettings.mode === "rectangle") {
        const start = this.gesturePoints[0]!;
        this.gesturePoints = [start, { x: point.x, y: start.y }, point, { x: start.x, y: point.y }];
      } else this.gesturePoints.push(point);
      this.renderLasso();
    }
  }

  private releasePointer(id: number): void {
    if (this.viewport.hasPointerCapture?.(id)) this.viewport.releasePointerCapture(id);
  }

  private scheduleInkRender(): void {
    if (this.inkFrame !== null) return;
    this.inkFrame = requestAnimationFrame(() => { this.inkFrame = null; this.renderActiveInk(false); });
  }

  private renderActiveInk(complete: boolean): void {
    if (this.activeInk && this.activeInkPath) this.activeInkPath.setAttribute("d", strokeToSvgPath(this.activeInk, complete));
  }

  private resetGesture(): void {
    this.spatial.sync(this.note.objects, this.activeInk);
    this.paperHost.querySelectorAll<HTMLTextAreaElement>("textarea").forEach(textarea => { delete textarea.dataset.editing; });
    this.hideEraserCursor();
    if (this.inkFrame !== null) cancelAnimationFrame(this.inkFrame);
    this.inkFrame = null; this.activeInk = null; this.activeInkPath = null;
    const pointer = this.activePointer;
    this.activePointer = null; this.gestureTools = null; this.handleDrag = null;
    this.moveOrigin = null; this.moveSnapshot.clear(); this.gesturePoints = []; this.pan = null;
    if (pointer !== null) this.releasePointer(pointer);
  }

  private pointerUp(event: PointerEvent): void {
    this.hideEraserCursor();
    if (event.pointerId === this.barrelPointer) { event.preventDefault(); event.stopPropagation(); this.barrelPointer = null; this.releasePointer(event.pointerId); this.contextSuppressedUntil = Date.now() + 800; return; }
    if (event.pointerId === this.pan?.id) {
      event.preventDefault(); event.stopPropagation(); this.pan = null;
      this.releasePointer(event.pointerId); return;
    }
    if (event.pointerId !== this.activePointer) return;
    event.preventDefault(); event.stopPropagation();
    if (this.handleDrag) { this.handleDrag = null; normalizeContentHeight(this.note); this.changed(); }
    else if (this.activeInk) {
      if (this.inkFrame !== null) cancelAnimationFrame(this.inkFrame);
      this.inkFrame = null; this.renderActiveInk(true);
      this.spatial.sync(this.note.objects, this.activeInk);
      this.activeInk = null; this.activeInkPath = null; this.syncTextLayout(); this.changed();
    }
    else if (this.tool === "lasso" && this.moveOrigin) { this.moveOrigin = null; this.moveSnapshot.clear(); normalizeContentHeight(this.note); this.changed(); }
    else if (this.tool === "lasso" && this.gesturePoints.length > 2) { this.selectGesture(); this.render(); }
    this.gesturePoints = []; this.activePointer = null; this.gestureTools = null; if (this.tool !== "text") this.tool = this.sharedTools.activeTool; this.releasePointer(event.pointerId); this.syncControls();
  }

  private selectGesture(): void {
    this.spatial.sync(this.note.objects);
    const bounds = polygonBounds(this.gesturePoints);
    for (const object of bounds ? this.spatial.search(bounds) : []) {
      if (selectHandwrittenObject(object, this.gesturePoints, this.tools.selectionSettings.partial)) this.selectedIds.add(object.id);
    }
  }

  private hideEraserCursor(): void {
    this.eraserPosition = null;
    this.eraserCursor?.remove();
  }

  private updateEraserCursor(event: PointerEvent): void {
    if (!this.enabled || this.tool !== "eraser" || this.radial || this.menu ||
      (event.pointerType !== "pen" && !(this.allowMouse && event.pointerType === "mouse")) ||
      isStylusBarrelButton(event) || (event.target as Element).closest("textarea, button") ||
      (this.activePointer !== null && event.pointerId !== this.activePointer)) {
      this.hideEraserCursor(); return;
    }
    this.eraserPosition = this.point(event);
    this.renderEraserCursor();
  }

  private renderEraserCursor(): void {
    if (!this.enabled || this.tool !== "eraser") { this.hideEraserCursor(); return; }
    const position = this.eraserPosition;
    const page = this.paperHost.querySelector<HTMLElement>(".canvas-scribe-note-page");
    if (!position || !page) return;
    if (!this.eraserCursor) {
      const ns = "http://www.w3.org/2000/svg";
      this.eraserCursor = this.root.ownerDocument.createElementNS(ns, "svg");
      this.eraserCursor.classList.add("canvas-scribe-note-eraser-overlay");
      this.eraserCursor.setAttribute("aria-hidden", "true");
      const circle = this.root.ownerDocument.createElementNS(ns, "circle");
      circle.classList.add("canvas-scribe-eraser-cursor", "is-visible");
      circle.setAttribute("vector-effect", "non-scaling-stroke");
      this.eraserCursor.append(circle);
    }
    const circle = this.eraserCursor.firstElementChild!;
    circle.setAttribute("cx", String(position.x));
    circle.setAttribute("cy", String(position.y));
    circle.setAttribute("r", String(this.tools.eraserSettings.radius / this.note.viewport.zoom));
    page.append(this.eraserCursor);
  }

  private eraseAt(x: number, y: number): void {
    const before = this.note.objects;
    const region = eraserOutline(x, y, this.tools.eraserSettings.radius / this.note.viewport.zoom);
    const radius = this.tools.eraserSettings.radius / this.note.viewport.zoom;
    const result = replaceSpatialCandidates(before, this.spatial, { minX: x - radius, minY: y - radius, maxX: x + radius, maxY: y + radius }, (object): HandwrittenObject[] => {
      if (object.kind === "text") return [object];
      if (this.tools.eraserSettings.highlighterOnly && object.tool !== "highlighter") return [object];
      if (this.tools.eraserSettings.mode === "stroke") {
        const hit = strokeIntersectsCircle(object, x, y, this.tools.eraserSettings.radius / this.note.viewport.zoom);
        return hit ? [] : [object];
      }
      const result = eraseInk([object], region, this.tools.eraserSettings);
      return result.strokes.map((stroke) => stroke === object ? object : ({ ...stroke, kind: "ink" }));
    });
    if (!result.changed) return;
    if (this.gesturePoints.length === 0) this.history.checkpoint(before);
    this.gesturePoints.push({ x, y }); this.note.objects = result.values; this.render(); this.changed(false);
  }

  private addText(x: number, y: number): void {
    this.history.checkpoint(this.note.objects);
    const object: HandwrittenTextObject = { kind: "text", id: createHandwrittenObjectId("text"), x, y, width: 300, text: "", fontSize: 18, color: "var(--text-normal)", align: "left" };
    this.note.objects.push(object); this.selectedIds.clear(); this.selectedIds.add(object.id); normalizeContentHeight(this.note); this.render(); this.changed();
    requestAnimationFrame(() => this.paperHost.querySelector<HTMLTextAreaElement>(`[data-object-id="${object.id}"]`)?.focus());
  }

  private renderSelectionHandles(page: HTMLElement): void {
    page.querySelectorAll(".canvas-scribe-note-selection").forEach(box => box.remove());
    const selected = this.selectedObjects(); const bounds = boundsForObjects(selected); if (!bounds) return;
    const box = page.ownerDocument.createElement("div"); box.className = "canvas-scribe-note-selection";
    box.style.left = `${bounds.minX}px`; box.style.top = `${bounds.minY}px`; box.style.width = `${bounds.maxX - bounds.minX}px`; box.style.height = `${bounds.maxY - bounds.minY}px`;
    const move = page.ownerDocument.createElement("button"); move.type = "button"; move.className = "canvas-scribe-note-move"; move.textContent = "↕"; move.setAttribute("aria-label", "Move selected objects");
    this.wireMoveHandle(move); box.append(move);
    const remove = page.ownerDocument.createElement("button"); remove.type = "button"; remove.className = "canvas-scribe-note-delete"; remove.textContent = "×"; remove.setAttribute("aria-label", "Delete selected objects");
    remove.addEventListener("click", (event) => { event.preventDefault(); event.stopPropagation(); this.deleteSelection(); }); box.append(remove);
    if (selected.length === 1 && selected[0]?.kind === "text") {
      const handle = page.ownerDocument.createElement("button"); handle.type = "button"; handle.className = "canvas-scribe-note-resize"; handle.setAttribute("aria-label", "Resize text box width");
      this.wireResizeHandle(handle, selected[0]); box.append(handle);
    }
    page.append(box);
  }

  private startHandleDrag(event: PointerEvent, move: (event: PointerEvent) => void): void {
    event.preventDefault(); event.stopPropagation();
    if (this.activePointer !== null) return;
    this.history.checkpoint(this.note.objects);
    this.pan = null; this.gestureTools = this.sharedTools.snapshot(); this.activePointer = event.pointerId; this.handleDrag = move;
    // Handles are rebuilt during rendering; capture on the persistent viewport.
    this.viewport.setPointerCapture?.(event.pointerId);
  }

  private wireMoveHandle(handle: HTMLButtonElement): void {
    handle.addEventListener("pointerdown", (event) => {
      const startX = event.clientX, startY = event.clientY;
      const originals = new Map(this.selectedObjects().map((object) => [object.id, cloneHandwrittenObjects([object])[0]!]));
      this.startHandleDrag(event, (next) => {
        const dx = (next.clientX - startX) / this.note.viewport.zoom, dy = (next.clientY - startY) / this.note.viewport.zoom;
        this.note.objects = this.note.objects.map((object) => { const original = originals.get(object.id); return original ? translateHandwrittenObject(original, dx, dy) : object; });
        this.render();
      });
    });
  }

  private wireResizeHandle(handle: HTMLButtonElement, object: HandwrittenTextObject): void {
    handle.addEventListener("pointerdown", (event) => {
      const startX = event.clientX, startWidth = object.width;
      this.startHandleDrag(event, (next) => {
        object.width = Math.max(80, startWidth + (next.clientX - startX) / this.note.viewport.zoom);
        this.render();
      });
    });
  }

  private keyDown(event: KeyboardEvent): void {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") { event.preventDefault(); event.shiftKey ? this.redo() : this.undo(); return; }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "y") { event.preventDefault(); this.redo(); return; }
    if ((event.key === "Delete" || event.key === "Backspace") && this.selectedIds.size) {
      event.preventDefault(); this.deleteSelection();
    }
  }

  undo(): void { const objects = this.history.undo(this.note.objects); if (objects) { this.resetGesture(); this.note.objects = objects; this.selectedIds.clear(); normalizeContentHeight(this.note); this.render(); this.changed(); } }
  redo(): void { const objects = this.history.redo(this.note.objects); if (objects) { this.resetGesture(); this.note.objects = objects; this.selectedIds.clear(); normalizeContentHeight(this.note); this.render(); this.changed(); } }
  private deleteSelection(): void { if (!this.selectedIds.size) return; this.history.checkpoint(this.note.objects); this.note.objects = this.note.objects.filter(({ id }) => !this.selectedIds.has(id)); this.selectedIds.clear(); normalizeContentHeight(this.note); this.render(); this.changed(); }

  private zoomControls(document: Document): HTMLElement {
    const group = document.createElement("div"); group.className = "canvas-scribe-note-zoom";
    for (const [label, value] of [["−", -.1], ["+", .1]] as const) {
      const button = document.createElement("button"); button.type = "button"; button.textContent = label; button.setAttribute("aria-label", value < 0 ? "Zoom out" : "Zoom in");
      button.addEventListener("click", () => { this.note.viewport.zoom = Math.max(.25, Math.min(2, this.note.viewport.zoom + value)); this.render(); this.changed(); }); group.append(button);
    }
    const fit = document.createElement("button"); fit.type = "button"; fit.textContent = "Fit"; fit.addEventListener("click", () => { this.note.viewport.zoom = Math.max(.25, Math.min(1, (this.viewport.clientWidth - 124) / this.note.logicalWidth)); this.render(); this.changed(); }); group.append(fit);
    return group;
  }

  private createTextStyleControls(document: Document): HTMLElement {
    const group = document.createElement("div"); group.className = "canvas-scribe-note-text-style"; group.hidden = true;
    const size = document.createElement("input"); size.type = "number"; size.min = "10"; size.max = "96"; size.step = "1"; size.setAttribute("aria-label", "Text size");
    const color = document.createElement("input"); color.type = "color"; color.setAttribute("aria-label", "Text color");
    const align = document.createElement("select"); align.setAttribute("aria-label", "Text alignment");
    for (const value of ["left", "center", "right"] as const) { const option = document.createElement("option"); option.value = value; option.textContent = value[0]!.toUpperCase() + value.slice(1); align.append(option); }
    const update = (field: "fontSize" | "color" | "align", value: string) => {
      const object = this.selectedObjects()[0]; if (!object || object.kind !== "text") return;
      this.history.checkpoint(this.note.objects);
      if (field === "fontSize") object.fontSize = Math.max(10, Math.min(96, Number(value) || object.fontSize));
      else if (field === "color") object.color = value;
      else object.align = value === "center" || value === "right" ? value : "left";
      normalizeContentHeight(this.note); this.render(); this.changed();
    };
    size.addEventListener("change", () => update("fontSize", size.value)); color.addEventListener("change", () => update("color", color.value)); align.addEventListener("change", () => update("align", align.value));
    group.append(size, color, align); return group;
  }

  private syncControls(): void {
    this.renderEraserCursor();
    syncCanvasControls(this.controls, { activeTool: this.tool === "text" ? null : this.sharedTools.activeTool, penDefault: this.sharedTools.toolColors.selection("pen") === null, highlighterDefault: this.sharedTools.toolColors.selection("highlighter") === null, penType: this.sharedTools.penType, highlighterType: this.sharedTools.highlighterType,
      eraserMode: this.sharedTools.eraserSettings.mode, selectionMode: this.sharedTools.selectionSettings.mode,
      penColor: this.sharedTools.toolColors.current("pen", "var(--text-normal)"), highlighterColor: this.sharedTools.toolColors.current("highlighter", this.defaultColor("highlighter")), penSize: this.sharedTools.penSize, highlighterSize: this.sharedTools.highlighterSize,
      penOpacity: this.sharedTools.opacity("pen"), highlighterOpacity: this.sharedTools.opacity("highlighter"), enabled: this.enabled, canUndo: this.history.past.length > 0, canRedo: this.history.future.length > 0 });
    this.root.querySelector(".canvas-scribe-note-text-tool")?.classList.toggle("is-active", this.tool === "text");
    const selected = this.selectedObjects()[0]; const text = this.selectedIds.size === 1 && selected?.kind === "text" ? selected : null;
    this.textStyleControls.hidden = text === null;
    if (text) {
      const [size, color, align] = Array.from(this.textStyleControls.children) as [HTMLInputElement, HTMLInputElement, HTMLSelectElement];
      size.value = String(text.fontSize); color.value = /^#[0-9a-f]{6}$/i.test(text.color) ? text.color : "#1f2937"; align.value = text.align;
    }
  }

  private renderLasso(): void {
    const page = this.paperHost.querySelector(".canvas-scribe-note-page"); if (!page) return;
    let svg = page.querySelector<SVGSVGElement>(".canvas-scribe-note-lasso");
    if (!svg) { svg = page.ownerDocument.createElementNS("http://www.w3.org/2000/svg", "svg"); svg.classList.add("canvas-scribe-note-lasso"); svg.setAttribute("viewBox", `0 0 ${this.note.logicalWidth} ${this.note.contentHeight + NOTE_SPARE_HEIGHT}`); page.append(svg); }
    const path = page.ownerDocument.createElementNS("http://www.w3.org/2000/svg", "path"); path.classList.add("canvas-scribe-lasso-path"); path.setAttribute("d", `${this.gesturePoints.map((p, i) => `${i ? "L" : "M"} ${p.x} ${p.y}`).join(" ")} Z`); svg.replaceChildren(path);
  }

  private changed(render = false): void { normalizeContentHeight(this.note); if (render) this.render(); this.onChange(this.note); this.syncControls(); }
  private selectedObjects(): HandwrittenObject[] { return this.note.objects.filter(({ id }) => this.selectedIds.has(id)); }
  private textObject(id?: string): HandwrittenTextObject | undefined { const object = this.note.objects.find((candidate) => candidate.id === id); return object?.kind === "text" ? object : undefined; }
  private point(event: PointerEvent): { x: number; y: number } | null {
    const page = this.paperHost.querySelector<HTMLElement>(".canvas-scribe-note-page"); if (!page) return null;
    const rect = page.getBoundingClientRect(); return { x: (event.clientX - rect.left) / this.note.viewport.zoom, y: (event.clientY - rect.top) / this.note.viewport.zoom };
  }
  private inkPoint(event: PointerEvent, point: { x: number; y: number }) { return { ...point, pressure: event.pressure || .5, tiltX: event.tiltX, tiltY: event.tiltY, time: event.timeStamp }; }
}
