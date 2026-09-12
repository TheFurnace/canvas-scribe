import { setIcon } from "obsidian";
import type { InkSurfaceAdapter, SurfaceTransform } from "./ink-surface";
import { strokeToSvgPath } from "./geometry";
import { eraseInk, eraserOutline, transformInk } from "./ink-operations";
import { boundsForStrokes, pointInBounds, selectRenderedStroke } from "./selection";
import { PEN_PROFILES } from "./pen-types";
import { createStrokeId, type InkPoint } from "./types";
import { clonePdfInk, clipPdfInk, type PdfCompanion, type PdfInk } from "./pdf-document";
import { PdfSession, PdfStore } from "./pdf-store";
import { pdfScreenPoint, type NativePdfHost, type NativePdfView } from "./pdf-native";
import { PdfTools } from "./pdf-tools";
import type { FavoritePens } from "./favorite-pens";

const NS = "http://www.w3.org/2000/svg";
type Point = { x: number; y: number };
interface Gesture { id: number; page: number; before: PdfInk[]; working: PdfInk[]; points: Point[]; origin: Point; stroke?: PdfInk; moving: boolean; }

export class PdfSurface implements InkSurfaceAdapter<PdfCompanion> {
  constructor(private readonly store: PdfStore, readonly session: PdfSession) {}
  async load(): Promise<PdfCompanion> { return this.session.document; }
  async save(document: PdfCompanion): Promise<void> { this.store.change(this.session, document.strokes); await this.session.queue; }
  transform(svg: SVGSVGElement | null): SurfaceTransform | null {
    const matrix = svg?.querySelector<SVGGElement>("g")?.getScreenCTM(); if (!matrix) return null;
    try { const screenToCanvas = matrix.inverse(); const screenScale = Math.hypot(matrix.a, matrix.b);
      return screenScale > 0 && [screenToCanvas.a, screenToCanvas.b, screenToCanvas.c, screenToCanvas.d, screenToCanvas.e, screenToCanvas.f].every(Number.isFinite) ? { screenToCanvas, screenScale } : null;
    } catch { return null; }
  }
}

