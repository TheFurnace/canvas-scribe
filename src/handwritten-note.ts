import type { InkStroke } from "./types";
import type { SelectionBounds } from "./selection";
import { strokeOutline } from "./ink-operations";
import { isPenType } from "./pen-types";
import { isHighlighterType } from "./highlighter-types";
import type { MultiPolygon } from "polygon-clipping";

export const HANDWRITTEN_NOTE_EXTENSION = "scribe";
export const HANDWRITTEN_NOTE_KIND = "canvas-scribe-handwritten-note" as const;
export const HANDWRITTEN_NOTE_VERSION = 1 as const;
export const DEFAULT_NOTE_WIDTH = 960;
export const DEFAULT_NOTE_HEIGHT = 1200;
export const NOTE_SPARE_HEIGHT = 640;

export interface HandwrittenTextObject {
  kind: "text";
  id: string;
  x: number;
  y: number;
  width: number;
  text: string;
  fontSize: number;
  color: string;
  align: "left" | "center" | "right";
}

export interface HandwrittenInkObject extends InkStroke { kind: "ink"; }
export type HandwrittenObject = HandwrittenInkObject | HandwrittenTextObject;

export interface HandwrittenNoteDocument {
  kind: typeof HANDWRITTEN_NOTE_KIND;
  version: typeof HANDWRITTEN_NOTE_VERSION;
  logicalWidth: number;
  contentHeight: number;
  viewport: { scrollTop: number; zoom: number };
  objects: HandwrittenObject[];
}

export class UnsupportedHandwrittenNoteError extends Error {}

export function createHandwrittenNote(): HandwrittenNoteDocument {
  return {
    kind: HANDWRITTEN_NOTE_KIND,
    version: HANDWRITTEN_NOTE_VERSION,
    logicalWidth: DEFAULT_NOTE_WIDTH,
    contentHeight: DEFAULT_NOTE_HEIGHT,
    viewport: { scrollTop: 0, zoom: 1 },
    objects: [],
  };
}

export function parseHandwrittenNote(raw: string): HandwrittenNoteDocument {
  let value: unknown;
  try { value = JSON.parse(raw); } catch { throw new Error("This file is not a valid Canvas Scribe handwritten note."); }
  if (!record(value) || value.kind !== HANDWRITTEN_NOTE_KIND) throw new Error("This file is not a Canvas Scribe handwritten note.");
  if (value.version !== HANDWRITTEN_NOTE_VERSION) throw new UnsupportedHandwrittenNoteError(`Canvas Scribe handwritten-note version ${String(value.version)} is not supported.`);
  const logicalWidth = finite(value.logicalWidth, 320, 4096);
  const contentHeight = finite(value.contentHeight, 320);
  if (!record(value.viewport) || !Array.isArray(value.objects)) throw new Error("The handwritten-note viewport or objects field is invalid.");
  const viewport = value.viewport;
  const objects = value.objects.map(parseObject);
  ensureUniqueIds(objects);
  return {
    kind: HANDWRITTEN_NOTE_KIND,
    version: HANDWRITTEN_NOTE_VERSION,
    logicalWidth,
    contentHeight: Math.max(contentHeight, contentBottom(objects)),
    viewport: {
      scrollTop: finite(viewport.scrollTop, 0),
      zoom: finite(viewport.zoom, 0.25, 4),
    },
    objects,
  };
}

export function serializeHandwrittenNote(note: HandwrittenNoteDocument): string {
  return `${JSON.stringify(note, null, 2)}\n`;
}

export function cloneHandwrittenObjects(objects: readonly HandwrittenObject[]): HandwrittenObject[] {
  return objects.map((object) => object.kind === "text" ? { ...object } : {
    ...object,
    points: object.points.map((point) => ({ ...point })),
    ...(object.outline ? { outline: object.outline.map((polygon) => polygon.map((ring) => ring.map(([x, y]) => [x, y] as [number, number]))) } : {}),
  });
}

export function createHandwrittenObjectId(prefix: "ink" | "text"): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}

export function contentBottom(objects: readonly HandwrittenObject[]): number {
  return objects.reduce((bottom, object) => Math.max(bottom, objectBounds(object).maxY), 0);
}

export function normalizeContentHeight(note: HandwrittenNoteDocument): void {
  note.contentHeight = Math.max(DEFAULT_NOTE_HEIGHT, Math.ceil(contentBottom(note.objects) + 160));
}

// Rendered text metrics are transient; the v1 document schema stores no height.
const textMetrics = new WeakMap<HandwrittenTextObject, { key: string; height: number }>();
function textMetricKey(object: HandwrittenTextObject): string { return JSON.stringify([object.text, object.width, object.fontSize]); }
export function measureTextHeight(object: HandwrittenTextObject, height: number): void {
  textMetrics.set(object, { key: textMetricKey(object), height });
}

