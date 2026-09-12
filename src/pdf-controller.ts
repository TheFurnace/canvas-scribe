import { Modal, Notice, type Plugin, type TFile } from "obsidian";
import type { FavoritePens } from "./favorite-pens";
import { createAction } from "./ui-controls";
import { describePdf, exportAnnotatedPdf } from "./pdf-export";
import { PdfLayer } from "./pdf-layer";
import { nativePdfHost, type NativePdfView, type NativePdfHost } from "./pdf-native";
import { PdfStore, type PdfSession } from "./pdf-store";
import { PDF_COMPANION_ROOT, samePdfPages, serializePdfCompanion } from "./pdf-document";

interface Attachment { view: NativePdfView; file: TFile; host: NativePdfHost; bar: HTMLElement; status: HTMLElement; layer?: PdfLayer; session?: PdfSession; abort: AbortController; }
export class PdfController {
  private readonly store: PdfStore;
  private readonly attachments = new Map<HTMLElement, Attachment>();
  private readonly unsupported = new Map<HTMLElement, HTMLElement>();
  constructor(private readonly plugin: Plugin, private readonly favorites: FavoritePens) {
    this.store = new PdfStore(plugin.app);
    plugin.registerEvent(plugin.app.workspace.on("layout-change", () => this.sync()));
    plugin.registerEvent(plugin.app.vault.on("rename", (file, oldPath) => { if ("extension" in file) this.store.rename(file as TFile, oldPath); for (const path of [file.path, oldPath]) if (path.startsWith(PDF_COMPANION_ROOT + "/")) this.store.companionChanged(path); this.sync(); }));
    plugin.registerEvent(plugin.app.vault.on("modify", file => { if ("extension" in file && typeof file.extension === "string" && file.extension.toLowerCase() === "pdf") this.store.invalidate(file.path); if (file.path.startsWith(PDF_COMPANION_ROOT + "/")) this.store.companionChanged(file.path); }));
    plugin.registerEvent(plugin.app.vault.on("create", file => { if (file.path.startsWith(PDF_COMPANION_ROOT + "/")) this.store.companionChanged(file.path); }));
    plugin.registerEvent(plugin.app.vault.on("delete", file => { this.store.invalidate(file.path); if (file.path.startsWith(PDF_COMPANION_ROOT + "/")) this.store.companionChanged(file.path); }));
    plugin.registerInterval(window.setInterval(() => this.sync(), 1000));
    plugin.app.workspace.onLayoutReady(() => this.sync());
  }
  destroy(): void { for (const attachment of this.attachments.values()) this.detach(attachment); this.attachments.clear(); for (const el of this.unsupported.values()) el.remove(); this.unsupported.clear(); }
  private detach(a: Attachment): void { a.abort.abort(); a.layer?.destroy(); a.bar.remove(); if (a.session) this.store.release(a.session); }
  private sync(): void {
    const live = new Set<HTMLElement>();
    for (const leaf of this.plugin.app.workspace.getLeavesOfType("pdf")) {
      const view = leaf.view as NativePdfView, file = view.file; if (!file) continue;
      live.add(view.containerEl);
      const host = nativePdfHost(view), old = this.attachments.get(view.containerEl);
      if (old && old.file === file && old.host === host) continue;
      if (old) { this.detach(old); this.attachments.delete(view.containerEl); }
      if (!host) {
        if (!this.unsupported.has(view.containerEl)) { const message = view.contentEl.createDiv({ cls: "canvas-scribe-pdf-status", text: "Scribe annotations: waiting for a supported PDF viewer. Reading remains available." }); this.unsupported.set(view.containerEl, message); }
        continue;
      }
      this.unsupported.get(view.containerEl)?.remove(); this.unsupported.delete(view.containerEl);
      const bar = view.contentEl.createDiv({ cls: "canvas-scribe-pdf-bar" }), status = bar.createSpan({ text: "Loading annotations…" }); status.setAttribute("role", "status");
      const a: Attachment = { view, file, host, bar, status, abort: new AbortController() }; this.attachments.set(view.containerEl, a);
      const actions = bar.createDiv({ cls: "canvas-scribe-pdf-actions" });
      actions.append(createAction(bar.ownerDocument, "Review / relink", () => void this.review(a)), createAction(bar.ownerDocument, "Export annotated PDF", () => void this.export(a)),
        createAction(bar.ownerDocument, "Download recovery", () => this.download(a)));
      void this.mount(a);
    }
    for (const [el, a] of this.attachments) if (!live.has(el)) { this.detach(a); this.attachments.delete(el); }
    for (const [el, message] of this.unsupported) if (!live.has(el)) { message.remove(); this.unsupported.delete(el); }
  }
  private async mount(a: Attachment): Promise<void> {
    try {
      const source = await describePdf(await this.plugin.app.vault.readBinary(a.file), a.file.path);
      const session = await this.store.open(source); if (a.abort.signal.aborted) return;
      a.session = session; a.layer?.destroy();
      a.layer = new PdfLayer(a.view, a.host, session, this.store, this.favorites, message => { a.status.textContent = message; });
    } catch (error) { if (!a.abort.signal.aborted) a.status.textContent = message(error); }
  }
  private download(a: Attachment): void {
    if (!a.session) { new Notice("No in-memory annotations to recover."); return; }
    const url = URL.createObjectURL(new Blob([serializePdfCompanion(a.session.document)], { type: "application/json" }));
    const link = a.bar.ownerDocument.createElement("a"); link.href = url; link.download = `${a.session.document.id}-recovery.json`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  private async review(a: Attachment): Promise<void> {
    try {
      if (a.session) await a.session.queue;
      const source = await describePdf(await this.plugin.app.vault.readBinary(a.file), a.file.path);
      const entries = await this.store.entries();
      const modal = new Modal(this.plugin.app); modal.titleEl.textContent = "Review PDF annotation association";
      modal.contentEl.createEl("p", { text: `Target: ${source.path}. Choose the annotation version to use. Other conflicting versions are preserved in Scribe PDF recovery/. Original PDFs stay unchanged.` });
      if (!entries.length) modal.contentEl.createEl("p", { text: "No saved companions. Close and reopen this PDF to retry. If a write failed, download in-memory recovery first." });
      for (const entry of entries) {
        const row = modal.contentEl.createDiv(); row.createEl("p", { text: `${entry.path} — ${entry.document.source.path} · ${entry.document.strokes.length} strokes · ${entry.document.source.pages.length} pages` });
        const sameBytes = entry.document.source.fingerprint === source.fingerprint, compatible = samePdfPages(entry.document.source.pages, source.pages);
        if (!compatible) { row.createEl("p", { text: "Page geometry differs. Automatic page remapping is unsupported; this companion remains preserved." }); continue; }
        const label = row.createEl("label"), check = label.createEl("input", { type: "checkbox" });
        label.appendText(sameBytes ? " Use this version and archive other conflicting versions." : " The PDF content changed. I reviewed the PDF and accept these marks at the same page numbers and coordinates; archive other conflicting versions.");
        const apply = createAction(row.ownerDocument, "Use this companion", () => void (async () => {
          apply.disabled = true;
          try { await this.store.relink(entry, source); modal.close(); await this.mount(a); }
          catch (error) { new Notice(message(error)); apply.disabled = false; }
        })()); apply.disabled = true; check.addEventListener("change", () => { apply.disabled = !check.checked; }); row.append(apply);
      }
      modal.open();
    } catch (error) { new Notice(message(error)); }
  }
  private async export(a: Attachment): Promise<void> {
    if (!a.session || a.session.error) { new Notice(a.session?.error || "Annotations are not ready to export."); return; }
    const modal = new Modal(this.plugin.app); modal.titleEl.textContent = "Export annotated PDF";
    const controller = new AbortController();
    modal.contentEl.createEl("p", { text: "Exporting all pages to a new file. Your original PDF and editable annotations remain unchanged." });
    modal.contentEl.append(createAction(modal.contentEl.ownerDocument, "Cancel", () => { controller.abort(); modal.close(); }));
    modal.onClose = () => controller.abort(); modal.open();
    try {
      await a.session.queue; if (a.session.error) throw new Error(a.session.error);
      const bytes = await this.plugin.app.vault.readBinary(a.file);
      const exported = await exportAnnotatedPdf(bytes, structuredClone(a.session.document), controller.signal);
      controller.signal.throwIfAborted();
      const folder = a.file.parent?.path === "/" ? "" : a.file.parent?.path;
      const base = `${folder ? folder + "/" : ""}${a.file.basename} annotated`;
      let path = `${base}.pdf`, number = 1;
      while (this.plugin.app.vault.getAbstractFileByPath(path)) path = `${base} ${number++}.pdf`;
      // Vault.createBinary fails on a racing collision; it never overwrites an existing output.
      await this.plugin.app.vault.createBinary(path, exported.buffer.slice(exported.byteOffset, exported.byteOffset + exported.byteLength) as ArrayBuffer);
      modal.close(); new Notice(`Exported ${path}`);
    } catch (error) { const canceled = controller.signal.aborted; modal.close(); if (!canceled) new Notice(`Export failed: ${message(error)}`); }
  }
}
function message(error: unknown): string { return error instanceof Error ? error.message : "PDF annotations could not be opened. The source and companion files were preserved."; }
