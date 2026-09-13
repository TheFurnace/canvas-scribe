import { createCanvasControls, syncCanvasControls, type IconRenderer } from "./canvas-controls";
import { DocumentHistory } from "./document-history";
import { eraseInk, eraserOutline, transformInk } from "./ink-operations";
import { strokeIntersectsCircle } from "./geometry";
import { createPenMenu } from "./pen-menu";
import { createHighlighterMenu } from "./highlighter-menu";
import { createEraserMenu } from "./eraser-menu";
import { createSelectionMenu } from "./selection-menu";
import { createColorPicker } from "./color-picker";
import { resolveColor } from "./colors";
import { positionPopup } from "./popover";
import { FavoritePens, type PenPreset } from "./favorite-pens";
import { createRadialPages } from "./radial-pages";
import { RadialSession } from "./radial-session";
import { isStylusBarrelButton } from "./pointer-input";
import type { DrawingTool, InkTool } from "./types";
import { InkToolState } from "./ink-tool-state";
import { selectRenderedStroke, pointInPolygon, pointInBounds } from "./selection";
import { PEN_PROFILES } from "./pen-types";
import {
  NOTE_SPARE_HEIGHT, boundsForObjects, cloneHandwrittenObjects, createHandwrittenObjectId,
  measureTextHeight, normalizeContentHeight, objectBounds, translateHandwrittenObject,
  type HandwrittenInkObject, type HandwrittenNoteDocument, type HandwrittenObject, type HandwrittenTextObject,
} from "./handwritten-note";
import { renderHandwrittenNotePage } from "./handwritten-note-renderer";

type EditorTool = "pen" | "highlighter" | "eraser" | "lasso" | "text";

export class HandwrittenNoteEditor {
  readonly root: HTMLElement;
  private readonly history = new DocumentHistory<HandwrittenObject>(cloneHandwrittenObjects, 100);
  private readonly tools = new InkToolState();
  private readonly selectedIds = new Set<string>();
  private controls: HTMLElement;
  private textStyleControls: HTMLElement;
  private viewport: HTMLElement;
  private paperHost: HTMLElement;
  private note: HandwrittenNoteDocument;
  private tool: EditorTool = "pen";
  private enabled = true;
  private activePointer: number | null = null;
  private pan: { id: number; x: number; y: number } | null = null;
  private activeInk: HandwrittenInkObject | null = null;
  private handleDrag: ((event: PointerEvent) => void) | null = null;
  private gesturePoints: { x: number; y: number }[] = [];
  private moveOrigin: { x: number; y: number } | null = null;
  private moveSnapshot = new Map<string, HandwrittenObject>();
  private onChange: (note: HandwrittenNoteDocument) => void;
  private readonly allowMouse: boolean;
  private readonly resizeObserver: ResizeObserver;
  private layoutFrame = 0;
  private menu: HTMLElement | null = null;
  private menuDispose: (() => void) | null = null;
  private radial: RadialSession | null = null;
  private barrelPointer: number | null = null;
  private contextSuppressedUntil = 0;

  constructor(document: Document, note: HandwrittenNoteDocument, onChange: (note: HandwrittenNoteDocument) => void, private readonly renderIcon: IconRenderer, allowMouse = false, private readonly favorites = new FavoritePens(), private readonly overlayMount: HTMLElement = document.body) {
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
    this.viewport.addEventListener("contextmenu", (event) => {
      if ((event.target as Element).closest("textarea, button") || this.activePointer !== null) return;
      event.preventDefault(); event.stopPropagation();
      if (Date.now() > this.contextSuppressedUntil) this.openRadial(event.clientX, event.clientY);
    });
    this.viewport.addEventListener("scroll", () => { this.note.viewport.scrollTop = this.viewport.scrollTop / this.note.viewport.zoom; });
    this.root.addEventListener("keydown", (event) => this.keyDown(event));
    this.resizeObserver = new ResizeObserver(() => this.syncTextLayout());
    this.resizeObserver.observe(this.root);
    this.render();
    requestAnimationFrame(() => { this.viewport.scrollTop = this.note.viewport.scrollTop * this.note.viewport.zoom; });
  }

