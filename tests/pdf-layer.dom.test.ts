// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { PdfLayer } from "../src/pdf-layer";
import { PdfSession, type PdfStore } from "../src/pdf-store";
import { newPdfCompanion, type PdfInk } from "../src/pdf-document";
import { FavoritePens } from "../src/favorite-pens";
import type { NativePdfHost, NativePdfView } from "../src/pdf-native";
import * as geometry from "../src/geometry";
import * as pdf from "../src/pdf-document";

afterEach(() => { document.body.replaceChildren(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
function fixture() {
  let pending: FrameRequestCallback | undefined;
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => { pending = callback; return 1; }); vi.stubGlobal("cancelAnimationFrame", () => { pending = undefined; });
  const frame = () => { const callback = pending; pending = undefined; callback?.(0); };
  const content = document.createElement("div"), viewer = document.createElement("div"), page = document.createElement("div");
  viewer.className = "pdfViewer"; page.className = "page"; page.dataset.pageNumber = "1"; viewer.append(page); content.append(viewer); document.body.append(content);
  const captured = new Set<number>(); content.setPointerCapture = id => { captured.add(id); }; content.hasPointerCapture = id => captured.has(id); content.releasePointerCapture = id => { captured.delete(id); };
  page.getBoundingClientRect = () => ({ left: 0, top: 0, right: 400, bottom: 600, x: 0, y: 0, width: 400, height: 600, toJSON: () => {} });
  const host = { pdfDocument: { numPages: 1 }, pdfViewer: { currentPageNumber: 1, container: viewer, getPageView: () => ({ div: page, viewport: { width: 400, height: 600, transform: [1, 0, 0, -1, 0, 600], viewBox: [0, 0, 400, 600], rotation: 0, scale: 1 } }) }, eventBus: { on: vi.fn(), off: vi.fn() } } as NativePdfHost;
  const session = new PdfSession(newPdfCompanion({ path: "source.pdf", fingerprint: "a".repeat(64), pages: [{ box: [0, 0, 400, 600], rotation: 0 }] }));
  const change = vi.fn((_session: PdfSession, strokes: PdfInk[]) => { session.document.strokes = strokes; session.notify(); });
  const store = { change, undo: vi.fn() } as unknown as PdfStore;
  const layer = new PdfLayer({ contentEl: content } as unknown as NativePdfView, host, session, store, new FavoritePens(), () => {});
  const input = (type: string, x: number, y: number, pointerType = "pen", pointerId = 1) => { const e = new PointerEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, pointerType, pointerId, pressure: 0.7 }); page.dispatchEvent(e); return e; };
  const enable = () => content.querySelector('[data-action="toggle"]')!.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
  return { content, page, viewer, session, host, change, layer, input, enable, frame };
}

function seed(count: number): PdfInk[] {
  return Array.from({ length: count }, (_, i) => ({ id: `seed-${i}`, page: 0, tool: "pen", penType: "fountain", color: "#123456", size: 3,
    opacity: 1, createdAt: 1, hasPressure: true, points: Array.from({ length: 80 }, (_, p) => ({ x: 20 + p, y: 200 + i % 100 + Math.sin(p), pressure: .5, time: p })) }));
}

it("isolates erasing by page and refreshes index before input after external replacement", () => {
  const f = fixture();
  f.session.document.source.pages.push({ box: [0, 0, 400, 600], rotation: 0 });
  const base = seed(1)[0]!;
  const strokes = [{ ...base, id: "other-page", page: 1 }, { ...base, id: "hit" }, { ...base, id: "remote", points: base.points.map(p => ({ ...p, x: p.x + 200 })) }];
  f.session.document.strokes = strokes; f.session.notify(); f.enable(); f.layer.setTool("eraser"); f.frame();
  f.input("pointerdown", 50, 400); f.input("pointerup", 50, 400);
  expect(f.session.document.strokes.map(s => s.id)).toEqual(["other-page", "remote"]);
  f.session.document.strokes = strokes; f.session.notify();
  // No frame between replacement and input: listener must already reconcile.
  f.input("pointerdown", 50, 400); f.input("pointerup", 50, 400);
  expect(f.session.document.strokes.map(s => s.id)).toEqual(["other-page", "remote"]);
  f.layer.destroy();
});

