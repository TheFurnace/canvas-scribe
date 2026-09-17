import type { DebugLogger } from "./debug-logger";
import { PEN_PROFILES, penPressure } from "./pen-types";
import type { InkPoint, InkStroke } from "./types";
import { DELEGATED_DEBUG_COLOR, DELEGATED_DEBUG_DIAMETER } from "./ink-latency-visuals";

export interface DelegatedInkTarget {
  area: HTMLElement;
  path: SVGPathElement;
  screenScale: number;
}
interface Presenter {
  updateInkTrailStartPoint(event: PointerEvent, style: { color: string; diameter: number }): void;
}
interface InkNavigator extends Navigator {
  ink?: { requestPresenter(options: { presentationArea: Element }): Promise<Presenter> };
}

/** Only the browser owns the temporary trail. No generated points enter the model. */
export class DelegatedInkSession {
  private presenter: Presenter | null = null;
  private event: PointerEvent | null = null;
  private point: InkPoint | null = null;
  private ended = false;
  private timer: number | null = null;
  private status = "requesting";
  private errorName = "";
  private updates = 0;
  private untrusted = 0;
  private stale = 0;
  private lastSubmitted = -Infinity;
  private color = "";
  private readonly started: number;
  private requestMs: number | null = null;
  private readonly view: Window;

  constructor(private readonly target: DelegatedInkTarget, private readonly surface: string,
    private readonly stroke: InkStroke, private readonly redraw: () => void, private readonly logger?: DebugLogger,
    private readonly visualDiagnostics = false) {
    this.view = target.area.ownerDocument.defaultView!;
    this.started = this.view.performance.now();
    if (stroke.tool !== "pen" || !stroke.penType || stroke.penType === "pencil" || stroke.opacity !== 1) {
      this.status = "unsupported-style"; return;
    }
    const ink = (this.view.navigator as InkNavigator).ink;
    if (!ink?.requestPresenter) { this.status = "unavailable"; return; }
    try {
      // Resolve theme variables in the actual surface/document, not the main window.
      this.color = visualDiagnostics ? DELEGATED_DEBUG_COLOR : this.view.getComputedStyle(target.path).fill;
      void Promise.resolve(ink.requestPresenter({ presentationArea: target.area })).then(presenter => {
        if (this.ended || !target.area.isConnected || !target.path.isConnected) return;
        this.requestMs = this.view.performance.now() - this.started;
        if (typeof presenter?.updateInkTrailStartPoint !== "function") { this.status = "invalid-presenter"; return; }
        this.presenter = presenter; this.status = "ready";
        this.redraw();
      }, error => { if (!this.ended) this.fail("request-failed", error); });
    } catch (error) { this.fail("request-failed", error); }
  }

  /** Called only when the surface accepts this real sample into the active stroke. */
  accept(event: PointerEvent): void {
    if (this.ended) return;
    this.event = event;
    this.point = this.stroke.points[this.stroke.points.length - 1] ?? null;
  }

  /** Submit only after SVG has been updated through the accepted sample. */
  rendered(): void {
    const event = this.event, last = this.stroke.points[this.stroke.points.length - 1];
    if (this.ended || !this.presenter || !event || !last) return;
    if (!this.target.area.isConnected || !this.target.path.isConnected) { this.end("detached"); return; }
    if (event.timeStamp <= this.lastSubmitted) return;
    if (!event.isTrusted) { this.untrusted++; this.event = null; return; }
    if (event.pointerType !== "pen" || !(event.buttons & 1) || last !== this.point) return;
    const age = this.view.performance.now() - event.timeStamp;
    if (!Number.isFinite(age) || age < -1 || age >= 40) { this.stale++; this.event = null; return; }
    const type = this.stroke.penType!;
    const thinning = PEN_PROFILES[type].thinning;
    const pressure = penPressure(type, last.pressure, this.stroke.hasPressure);
    const diameter = this.visualDiagnostics ? DELEGATED_DEBUG_DIAMETER :
      this.stroke.size * (1 - thinning + 2 * thinning * pressure) * this.target.screenScale;
    if (!Number.isFinite(diameter) || diameter <= 0) { this.status = "invalid-style"; this.presenter = null; return; }
    try {
      this.presenter.updateInkTrailStartPoint(event, { color: this.color, diameter });
      this.lastSubmitted = event.timeStamp; this.updates++;
      if (this.timer !== null) this.view.clearTimeout(this.timer);
      // The API has no clear/dispose method. Stop submitting and repaint actual
      // ink after inactivity; the browser owns trail expiry between frames.
      this.timer = this.view.setTimeout(() => {
        this.timer = null; this.event = null;
        if (!this.ended) this.redraw();
      }, Math.max(0, 40 - age));
    } catch (error) { this.fail("update-failed", error); }
  }

  end(reason: string): void {
    if (this.ended) return;
    this.ended = true;
    if (this.timer !== null) this.view.clearTimeout(this.timer);
    this.timer = null; this.presenter = null; this.event = null; this.point = null;
    this.logger?.record("ink-latency", "delegated_stroke", {
      surface: this.surface, tool: this.stroke.penType ?? this.stroke.tool, status: this.status,
      updates: this.updates, untrustedSkipped: this.untrusted, staleSkipped: this.stale,
      requestMs: this.requestMs, errorName: this.errorName, reason,
      visualDiagnostics: this.visualDiagnostics,
      diagnosticColor: this.visualDiagnostics ? DELEGATED_DEBUG_COLOR : null,
      diagnosticDiameterCssPx: this.visualDiagnostics ? DELEGATED_DEBUG_DIAMETER : null,
      scope: "Successful API calls only; visible delegated ink and physical latency are not measured. Round tip approximates pressure/taper; SVG smoothing unchanged.",
    });
  }

  private fail(status: string, error: unknown): void {
    this.status = status; this.presenter = null;
    // Do not copy arbitrary browser messages/URLs into diagnostics.
    this.errorName = error instanceof Error ? error.name.slice(0, 64) : "unknown";
  }
}
