import type { PenType } from "./pen-types";
import type { HighlighterType } from "./highlighter-types";
import type { MultiPolygon } from "polygon-clipping";

export const CANVAS_INK_KEY = "canvasScribe" as const;
export const CANVAS_INK_VERSION = 1 as const;

export type InkTool = "pen" | "highlighter";
export type DrawingTool = InkTool | "eraser" | "lasso";

export interface InkPoint {
  x: number;
  y: number;
  pressure: number;
  tiltX?: number;
  tiltY?: number;
  time: number;
}

export interface InkStroke {
  /** Frozen rendered geometry after an area cut; retains all original style metadata. */
  outline?: MultiPolygon;
  highlighterType?: HighlighterType;
  penType?: PenType;
  id: string;
  tool: InkTool;
  color: string;
  size: number;
  opacity: number;
  points: InkPoint[];
  hasPressure: boolean;
  createdAt: number;
}

export interface CanvasInkData {
  highlighterSettings?: { type: HighlighterType; size: number; opacity: number };
  penSettings?: { type: PenType; size: number };
  version: typeof CANVAS_INK_VERSION | 2;
  strokes: InkStroke[];
}

export type JsonCanvasDocument = Record<string, unknown> & {
  nodes?: unknown[];
  edges?: unknown[];
  [CANVAS_INK_KEY]?: CanvasInkData;
};

export function createEmptyInkData(): CanvasInkData {
  return { version: CANVAS_INK_VERSION, strokes: [] };
}

export function createStrokeId(): string {
  return `ink-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}

export function cloneStrokes(strokes: readonly InkStroke[]): InkStroke[] {
  return strokes.map((stroke) => ({
    ...stroke,
    ...(stroke.outline ? { outline: stroke.outline.map((polygon) => polygon.map((ring) => ring.map(([x, y]) => [x, y] as [number, number]))) } : {}),
    points: stroke.points.map((point) => ({ ...point })),
  }));
}
