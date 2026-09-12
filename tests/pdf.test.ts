import { describe, expect, it } from "vitest";
import { PDFDocument, PDFName, PDFString, StandardFonts, degrees } from "pdf-lib";
import { clipPdfInk, newPdfCompanion, parsePdfCompanion, serializePdfCompanion, type PdfInk } from "../src/pdf-document";
import { describePdf, exportAnnotatedPdf } from "../src/pdf-export";
import { pdfScreenPoint, type NativePdfPage } from "../src/pdf-native";
import { eraseInk, eraserOutline } from "../src/ink-operations";

export function ink(page = 0): PdfInk { return { id: "ink-1", page, tool: "pen", penType: "fountain", color: "#2563eb", size: 4, opacity: 0.8, hasPressure: true, createdAt: 1,
  points: [{ x: 50, y: 70, pressure: 0.5, time: 0 }, { x: 100, y: 90, pressure: 0.8, time: 10 }] }; }
async function sourcePdf() {
  const pdf = await PDFDocument.create(), font = await pdf.embedFont(StandardFonts.Helvetica);
  const page = pdf.addPage([400, 600]); page.setCropBox(20, 30, 350, 540); page.setRotation(degrees(90));
  page.drawText("Selectable original text", { x: 50, y: 300, font });
  page.node.set(PDFName.of("Annots"), pdf.context.obj([pdf.context.register(pdf.context.obj({ Type: "Annot", Subtype: "Link", Rect: [50, 200, 200, 220], A: { S: "URI", URI: PDFString.of("https://obsidian.md") } }))]));
  pdf.addPage([600, 800]); return pdf.save();
}
describe("PDF annotation document and export", () => {
  it("preserves page boxes, rotation, source streams, links, source bytes, and companion data", async () => {
    const bytes = await sourcePdf(), before = bytes.slice(), source = await describePdf(bytes, "input.pdf");
    const document = newPdfCompanion(source); document.strokes = [ink(), { ...ink(), id: "pencil", penType: "pencil" }, { ...ink(), id: "highlight", tool: "highlighter", highlighterType: "chisel", opacity: 0.38 }];
    const erased = eraseInk([ink()], eraserOutline(75, 80, 3), { mode: "area", highlighterOnly: false });
    document.strokes.push(...erased.strokes.map((s, i) => ({ ...s, id: `fragment-${i}`, page: 0 })));
    const raw = serializePdfCompanion(document), output = await exportAnnotatedPdf(bytes, document);
    const exported = await PDFDocument.load(output), original = await PDFDocument.load(bytes);
    expect(exported.getPageCount()).toBe(2);
    expect(exported.getPage(0).getCropBox()).toEqual(original.getPage(0).getCropBox());
    expect(exported.getPage(0).getRotation()).toEqual(original.getPage(0).getRotation());
    expect(exported.getPage(0).node.get(PDFName.of("Annots"))?.toString()).toBe(original.getPage(0).node.get(PDFName.of("Annots"))?.toString());
    for (const [ref, object] of original.context.enumerateIndirectObjects()) {
      if (object.constructor.name === "PDFRawStream") expect(exported.context.lookup(ref)?.toString()).toBe(object.toString());
    }
    expect(bytes).toEqual(before); expect(serializePdfCompanion(document)).toBe(raw);
    expect(parsePdfCompanion(raw)).toEqual(document);
  });
  it("rejects replaced sources and honors cancellation without modifying editable ink", async () => {
    const bytes = await sourcePdf(), document = newPdfCompanion(await describePdf(bytes, "input.pdf"));
    document.source.fingerprint = "0".repeat(64);
    await expect(exportAnnotatedPdf(bytes, document)).rejects.toThrow("changed");
    const controller = new AbortController(); controller.abort();
    await expect(exportAnnotatedPdf(bytes, document, controller.signal)).rejects.toThrow();
  });
  it("rejects future formats and malformed stroke metadata rather than normalizing", async () => {
    const document = newPdfCompanion(await describePdf(await sourcePdf(), "input.pdf")); document.strokes = [ink()];
    for (const change of [{ version: 2 }, { id: "../../outside-root" }, { strokes: [ink(), ink()] }, { strokes: [{ ...ink(), page: 8 }] }, { strokes: [{ ...ink(), color: "var(--text-normal)" }] }, { strokes: [{ ...ink(), outline: [[[ [NaN, 2] ]]] }] }])
      expect(() => parsePdfCompanion(JSON.stringify({ ...document, ...change }))).toThrow();
  });
  it("clips rendered ink at the page boundary without white-paint erasure", () => {
    const stroke = { ...ink(), points: [{ x: -20, y: 70, pressure: 0.5, time: 0 }, { x: 100, y: 90, pressure: 0.5, time: 1 }] };
    const clipped = clipPdfInk(stroke, { box: [0, 0, 80, 80], rotation: 0 });
    expect(clipped?.outline?.flat(2).every(([x, y]) => x >= 0 && x <= 80 && y >= 0 && y <= 80)).toBe(true);
    expect(stroke.points[0]!.x).toBe(-20);
  });
  it.each([
    [2, 0, 0, -2, -40, 1140], [0, 2, 2, 0, -60, -40], [-2, 0, 0, 2, 740, -60], [0, -2, -2, 0, 1140, 740],
  ])("inverts crop/rotation and CSS scaling for transform %j", (...transform) => {
    const [a, b, c, d, e, f] = transform as [number, number, number, number, number, number];
    const px = a * 100 + c * 120 + e, py = b * 100 + d * 120 + f;
    const page = { div: { getBoundingClientRect: () => ({ left: 100, top: 60, width: 350, height: 540 }) }, viewport: { width: 700, height: 1080, transform } } as unknown as NativePdfPage;
    expect(pdfScreenPoint(page, 100 + px / 2, 60 + py / 2)).toEqual({ x: 100, y: 120 });
  });
});
