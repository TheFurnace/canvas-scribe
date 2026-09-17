import type { DelegatedInkTarget } from "./delegated-ink";
import type { InkPoint } from "./types";

export const DELEGATED_DEBUG_COLOR = "#ff00ff";
export const DELEGATED_DEBUG_DIAMETER = 16;
const SVG_NS = "http://www.w3.org/2000/svg";

/** Temporary SVG markers in stroke coordinates. Magenta is NEVER drawn here. */
export class InkLatencyVisuals {
  private readonly group: SVGGElement;
  private readonly actual: SVGCircleElement;
  private readonly predicted: SVGCircleElement;
  private readonly extension: SVGLineElement;
  private ended = false;

  constructor(private readonly target: DelegatedInkTarget) {
    const doc = target.path.ownerDocument;
    this.group = doc.createElementNS(SVG_NS, "g");
    this.group.classList.add("canvas-scribe-latency-markers");
    this.group.setAttribute("pointer-events", "none");
    this.group.setAttribute("aria-hidden", "true");
    this.extension = doc.createElementNS(SVG_NS, "line");
    this.extension.setAttribute("stroke", "#ffea00");
    this.extension.setAttribute("stroke-linecap", "round");
    this.predicted = doc.createElementNS(SVG_NS, "circle");
    this.predicted.setAttribute("fill", "#ffea00");
    this.actual = doc.createElementNS(SVG_NS, "circle");
    this.actual.setAttribute("fill", "#00e5ff");
    for (const circle of [this.actual, this.predicted]) {
      circle.setAttribute("stroke", "#111111");
    }
    this.group.append(this.extension, this.predicted, this.actual);
    this.group.style.display = "none";
    target.path.parentElement?.append(this.group);
  }

  render(actual: InkPoint | undefined, predicted: InkPoint | null): void {
    if (this.ended) return;
    if (!this.target.path.isConnected) { this.end(); return; }
    const scale = this.target.screenScale;
    if (!actual || !Number.isFinite(scale) || scale <= 0) { this.group.style.display = "none"; return; }
    this.group.style.removeProperty("display");
    // The group's parent already has the same pan/zoom transform as the ink.
    // Divide by scale to keep the diagnostic sizes fixed in CSS pixels.
    this.actual.setAttribute("r", String(5 / scale));
    this.predicted.setAttribute("r", String(6 / scale));
    this.extension.setAttribute("stroke-width", String(8 / scale));
    for (const circle of [this.actual, this.predicted]) circle.setAttribute("stroke-width", String(1.5 / scale));
    this.position(this.actual, actual);
    this.extension.style.display = this.predicted.style.display = predicted ? "" : "none";
    if (predicted) {
      this.position(this.predicted, predicted);
      this.extension.setAttribute("x1", String(actual.x)); this.extension.setAttribute("y1", String(actual.y));
      this.extension.setAttribute("x2", String(predicted.x)); this.extension.setAttribute("y2", String(predicted.y));
    }
  }

  end(): void { this.ended = true; this.group.remove(); }

  private position(circle: SVGCircleElement, point: InkPoint): void {
    circle.setAttribute("cx", String(point.x)); circle.setAttribute("cy", String(point.y));
  }
}
