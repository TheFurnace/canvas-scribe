// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from "vitest";
import { DelegatedInkSession } from "../src/delegated-ink";
import { InkLatencyExperiment } from "../src/ink-latency";
import { DebugLogger } from "../src/debug-logger";
import type { InkStroke } from "../src/types";

afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); delete (navigator as unknown as { ink?: unknown }).ink; document.body.replaceChildren(); });
function setup(options: { unavailable?: boolean; delayed?: boolean; reject?: boolean; syncThrow?: boolean; updateThrow?: boolean; type?: InkStroke["penType"] } = {}) {
  vi.useFakeTimers();
  let now = 100.3;
  vi.spyOn(performance, "now").mockImplementation(() => now);
  const area = document.createElement("div");
  area.innerHTML = '<svg><path style="fill: rgb(20, 30, 40)"></path></svg>'; document.body.append(area);
  const path = area.querySelector("path")!;
  const stroke: InkStroke = { id: "test", tool: "pen", penType: options.type ?? "ballpoint", color: "var(--text-normal)", opacity: 1, size: 4,
    hasPressure: true, createdAt: 1, points: [{ x: 10, y: 20, pressure: .8, time: 100 }] };
  const update = vi.fn((_event: PointerEvent, _style: { color: string; diameter: number }) => { if (options.updateThrow) throw new TypeError("private message"); });
  const presenter = { updateInkTrailStartPoint: update };
  let resolve!: (p: typeof presenter) => void;
  const request = vi.fn(() => {
    if (options.syncThrow) throw new TypeError("private URL");
    if (options.reject) return Promise.reject(new TypeError("private URL"));
    if (options.delayed) return new Promise<typeof presenter>(r => { resolve = r; });
    return Promise.resolve(presenter);
  });
  if (!options.unavailable) Object.defineProperty(navigator, "ink", { configurable: true, value: { requestPresenter: request } });
  const logger = new DebugLogger(), redraw = vi.fn();
  const session = new DelegatedInkSession({ area, path, screenScale: 2 }, "canvas", stroke, redraw, logger);
  // Trusted-event doubles exercise our guard; the real-host test supplies native events.
  const event = { timeStamp: 100.3, pointerType: "pen", buttons: 1, isTrusted: true } as PointerEvent;
  session.accept(event);
  return { session, area, path, stroke, event, logger, redraw, request, update, resolve: () => resolve(presenter), time: (v: number) => { now = v; },
    data: () => logger.snapshot().entries[0]!.data! };
}

it("submits the exact trusted accepted event with resolved color and CSS-pixel width without changing ink", async () => {
  const f = setup(), original = structuredClone(f.stroke); await Promise.resolve(); f.session.rendered();
  expect(f.request).toHaveBeenCalledWith({ presentationArea: f.area });
  expect(f.update).toHaveBeenCalledWith(f.event, { color: "rgb(20, 30, 40)", diameter: 8 });
  f.session.rendered(); expect(f.update).toHaveBeenCalledOnce();
  expect(f.stroke).toEqual(original);
  f.session.end("up"); expect(f.data()).toMatchObject({ status: "ready", updates: 1 });
});

it("uses pressure-adjusted diameter for fountain and rejects a point not yet accepted", async () => {
  const f = setup({ type: "fountain" }); await Promise.resolve();
  f.stroke.points.push({ x: 20, y: 20, pressure: .6, time: 101 }); f.session.rendered(); expect(f.update).not.toHaveBeenCalled();
  f.session.accept(f.event); f.session.rendered();
  expect(f.update.mock.calls[0]![1].diameter).toBeCloseTo(8 * (.5 + Math.pow(.6, .8)));
});

it.each([{ unavailable: true }, { reject: true }, { syncThrow: true }, { updateThrow: true }])("falls back safely for API failure %j", async options => {
  const f = setup(options); await Promise.resolve(); f.session.rendered(); f.session.rendered(); f.session.end("up");
  expect(f.data().status).toBe(options.unavailable ? "unavailable" : options.updateThrow ? "update-failed" : "request-failed");
  expect(JSON.stringify(f.data())).not.toContain("private"); expect(f.data().updates).toBe(0);
});

it("does not revive an ended gesture after request resolution", async () => {
  const f = setup({ delayed: true }); f.session.end("cancel"); f.resolve(); await Promise.resolve();
  f.session.rendered(); expect(f.update).not.toHaveBeenCalled(); expect(f.redraw).not.toHaveBeenCalled();
});

it("does not revive a detached surface after request resolution", async () => {
  const f = setup({ delayed: true }); f.area.remove(); f.resolve(); await Promise.resolve();
  f.session.rendered(); expect(f.update).not.toHaveBeenCalled(); expect(f.redraw).not.toHaveBeenCalled(); f.session.end("dispose");
});

it("skips untrusted and stale samples", async () => {
  const f = setup(); await Promise.resolve(); f.session.accept({ ...f.event, isTrusted: false } as PointerEvent); f.session.rendered();
  f.session.accept(f.event); f.time(150); f.session.rendered(); f.session.end("up");
  expect(f.update).not.toHaveBeenCalled(); expect(f.data()).toMatchObject({ untrustedSkipped: 1, staleSkipped: 1 });
});

it("repaints after inactivity without resubmission and cancels expiry on end", async () => {
  const f = setup(); await Promise.resolve(); f.redraw.mockClear(); f.session.rendered();
  vi.advanceTimersByTime(40); expect(f.redraw).toHaveBeenCalledOnce(); f.session.rendered(); expect(f.update).toHaveBeenCalledOnce();
  f.session.accept({ ...f.event, timeStamp: 110 } as PointerEvent); f.time(110); f.session.rendered(); f.session.end("cancel");
  f.redraw.mockClear(); vi.advanceTimersByTime(100); expect(f.redraw).not.toHaveBeenCalled();
});

it("keeps pencil on ordinary rendering without requesting a presenter", async () => {
  const f = setup({ type: "pencil" }); await Promise.resolve(); f.session.rendered(); f.session.end("up");
  expect(f.request).not.toHaveBeenCalled(); expect(f.data().status).toBe("unsupported-style");
});

it("makes prediction and delegation mutually exclusive and defaults both off", () => {
  const experiment = new InkLatencyExperiment(); expect(experiment.delegated).toBe(false); expect(experiment.prediction).toBe(false);
  experiment.cyclePrediction(); expect(experiment.prediction).toBe(true);
  expect(experiment.toggleDelegated()).toBe(true); expect(experiment.prediction).toBe(false);
  experiment.cyclePrediction(); expect(experiment.delegated).toBe(false); expect(experiment.horizonMs).toBe(16);
});
