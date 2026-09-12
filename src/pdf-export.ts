import { PDFDocument, rgb, pushGraphicsState, popGraphicsState, concatTransformationMatrix } from "pdf-lib";
import { strokeToSvgPath } from "./geometry";
import { hexToRgb } from "./colors";
import { clipPdfInk, pdfFingerprint, samePdfPages, type PdfCompanion, type PdfSource } from "./pdf-document";

async function openPdf(bytes: ArrayBuffer | Uint8Array): Promise<PDFDocument> {
  let pdf: PDFDocument;
  try { pdf = await PDFDocument.load(bytes, { updateMetadata: false }); }
  catch (error) { if (error instanceof Error && /encrypted/i.test(error.message)) throw new Error("Encrypted/password-protected PDFs cannot be annotated or exported by Scribe. Reading remains available where supported by Obsidian."); throw error; }
  if (pdf.isEncrypted) throw new Error("Encrypted/password-protected PDFs cannot be annotated or exported by Scribe.");
  return pdf;
}
function pages(pdf: PDFDocument): PdfSource["pages"] {
  return pdf.getPages().map(page => {
    const crop = page.getCropBox(), media = page.getMediaBox();
    const x0 = Math.max(crop.x, media.x), y0 = Math.max(crop.y, media.y), x1 = Math.min(crop.x + crop.width, media.x + media.width), y1 = Math.min(crop.y + crop.height, media.y + media.height);
    const box: [number, number, number, number] = x1 > x0 && y1 > y0 ? [x0, y0, x1, y1] : [media.x, media.y, media.x + media.width, media.y + media.height];
    return { box, rotation: page.getRotation().angle };
  });
}
export async function describePdf(bytes: ArrayBuffer | Uint8Array, path: string): Promise<PdfSource> {
  const pdf = await openPdf(bytes);
  return { path, fingerprint: await pdfFingerprint(bytes), pages: pages(pdf) };
}
/** Add shared vector outlines to page content; pdf-lib's SVG y flip is canceled explicitly. */
export async function exportAnnotatedPdf(bytes: ArrayBuffer | Uint8Array, companion: PdfCompanion, signal?: AbortSignal): Promise<Uint8Array> {
  signal?.throwIfAborted();
  if (await pdfFingerprint(bytes) !== companion.source.fingerprint) throw new Error("The source PDF changed. Review its association before exporting.");
  const pdf = await openPdf(bytes);
  if (!samePdfPages(pages(pdf), companion.source.pages)) throw new Error("PDF page geometry changed. The export was canceled.");
  for (let index = 0; index < pdf.getPageCount(); index++) {
    signal?.throwIfAborted();
    const page = pdf.getPage(index);
    // Keep original page content, annotations, text, links, and rotation dictionaries intact.
    for (const original of companion.strokes.filter(s => s.page === index)) {
      const stroke = clipPdfInk(original, companion.source.pages[index]!); if (!stroke) continue;
      const [r, g, b] = hexToRgb(stroke.color).map(c => c / 255);
      page.pushOperators(pushGraphicsState(), concatTransformationMatrix(1, 0, 0, -1, 0, 0));
      page.drawSvgPath(strokeToSvgPath(stroke), { color: rgb(r!, g!, b!), opacity: stroke.opacity });
      page.pushOperators(popGraphicsState());
    }
    // Yield between pages so cancellation/UI can be processed on mobile.
    await new Promise<void>(resolve => setTimeout(resolve, 0));
  }
  signal?.throwIfAborted();
  const result = await pdf.save(); signal?.throwIfAborted(); return result;
}