  setDocument(note: HandwrittenNoteDocument, clearHistory = true): void {
    this.closeOverlays();
    this.note = note; this.selectedIds.clear();
    if (clearHistory) { this.history.past = []; this.history.future = []; }
    this.render();
    requestAnimationFrame(() => { this.viewport.scrollTop = note.viewport.scrollTop * note.viewport.zoom; });
  }

  getDocument(): HandwrittenNoteDocument { return this.note; }
  focus(): void { this.root.focus(); }
  destroy(): void { this.closeOverlays(); this.resizeObserver.disconnect(); cancelAnimationFrame(this.layoutFrame); this.root.remove(); }

  private setTool(tool: DrawingTool): void { this.closeOverlays(); this.tool = tool; this.tools.activeTool = tool; this.render(); }
  private color(tool: InkTool): string { return this.tools.toolColors.current(tool, tool === "pen" ? "var(--text-normal)" : "#fde047"); }
  private defaultColor(tool: InkTool): string { return tool === "highlighter" ? "#fde047" : resolveColor(this.root.ownerDocument, this.root.ownerDocument.defaultView!.getComputedStyle(this.root).color); }
  private opacity(tool: InkTool): number { return tool === "pen" ? this.tools.penOpacity ?? PEN_PROFILES[this.tools.penType].opacity : this.tools.highlighterOpacity; }
  private closeOverlays(): void { this.closeMenu(); this.radial?.close(false); this.radial = null; }
  private closeMenu(focus = false): void {
    this.menuDispose?.(); this.menuDispose = null; this.menu?.remove(); this.menu = null;
    if (focus) this.controls.querySelector<HTMLElement>(`[data-action="${this.tool}"]`)?.focus();
  }
  private mountMenu(menu: HTMLElement): void {
    this.closeOverlays(); this.menu = menu;
    const document = this.root.ownerDocument;
    const anchor = this.controls.querySelector<HTMLElement>(`[data-action="${this.tool}"]`) ?? this.controls;
    this.overlayMount.append(menu); anchor.setAttribute("aria-expanded", "true"); anchor.setAttribute("aria-haspopup", "dialog");
    const position = () => {
      if (!menu.classList.contains("canvas-scribe-tool-menu")) return; // Color picker supplies its own modal layout.
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
    const selected = this.selectedObjects().filter((object): object is HandwrittenInkObject => object.kind === "ink");
    const tool = recolor ? selected[0]?.tool : this.tool;
    if (tool !== "pen" && tool !== "highlighter") return;
    const document = this.root.ownerDocument;
    this.mountMenu(createColorPicker(document, {
      tool, current: resolveColor(document, (recolor ? selected[0]!.color : this.tools.toolColors.selection(tool))?.replace("var(--text-normal)", this.defaultColor(tool)) ?? this.defaultColor(tool)),
      defaultColor: this.defaultColor(tool), recent: this.tools.toolColors.recent(tool),
      onConfirm: (color) => {
        if (recolor) {
          this.history.checkpoint(this.note.objects);
          this.note.objects = this.note.objects.map(object => object.kind === "ink" && this.selectedIds.has(object.id)
            ? { ...object, color: color ?? (object.tool === "pen" ? "var(--text-normal)" : "#fde047") } : object);
          this.changed(true);
        } else this.tools.toolColors.confirm(tool, color);
        this.closeMenu(true); this.syncControls();
      }, onCancel: () => this.closeMenu(true),
    }));
  }
  private toggleToolMenu(): void {
    if (this.menu) { this.closeMenu(true); return; }
    const document = this.root.ownerDocument, state = this.tools;
    const common = { renderIcon: this.renderIcon, onClose: () => this.closeMenu(true) }, sync = () => this.syncControls();
    const menu = this.tool === "pen" ? createPenMenu(document, { ...common,
      type: state.penType, size: state.penSize, color: this.color("pen"),
      onType: type => { state.penType = type; state.penOpacity = null; sync(); }, onSize: size => { state.penSize = size; sync(); },
      onColor: color => { state.toolColors.confirm("pen", color); sync(); }, onColors: () => this.openColors(),
    }) : this.tool === "highlighter" ? createHighlighterMenu(document, { ...common,
      type: state.highlighterType, size: state.highlighterSize, opacity: state.highlighterOpacity, color: this.color("highlighter"),
      onType: type => { state.highlighterType = type; sync(); }, onSize: size => { state.highlighterSize = size; sync(); },
      onOpacity: opacity => { state.highlighterOpacity = opacity; sync(); },
      onColor: color => { state.toolColors.confirm("highlighter", color); sync(); }, onColors: () => this.openColors(),
    }) : this.tool === "eraser" ? createEraserMenu(document, { ...common,
      settings: state.eraserSettings, onChange: settings => { state.eraserSettings = settings; },
      canClear: this.note.objects.some(object => object.kind === "ink"), clearLabel: "Erase all ink in this note…",
      clearMessage: "Erase all ink in this note? Text boxes will remain. You can undo this action.",
      onClear: () => { this.history.checkpoint(this.note.objects); this.note.objects = this.note.objects.filter(object => object.kind === "text"); this.selectedIds.clear(); this.closeMenu(); this.changed(true); },
    }) : this.tool === "lasso" ? createSelectionMenu(document, { ...common,
      settings: state.selectionSettings, count: this.selectedObjects().filter(object => object.kind === "ink").length,
      onChange: settings => { state.selectionSettings = settings; }, onRecolor: () => this.openColors(true),
      onScale: scale => {
        const bounds = boundsForObjects(this.selectedObjects().filter(object => object.kind === "ink")); if (!bounds || scale === 1) return;
        this.history.checkpoint(this.note.objects); const cx = (bounds.minX + bounds.maxX) / 2, cy = (bounds.minY + bounds.maxY) / 2;
        this.note.objects = this.note.objects.map(object => object.kind === "ink" && this.selectedIds.has(object.id)
          ? { ...transformInk(object, (x, y) => [cx + (x - cx) * scale, cy + (y - cy) * scale], scale), kind: "ink" } : object);
        this.changed(true);
      },
    }) : null;
    if (menu) this.mountMenu(menu);
  }
  private openRadial(x: number, y: number): void {
    this.closeOverlays();
    const state = this.tools, tool = this.tool === "text" ? state.activeTool : this.tool;
    const preset: PenPreset | null = tool === "pen" || tool === "highlighter" ? {
      tool, penType: state.penType, highlighterType: state.highlighterType, color: state.toolColors.selection(tool),
      size: tool === "pen" ? state.penSize : state.highlighterSize, opacity: this.opacity(tool),
    } : null;
    const actions = createRadialPages({
      document: this.root.ownerDocument, tool, colors: state.toolColors, favorites: this.favorites, currentPreset: preset,
      penType: state.penType, highlighterType: state.highlighterType, eraserMode: state.eraserSettings.mode,
      selectTool: value => this.setTool(value),
      selectPen: type => { state.penType = type; state.penOpacity = null; this.setTool("pen"); },
      selectHighlighter: type => { state.highlighterType = type; this.setTool("highlighter"); },
      selectEraser: mode => { state.eraserSettings.mode = mode; this.setTool("eraser"); },
      getSize: () => tool === "pen" ? state.penSize : state.highlighterSize,
      setSize: size => { if (tool === "pen") state.penSize = size; else state.highlighterSize = size; this.syncControls(); },
      getOpacity: () => this.opacity(tool === "pen" ? "pen" : "highlighter"),
      setOpacity: opacity => { if (tool === "pen") state.penOpacity = opacity; else state.highlighterOpacity = opacity; this.syncControls(); },
      undo: () => this.undo(), redo: () => this.redo(), canUndo: () => this.history.past.length > 0, canRedo: () => this.history.future.length > 0,
      defaultColor: ink => this.defaultColor(ink),
      colorsChanged: () => this.syncControls(),
      applyFavorite: favorite => {
        state.toolColors.confirm(favorite.tool, favorite.color);
        if (favorite.tool === "pen") { state.penType = favorite.penType; state.penSize = favorite.size; state.penOpacity = favorite.opacity; }
        else { state.highlighterType = favorite.highlighterType ?? "round"; state.highlighterSize = favorite.size; state.highlighterOpacity = favorite.opacity; }
        this.setTool(favorite.tool);
      },
      openCanvasMenu: () => this.toggleToolMenu(),
      contextAction: { id: "tool-settings", label: "Tool settings", icon: "settings-2", run: () => this.toggleToolMenu() },
    });
    this.radial = new RadialSession(this.root.ownerDocument, actions, () => { this.radial = null; }, this.renderIcon, this.overlayMount);
    this.radial.open(x, y);
  }

  private render(): void {
    const page = renderHandwrittenNotePage(this.root.ownerDocument, { ...this.note, contentHeight: this.note.contentHeight + NOTE_SPARE_HEIGHT }, { interactive: true, selectedIds: this.selectedIds });
    page.style.width = `${this.note.logicalWidth}px`;
    page.style.height = `${this.note.contentHeight + NOTE_SPARE_HEIGHT}px`;
    page.style.zoom = String(this.note.viewport.zoom);
    for (const textarea of Array.from(page.querySelectorAll<HTMLTextAreaElement>("textarea.canvas-scribe-note-text"))) this.wireTextArea(textarea);
    this.paperHost.replaceChildren(page);
    this.syncTextLayout();
    cancelAnimationFrame(this.layoutFrame);
    this.layoutFrame = requestAnimationFrame(() => this.syncTextLayout());
    this.syncControls();
  }

  private syncTextLayout(): void {
    const page = this.paperHost.querySelector<HTMLElement>(".canvas-scribe-note-page"); if (!page) return;
    for (const textarea of Array.from(page.querySelectorAll<HTMLTextAreaElement>("textarea.canvas-scribe-note-text"))) {
      const object = this.textObject(textarea.dataset.objectId); if (!object) continue;
      textarea.style.height = "0px";
      // scrollHeight includes padding but excludes borders, and is in logical CSS pixels.
      const height = textarea.scrollHeight ? Math.max(48, textarea.scrollHeight + 2) : objectBounds(object).maxY - object.y;
      textarea.style.height = `${height}px`;
      measureTextHeight(object, height);
    }
    normalizeContentHeight(this.note);
    const height = this.note.contentHeight + NOTE_SPARE_HEIGHT;
    page.style.height = `${height}px`;
    page.querySelectorAll("svg.canvas-scribe-note-ink").forEach(svg => svg.setAttribute("viewBox", `0 0 ${this.note.logicalWidth} ${height}`));
    this.renderSelectionHandles(page);
  }

  private wireTextArea(textarea: HTMLTextAreaElement): void {
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
      if (object) { object.text = textarea.value; this.syncTextLayout(); this.changed(false); }
    });
    textarea.addEventListener("blur", () => { textarea.classList.remove("is-editing"); delete textarea.dataset.editing; this.changed(); });
    textarea.addEventListener("keydown", (event) => { if (event.key === "Escape") { event.preventDefault(); textarea.blur(); this.root.focus(); } event.stopPropagation(); });
  }

  private pointerDown(event: PointerEvent): void {
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
    event.preventDefault(); event.stopPropagation(); this.pan = null; this.activePointer = event.pointerId; this.viewport.setPointerCapture?.(event.pointerId);
    if (this.tool === "text") { this.addText(point.x, point.y); this.activePointer = null; this.releasePointer(event.pointerId); return; }
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
    this.note.objects.push(this.activeInk); this.render();
  }

  private pointerMove(event: PointerEvent): void {
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
    const point = this.point(event); if (!point) return;
    if (this.activeInk) {
      const coalesced = event.getCoalescedEvents?.() ?? [];
      const samples = coalesced.length ? coalesced : [event];
      for (const sample of samples) { const p = this.point(sample); if (p) this.activeInk.points.push(this.inkPoint(sample, p)); }
      this.render(); return;
    }
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

  private pointerUp(event: PointerEvent): void {
    if (event.pointerId === this.barrelPointer) { event.preventDefault(); event.stopPropagation(); this.barrelPointer = null; this.releasePointer(event.pointerId); this.contextSuppressedUntil = Date.now() + 800; return; }
    if (event.pointerId === this.pan?.id) {
      event.preventDefault(); event.stopPropagation(); this.pan = null;
      this.releasePointer(event.pointerId); return;
    }
    if (event.pointerId !== this.activePointer) return;
    event.preventDefault(); event.stopPropagation();
    if (this.handleDrag) { this.handleDrag = null; normalizeContentHeight(this.note); this.changed(); }
    else if (this.activeInk) { this.activeInk = null; normalizeContentHeight(this.note); this.changed(); }
    else if (this.tool === "lasso" && this.moveOrigin) { this.moveOrigin = null; this.moveSnapshot.clear(); normalizeContentHeight(this.note); this.changed(); }
    else if (this.tool === "lasso" && this.gesturePoints.length > 2) { this.selectGesture(); this.render(); }
    this.gesturePoints = []; this.activePointer = null; this.releasePointer(event.pointerId);
  }

  private selectGesture(): void {
    for (const object of this.note.objects) {
      if (object.kind === "ink" ? selectRenderedStroke(object, this.gesturePoints, this.tools.selectionSettings.partial) : this.boxIntersectsPolygon(objectBounds(object), this.gesturePoints)) this.selectedIds.add(object.id);
    }
  }

  private eraseAt(x: number, y: number): void {
    const before = this.note.objects;
    const region = eraserOutline(x, y, this.tools.eraserSettings.radius / this.note.viewport.zoom);
    let changed = false;
    const next = before.flatMap((object): HandwrittenObject[] => {
      if (object.kind === "text") return [object];
      if (this.tools.eraserSettings.highlighterOnly && object.tool !== "highlighter") return [object];
      if (this.tools.eraserSettings.mode === "stroke") {
        const hit = strokeIntersectsCircle(object, x, y, this.tools.eraserSettings.radius / this.note.viewport.zoom);
        changed ||= hit; return hit ? [] : [object];
      }
      const result = eraseInk([object], region, this.tools.eraserSettings);
      changed ||= result.changed;
      return result.strokes.map((stroke) => ({ ...stroke, kind: "ink" }));
    });
    if (!changed) return;
    if (this.gesturePoints.length === 0) this.history.checkpoint(before);
    this.gesturePoints.push({ x, y }); this.note.objects = next; this.render(); this.changed(false);
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
    this.pan = null; this.activePointer = event.pointerId; this.handleDrag = move;
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

  private undo(): void { const objects = this.history.undo(this.note.objects); if (objects) { this.note.objects = objects; this.selectedIds.clear(); normalizeContentHeight(this.note); this.render(); this.changed(); } }
  private redo(): void { const objects = this.history.redo(this.note.objects); if (objects) { this.note.objects = objects; this.selectedIds.clear(); normalizeContentHeight(this.note); this.render(); this.changed(); } }
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
    syncCanvasControls(this.controls, { activeTool: this.tool === "text" ? null : this.tool, penType: this.tools.penType, highlighterType: this.tools.highlighterType,
      penColor: this.color("pen"), highlighterColor: this.color("highlighter"), penSize: this.tools.penSize, highlighterSize: this.tools.highlighterSize,
      penOpacity: this.opacity("pen"), highlighterOpacity: this.opacity("highlighter"), enabled: this.enabled, canUndo: this.history.past.length > 0, canRedo: this.history.future.length > 0 });
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
  private boxIntersectsPolygon(bounds: ReturnType<typeof objectBounds>, polygon: readonly { x: number; y: number }[]): boolean {
    const corners = [{ x: bounds.minX, y: bounds.minY }, { x: bounds.maxX, y: bounds.minY }, { x: bounds.maxX, y: bounds.maxY }, { x: bounds.minX, y: bounds.maxY }];
    return corners.some((corner) => pointInPolygon(corner, polygon)) || polygon.some((point) => pointInBounds(point, bounds));
  }
}
