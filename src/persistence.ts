import type { App, TFile, View } from "obsidian";
import { clampPenSize, isPenType } from "./pen-types";

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
    canvas.data[CANVAS_INK_KEY] = normalizeInkData(data);
    canvas.requestSave(false);
    await canvasView.saveImmediately?.();
    return;
  }

  await app.vault.process(file, (raw) => {
    const document = parseCanvasDocument(raw);
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
  if (!isRecord(value) || !Array.isArray(value.strokes)) return createEmptyInkData();
  return {
    version: CANVAS_INK_VERSION,
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
    id: typeof value.id === "string" ? value.id : crypto.randomUUID(),
    tool,
    ...(tool === "pen" && isPenType(value.penType) ? { penType: value.penType } : {}),
    color: typeof value.color === "string" ? value.color : tool === "pen" ? "#1f2937" : "#fde047",
    size: finitePositive(value.size, tool === "pen" ? 3.5 : 16),
    opacity: finiteRange(value.opacity, 0, 1, tool === "pen" ? 1 : 0.35),
    points,
    hasPressure: value.hasPressure === true,
    createdAt: finitePositive(value.createdAt, Date.now()),
  };
}

function normalizePoint(value: unknown): InkPoint | null {
  if (!isRecord(value) || !isFiniteNumber(value.x) || !isFiniteNumber(value.y)) return null;
  const point: InkPoint = {
    x: value.x,
    y: value.y,
    pressure: finiteRange(value.pressure, 0, 1, 0.5),
    time: isFiniteNumber(value.time) ? value.time : 0,
  };
  if (isFiniteNumber(value.tiltX)) point.tiltX = value.tiltX;
  if (isFiniteNumber(value.tiltY)) point.tiltY = value.tiltY;
  return point;
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
