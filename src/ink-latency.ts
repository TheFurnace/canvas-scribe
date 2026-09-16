import type { DebugData, DebugLogger } from "./debug-logger";
import type { InkPoint, InkStroke } from "./types";
import { DelegatedInkSession, type DelegatedInkTarget } from "./delegated-ink";

export const PREDICTION_HORIZONS = [0, 16, 24, 32] as const;
export type PredictionHorizon = typeof PREDICTION_HORIZONS[number];
const EXPIRY_MS = 40;
const MAX_DISTANCE_PX = 24;
type Position = { x: number; y: number };
type Sample = Position & { time: number };
type Project = (x: number, y: number) => Position | null;

/** Session-only experiment. Neither options nor predicted points enter document data. */
export class InkLatencyExperiment {
  horizonMs: PredictionHorizon = 0;
  get prediction(): boolean { return this.horizonMs !== 0; }
  diagnostics = false;
  delegated = false;
  constructor(private readonly logger?: DebugLogger) {}
  cyclePrediction(): PredictionHorizon {
    this.delegated = false;
    this.horizonMs = PREDICTION_HORIZONS[(PREDICTION_HORIZONS.indexOf(this.horizonMs) + 1) % PREDICTION_HORIZONS.length]!;
    return this.horizonMs;
  }
  toggleDelegated(): boolean {
    this.delegated = !this.delegated; this.horizonMs = 0;
    return this.delegated;
  }
  begin(document: Document, surface: "canvas" | "note", stroke: InkStroke, redraw: () => void, target?: DelegatedInkTarget): LiveInkSession | null {
    if (!this.prediction && !this.diagnostics && !this.delegated) return null;
    return new LiveInkSession(document.defaultView!, surface, stroke.penType ?? stroke.highlighterType ?? stroke.tool,
      this.delegated ? 0 : this.horizonMs, this.diagnostics ? this.logger : undefined, redraw,
      this.delegated && target ? new DelegatedInkSession(target, surface, stroke, redraw, this.logger) : undefined);
  }
}

/** Small bounded timing window, with whole-gesture count/mean/max. */
class Timing {
  private values: number[] = [];
  private count = 0;
  private total = 0;
  private min = Infinity;
  private max = -Infinity;
  constructor(private readonly unit: "Ms" | "CssPx" = "Ms", private readonly signed = false) {}
  add(value: number): void {
    if (!Number.isFinite(value) || (!this.signed && value < 0)) return;
    this.values[this.count++ % 256] = value;
    this.total += value; this.min = Math.min(this.min, value); this.max = Math.max(this.max, value);
  }
  write(data: DebugData, name: string): void {
    if (!this.count) return;
    const sorted = [...this.values].sort((a, b) => a - b);
    data[`${name}Count`] = this.count;
    data[`${name}Mean${this.unit}`] = round(this.total / this.count);
    data[`${name}Min${this.unit}`] = round(this.min);
    data[`${name}Max${this.unit}`] = round(this.max);
    data[`${name}RecentP95${this.unit}`] = round(sorted[Math.ceil(sorted.length * .95) - 1]!);
  }
}

export class LiveInkSession {
  private samples: Sample[] = [];
  private tip: Position | null = null;
  private source: "native" | "native-extended" | "fallback" | "none" = "none";
  private tipTime = 0;
  private tipHorizon = 0;
  private nativeHorizon = 0;
  private tipDistance = 0;
  private uncappedDistance = 0;
  private distanceScale = 1;
  private expiry: number | null = null;
  private ended = false;
  private newestTime: number | null = null;
  private pendingAt: number | null = null;
  private lastFrame: number | null = null;
  private events = 0;
  private frames = 0;
  private nativeFrames = 0;
  private nativeExtendedFrames = 0;
  private distanceCappedFrames = 0;
  private fallbackFrames = 0;
  private nativeAvailable = false;
  private invalidTimestamps = 0;
  private readonly inputAge = new Timing();
  private readonly oldestInputAge = new Timing();
  private readonly renderAge = new Timing();
  private readonly frameWait = new Timing();
  private readonly frameInterval = new Timing();
  private readonly renderWork = new Timing();
  private readonly selectedNativeHorizon = new Timing();
  private readonly predictionHorizon = new Timing();
  private readonly effectiveHorizonEstimate = new Timing();
  private readonly predictionLeadAtRender = new Timing("Ms", true);
  private readonly effectiveLeadAtRenderEstimate = new Timing("Ms", true);
  private readonly predictionDistance = new Timing("CssPx");
  private readonly uncappedPredictionDistance = new Timing("CssPx");

  constructor(private readonly view: Window, private readonly surface: string, private readonly tool: string,
    private readonly horizonMs: PredictionHorizon, private readonly logger: DebugLogger | undefined, private readonly redraw: () => void,
    private readonly delegated?: DelegatedInkSession) {}

