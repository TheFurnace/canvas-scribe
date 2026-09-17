import { expect, it, vi } from "vitest";
import { InkLatencyExperiment, LiveInkSession, type PredictionHorizon } from "../src/ink-latency";
import { DebugLogger } from "../src/debug-logger";
import type { InkStroke } from "../src/types";

function setup(prediction = true, horizon: PredictionHorizon = 16) {
  let now = 100, timer = 0;
  const timers = new Map<number, () => void>();
  const view = { performance: { now: () => now }, setTimeout: (fn: () => void) => { timers.set(++timer, fn); return timer; }, clearTimeout: (id: number) => timers.delete(id) } as unknown as Window;
  const logger = new DebugLogger(), redraw = vi.fn();
  const session = new LiveInkSession(view, "canvas", "fountain", prediction ? horizon : 0, logger, redraw);
  const stroke: InkStroke = { id: "one", tool: "pen", penType: "fountain", size: 3, opacity: 1, color: "#000", createdAt: 1, hasPressure: true,
    points: [{ x: 0, y: 0, time: 80, pressure: .7, tiltX: 25 }, { x: 10, y: 0, time: 90, pressure: .7 }, { x: 20, y: 0, time: 100, pressure: .7, tiltX: 25 }] };
  const event = (time: number, x: number, y = 0) => ({ timeStamp: time, clientX: x, clientY: y, pointerType: "pen" }) as PointerEvent;
  const samples = [event(80, 0), event(90, 10), event(100, 20)];
  const project = (x: number, y: number) => ({ x, y });
  const render = () => { let result = stroke; session.render(stroke, s => { result = s; now += .2; }); return result; };
  return { session, stroke, samples, event, project, render, logger, timers, redraw, time: (value: number) => { now = value; } };
}

it("allocates no session when the experiment is off", () => {
  expect(new InkLatencyExperiment().begin({} as Document, "canvas", {} as InkStroke, vi.fn())).toBeNull();
});

it("predicts only in a temporary array and preserves pressure, tilt and original samples", () => {
  const f = setup(), original = structuredClone(f.stroke);
  f.session.observe(f.samples[2]!, f.samples, f.project);
  const preview = f.render();
  expect(preview).not.toBe(f.stroke);
  expect(preview.points[3]).toMatchObject({ x: 36, y: 0, pressure: .7, tiltX: 25 });
  expect(f.stroke).toEqual(original);
  expect(preview.points.slice(0, 3)).toEqual(original.points);
});

it("selects native predictions inside the horizon and projects the capped screen distance", () => {
  const f = setup(), e = f.samples[2]!;
  Object.assign(e, { getPredictedEvents: () => [f.event(112, 120), f.event(140, 300)] });
  f.session.observe(e, f.samples, (x, y) => ({ x: x / 2, y: y / 2 }));
  expect(f.render().points[3]!.x).toBe(22); // screen 20 + capped 24, at 2x zoom
  f.session.end("up");
  expect(f.logger.snapshot().entries[0]!.data).toMatchObject({ nativeFrames: 1, fallbackFrames: 0, nativeAvailable: true });
});

it("uses fallback if native prediction throws or is too far in the future", () => {
  for (const native of [() => { throw Error("unsupported"); }, () => [({ timeStamp: 150, clientX: 100, clientY: 0 })]]) {
    const f = setup(); Object.assign(f.samples[2]!, { getPredictedEvents: native });
    f.session.observe(f.samples[2]!, f.samples, f.project);
    expect(f.render().points[3]!.x).toBe(36);
  }
});

it("retracts on inactivity without another pointer event and on fresh stationary input", () => {
  const f = setup(); f.session.observe(f.samples[2]!, f.samples, f.project); f.render();
  const expire = [...f.timers.values()][0]!; f.time(140); expire();
  expect(f.redraw).toHaveBeenCalledOnce(); expect(f.render()).toBe(f.stroke);
  f.time(110); const stop = f.event(110, 20); f.session.observe(stop, [stop], f.project);
  expect(f.render()).toBe(f.stroke);
});

it("anchors only fresh predicted previews, never expired or ended strokes", () => {
  const f = setup(), draw = vi.fn();
  f.session.observe(f.samples[2]!, f.samples, f.project);
  f.session.render(f.stroke, draw);
  expect(draw.mock.calls[0]![1]).toBe(true);
  f.time(140); [...f.timers.values()][0]!();
  f.session.render(f.stroke, draw);
  expect(draw.mock.calls[1]).toEqual([f.stroke, false]);
  f.session.end("up"); f.session.render(f.stroke, draw);
  expect(draw.mock.calls[2]).toEqual([f.stroke]);
});

it.each([[20, 10], [0, 0], [100, 0]])("suppresses sharp turns, reversal and acceleration at %j,%j", (x, y) => {
  const f = setup(); f.session.observe(f.samples[2]!, f.samples, f.project);
  f.time(110); const e = f.event(110, x, y); f.session.observe(e, [e], f.project);
  expect(f.render()).toBe(f.stroke);
});

it("ignores duplicate timestamps and rejects stale or epoch timestamps", () => {
  const f = setup();
  f.session.observe(f.samples[2]!, [...f.samples, f.samples[2]!], f.project);
  expect(f.render().points[3]!.x).toBe(36);
  const g = setup(); const invalid = [g.event(Date.now(), 10), g.event(-5, 5)];
  g.session.observe(invalid[0]!, invalid, g.project);
  expect(g.render()).toBe(g.stroke);
  g.session.end("up"); expect(g.logger.snapshot().entries[0]!.data!.invalidTimestamps).toBe(2);
});

