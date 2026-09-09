import type { App } from "obsidian";
import type { CanvasTarget } from "./canvas-target";
import type { CanvasInkData } from "./types";
import { loadInkData, saveInkData } from "./persistence";

export interface SurfaceTransform { screenToCanvas: DOMMatrix; screenScale: number; }
export interface InkSurfaceAdapter<TDocument> {
  load(): Promise<TDocument>;
  save(document: TDocument): Promise<void>;
  transform(svg: SVGSVGElement | null): SurfaceTransform | null;
}

/** Canvas owns its navigation and saves; other surfaces supply their own adapters. */
export class CanvasInkSurface implements InkSurfaceAdapter<CanvasInkData> {
  constructor(private readonly app: App, private readonly target: CanvasTarget) {}
  load(): Promise<CanvasInkData> { return loadInkData(this.app, this.target.file); }
  save(data: CanvasInkData): Promise<void> { return saveInkData(this.app, this.target.file, data, this.target.view); }
  transform(svg: SVGSVGElement | null): SurfaceTransform | null {
    const matrix = svg?.getScreenCTM(); if (!matrix) return null;
    const screenScale = Math.max(Math.hypot(matrix.a, matrix.b), Math.hypot(matrix.c, matrix.d));
    if (!Number.isFinite(screenScale) || screenScale <= 0) return null;
    try {
      const screenToCanvas = matrix.inverse();
      return [screenToCanvas.a, screenToCanvas.b, screenToCanvas.c, screenToCanvas.d, screenToCanvas.e, screenToCanvas.f].every(Number.isFinite)
        ? { screenToCanvas, screenScale } : null;
    } catch { return null; }
  }
}