  acceptActual(event: PointerEvent): void { this.delegated?.accept(event); }

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
    if (this.horizonMs === 0 || event.pointerType !== "pen") return;
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
    let dx = vx * this.horizonMs, dy = vy * this.horizonMs;
    this.tipHorizon = this.horizonMs; this.nativeHorizon = 0;
    this.source = "fallback";
    try {
      const predictions = native.getPredictedEvents?.() ?? [];
      let bestTime = latest.time;
      for (const p of predictions) {
        if (p.timeStamp > bestTime && p.timeStamp <= latest.time + this.horizonMs &&
          Number.isFinite(p.clientX) && Number.isFinite(p.clientY)) {
          const px = p.clientX - latest.x, py = p.clientY - latest.y;
          if (px * vx + py * vy <= 0) continue;
          dx = px; dy = py; bestTime = p.timeStamp; this.source = "native";
          this.nativeHorizon = this.tipHorizon = bestTime - latest.time;
        }
      }
    } catch { /* Some WebViews expose the method but cannot supply predictions. */ }
    // Preserve beta.15's 16 ms mode. Longer modes must not silently reuse a
    // shorter native endpoint unchanged: extend it with already-guarded velocity.
    if (this.horizonMs > 16 && this.source === "native" && this.tipHorizon < this.horizonMs) {
      const extra = this.horizonMs - this.tipHorizon;
      dx += vx * extra; dy += vy * extra;
      this.tipHorizon = this.horizonMs; this.source = "native-extended";
    }
    const distance = Math.hypot(dx, dy);
    const scale = Math.min(1, MAX_DISTANCE_PX / distance);
    this.tip = project(latest.x + dx * scale, latest.y + dy * scale);
    if (!this.tip || !Number.isFinite(this.tip.x) || !Number.isFinite(this.tip.y)) { this.tip = null; return; }
    this.tipTime = latest.time;
    this.tipDistance = distance * scale; this.uncappedDistance = distance; this.distanceScale = scale;
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
    this.delegated?.rendered();
    if (!this.logger) return;
    this.frames++;
    if (point) {
      if (this.source === "native" || this.source === "native-extended") {
        this.nativeFrames++; this.selectedNativeHorizon.add(this.nativeHorizon);
      }
      if (this.source === "native-extended") this.nativeExtendedFrames++;
      if (this.source === "fallback") this.fallbackFrames++;
      if (this.distanceScale < 1) this.distanceCappedFrames++;
      this.predictionHorizon.add(this.tipHorizon);
      this.effectiveHorizonEstimate.add(this.tipHorizon * this.distanceScale);
      this.predictionLeadAtRender.add(this.tipTime + this.tipHorizon - start);
      this.effectiveLeadAtRenderEstimate.add(this.tipTime + this.tipHorizon * this.distanceScale - start);
      this.predictionDistance.add(this.tipDistance); this.uncappedPredictionDistance.add(this.uncappedDistance);
    }
    if (this.newestTime !== null) this.renderAge.add(start - this.newestTime);
    if (this.pendingAt !== null) this.frameWait.add(start - this.pendingAt);
    if (this.lastFrame !== null) this.frameInterval.add(start - this.lastFrame);
    this.renderWork.add(this.view.performance.now() - start);
    this.lastFrame = start; this.pendingAt = null;
  }

  end(reason: string): void {
    if (this.ended) return;
    this.ended = true; this.clearExpiry(); this.tip = null; this.samples = [];
    this.delegated?.end(reason);
    if (!this.logger) return;
    const data: DebugData = { surface: this.surface, tool: this.tool, prediction: this.horizonMs !== 0, reason,
      events: this.events, frames: this.frames, nativeFrames: this.nativeFrames, fallbackFrames: this.fallbackFrames,
      nativeAvailable: this.nativeAvailable, invalidTimestamps: this.invalidTimestamps,
      nativeExtendedFrames: this.nativeExtendedFrames, distanceCappedFrames: this.distanceCappedFrames,
      delegated: !!this.delegated, horizonMs: this.horizonMs, maxDistanceCssPx: MAX_DISTANCE_PX, expiryMs: EXPIRY_MS,
      predictionScope: "Frame-weighted endpoint metrics, before smoothing/paint. Effective horizon/lead are linear distance-cap estimates; negative lead means behind render time.",
      timingScope: "JS input-to-SVG-update; excludes paint/display; recent p95 uses last 256 observations" };
    for (const [name, timing] of Object.entries({ inputAge: this.inputAge, oldestInputAge: this.oldestInputAge,
      renderAge: this.renderAge, frameWait: this.frameWait, activeRenderInterval: this.frameInterval, renderWork: this.renderWork,
      selectedNativeHorizon: this.selectedNativeHorizon, predictionHorizon: this.predictionHorizon,
      effectiveHorizonEstimate: this.effectiveHorizonEstimate, predictionLeadAtRender: this.predictionLeadAtRender,
      effectiveLeadAtRenderEstimate: this.effectiveLeadAtRenderEstimate, predictionDistance: this.predictionDistance,
      uncappedPredictionDistance: this.uncappedPredictionDistance })) timing.write(data, name);
    this.logger.record("ink-latency", "stroke", data);
  }

  private clearExpiry(): void { if (this.expiry !== null) this.view.clearTimeout(this.expiry); this.expiry = null; }
}

function round(value: number): number { return Math.round(value * 1000) / 1000; }
