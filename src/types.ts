export const CANVAS_INK_KEY = "canvasScribe" as const;
export const CANVAS_INK_VERSION = 1 as const;

export type DrawingTool = "pen" | "highlighter" | "eraser";

export interface InkPoint {
  x: number;
  y: number;
  pressure: number;
  tiltX?: number;
  tiltY?: number;
  time: number;
}

export interface InkStroke {
  id: string;
  tool: Exclude<DrawingTool, "eraser">;
  color: string;
  size: number;
  opacity: number;
  points: InkPoint[];
  hasPressure: boolean;
  createdAt: number;
}

export interface CanvasInkData {
  version: typeof CANVAS_INK_VERSION;
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
    points: stroke.points.map((point) => ({ ...point })),
  }));
}