export class PdfLayer {
  readonly tools: PdfTools;
  private enabled = false;
  private readonly selected = new Set<string>();
  private selectedPage = 0;
  private gesture: Gesture | null = null;
  private readonly overlays = new Map<number, SVGSVGElement>();
  private readonly touches = new Map<number, Point>();
  private touchScale = 0;
  private frame: number | null = null;
  private readonly surface: PdfSurface;
  private readonly abort = new AbortController();
  private readonly events = ["pagerendered", "pagesinit", "scalechanging", "rotationchanging", "updateviewarea"];
  private readonly changed = () => { if (this.gesture && (this.session.error || this.session.reviewing || this.gesture.before !== this.session.document.strokes)) this.cancel(); this.schedule(); };
  private readonly redraw = () => this.schedule();
  private readonly viewportChanged = () => { this.cancel(); this.schedule(); };
  constructor(private readonly view: NativePdfView, private readonly host: NativePdfHost, private readonly session: PdfSession,
    store: PdfStore, favorites: FavoritePens, private readonly status: (message: string) => void) {
    this.surface = new PdfSurface(store, session);
    this.tools = new PdfTools(view.contentEl.ownerDocument, setIcon, {
      changed: () => { this.cancel(); this.sync(); }, toggle: () => this.toggle(), undo: () => { this.cancel(); store.undo(session); }, redo: () => { this.cancel(); store.undo(session, true); },
      clear: () => this.commit(session.document.strokes.filter(s => s.page !== this.pageIndex())),
      scale: scale => this.scale(scale), recolor: color => this.commit(session.document.strokes.map(s => this.selected.has(s.id) ? { ...s, color } : s)),
      remove: () => this.commit(session.document.strokes.filter(s => !this.selected.has(s.id))),
    }, favorites);
    view.contentEl.append(this.tools.root);
    const options = { capture: true, signal: this.abort.signal };
    view.contentEl.addEventListener("pointerdown", event => this.down(event), options);
    view.contentEl.addEventListener("pointermove", event => this.move(event), options);
    view.contentEl.addEventListener("pointerup", event => this.up(event), options);
    view.contentEl.addEventListener("pointercancel", event => this.up(event, true), options);
    view.contentEl.addEventListener("lostpointercapture", event => this.up(event, true), options);
    view.contentEl.addEventListener("keydown", event => {
      if ((event.target as Element).closest("input,textarea,[contenteditable=true]")) return;
      if (event.key === "Escape") { this.cancel(); this.selected.clear(); this.tools.close(); this.schedule(); }
      if (!this.enabled || this.session.error) return;
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") { event.preventDefault(); event.stopPropagation(); this.cancel(); store.undo(session, event.shiftKey); }
      if ((event.key === "Delete" || event.key === "Backspace") && this.selected.size) { event.preventDefault(); this.commit(session.document.strokes.filter(s => !this.selected.has(s.id))); }
    }, options);
    for (const event of this.events) host.eventBus.on(event, this.redraw);
    host.eventBus.on("scalechanging", this.viewportChanged); host.eventBus.on("rotationchanging", this.viewportChanged);
    host.pdfViewer.container.addEventListener("scroll", this.redraw, { signal: this.abort.signal, passive: true });
    session.listeners.add(this.changed); this.schedule();
  }
  destroy(): void {
    this.cancel(); this.abort.abort(); this.touches.clear(); this.view.contentEl.classList.remove("canvas-scribe-pdf-annotating");
    for (const event of this.events) this.host.eventBus.off(event, this.redraw);
    this.host.eventBus.off("scalechanging", this.viewportChanged); this.host.eventBus.off("rotationchanging", this.viewportChanged);
    this.session.listeners.delete(this.changed); if (this.frame !== null) cancelAnimationFrame(this.frame);
    for (const svg of this.overlays.values()) svg.remove(); this.overlays.clear(); this.tools.close(); this.tools.root.remove();
  }
  private toggle(): void {
    if (this.session.error) { this.status(this.session.error); return; }
    this.cancel(); this.enabled = !this.enabled;
    this.view.contentEl.classList.toggle("canvas-scribe-pdf-annotating", this.enabled); this.sync();
  }
  private pageIndex(): number { return Math.max(0, this.host.pdfViewer.currentPageNumber - 1); }
  private sync(): void {
    if (this.session.error || this.session.reviewing) { this.enabled = false; this.view.contentEl.classList.remove("canvas-scribe-pdf-annotating"); }
    this.tools.sync(this.enabled, !this.session.error && !!this.session.history.past.length, !this.session.error && !!this.session.history.future.length, this.selected.size,
      this.session.document.strokes.some(s => s.page === this.pageIndex()));
    this.status(this.session.reviewing ? "Applying reviewed association…" : this.session.error || (this.session.saving ? "Saving annotations…" : this.enabled ? "Annotating · pen draws, fingers navigate" : "Reading · annotations saved separately"));
  }
  private schedule(): void { if (this.frame === null) this.frame = requestAnimationFrame(() => { this.frame = null; this.render(); }); }
  private render(): void {
    this.sync();
    const visible = this.host.pdfViewer.container.getBoundingClientRect();
    const strokes = this.gesture?.working ?? this.session.document.strokes;
    for (let i = 0; i < this.host.pdfDocument.numPages; i++) {
      const page = this.host.pdfViewer.getPageView(i), box = page?.div.getBoundingClientRect();
      if (!page || !box || box.bottom < visible.top - 400 || box.top > visible.bottom + 400 || !page.viewport) { this.overlays.get(i)?.remove(); this.overlays.delete(i); continue; }
      let svg = this.overlays.get(i);
      if (!svg) { svg = page.div.ownerDocument.createElementNS(NS, "svg"); svg.classList.add("canvas-scribe-pdf-overlay"); svg.setAttribute("aria-hidden", "true"); this.overlays.set(i, svg); }
      if (svg.parentElement !== page.div) page.div.append(svg);
      svg.setAttribute("viewBox", `0 0 ${page.viewport.width} ${page.viewport.height}`); svg.setAttribute("preserveAspectRatio", "none");
      const group = svg.ownerDocument.createElementNS(NS, "g"); group.setAttribute("transform", `matrix(${page.viewport.transform.join(" ")})`);
      for (const stroke of strokes.filter(s => s.page === i)) {
        const path = svg.ownerDocument.createElementNS(NS, "path"); path.setAttribute("d", strokeToSvgPath(stroke)); path.setAttribute("fill", stroke.color); path.setAttribute("opacity", String(stroke.opacity));
        if (this.selected.has(stroke.id)) { path.setAttribute("stroke", "#5688ff"); path.setAttribute("stroke-width", String(1 / page.viewport.scale)); }
        group.append(path);
      }
      const gesture = this.gesture;
      if (gesture?.page === i && this.tools.state.activeTool === "lasso" && !gesture.moving && gesture.points.length > 1) {
        const outline = svg.ownerDocument.createElementNS(NS, "path"); outline.setAttribute("d", `M ${this.polygon(gesture.points).map(p => `${p.x} ${p.y}`).join(" L ")} Z`);
        outline.setAttribute("fill", "none"); outline.setAttribute("stroke", "#5688ff"); outline.setAttribute("stroke-width", String(1 / page.viewport.scale)); group.append(outline);
      }
      svg.replaceChildren(group);
    }
  }
  private point(event: PointerEvent, index: number): Point | null { const page = this.host.pdfViewer.getPageView(index); return page ? pdfScreenPoint(page, event.clientX, event.clientY) : null; }
  private consume(event: PointerEvent): void { event.preventDefault(); event.stopImmediatePropagation(); }
  private down(event: PointerEvent): void {
    if (!this.enabled || this.session.error || this.session.reviewing || !(event.target as Element).closest(".pdfViewer .page")) return;
    if (event.pointerType === "touch") { this.consume(event); if (this.gesture) return; this.touches.set(event.pointerId, { x: event.clientX, y: event.clientY }); this.view.contentEl.setPointerCapture(event.pointerId); this.touchScale = this.touchDistance(); return; }
    if (event.pointerType !== "pen" || this.gesture) return;
    const pageEl = (event.target as Element).closest<HTMLElement>(".page[data-page-number]");
    const index = Number(pageEl?.dataset.pageNumber) - 1, point = this.point(event, index); if (!point || !this.session.document.source.pages[index]) return;
    this.consume(event); this.tools.close(); this.touches.clear(); this.view.contentEl.setPointerCapture(event.pointerId);
    const before = this.session.document.strokes, working = before.map(stroke => stroke.page === index ? clonePdfInk([stroke])[0]! : stroke);
    const bounds = boundsForStrokes(working.filter(s => this.selected.has(s.id) && s.page === index));
    const g: Gesture = { id: event.pointerId, page: index, before, working, points: [point], origin: point, moving: this.tools.state.activeTool === "lasso" && !!bounds && pointInBounds(point, bounds) };
    this.gesture = g; this.selectedPage = index;
    const s = this.tools.state;
    if (s.activeTool === "pen" || s.activeTool === "highlighter") {
      this.selected.clear();
      g.stroke = { id: createStrokeId(), page: index, tool: s.activeTool, color: this.tools.color(), size: s.activeTool === "pen" ? s.penSize : s.highlighterSize,
        opacity: s.activeTool === "pen" ? s.penOpacity ?? PEN_PROFILES[s.penType].opacity : s.highlighterOpacity, penType: s.penType, highlighterType: s.highlighterType,
        points: [this.inkPoint(event, point)], hasPressure: event.pressure > 0, createdAt: Date.now() }; g.working.push(g.stroke);
    } else if (s.activeTool === "eraser") this.erase(point);
    else if (!g.moving) this.selected.clear();
    this.schedule();
  }
  private touchDistance(): number { const p = [...this.touches.values()]; return p.length === 2 ? Math.hypot(p[0]!.x - p[1]!.x, p[0]!.y - p[1]!.y) : 0; }
  private move(event: PointerEvent): void {
    const finger = this.touches.get(event.pointerId);
    if (finger) {
      this.consume(event); this.touches.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (this.touches.size === 1) { this.host.pdfViewer.container.scrollLeft += finger.x - event.clientX; this.host.pdfViewer.container.scrollTop += finger.y - event.clientY; }
      else { const distance = this.touchDistance(); const viewer = this.host.pdfViewer as NativePdfHost["pdfViewer"] & { currentScale?: number };
        if (distance && this.touchScale && typeof viewer.currentScale === "number") viewer.currentScale = Math.max(0.25, Math.min(5, viewer.currentScale * distance / this.touchScale)); this.touchScale = distance; }
      return;
    }
    const g = this.gesture; if (!g || g.id !== event.pointerId) return;
    this.consume(event); const point = this.point(event, g.page); if (!point) return;
    if (g.stroke) {
      const coalesced = event.getCoalescedEvents?.() ?? [];
      for (const sample of coalesced.length ? coalesced : [event]) { const p = this.point(sample, g.page); if (p) g.stroke.points.push(this.inkPoint(sample, p)); }
    } else if (this.tools.state.activeTool === "eraser") this.erase(point);
    else if (g.moving) {
      const bounds = boundsForStrokes(g.before.filter(s => this.selected.has(s.id))); if (!bounds) return;
      const [x0, y0, x1, y1] = this.session.document.source.pages[g.page]!.box;
      const dx = Math.max(x0 - bounds.minX, Math.min(x1 - bounds.maxX, point.x - g.origin.x)), dy = Math.max(y0 - bounds.minY, Math.min(y1 - bounds.maxY, point.y - g.origin.y));
      g.working = g.before.map(s => this.selected.has(s.id) ? { ...transformInk(s, (x, y) => [x + dx, y + dy]), page: s.page } : s);
    } else g.points.push(point);
    this.schedule();
  }
  private erase(point: Point): void {
    const g = this.gesture!; const scale = this.host.pdfViewer.getPageView(g.page)?.viewport.scale ?? 1;
    const result = eraseInk(g.working.filter(s => s.page === g.page), eraserOutline(point.x, point.y, this.tools.state.eraserSettings.radius / scale), this.tools.state.eraserSettings);
    if (result.changed) g.working = [...g.working.filter(s => s.page !== g.page), ...result.strokes.map(s => ({ ...s, page: g.page }))];
  }
  private up(event: PointerEvent, canceled = false): void {
    if (this.touches.delete(event.pointerId)) { this.consume(event); this.touchScale = this.touchDistance(); this.release(event.pointerId); return; }
    const g = this.gesture; if (!g || g.id !== event.pointerId) return;
    this.consume(event); this.gesture = null; this.release(event.pointerId);
    if (!canceled && g.before === this.session.document.strokes && !this.session.error) {
      if (this.tools.state.activeTool === "lasso" && !g.moving) {
        for (const stroke of g.working.filter(s => s.page === g.page)) if (selectRenderedStroke(stroke, this.polygon(g.points), this.tools.state.selectionSettings.partial)) this.selected.add(stroke.id);
      } else {
        const strokes = g.working.flatMap(s => { const clipped = s.page === g.page ? clipPdfInk(s, this.session.document.source.pages[s.page]!) : s; return clipped ? [clipped] : []; });
        if (JSON.stringify(strokes) !== JSON.stringify(g.before)) this.commit(strokes);
      }
    }
    this.schedule();
  }
  private polygon(points: Point[]): Point[] {
    if (this.tools.state.selectionSettings.mode !== "rectangle" || points.length < 2) return points;
    const a = points[0]!, b = points[points.length - 1]!; return [a, { x: b.x, y: a.y }, b, { x: a.x, y: b.y }];
  }
  private inkPoint(event: PointerEvent, point: Point): InkPoint { return { ...point, pressure: event.pressure || 0.5, tiltX: event.tiltX, tiltY: event.tiltY, time: event.timeStamp }; }
  private release(id: number): void { if (this.view.contentEl.hasPointerCapture?.(id)) this.view.contentEl.releasePointerCapture(id); }
  private cancel(): void { const g = this.gesture; this.gesture = null; if (g) this.release(g.id); this.schedule(); }
  private commit(strokes: PdfInk[]): void { void this.surface.save({ ...this.session.document, strokes }); this.selected.clear(); this.schedule(); }
  private scale(factor: number): void {
    const selected = this.session.document.strokes.filter(s => this.selected.has(s.id)); const bounds = boundsForStrokes(selected); if (!bounds || !Number.isFinite(factor) || factor <= 0) return;
    const cx = (bounds.minX + bounds.maxX) / 2, cy = (bounds.minY + bounds.maxY) / 2;
    const page = this.session.document.source.pages[this.selectedPage]!;
    const max = Math.min((page.box[2] - page.box[0]) / (bounds.maxX - bounds.minX || 1), (page.box[3] - page.box[1]) / (bounds.maxY - bounds.minY || 1));
    factor = Math.min(factor, max);
    const changed = selected.map(s => ({ ...transformInk(s, (x, y) => [cx + (x - cx) * factor, cy + (y - cy) * factor], factor), page: s.page }));
    const next = boundsForStrokes(changed)!;
    const dx = Math.max(page.box[0] - next.minX, Math.min(0, page.box[2] - next.maxX)), dy = Math.max(page.box[1] - next.minY, Math.min(0, page.box[3] - next.maxY));
    const moved = new Map(changed.map(s => [s.id, { ...transformInk(s, (x, y) => [x + dx, y + dy]), page: s.page }]));
    this.commit(this.session.document.strokes.map(s => moved.get(s.id) ?? s));
  }
}
