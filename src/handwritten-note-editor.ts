import { createCanvasControls, syncCanvasControls, type IconRenderer } from "./canvas-controls";
import { DocumentHistory } from "./document-history";
import { strokeIntersectsCircle } from "./geometry";
import { InkToolState } from "./ink-tool-state";
import { selectRenderedStroke, pointInPolygon, pointInBounds } from "./selection";
import { PEN_PROFILES } from "./pen-types";
import {
  NOTE_SPARE_HEIGHT, boundsForObjects, cloneHandwrittenObjects, createHandwrittenObjectId,
  normalizeContentHeight, objectBounds, translateHandwrittenObject,
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
  private activeInk: HandwrittenInkObject | null = null;
  private gesturePoints: { x: number; y: number }[] = [];
  private moveOrigin: { x: number; y: number } | null = null;
  private moveSnapshot = new Map<string, HandwrittenObject>();
  private onChange: (note: HandwrittenNoteDocument) => void;
  private readonly allowMouse: boolean;

  constructor(document: Document, note: HandwrittenNoteDocument, onChange: (note: HandwrittenNoteDocument) => void, renderIcon: IconRenderer, allowMouse = false) {
    this.note = note; this.onChange = onChange; this.allowMouse = allowMouse;
    this.root = document.createElement("section");
    this.root.className = "canvas-scribe-note-editor";
    this.root.tabIndex = 0;
    const toolbar = document.createElement("div"); toolbar.className = "canvas-scribe-note-toolbar";
    this.controls = createCanvasControls(document, renderIcon, {
      setTool: (tool) => { this.tool = tool; this.tools.activeTool = tool; this.render(); },
      toggleColorPalette: () => undefined,
      undo: () => this.undo(), redo: () => this.redo(),
      toggleEnabled: () => { this.enabled = !this.enabled; this.syncControls(); },
    });
    const textButton = document.createElement("button");
    textButton.type = "button"; textButton.className = "canvas-scribe-ui-button canvas-scribe-note-text-tool";
    textButton.textContent = "T"; textButton.title = "Add text box"; textButton.setAttribute("aria-label", "Add text box");
    textButton.addEventListener("click", () => { this.tool = "text"; this.render(); });
    this.textStyleControls = this.createTextStyleControls(document);
    toolbar.append(this.controls, textButton, this.textStyleControls, this.zoomControls(document));
    this.viewport = document.createElement("div"); this.viewport.className = "canvas-scribe-note-viewport"; this.viewport.tabIndex = 0;
    this.paperHost = document.createElement("div"); this.paperHost.className = "canvas-scribe-note-paper-host";
    this.viewport.append(this.paperHost); this.root.append(toolbar, this.viewport);
    this.viewport.addEventListener("pointerdown", (event) => this.pointerDown(event));
    this.viewport.addEventListener("pointermove", (event) => this.pointerMove(event));
    this.viewport.addEventListener("pointerup", (event) => this.pointerUp(event));
    this.viewport.addEventListener("pointercancel", (event) => this.pointerUp(event));
    this.viewport.addEventListener("scroll", () => { this.note.viewport.scrollTop = this.viewport.scrollTop / this.note.viewport.zoom; });
    this.root.addEventListener("keydown", (event) => this.keyDown(event));
    this.render();
    requestAnimationFrame(() => { this.viewport.scrollTop = this.note.viewport.scrollTop * this.note.viewport.zoom; });
  }

  setDocument(note: HandwrittenNoteDocument, clearHistory = true): void {
    this.note = note; this.selectedIds.clear();
    if (clearHistory) { this.history.past = []; this.history.future = []; }
    this.render();
    requestAnimationFrame(() => { this.viewport.scrollTop = note.viewport.scrollTop * note.viewport.zoom; });
  }

  getDocument(): HandwrittenNoteDocument { return this.note; }
  focus(): void { this.root.focus(); }
  destroy(): void { this.root.remove(); }

  private render(): void {
    const page = renderHandwrittenNotePage(this.root.ownerDocument, { ...this.note, contentHeight: this.note.contentHeight + NOTE_SPARE_HEIGHT }, { interactive: true, selectedIds: this.selectedIds });
    page.style.width = `${this.note.logicalWidth}px`;
    page.style.height = `${this.note.contentHeight + NOTE_SPARE_HEIGHT}px`;
    page.style.zoom = String(this.note.viewport.zoom);
    for (const textarea of Array.from(page.querySelectorAll<HTMLTextAreaElement>("textarea.canvas-scribe-note-text"))) this.wireTextArea(textarea);
    this.paperHost.replaceChildren(page);
    this.renderSelectionHandles(page);
    this.syncControls();
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
      if (object) { object.text = textarea.value; normalizeContentHeight(this.note); this.changed(false); }
    });
    textarea.addEventListener("blur", () => { textarea.classList.remove("is-editing"); delete textarea.dataset.editing; this.changed(); });
    textarea.addEventListener("keydown", (event) => { if (event.key === "Escape") { event.preventDefault(); textarea.blur(); this.root.focus(); } event.stopPropagation(); });
  }

  private pointerDown(event: PointerEvent): void {
    if (!this.enabled || (event.pointerType !== "pen" && !(this.allowMouse && event.pointerType === "mouse")) || this.activePointer !== null || (event.target as Element).closest(".canvas-scribe-note-toolbar, textarea, button")) return;
    const point = this.point(event); if (!point) return;
    event.preventDefault(); event.stopPropagation(); this.activePointer = event.pointerId; this.viewport.setPointerCapture?.(event.pointerId);
    if (this.tool === "text") { this.addText(point.x, point.y); this.activePointer = null; return; }
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
      color: this.tools.toolColors.current(this.tool, this.tool === "pen" ? "#1f2937" : "#fde047"),
      size: this.tool === "pen" ? this.tools.penSize : this.tools.highlighterSize,
      opacity: this.tool === "pen" ? (this.tools.penOpacity ?? PEN_PROFILES[this.tools.penType].opacity) : this.tools.highlighterOpacity,
      ...(this.tool === "pen" ? { penType: this.tools.penType } : { highlighterType: this.tools.highlighterType }),
      points: [this.inkPoint(event, point)], hasPressure: event.pressure > 0, createdAt: Date.now(),
    };
    this.note.objects.push(this.activeInk); this.render();
  }

  private pointerMove(event: PointerEvent): void {
    if (event.pointerId !== this.activePointer) return;
    const point = this.point(event); if (!point) return;
    event.preventDefault();
    if (this.activeInk) {
      const samples = typeof event.getCoalescedEvents === "function" ? event.getCoalescedEvents() : [event];
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
    if (this.tool === "lasso") { this.gesturePoints.push(point); this.renderLasso(); }
  }

  private pointerUp(event: PointerEvent): void {
    if (event.pointerId !== this.activePointer) return;
    event.preventDefault();
    if (this.activeInk) { this.activeInk = null; normalizeContentHeight(this.note); this.changed(); }
    else if (this.tool === "lasso" && this.moveOrigin) { this.moveOrigin = null; this.moveSnapshot.clear(); normalizeContentHeight(this.note); this.changed(); }
    else if (this.tool === "lasso" && this.gesturePoints.length > 2) { this.selectGesture(); this.render(); }
    this.gesturePoints = []; this.activePointer = null; this.viewport.releasePointerCapture?.(event.pointerId);
  }

  private selectGesture(): void {
    for (const object of this.note.objects) {
      if (object.kind === "ink" ? selectRenderedStroke(object, this.gesturePoints, true) : this.boxIntersectsPolygon(objectBounds(object), this.gesturePoints)) this.selectedIds.add(object.id);
    }
  }

  private eraseAt(x: number, y: number): void {
    const before = this.note.objects;
    const next = before.filter((object) => object.kind === "text" || !strokeIntersectsCircle(object, x, y, this.tools.eraserSettings.radius));
    if (next.length === before.length) return;
    if (this.gesturePoints.length === 0) this.history.checkpoint(before);
    this.gesturePoints.push({ x, y }); this.note.objects = next; this.render(); this.changed(false);
  }

  private addText(x: number, y: number): void {
    this.history.checkpoint(this.note.objects);
    const object: HandwrittenTextObject = { kind: "text", id: createHandwrittenObjectId("text"), x, y, width: 300, text: "", fontSize: 18, color: "#1f2937", align: "left" };
    this.note.objects.push(object); this.selectedIds.clear(); this.selectedIds.add(object.id); normalizeContentHeight(this.note); this.render(); this.changed();
    requestAnimationFrame(() => this.paperHost.querySelector<HTMLTextAreaElement>(`[data-object-id="${object.id}"]`)?.focus());
  }

  private renderSelectionHandles(page: HTMLElement): void {
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

  private wireMoveHandle(handle: HTMLButtonElement): void {
    handle.addEventListener("pointerdown", (event) => {
      event.preventDefault(); event.stopPropagation(); this.history.checkpoint(this.note.objects);
      const startX = event.clientX, startY = event.clientY;
      const originals = new Map(this.selectedObjects().map((object) => [object.id, cloneHandwrittenObjects([object])[0]!]));
      handle.setPointerCapture?.(event.pointerId);
      const move = (next: PointerEvent) => {
        const dx = (next.clientX - startX) / this.note.viewport.zoom, dy = (next.clientY - startY) / this.note.viewport.zoom;
        this.note.objects = this.note.objects.map((object) => { const original = originals.get(object.id); return original ? translateHandwrittenObject(original, dx, dy) : object; }); this.render(); this.changed(false);
      };
      const up = (next: PointerEvent) => { handle.releasePointerCapture?.(next.pointerId); handle.removeEventListener("pointermove", move); handle.removeEventListener("pointerup", up); normalizeContentHeight(this.note); this.changed(); };
      handle.addEventListener("pointermove", move); handle.addEventListener("pointerup", up);
    });
  }

  private wireResizeHandle(handle: HTMLButtonElement, object: HandwrittenTextObject): void {
    handle.addEventListener("pointerdown", (event) => {
      event.preventDefault(); event.stopPropagation(); this.history.checkpoint(this.note.objects);
      const startX = event.clientX, startWidth = object.width; handle.setPointerCapture?.(event.pointerId);
      const move = (next: PointerEvent) => { object.width = Math.max(80, startWidth + (next.clientX - startX) / this.note.viewport.zoom); this.render(); this.changed(false); };
      const up = (next: PointerEvent) => { handle.releasePointerCapture?.(next.pointerId); handle.removeEventListener("pointermove", move); handle.removeEventListener("pointerup", up); normalizeContentHeight(this.note); this.changed(); };
      handle.addEventListener("pointermove", move); handle.addEventListener("pointerup", up);
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
    const fit = document.createElement("button"); fit.type = "button"; fit.textContent = "Fit"; fit.addEventListener("click", () => { this.note.viewport.zoom = Math.max(.25, Math.min(1, (this.viewport.clientWidth - 32) / this.note.logicalWidth)); this.render(); this.changed(); }); group.append(fit);
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
    syncCanvasControls(this.controls, { activeTool: this.tool === "text" ? null : this.tool, penType: this.tools.penType, highlighterType: this.tools.highlighterType, enabled: this.enabled, canUndo: this.history.past.length > 0, canRedo: this.history.future.length > 0 });
    this.controls.querySelector<HTMLElement>("[data-action=color]")?.setAttribute("aria-disabled", "true");
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
