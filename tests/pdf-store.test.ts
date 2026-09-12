import { describe, expect, it } from "vitest";
import type { App, TFile } from "obsidian";
import { PdfStore } from "../src/pdf-store";
import { newPdfCompanion, parsePdfCompanion, PDF_COMPANION_ROOT, pdfFingerprint, type PdfInk, type PdfSource } from "../src/pdf-document";

const stroke: PdfInk = { id: "ink", page: 0, tool: "pen", color: "#123456", size: 3, opacity: 1, points: [{ x: 10, y: 10, pressure: 0.5, time: 0 }], hasPressure: true, createdAt: 1 };
async function fixture() {
  const raw = new Map<string, string>(), binary = new Map<string, ArrayBuffer>(), files = new Map<string, TFile>();
  const add = (path: string) => { const file = { path, extension: path.split(".").pop() } as TFile; files.set(path, file); return file; };
  const bytes = new Uint8Array([1, 2, 3]).buffer; binary.set("input.pdf", bytes); add("input.pdf");
  const source: PdfSource = { path: "input.pdf", fingerprint: await pdfFingerprint(bytes), pages: [{ box: [0, 0, 400, 600], rotation: 0 }] };
  const app = { vault: {
    getFiles: () => [...files.values()].filter(f => f.extension), getAbstractFileByPath: (path: string) => files.get(path) ?? null,
    readBinary: async (file: TFile) => { const bytes = binary.get(file.path); if (!bytes) throw Error("missing"); return bytes; },
    read: async (file: TFile) => raw.get(file.path)!,
    createFolder: async (path: string) => { if (files.has(path)) throw Error("exists"); files.set(path, { path } as TFile); },
    create: async (path: string, data: string) => { if (files.has(path)) throw Error("exists"); raw.set(path, data); return add(path); },
    process: async (file: TFile, fn: (raw: string) => string) => { const next = fn(raw.get(file.path)!); raw.set(file.path, next); return next; },
    rename: async (file: TFile, path: string) => { if (files.has(path)) throw Error("exists"); const old = file.path; files.delete(old); file.path = path; files.set(path, file); if (raw.has(old)) { raw.set(path, raw.get(old)!); raw.delete(old); } },
  } } as unknown as App;
  return { app, raw, files, binary, add, bytes, source, store: new PdfStore(app) };
}
describe("PDF companion save ownership and recovery", () => {
  it("shares concurrent open views, creates on first ink, and keeps path stable across a source move", async () => {
    const f = await fixture(), [a, b] = await Promise.all([f.store.open(f.source), f.store.open(f.source)]);
    expect(a).toBe(b); expect(f.raw.size).toBe(0);
    f.store.change(a, [stroke]); await a.queue; const path = a.path;
    const file = f.files.get("input.pdf")!; f.files.delete(file.path); f.binary.delete(file.path); file.path = "other/renamed.pdf"; f.files.set(file.path, file); f.binary.set(file.path, f.bytes);
    f.store.rename(file, "input.pdf"); await a.queue;
    expect(a.path).toBe(path); expect(parsePdfCompanion(f.raw.get(path)!).source.path).toBe(file.path);
    expect(a.error).toBe("");
  });
  it("reconciles a unique offline move but never steals ink from a same-byte copy", async () => {
    const f = await fixture(); const a = await f.store.open(f.source); f.store.change(a, [stroke]); await a.queue;
    f.files.delete("input.pdf"); f.binary.delete("input.pdf"); f.add("moved.pdf"); f.binary.set("moved.pdf", f.bytes);
    const reopened = await new PdfStore(f.app).open({ ...f.source, path: "moved.pdf" });
    expect(reopened.document.strokes).toEqual([stroke]); expect(reopened.path).toBe(a.path);
    f.add("copy.pdf"); f.binary.set("copy.pdf", f.bytes);
    await expect(new PdfStore(f.app).open({ ...f.source, path: "copy.pdf" })).rejects.toThrow("same fingerprint");
  });
  it("preserves external conflict bytes and all local edits in a recovery version", async () => {
    const f = await fixture(), a = await f.store.open(f.source); f.store.change(a, [stroke]); await a.queue;
    const external = f.raw.get(a.path)! + " \n"; f.raw.set(a.path, external);
    const local = [stroke, { ...stroke, id: "second" }]; f.store.change(a, local); await a.queue;
    expect(f.raw.get(a.path)).toBe(external); expect(a.error).toContain("outside this editor");
    const recovery = [...f.raw.keys()].find(p => p.includes("-recovery-"))!;
    expect(parsePdfCompanion(f.raw.get(recovery)!).strokes).toEqual(local);
    await expect(new PdfStore(f.app).open(f.source)).rejects.toThrow("Multiple companion");
  });
  it("keeps replacement ink intact and requires explicit review", async () => {
    const f = await fixture(), a = await f.store.open(f.source); f.store.change(a, [stroke]); await a.queue;
    f.binary.set("input.pdf", new Uint8Array([8, 9]).buffer);
    const reopened = await new PdfStore(f.app).open({ ...f.source, fingerprint: await pdfFingerprint(f.binary.get("input.pdf")!) });
    expect(reopened.error).toContain("changed"); expect(reopened.document.strokes).toEqual([stroke]);
  });
  it("refuses damaged/future companions without rewriting them", async () => {
    const f = await fixture(), path = `${PDF_COMPANION_ROOT}/future.json`;
    const raw = JSON.stringify({ ...newPdfCompanion(f.source), version: 99 }); f.raw.set(path, raw); f.add(path);
    await expect(f.store.open(f.source)).rejects.toThrow("preserved"); expect(f.raw.get(path)).toBe(raw);
  });
  it("keeps separate documents for different PDFs with identical basenames", async () => {
    const f = await fixture(); f.add("other/input.pdf"); const bytes = new Uint8Array([4, 5, 6]).buffer; f.binary.set("other/input.pdf", bytes);
    const a = await f.store.open(f.source), b = await f.store.open({ ...f.source, path: "other/input.pdf", fingerprint: await pdfFingerprint(bytes) });
    f.store.change(a, [stroke]); await a.queue; f.store.change(b, [stroke]); await b.queue;
    expect(a.path).not.toBe(b.path); expect(f.raw.size).toBe(2);
  });
  it("serializes rapid edits and undo without a stale snapshot winning", async () => {
    const f = await fixture(), a = await f.store.open(f.source);
    f.store.change(a, [stroke]); f.store.change(a, [stroke, { ...stroke, id: "second" }]); f.store.undo(a); await a.queue;
    expect(parsePdfCompanion(f.raw.get(a.path)!).strokes).toEqual([stroke]); expect(a.error).toBe("");
  });
  it("shares unchanged immutable ink in history without retaining mutable caller objects", async () => {
    const f = await fixture(), a = await f.store.open(f.source), incoming = structuredClone(stroke);
    f.store.change(a, [incoming]); const first = a.document.strokes[0]!;
    incoming.points[0]!.x = 99; expect(first.points[0]!.x).toBe(10);
    f.store.change(a, [first, { ...stroke, id: "second" }]);
    expect(a.document.strokes[0]).toBe(first); expect(a.history.past[1]![0]).toBe(first); await a.queue;
  });
  it("archives conflicting versions only after explicit version selection", async () => {
    const f = await fixture(), a = await f.store.open(f.source); f.store.change(a, [stroke]); await a.queue;
    const conflictPath = `${PDF_COMPANION_ROOT}/conflict.json`; f.raw.set(conflictPath, f.raw.get(a.path)!); f.add(conflictPath);
    const entries = await f.store.entries(); await f.store.relink(entries.find(e => e.path === a.path)!, f.source);
    expect(f.raw.has(conflictPath)).toBe(false); expect([...f.raw.keys()].some(p => p.startsWith("Scribe PDF recovery/"))).toBe(true);
    expect(a.error).toBe(""); expect(parsePdfCompanion(f.raw.get(a.path)!).strokes).toEqual([stroke]);
  });
  it("finishes queued edits and rejects a stale review instead of losing those edits", async () => {
    const f = await fixture(), a = await f.store.open(f.source); f.store.change(a, [stroke]); await a.queue;
    const entry = (await f.store.entries())[0]!;
    const latest = [a.document.strokes[0]!, { ...stroke, id: "pending" }]; f.store.change(a, latest);
    await expect(f.store.relink(entry, f.source)).rejects.toThrow("changed during review");
    expect(parsePdfCompanion(f.raw.get(a.path)!).strokes).toEqual(latest); expect(a.reviewing).toBe(false);
  });
});