it("records timing without coordinates and keeps diagnostics-only rendering identical", () => {
  const f = setup(false); f.time(104); f.session.observe(f.samples[2]!, f.samples, f.project);
  f.time(112); expect(f.render()).toBe(f.stroke);
  f.session.end("up"); f.session.end("again");
  const entries = f.logger.snapshot().entries; expect(entries).toHaveLength(1);
  expect(entries[0]!.data).toMatchObject({ inputAgeMeanMs: 4, oldestInputAgeMeanMs: 24, renderAgeMeanMs: 12, frameWaitMeanMs: 8, renderWorkMeanMs: .2, prediction: false });
  expect(Object.keys(entries[0]!.data!).some(k => /client|pressure|tilt|points|^x$|^y$/.test(k))).toBe(false);
});

it("ends pending prediction on cancellation and cannot schedule later redraws", () => {
  const f = setup(); f.session.observe(f.samples[2]!, f.samples, f.project);
  const pending = [...f.timers.values()][0]!;
  f.session.end("cancel"); expect(f.timers.size).toBe(0);
  pending(); expect(f.redraw).not.toHaveBeenCalled();
  expect(f.render()).toBe(f.stroke);
});

it("cycles OFF / 16 / 24 / 32 / OFF and snapshots each gesture's mode", () => {
  const logger = new DebugLogger(), experiment = new InkLatencyExperiment(logger);
  experiment.diagnostics = true;
  expect(experiment.horizonMs).toBe(0);
  expect(experiment.prediction).toBe(false);
  expect(experiment.cyclePrediction()).toBe(16);
  const view = { performance: { now: () => 100 } } as unknown as Window;
  const session = experiment.begin({ defaultView: view } as Document, "canvas", setup().stroke, vi.fn())!;
  expect(experiment.cyclePrediction()).toBe(24);
  expect(experiment.cyclePrediction()).toBe(32);
  expect(experiment.cyclePrediction()).toBe(0);
  // This already-started session keeps its 16 ms setting even after mode changes.
  session.end("up"); expect(logger.snapshot().entries[0]!.data!.horizonMs).toBe(16);
  expect(new InkLatencyExperiment().horizonMs).toBe(0);
});

it.each([16, 24, 32] as const)("uses %i ms with fallback and reports uncapped endpoint horizon/distance", horizon => {
  const f = setup(true, horizon);
  const samples = [f.event(80, 0), f.event(90, 5), f.event(100, 10)];
  f.session.observe(samples[2]!, samples, f.project); f.time(112);
  expect(f.render().points[3]!.x).toBe(10 + horizon * .5);
  f.session.end("up");
  expect(f.logger.snapshot().entries[0]!.data).toMatchObject({ horizonMs: horizon, predictionHorizonMeanMs: horizon,
    effectiveHorizonEstimateMeanMs: horizon, predictionDistanceMeanCssPx: horizon * .5,
    predictionLeadAtRenderMeanMs: horizon - 12, effectiveLeadAtRenderEstimateMeanMs: horizon - 12,
    distanceCappedFrames: 0, nativeExtendedFrames: 0, fallbackFrames: 1 });
});

it.each([16, 24, 32] as const)("keeps 16 ms native behavior but extends short native input for %i ms", horizon => {
  const f = setup(true, horizon);
  const samples = [f.event(80, 0), f.event(90, 5), f.event(100, 10)];
  Object.assign(samples[2]!, { getPredictedEvents: () => [f.event(108, 14)] });
  f.session.observe(samples[2]!, samples, f.project); f.time(112);
  const used = horizon === 16 ? 8 : horizon;
  expect(f.render().points[3]!.x).toBe(10 + used * .5); f.session.end("up");
  expect(f.logger.snapshot().entries[0]!.data).toMatchObject({ horizonMs: horizon, selectedNativeHorizonMeanMs: 8,
    predictionHorizonMeanMs: used, predictionLeadAtRenderMeanMs: used - 12,
    predictionLeadAtRenderMaxMs: used - 12, // negative lead must not be clamped to zero
    nativeFrames: 1, nativeExtendedFrames: horizon === 16 ? 0 : 1, fallbackFrames: 0 });
});

it("reports distance-limited prediction honestly rather than claiming the configured horizon", () => {
  const f = setup(true, 32); f.session.observe(f.samples[2]!, f.samples, f.project); f.time(112);
  expect(f.render().points[3]!.x).toBe(44); f.session.end("up");
  expect(f.logger.snapshot().entries[0]!.data).toMatchObject({ horizonMs: 32, predictionHorizonMeanMs: 32,
    uncappedPredictionDistanceMeanCssPx: 32, predictionDistanceMeanCssPx: 24, effectiveHorizonEstimateMeanMs: 24,
    predictionLeadAtRenderMeanMs: 20, effectiveLeadAtRenderEstimateMeanMs: 12, distanceCappedFrames: 1 });
});

it("records no prediction metrics for diagnostics-only or stale preview frames", () => {
  for (const predicted of [true, false]) {
    const f = setup(predicted, 32); f.session.observe(f.samples[2]!, f.samples, f.project); f.time(141);
    expect(f.render()).toBe(f.stroke); f.session.end("up");
    expect(f.logger.snapshot().entries[0]!.data).not.toHaveProperty("predictionDistanceMeanCssPx");
    expect(f.logger.snapshot().entries[0]!.data!.nativeExtendedFrames).toBe(0);
  }
});

it("does not extend on a corner even when native predictions are available", () => {
  const f = setup(true, 32); f.session.observe(f.samples[2]!, f.samples, f.project); f.time(110);
  const e = f.event(110, 20, 10); Object.assign(e, { getPredictedEvents: () => [f.event(118, 20, 18)] });
  f.session.observe(e, [e], f.project); expect(f.render()).toBe(f.stroke);
});
