import type { DebugData, DebugLogger } from "./debug-logger";
import type { InkPoint, InkStroke } from "./types";

const HORIZON_MS = 16;
const EXPIRY_MS = 40;
const MAX_DISTANCE_PX = 24;
type Position = { x: number; y: number };
type Sample = Position & { time: number };
type Project = (x: number, y: number) => Position | null;

/** Session-only experiment. Neither options nor predicted points enter document data. */
export class InkLatencyExperiment {
  prediction = false;
  diagnostics = false;
  constructor(private readonly logger?: DebugLogger) {}
  begin(document: Document, surface: "canvas" | "note", stroke: InkStroke, redraw: () => void): LiveInkSession | null {
    if (!this.prediction && !this.diagnostics) return null;
    return new LiveInkSession(document.defaultView!, surface, stroke.penType ?? stroke.highlighterType ?? stroke.tool,
      this.prediction, this.diagnostics ? this.logger : undefined, redraw);
  }
}

/** Small bounded timing window, with whole-gesture count/mean/max. */
class Timing {
  private values: number[] = [];
  private count = 0;
  private total = 0;
  private max = 0;
  add(value: number): void {
    if (!Number.isFinite(value) || value < 0) return;
    this.values[this.count++ % 256] = value;
    this.total += value; this.max = Math.max(this.max, value);
  }
  write(data: DebugData, name: string): void {
    if (!this.count) return;
    const sorted = [...this.values].sort((a, b) => a - b);
    data[`${name}MeanMs`] = round(this.total / this.count);
    data[`${name}MaxMs`] = round(this.max);
    data[`${name}RecentP95Ms`] = round(sorted[Math.ceil(sorted.length * .95) - 1]!);
  }
}

export class LiveInkSession {
  private samples: Sample[] = [];
  private tip: Position | null = null;
  private source: "native" | "fallback" | "none" = "none";
  private expiry: number | null = null;
  private ended = false;
  private newestTime: number | null = null;
  private pendingAt: number | null = null;
  private lastFrame: number | null = null;
  private events = 0;
  private frames = 0;
  private nativeFrames = 0;
  private fallbackFrames = 0;
  private nativeAvailable = false;
  private invalidTimestamps = 0;
  private readonly inputAge = new Timing();
  private readonly oldestInputAge = new Timing();
  private readonly renderAge = new Timing();
  private readonly frameWait = new Timing();
  private readonly frameInterval = new Timing();
  private readonly renderWork = new Timing();

  constructor(private readonly view: Window, private readonly surface: string, private readonly tool: string,
    private readonly prediction: boolean, private readonly logger: DebugLogger | undefined, private readonly redraw: () => void) {}