it("restricts lasso candidates to the active PDF page", () => {
  const f = fixture(), base = seed(1)[0]!;
  f.session.document.source.pages.push({ box: [0, 0, 400, 600], rotation: 0 });
  f.session.document.strokes = [{ ...base, id: "other-page", page: 1 }, { ...base, id: "selected" }];
  f.session.notify(); f.enable(); f.layer.setTool("lasso"); f.frame();
  f.input("pointerdown", 10, 380); f.input("pointermove", 120, 380); f.input("pointermove", 120, 420); f.input("pointermove", 10, 420); f.input("pointerup", 10, 380);
  expect([...(f.layer as unknown as { selected: Set<string> }).selected]).toEqual(["selected"]);
  f.layer.destroy();
});

it.each([0, 100, 500])("retains completed PDF paths and clips only new ink with %i strokes", count => {
  const f = fixture(); f.session.document.strokes = seed(count); f.enable(); f.frame();
  const existing = Array.from(f.page.querySelectorAll("path")), before = [...f.session.document.strokes];
  const geometrySpy = vi.spyOn(geometry, "strokeToSvgPath"), clip = vi.spyOn(pdf, "clipPdfInk");
  f.input("pointerdown", 150, 100); f.frame(); geometrySpy.mockClear();
  const rect = vi.spyOn(f.page, "getBoundingClientRect");
  for (let i = 0; i < 20; i++) f.input("pointermove", 150 + i, 100 + i);
  rect.mockClear(); f.frame();
  expect(geometrySpy).toHaveBeenCalledTimes(1); expect(rect).not.toHaveBeenCalled();
  expect(Array.from(f.page.querySelectorAll("path")).slice(0, count)).toEqual(existing);
  f.input("pointerup", 170, 120); f.frame();
  expect(clip).toHaveBeenCalledTimes(1);
  expect(f.session.document.strokes.slice(0, count).every((stroke, i) => stroke === before[i])).toBe(true);
  expect(existing.every(path => path.isConnected)).toBe(true);
  const last = f.session.document.strokes[count]!;
  expect(f.page.querySelectorAll("path")[count]!.getAttribute("d")).toBe(geometry.strokeToSvgPath(last, true));
  f.layer.destroy();
});

it("does not clip or commit an empty eraser gesture or a stationary selection", () => {
  const f = fixture(); f.session.document.strokes = seed(1); f.enable(); f.frame();
  const clip = vi.spyOn(pdf, "clipPdfInk");
  f.layer.setTool("eraser"); f.input("pointerdown", 350, 30); f.input("pointerup", 350, 30);
  expect(f.change).not.toHaveBeenCalled(); expect(clip).not.toHaveBeenCalled();
  // Select the seeded ink and press/release inside it without moving.
  f.layer.setTool("lasso");
  f.input("pointerdown", 5, 410); f.input("pointermove", 120, 410); f.input("pointermove", 120, 380); f.input("pointermove", 5, 380); f.input("pointerup", 5, 410);
  f.input("pointerdown", 50, 400); f.input("pointerup", 50, 400);
  expect(f.change).not.toHaveBeenCalled(); expect(clip).not.toHaveBeenCalled(); f.layer.destroy();
});