export function objectBounds(object: HandwrittenObject): SelectionBounds {
  if (object.kind === "text") {
    const columns = Math.max(1, (object.width - 14) / (object.fontSize * .55));
    const lines = object.text.split("\n").reduce((sum, line) => sum + Math.max(1, Math.ceil(line.length / columns)), 0);
    const measured = textMetrics.get(object);
    const height = measured?.key === textMetricKey(object) ? measured.height : Math.max(48, lines * object.fontSize * 1.35 + 14);
    return { minX: object.x, minY: object.y, maxX: object.x + object.width, maxY: object.y + height };
  }
  const coordinates = strokeOutline(object).flatMap((polygon) => polygon.flatMap((ring) => ring));
  if (!coordinates.length) return { minX: 0, minY: 0, maxX: 0, maxY: 0 };
  return coordinates.reduce((bounds, [x, y]) => ({
    minX: Math.min(bounds.minX, x), minY: Math.min(bounds.minY, y),
    maxX: Math.max(bounds.maxX, x), maxY: Math.max(bounds.maxY, y),
  }), { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity });
}

export function boundsForObjects(objects: readonly HandwrittenObject[]): SelectionBounds | null {
  if (!objects.length) return null;
  return objects.map(objectBounds).reduce((all, bounds) => ({
    minX: Math.min(all.minX, bounds.minX), minY: Math.min(all.minY, bounds.minY),
    maxX: Math.max(all.maxX, bounds.maxX), maxY: Math.max(all.maxY, bounds.maxY),
  }));
}

export function translateHandwrittenObject(object: HandwrittenObject, dx: number, dy: number): HandwrittenObject {
  if (object.kind === "text") return { ...object, x: object.x + dx, y: object.y + dy };
  return {
    ...object,
    points: object.points.map((point) => ({ ...point, x: point.x + dx, y: point.y + dy })),
    ...(object.outline ? { outline: object.outline.map((polygon) => polygon.map((ring) => ring.map(([x, y]) => [x + dx, y + dy] as [number, number]))) } : {}),
  };
}

function parseObject(value: unknown): HandwrittenObject {
  if (!record(value) || (typeof value.id !== "string" || !value.id.length)) throw new Error("A handwritten-note object is invalid.");
  if (value.kind === "text") {
    if (value.align !== "left" && value.align !== "center" && value.align !== "right") throw new Error("A handwritten-note text alignment is invalid.");
    const align = value.align;
    return { kind: "text", id: value.id, x: finite(value.x), y: finite(value.y), width: finite(value.width, 80), text: string(value.text), fontSize: finite(value.fontSize, 10, 96), color: string(value.color), align };
  }
  if (value.kind !== "ink" || (value.tool !== "pen" && value.tool !== "highlighter") || !Array.isArray(value.points)) throw new Error("A handwritten-note ink object is invalid.");
  if (typeof value.hasPressure !== "boolean" || (value.penType !== undefined && !isPenType(value.penType)) || (value.highlighterType !== undefined && !isHighlighterType(value.highlighterType))) throw new Error("A handwritten-note ink style is invalid.");
  const outline = value.outline === undefined ? undefined : parseOutline(value.outline);
  return {
    kind: "ink",
    id: value.id,
    tool: value.tool,
    color: string(value.color),
    size: finite(value.size, .1, 512),
    opacity: finite(value.opacity, 0, 1),
    points: value.points.map((point) => {
      if (!record(point)) throw new Error("A handwritten-note ink point is invalid.");
      return { x: finite(point.x), y: finite(point.y), pressure: finite(point.pressure, 0, 1), time: finite(point.time, 0), ...(point.tiltX !== undefined ? { tiltX: finite(point.tiltX, -90, 90) } : {}), ...(point.tiltY !== undefined ? { tiltY: finite(point.tiltY, -90, 90) } : {}) };
    }),
    hasPressure: value.hasPressure === true,
    createdAt: finite(value.createdAt, 0),
    ...(isPenType(value.penType) ? { penType: value.penType } : {}),
    ...(isHighlighterType(value.highlighterType) ? { highlighterType: value.highlighterType } : {}),
    ...(outline ? { outline } : {}),
  };
}

function parseOutline(value: unknown): MultiPolygon {
  if (!Array.isArray(value)) throw new Error("A handwritten-note ink outline is invalid.");
  return value.map((polygon) => {
    if (!Array.isArray(polygon)) throw new Error("A handwritten-note ink outline is invalid.");
    return polygon.map((ring) => {
      if (!Array.isArray(ring)) throw new Error("A handwritten-note ink outline is invalid.");
      return ring.map((point) => {
        if (!Array.isArray(point) || point.length !== 2 || !point.every((coordinate) => typeof coordinate === "number" && Number.isFinite(coordinate))) throw new Error("A handwritten-note ink outline is invalid.");
        return [point[0], point[1]] as [number, number];
      });
    });
  });
}

function ensureUniqueIds(objects: readonly HandwrittenObject[]): void {
  if (new Set(objects.map(({ id }) => id)).size !== objects.length) throw new Error("Handwritten-note object IDs must be unique.");
}

function finite(value: unknown, min = -Infinity, max = Infinity): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < min || value > max) throw new Error("A handwritten-note numeric field is invalid.");
  return value;
}

function string(value: unknown): string {
  if (typeof value !== "string") throw new Error("A handwritten-note text field is invalid.");
  return value;
}

function record(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }
