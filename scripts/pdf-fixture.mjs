import { PDFDocument, StandardFonts, rgb, degrees, PDFName, PDFString } from 'pdf-lib';
import { mkdir, writeFile } from 'node:fs/promises';
const pdf = await PDFDocument.create();
const font = await pdf.embedFont(StandardFonts.Helvetica);
const count = Number(process.argv[2] ?? 12);
if (!Number.isInteger(count) || count < 1 || count > 1000) throw new Error('Page count must be 1..1000');
for (let i = 0; i < count; i++) {
  const page = pdf.addPage(i % 2 ? [500, 700] : [612, 792]);
  if (i === 1) { page.setCropBox(30, 40, 430, 620); page.setRotation(degrees(90)); }
  if (i === 2) page.setRotation(degrees(180));
  page.drawText(`Scribe PDF fixture - page ${i + 1}`, { x: 60, y: 620, size: 22, font });
  for (let j = 0; j < 15; j++) page.drawText('Selectable source text. Draw, highlight, erase, and export.', { x: 60, y: 570 - j * 26, size: 12, font });
  page.drawRectangle({ x: 60, y: 100, width: 300, height: 45, borderWidth: 1, borderColor: rgb(0.3, 0.3, 0.8) });
  const link = pdf.context.obj({ Type: 'Annot', Subtype: 'Link', Rect: [60, 100, 360, 145], Border: [0, 0, 0], A: { Type: 'Action', S: 'URI', URI: PDFString.of('https://obsidian.md') } });
  page.node.set(PDFName.of('Annots'), pdf.context.obj([pdf.context.register(link)]));
}
const root = '.canvas-scribe-sandbox/vaults/pdf-lab';
await mkdir(root, { recursive: true });
await writeFile(`${root}/${process.argv[3] ?? 'PDF fixture.pdf'}`, await pdf.save());