  observe(event: PointerEvent, actual: readonly PointerEvent[], project: Project): void {
    if (this.ended) return;
    const now = this.view.performance.now();
    const native = event as PointerEvent & { getPredictedEvents?: () => PointerEvent[] };
    this.nativeAvailable ||= typeof native.getPredictedEvents === "function";
    this.events++;
    this.pendingAt ??= now;
    this.clearExpiry(); this.tip = null; this.source = "none";
    let oldest = Infinity;
    // Coalesced samples can duplicate the dispatched event. Only strictly newer
    // timestamps contribute velocity; equal-time samples never create a spike.
    for (const sample of actual) {
      const time = sample.timeStamp;
      if (!Number.isFinite(time) || time <= 0 || time > now + 1 || now - time > 1000) {
        this.invalidTimestamps++; continue;
      }
      oldest = Math.min(oldest, time);
      this.newestTime = Math.max(this.newestTime ?? time, time);
      if (!Number.isFinite(sample.clientX) || !Number.isFinite(sample.clientY)) continue;
      if (time <= (this.samples[this.samples.length - 1]?.time ?? -Infinity)) continue;
      this.samples.push({ x: sample.clientX, y: sample.clientY, time });
      if (this.samples.length > 3) this.samples.shift();
    }
    if (this.logger) {
      if (this.newestTime !== null) this.inputAge.add(now - this.newestTime);
      this.oldestInputAge.add(now - oldest);
    }
    if (oldest === Infinity) { this.samples = []; return; }
    if (!this.prediction || event.pointerType !== "pen") return;
    const latest = this.samples[this.samples.length - 1], previous = this.samples[this.samples.length - 2], before = this.samples[this.samples.length - 3];
    if (!latest || !previous || !before || now - latest.time >= EXPIRY_MS) return;
    const dt = latest.time - previous.time, priorDt = previous.time - before.time;
    if (dt < 1 || dt > 32 || priorDt < 1 || priorDt > 32) return;
    const vx = (latest.x - previous.x) / dt, vy = (latest.y - previous.y) / dt;
    const ux = (previous.x - before.x) / priorDt, uy = (previous.y - before.y) / priorDt;
    const speed = Math.hypot(vx, vy), priorSpeed = Math.hypot(ux, uy);
    // Suppress extrapolation at stops, sudden speed changes, and sharp corners.
    if (speed < .08 || priorSpeed < .08 || speed / priorSpeed < .5 || speed / priorSpeed > 2 ||
      (vx * ux + vy * uy) / (speed * priorSpeed) < .85) return;
    let dx = vx * HORIZON_MS, dy = vy * HORIZON_MS;
    this.source = "fallback";
    try {
      const predictions = native.getPredictedEvents?.() ?? [];
      let bestTime = latest.time;
      for (const p of predictions) {
        if (p.timeStamp > bestTime && p.timeStamp <= latest.time + HORIZON_MS &&
          Number.isFinite(p.clientX) && Number.isFinite(p.clientY)) {
          const px = p.clientX - latest.x, py = p.clientY - latest.y;
          if (px * vx + py * vy <= 0) continue;
          dx = px; dy = py; bestTime = p.timeStamp; this.source = "native";
        }
      }
    } catch { /* Some WebViews expose the method but cannot supply predictions. */ }
    const distance = Math.hypot(dx, dy);
    const scale = Math.min(1, MAX_DISTANCE_PX / distance);
    this.tip = project(latest.x + dx * scale, latest.y + dy * scale);
    if (!this.tip || !Number.isFinite(this.tip.x) || !Number.isFinite(this.tip.y)) { this.tip = null; return; }
    // No new event is required to retract the tip when the pen stops in contact.
    this.expiry = this.view.setTimeout(() => {
      this.expiry = null; this.tip = null; this.source = "none";
      if (!this.ended) this.redraw();
    }, Math.max(0, EXPIRY_MS - (now - latest.time)));
  }

  render(stroke: InkStroke, draw: (preview: InkStroke) => void): void {
    if (this.ended) { draw(stroke); return; }
    const start = this.view.performance.now();
    const fresh = this.newestTime !== null && start - this.newestTime < EXPIRY_MS;
    const last = stroke.points[stroke.points.length - 1];
    // A temporary object and array, never a mutation of the stroke or its points.
    const point: InkPoint | null = this.tip && fresh && last ? { ...last, ...this.tip } : null;
    draw(point ? { ...stroke, points: [...stroke.points, point] } : stroke);
    if (!this.logger) return;
    this.frames++;
    if (point && this.source === "native") this.nativeFrames++;
    if (point && this.source === "fallback") this.fallbackFrames++;
    if (this.newestTime !== null) this.renderAge.add(start - this.newestTime);
    if (this.pendingAt !== null) this.frameWait.add(start - this.pendingAt);
    if (this.lastFrame !== null) this.frameInterval.add(start - this.lastFrame);
    this.renderWork.add(this.view.performance.now() - start);
    this.lastFrame = start; this.pendingAt = null;
  }

  end(reason: string): void {
    if (this.ended) return;
    this.ended = true; this.clearExpiry(); this.tip = null; this.samples = [];
    if (!this.logger) return;
    const data: DebugData = { surface: this.surface, tool: this.tool, prediction: this.prediction, reason,
      events: this.events, frames: this.frames, nativeFrames: this.nativeFrames, fallbackFrames: this.fallbackFrames,
      nativeAvailable: this.nativeAvailable, invalidTimestamps: this.invalidTimestamps,
      horizonMs: HORIZON_MS, maxDistanceCssPx: MAX_DISTANCE_PX, expiryMs: EXPIRY_MS,
      timingScope: "JS input-to-SVG-update; excludes paint/display; recent p95 uses last 256 observations" };
    for (const [name, timing] of Object.entries({ inputAge: this.inputAge, oldestInputAge: this.oldestInputAge,
      renderAge: this.renderAge, frameWait: this.frameWait, activeRenderInterval: this.frameInterval, renderWork: this.renderWork })) timing.write(data, name);
    this.logger.record("ink-latency", "stroke", data);
  }

  private clearExpiry(): void { if (this.expiry !== null) this.view.clearTimeout(this.expiry); this.expiry = null; }
}

function round(value: number): number { return Math.round(value * 1000) / 1000; }
