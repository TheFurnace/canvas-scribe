import type { App, TFile, View } from "obsidian";
import { clampPenSize, isPenType } from "./pen-types";
import { clampHighlighterSize, isHighlighterType } from "./highlighter-types";
import type { MultiPolygon } from "polygon-clipping";

import {
  CANVAS_INK_KEY,
  CANVAS_INK_VERSION,
  createEmptyInkData,
  type CanvasInkData,
  type InkPoint,
  type InkStroke,
  type JsonCanvasDocument,
} from "./types";

export async function loadInkData(app: App, file: TFile): Promise<CanvasInkData> {
  const document = parseCanvasDocument(await app.vault.read(file));
  return normalizeInkData(document[CANVAS_INK_KEY]);
}

type CanvasSaveView = View & {
  canvas?: {
    data?: JsonCanvasDocument;
    requestSave?: (pushHistory?: boolean) => void;
  };
  saveImmediately?: () => Promise<void> | void;
};

export async function saveInkData(app: App, file: TFile, data: CanvasInkData, view?: View): Promise<void> {
  const canvasView = view as CanvasSaveView | undefined;
  const canvas = canvasView?.canvas;
  if (canvas && isRecord(canvas.data) && typeof canvas.requestSave === "function") {
    assertCompatible(canvas.data[CANVAS_INK_KEY]);
    canvas.data[CANVAS_INK_KEY] = normalizeInkData(data);
    canvas.requestSave(false);
    await canvasView.saveImmediately?.();
    return;
  }

  await app.vault.process(file, (raw) => {
    const document = parseCanvasDocument(raw);
    assertCompatible(document[CANVAS_INK_KEY]);
    document[CANVAS_INK_KEY] = normalizeInkData(data);
    return `${JSON.stringify(document, null, "\t")}\n`;
  });
}

function parseCanvasDocument(raw: string): JsonCanvasDocument {
  const parsed: unknown = JSON.parse(raw || "{}");
  if (!isRecord(parsed)) throw new Error("Canvas file did not contain a JSON object.");
  return parsed;
}

function normalizeInkData(value: unknown): CanvasInkData {
  assertCompatible(value);
  if (!isRecord(value) || !Array.isArray(value.strokes)) return createEmptyInkData();
  return {
    ...value,
    version: value.version === 2 || value.highlighterSettings !== undefined || value.strokes.some((stroke) => isRecord(stroke) && (stroke.outline !== undefined || stroke.highlighterType !== undefined)) ? 2 : CANVAS_INK_VERSION,
    ...(isRecord(value.highlighterSettings) && isHighlighterType(value.highlighterSettings.type)
      ? { highlighterSettings: { type: value.highlighterSettings.type,
        size: clampHighlighterSize(Number(value.highlighterSettings.size)),
        opacity: finiteRange(value.highlighterSettings.opacity, 0.05, 0.8, 0.38) } } : {}),
    ...(isRecord(value.penSettings) && isPenType(value.penSettings.type)
      ? { penSettings: { type: value.penSettings.type, size: clampPenSize(Number(value.penSettings.size)) } } : {}),
    strokes: value.strokes.map(normalizeStroke).filter(isPresent),
  };
}

function normalizeStroke(value: unknown): InkStroke | null {
  if (!isRecord(value) || !Array.isArray(value.points)) return null;
  const points = value.points.map(normalizePoint).filter(isPresent);
  if (points.length === 0) return null;
  const tool = value.tool === "highlighter" ? "highlighter" : "pen";
  return {
    ...value,
    id: typeof value.id === "string" ? value.id : crypto.randomUUID(),
    tool,
    ...(value.outline !== undefined ? { outline: normalizeOutline(value.outline) } : {}),
    ...(tool === "highlighter" && isHighlighterType(value.highlighterType) ? { highlighterType: value.highlighterType } : {}),
    ...(tool === "pen" && isPenType(value.penType) ? { penType: value.penType } : {}),
    color: typeof value.color === "string" ? value.color : tool === "pen" ? "#1f2937" : "#fde047",
    size: finitePositive(value.size, tool === "pen" ? 3.5 : 16),
    opacity: finiteRange(value.opacity, 0, 1, tool === "pen" ? 1 : 0.35),
    points,
    hasPressure: value.hasPressure === true,
    createdAt: finitePositive(value.createdAt, Date.now()),
  };
}

function normalizeOutline(value: unknown): MultiPolygon {
  if (!Array.isArray(value) || !value.every((polygon) => Array.isArray(polygon) && polygon.length > 0 && polygon.every((ring) => Array.isArray(ring) && ring.length >= 3 && ring.every((point) => Array.isArray(point) && point.length === 2 && point.every(isFiniteNumber))))) {
    throw new Error("Unsupported or invalid area-erased ink geometry. The file was not modified.");
  }
  return value.map((polygon) => polygon.map((ring: [number, number][]) => ring.map(([x, y]) => [x, y] as [number, number])));
}

function normalizePoint(value: unknown): InkPoint | null {
  if (!isRecord(value) || !isFiniteNumber(value.x) || !isFiniteNumber(value.y)) return null;
  const point: InkPoint = {
    ...value,
    x: value.x,
    y: value.y,
    pressure: finiteRange(value.pressure, 0, 1, 0.5),
    time: isFiniteNumber(value.time) ? value.time : 0,
  };
  if (isFiniteNumber(value.tiltX)) point.tiltX = value.tiltX;
  if (isFiniteNumber(value.tiltY)) point.tiltY = value.tiltY;
  return point;
}

function assertCompatible(value: unknown): void {
  if (value === undefined || value === null) return;
  if (!isRecord(value) || (value.version !== undefined && value.version !== 1 && value.version !== 2)) {
    throw new Error("This Canvas uses an unsupported ink schema. It was not modified.");
  }
  if (!Array.isArray(value.strokes)) throw new Error("Invalid ink document. It was not modified.");
  if ((value.penSettings !== undefined && (!isRecord(value.penSettings) || !isPenType(value.penSettings.type)))
    || (value.highlighterSettings !== undefined && (!isRecord(value.highlighterSettings) || !isHighlighterType(value.highlighterSettings.type)))) {
    throw new Error("Unsupported ink tool settings. It was not modified.");
  }
  const ids = new Set<string>();
  for (const stroke of value.strokes) {
    if (!isRecord(stroke) || !Array.isArray(stroke.points) || !stroke.points.length
      || stroke.points.some((point) => !isRecord(point) || !isFiniteNumber(point.x) || !isFiniteNumber(point.y))) {
      throw new Error("Invalid ink stroke geometry. It was not modified.");
    }
    if (typeof stroke.id === "string") {
      if (ids.has(stroke.id)) throw new Error("Duplicate ink object IDs. It was not modified.");
      ids.add(stroke.id);
    }
    if ((stroke.tool !== undefined && stroke.tool !== "pen" && stroke.tool !== "highlighter")
      || (stroke.penType !== undefined && !isPenType(stroke.penType))
      || (stroke.highlighterType !== undefined && !isHighlighterType(stroke.highlighterType))) {
      throw new Error("This Canvas contains an unsupported ink tool. It was not modified.");
    }
    if (stroke.outline !== undefined) normalizeOutline(stroke.outline);
  }
}

function finitePositive(value: unknown, fallback: number): number {
  return isFiniteNumber(value) && value > 0 ? value : fallback;
}

function finiteRange(value: unknown, minimum: number, maximum: number, fallback: number): number {
  return isFiniteNumber(value) ? Math.min(maximum, Math.max(minimum, value)) : fallback;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isPresent<T>(value: T | null): value is T {
  return value !== null;
}
