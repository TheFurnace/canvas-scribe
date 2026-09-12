import type { TFile, View } from "obsidian";

export interface NativePdfPage {
  div: HTMLElement;
  viewport: { width: number; height: number; transform: number[]; viewBox: number[]; scale: number; rotation: number };
}
export interface NativePdfHost {
  pdfDocument: { numPages: number };
  pdfViewer: { getPageView(index: number): NativePdfPage | undefined; currentPageNumber: number; container: HTMLElement };
  eventBus: { on(name: string, callback: () => void): void; off(name: string, callback: () => void): void };
}
export type NativePdfView = View & { file?: TFile; contentEl: HTMLElement; viewer?: { child?: { pdfViewer?: NativePdfHost } } };
/** The only private Obsidian/PDF.js access point. Fail closed without disturbing host reading. */
export function nativePdfHost(view: NativePdfView): NativePdfHost | null {
  const host = view.viewer?.child?.pdfViewer;
  return host && Number.isInteger(host.pdfDocument?.numPages) && typeof host.pdfViewer?.getPageView === "function"
    && host.pdfViewer.container && typeof host.eventBus?.on === "function" && typeof host.eventBus?.off === "function" ? host : null;
}
export function pdfScreenPoint(page: NativePdfPage, x: number, y: number): { x: number; y: number } | null {
  const box = page.div.getBoundingClientRect(), v = page.viewport;
  if (!box.width || !box.height || v.transform.length !== 6 || !v.transform.every(Number.isFinite)) return null;
  const [a, b, c, d, e, f] = v.transform as [number, number, number, number, number, number];
  const determinant = a * d - b * c; if (!determinant) return null;
  const px = (x - box.left) * v.width / box.width - e, py = (y - box.top) * v.height / box.height - f;
  return { x: (d * px - c * py) / determinant, y: (a * py - b * px) / determinant };
}