it("reconciles viewport changes and cancels pending live ink without stale paths", () => {
  const f = fixture(); f.session.document.strokes = seed(1); f.enable(); f.frame();
  const old = f.page.querySelector("path");
  f.input("pointerdown", 150, 100); f.frame(); f.input("pointermove", 180, 120);
  const on = f.host.eventBus.on as ReturnType<typeof vi.fn>;
  for (const [name, callback] of on.mock.calls) if (name === "rotationchanging") callback();
  f.frame(); expect(f.page.querySelectorAll("path")).toHaveLength(1); expect(f.page.querySelector("path")).toBe(old);
  f.input("pointerup", 180, 120); expect(f.change).not.toHaveBeenCalled();
  f.page.getBoundingClientRect = () => ({ top: 2000, bottom: 2600 } as DOMRect);
  for (const [name, callback] of on.mock.calls) if (name === "updateviewarea") callback();
  f.frame(); expect(f.page.querySelector("svg")).toBeNull();
  f.page.getBoundingClientRect = () => ({ top: 0, bottom: 600 } as DOMRect);
  for (const [name, callback] of on.mock.calls) if (name === "updateviewarea") callback();
  f.frame(); expect(f.page.querySelectorAll("path")).toHaveLength(1); f.layer.destroy();
});
describe("native PDF input ownership", () => {
  it("dismisses the radial with a pen contact without annotating and accepts the next stroke", () => {
    const f = fixture(); f.enable();
    f.page.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: 200, clientY: 200 }));
    expect(f.input("pointerdown", 40, 80).defaultPrevented).toBe(true);
    f.input("pointermove", 90, 120); f.input("pointerup", 90, 120);
    expect(document.querySelector('.canvas-scribe-radial-menu')).toBeNull(); expect(f.change).not.toHaveBeenCalled();
    f.input("pointerdown", 40, 80); f.input("pointermove", 90, 120); f.input("pointerup", 90, 120);
    expect(f.change).toHaveBeenCalledOnce(); f.layer.destroy();
  });
  it("passes the radial context action to the originating PDF page without recursion", () => {
    const f = fixture(), native = vi.fn();
    f.page.addEventListener("contextmenu", native);
    const event = new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: 80, clientY: 120 });
    f.page.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true); expect(native).not.toHaveBeenCalled();
    document.querySelector<HTMLButtonElement>('.canvas-scribe-radial-tabs [data-tab="1"]')!.click();
    document.querySelector<HTMLButtonElement>('[data-action="canvas-menu"]')!.click();
    expect(native).toHaveBeenCalledOnce();
    expect(native.mock.calls[0]![0]).toMatchObject({ clientX: 80, clientY: 120, target: f.page });
    expect(document.querySelector(".canvas-scribe-radial-menu")).toBeNull(); f.layer.destroy();
  });
  it("leaves reading and mouse input native, consumes only annotation pen gestures", () => {
    const f = fixture(); expect(f.input("pointerdown", 40, 80).defaultPrevented).toBe(false);
    f.enable(); expect(f.input("pointerdown", 40, 80, "mouse").defaultPrevented).toBe(false);
    expect(f.input("pointerdown", 40, 80).defaultPrevented).toBe(true); f.input("pointermove", 90, 120); f.input("pointerup", 90, 120);
    expect(f.change).toHaveBeenCalledOnce(); expect(f.session.document.strokes[0]!.points[0]).toMatchObject({ x: 40, y: 520 });
    expect(f.viewer.scrollTop).toBe(0); f.layer.destroy();
  });
  it("routes fingers to navigation without producing ink", () => {
    const f = fixture(); f.enable(); f.input("pointerdown", 40, 200, "touch"); f.input("pointermove", 40, 150, "touch"); f.input("pointerup", 40, 150, "touch");
    expect(f.viewer.scrollTop).toBe(50); expect(f.change).not.toHaveBeenCalled(); f.layer.destroy();
  });
  it("keeps partial ink on cancellation without reviving a superseded document", () => {
    const f = fixture(); f.enable(); f.input("pointerdown", 40, 80); f.input("pointermove", 90, 120); f.input("pointercancel", 90, 120);
    expect(f.change).toHaveBeenCalledOnce(); expect(f.session.document.strokes[0]?.points).toHaveLength(2); f.change.mockClear();
    f.input("pointerdown", 40, 80); f.session.document.strokes = []; f.session.notify(); f.input("pointerup", 90, 120); expect(f.change).not.toHaveBeenCalled(); f.layer.destroy();
  });
  it("blocks drawing after a source or companion conflict", () => {
    const f = fixture(); f.enable(); f.session.error = "Source changed"; expect(f.input("pointerdown", 40, 80).defaultPrevented).toBe(false); expect(f.change).not.toHaveBeenCalled(); f.layer.destroy();
  });
});
