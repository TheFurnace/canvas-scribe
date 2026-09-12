import polygonClipping from "polygon-clipping";
import { isPenType } from "./pen-types";
import { isHighlighterType } from "./highlighter-types";
import { parseHex } from "./colors";
import { strokeOutline } from "./ink-operations";
import { cloneStrokes, type InkStroke } from "./types";

export const PDF_COMPANION_ROOT = "Scribe PDF annotations";
export interface PdfPageMetadata { box: [number, number, number, number]; rotation: number; }
export interface PdfSource { path: string; fingerprint: string; pages: PdfPageMetadata[]; }
export interface PdfInk extends InkStroke { page: number; }
export interface PdfCompanion {
  format: "canvas-scribe-pdf"; version: 1; id: string; revision: number;
  source: PdfSource; strokes: PdfInk[];
}
export function newPdfCompanion(source: PdfSource): PdfCompanion {
  return { format: "canvas-scribe-pdf", version: 1, id: crypto.randomUUID(), revision: 0, source: structuredClone(source), strokes: [] };
}
export function clonePdfInk(strokes: readonly PdfInk[]): PdfInk[] { return cloneStrokes(strokes) as PdfInk[]; }
export function serializePdfCompanion(document: PdfCompanion): string { return JSON.stringify(document, null, 2) + "\n"; }
const finite = (x: unknown): x is number => typeof x === "number" && Number.isFinite(x);
const record = (x: unknown): x is Record<string, unknown> => !!x && typeof x === "object" && !Array.isArray(x);
export function parsePdfCompanion(raw: string): PdfCompanion {
  const x: unknown = JSON.parse(raw);
  const fail = (): never => { throw new Error("Unsupported or damaged PDF companion. The file is preserved unchanged."); };
  if (!record(x) || x.format !== "canvas-scribe-pdf" || x.version !== 1 || typeof x.id !== "string" || !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(x.id)
    || !Number.isSafeInteger(x.revision) || Number(x.revision) < 0 || !record(x.source) || typeof x.source.path !== "string"
    || typeof x.source.fingerprint !== "string" || !/^[a-f0-9]{64}$/.test(x.source.fingerprint)
    || !Array.isArray(x.source.pages) || !x.source.pages.length || !Array.isArray(x.strokes)) return fail();
  const pages = x.source.pages;
  for (const p of pages) if (!record(p) || !Array.isArray(p.box) || p.box.length !== 4 || !p.box.every(finite)
    || p.box[2] <= p.box[0] || p.box[3] <= p.box[1] || !finite(p.rotation) || p.rotation % 90 !== 0) return fail();
  const ids = new Set<string>();
  for (const s of x.strokes) {
    if (!record(s) || typeof s.id !== "string" || !s.id || ids.has(s.id) || !Number.isInteger(s.page) || Number(s.page) < 0 || Number(s.page) >= pages.length
      || (s.tool !== "pen" && s.tool !== "highlighter") || (s.penType !== undefined && !isPenType(s.penType))
      || (s.highlighterType !== undefined && !isHighlighterType(s.highlighterType)) || typeof s.color !== "string" || !parseHex(s.color)
      || !finite(s.size) || s.size <= 0 || !finite(s.opacity) || s.opacity < 0 || s.opacity > 1 || !finite(s.createdAt)
      || typeof s.hasPressure !== "boolean" || !Array.isArray(s.points) || !s.points.length) return fail();
    for (const p of s.points) if (!record(p) || !finite(p.x) || !finite(p.y) || !finite(p.time) || !finite(p.pressure) || p.pressure < 0 || p.pressure > 1
      || (p.tiltX !== undefined && !finite(p.tiltX)) || (p.tiltY !== undefined && !finite(p.tiltY))) return fail();
    if (s.outline !== undefined && (!Array.isArray(s.outline) || !s.outline.every(poly => Array.isArray(poly) && poly.length > 0 && poly.every(ring => Array.isArray(ring) && ring.length >= 3 && ring.every(p => Array.isArray(p) && p.length === 2 && p.every(finite)))))) return fail();
    ids.add(s.id);
  }
  return x as unknown as PdfCompanion;
}
export async function pdfFingerprint(bytes: ArrayBuffer | Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new Uint8Array(bytes instanceof ArrayBuffer ? bytes : bytes.slice()));
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, "0")).join("");
}
/** Freeze only boundary-crossing outlines; page coordinates are unrotated PDF user space. */
export function clipPdfInk(stroke: PdfInk, page: PdfPageMetadata): PdfInk | null {
  const [x0, y0, x1, y1] = page.box;
  const outline = strokeOutline(stroke);
  const inside = outline.every(poly => poly.every(ring => ring.every(([x, y]) => x >= x0 && x <= x1 && y >= y0 && y <= y1)));
  if (inside) return stroke;
  const clipped = polygonClipping.intersection(outline, [[[x0, y0], [x1, y0], [x1, y1], [x0, y1]]]);
  return clipped.length ? { ...stroke, outline: clipped } : null;
}
export function samePdfPages(a: PdfPageMetadata[], b: PdfPageMetadata[]): boolean { return JSON.stringify(a) === JSON.stringify(b); }
