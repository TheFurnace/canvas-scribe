// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { PdfLayer } from "../src/pdf-layer";
import { PdfSession, type PdfStore } from "../src/pdf-store";
import { newPdfCompanion, type PdfInk } from "../src/pdf-document";
import { FavoritePens } from "../src/favorite-pens";
import type { NativePdfHost, NativePdfView } from "../src/pdf-native";

afterEach(() => { document.body.replaceChildren(); vi.unstubAllGlobals(); });
function fixture() {
  vi.stubGlobal("requestAnimationFrame", () => 1); vi.stubGlobal("cancelAnimationFrame", () => {});
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
  return { content, page, viewer, session, host, change, layer, input, enable };
}
describe("native PDF input ownership", () => {
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
  it("discards canceled gestures and gestures superseded by another view", () => {
    const f = fixture(); f.enable(); f.input("pointerdown", 40, 80); f.input("pointermove", 90, 120); f.input("pointercancel", 90, 120); expect(f.change).not.toHaveBeenCalled();
    f.input("pointerdown", 40, 80); f.session.document.strokes = []; f.session.notify(); f.input("pointerup", 90, 120); expect(f.change).not.toHaveBeenCalled(); f.layer.destroy();
  });
  it("blocks drawing after a source or companion conflict", () => {
    const f = fixture(); f.enable(); f.session.error = "Source changed"; expect(f.input("pointerdown", 40, 80).defaultPrevented).toBe(false); expect(f.change).not.toHaveBeenCalled(); f.layer.destroy();
  });
});

