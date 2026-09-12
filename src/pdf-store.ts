import type { App, TFile } from "obsidian";
import { DocumentHistory } from "./document-history";
import { clonePdfInk, newPdfCompanion, parsePdfCompanion, PDF_COMPANION_ROOT, pdfFingerprint, samePdfPages, serializePdfCompanion, type PdfCompanion, type PdfInk, type PdfSource } from "./pdf-document";

export interface CompanionEntry { path: string; raw: string; document: PdfCompanion; }
export class PdfSession {
  // Store.change owns immutable stroke values. History shares those values and copies only order.
  readonly history = new DocumentHistory<PdfInk>(strokes => [...strokes], 60);
  readonly listeners = new Set<() => void>();
  error = "";
  saving = false;
  pendingSaves = 0;
  reviewing = false;
  raw: string | null;
  path: string;
  queue: Promise<void> = Promise.resolve();
  constructor(public document: PdfCompanion, entry?: CompanionEntry) {
    this.raw = entry?.raw ?? null;
    this.path = entry?.path ?? `${PDF_COMPANION_ROOT}/${document.id}.json`;
  }
  notify(): void { for (const listener of this.listeners) listener(); }
}

/** One session/save owner per source. Vault.process detects writes outside this owner. */
export class PdfStore {
  readonly sessions = new Map<string, PdfSession>();
  private readonly opening = new Map<string, Promise<PdfSession>>();
  private folderPromise: Promise<void> | null = null;
  constructor(private readonly app: App) {}
  private ensureRoot(): Promise<void> {
    if (!this.folderPromise) this.folderPromise = (async () => {
      if (!this.app.vault.getAbstractFileByPath(PDF_COMPANION_ROOT)) await this.app.vault.createFolder(PDF_COMPANION_ROOT);
    })().catch(error => { this.folderPromise = null; throw error; });
    return this.folderPromise;
  }
  release(session: PdfSession): void {
    void session.queue.then(() => {
      if (session.listeners.size || session.error) return;
      for (const [path, current] of this.sessions) if (current === session) this.sessions.delete(path);
    });
  }
  companionChanged(path: string): void {
    for (const session of this.sessions.values()) session.queue = session.queue.then(async () => {
      if (session.error || session.raw === null) return;
      try {
        const file = this.app.vault.getAbstractFileByPath(path) as TFile | null;
        if (file && (!('extension' in file) || file.extension !== "json")) return;
        const raw = file ? await this.app.vault.read(file) : null;
        const changed = path === session.path ? raw !== session.raw : raw !== null && (() => {
          const other = parsePdfCompanion(raw);
          return other.id === session.document.id || other.source.path === session.document.source.path;
        })();
        if (changed) {
          session.error = "Companion data changed or a conflict version appeared. Local ink is retained in this view; use Download recovery and Review / relink."; session.notify();
        }
      } catch (error) { session.error = error instanceof Error ? error.message : "Could not verify companion data."; session.notify(); }
    });
  }
  async entries(): Promise<CompanionEntry[]> {
    const entries: CompanionEntry[] = [];
    for (const file of this.app.vault.getFiles().filter(f => f.path.startsWith(PDF_COMPANION_ROOT + "/") && f.extension === "json")) {
      const raw = await this.app.vault.read(file);
      // Fail closed: unreadable companions must never be replaced with new empty data.
      try { entries.push({ path: file.path, raw, document: parsePdfCompanion(raw) }); }
      catch { throw new Error(`Cannot read ${file.path}. It is preserved; repair or move it out of the annotation root before continuing.`); }
    }
    return entries;
  }
  async open(source: PdfSource): Promise<PdfSession> {
    const existing = this.sessions.get(source.path);
    if (existing) {
      if (existing.document.source.fingerprint !== source.fingerprint) { existing.error = "The PDF changed. Your ink is preserved. Review and relink before editing."; existing.notify(); }
      return existing;
    }
    const pending = this.opening.get(source.path); if (pending) return pending;
    const promise = this.load(source).finally(() => this.opening.delete(source.path));
    this.opening.set(source.path, promise); return promise;
  }
  private async load(source: PdfSource): Promise<PdfSession> {
    const entries = await this.entries();
    const byPath = entries.filter(e => e.document.source.path === source.path);
    const byHash = entries.filter(e => e.document.source.fingerprint === source.fingerprint);
    if (byPath.length > 1) throw new Error("Multiple companion versions reference this PDF. Preserve them and select a version with Review / relink.");
    let entry = byPath[0];
    if (!entry && byHash.length) {
      // Same bytes at a still-existing path may be a copy, not a move. Never steal its ink.
      if (byHash.length !== 1 || this.app.vault.getAbstractFileByPath(byHash[0]!.document.source.path))
        throw new Error("Another PDF or companion has the same fingerprint. Use Review / relink to select the intended association.");
      let matches = 0;
      for (const file of this.app.vault.getFiles().filter(f => f.extension.toLowerCase() === "pdf")) {
        if (await pdfFingerprint(await this.app.vault.readBinary(file)) === source.fingerprint) matches++;
      }
      if (matches !== 1) throw new Error("Multiple source PDFs match these annotations. Use Review / relink to choose explicitly.");
      entry = byHash[0];
    }
    const document = entry ? structuredClone(entry.document) : newPdfCompanion(source);
    const session = new PdfSession(document, entry);
    this.sessions.set(source.path, session);
    if (document.source.fingerprint !== source.fingerprint) session.error = "The source PDF changed. Ink is preserved; use Review / relink before editing.";
    else if (document.source.path !== source.path) { document.source.path = source.path; await this.save(session); }
    return session;
  }
  change(session: PdfSession, strokes: PdfInk[]): void {
    if (session.error || session.reviewing) return;
    const previous = new Set(session.document.strokes);
    session.history.checkpoint(session.document.strokes);
    session.document.strokes = strokes.map(stroke => previous.has(stroke) ? stroke : clonePdfInk([stroke])[0]!);
    void this.save(session); session.notify();
  }
  undo(session: PdfSession, redo = false): void {
    if (session.error || session.reviewing) return;
    const next = redo ? session.history.redo(session.document.strokes) : session.history.undo(session.document.strokes);
    if (next) { session.document.strokes = next; void this.save(session); session.notify(); }
  }
  async save(session: PdfSession): Promise<void> {
    const snapshot = { ...session.document, source: structuredClone(session.document.source), strokes: session.document.strokes };
    session.pendingSaves++;
    session.saving = true;
    session.queue = session.queue.then(async () => {
      if (session.error) return;
      try {
        const sourceFile = this.app.vault.getAbstractFileByPath(session.document.source.path) as TFile | null;
        if (!sourceFile || !('extension' in sourceFile) || await pdfFingerprint(await this.app.vault.readBinary(sourceFile)) !== snapshot.source.fingerprint)
          throw new Error("Source PDF is missing or changed. Review / relink before editing.");
        snapshot.source.path = sourceFile.path;
        snapshot.revision = session.document.revision + 1;
        const raw = serializePdfCompanion(snapshot);
        await this.ensureRoot();
        const file = this.app.vault.getAbstractFileByPath(session.path) as TFile | null;
        if (session.raw === null) {
          if (file) throw new Error("Companion appeared during editing. Both versions must be reviewed.");
          await this.app.vault.create(session.path, raw);
        } else {
          if (!file) throw new Error("Companion moved or disappeared during editing.");
          await this.app.vault.process(file, current => {
            if (current !== session.raw) throw new Error("Companion changed outside this editor. Both versions must be reviewed.");
            return raw;
          });
        }
        session.raw = raw; session.document.revision = snapshot.revision;
      } catch (error) {
        session.error = error instanceof Error ? error.message : "Could not save annotations.";
        // Save the latest in-memory edits separately, never overwrite the external version.
        try {
          await this.ensureRoot();
          const recovery = `${PDF_COMPANION_ROOT}/${session.document.id}-recovery-${crypto.randomUUID()}.json`;
          await this.app.vault.create(recovery, serializePdfCompanion(session.document));
          session.error += ` Your local ink is preserved in ${recovery}. Use Review / relink.`;
        } catch { session.error += " Recovery could not be written. Keep this view open and use Download recovery."; }
      }
    }).finally(() => { session.pendingSaves--; session.saving = session.pendingSaves > 0; session.notify(); });
    return session.queue;
  }
  rename(file: TFile, oldPath: string): void {
    const session = this.sessions.get(oldPath);
    if (session) {
      this.sessions.delete(oldPath); this.sessions.set(file.path, session);
      session.document.source.path = file.path;
      if (session.raw !== null) void this.save(session);
    }
    // Closed documents are reconciled on reopen by fingerprint, with ambiguity checks.
  }
  invalidate(path: string): void {
    for (const session of this.sessions.values()) if (session.document.source.path === path) {
      session.error = "Source PDF changed or was removed. Use Review / relink; existing ink is preserved."; session.notify();
    }
  }
  async relink(entry: CompanionEntry, source: PdfSource): Promise<void> {
    if (!samePdfPages(entry.document.source.pages, source.pages)) throw new Error("Page geometry differs. Automatic page remapping is unsupported.");
    const active = this.sessions.get(source.path);
    const locked = [...this.sessions.values()].filter(s => s === active || s.path === entry.path || s.document.id === entry.document.id);
    if (locked.some(s => s.reviewing)) throw new Error("Another association review is in progress. Try again when it finishes.");
    for (const session of locked) { session.reviewing = true; session.notify(); }
    try {
      // Finish queued edits before comparing the user's reviewed version. New gestures are suspended.
      await Promise.all(locked.map(s => s.queue));
      const all = await this.entries();
      const duplicates = all.filter(e => e.path !== entry.path && (e.document.source.path === source.path || e.document.id === entry.document.id));
      const sourceFile = this.app.vault.getAbstractFileByPath(source.path) as TFile | null;
      if (!sourceFile || await pdfFingerprint(await this.app.vault.readBinary(sourceFile)) !== source.fingerprint) throw new Error("The PDF changed during review. Reopen Review / relink.");
      const updated = structuredClone(entry.document); updated.source = structuredClone(source); updated.revision++;
      const raw = serializePdfCompanion(updated);
      const file = this.app.vault.getAbstractFileByPath(entry.path) as TFile;
      if (!file || await this.app.vault.read(file) !== entry.raw) throw new Error("Companion changed during review. Reopen Review / relink.");
      if (duplicates.length) {
        const recoveryRoot = "Scribe PDF recovery";
        if (!this.app.vault.getAbstractFileByPath(recoveryRoot)) await this.app.vault.createFolder(recoveryRoot);
        for (const duplicate of duplicates) {
          const old = this.app.vault.getAbstractFileByPath(duplicate.path) as TFile;
          if (await this.app.vault.read(old) !== duplicate.raw) throw new Error("A conflict copy changed during review. Reopen Review / relink.");
          await this.app.vault.rename(old, `${recoveryRoot}/${duplicate.document.id}-${crypto.randomUUID()}.json`);
        }
      }
      await this.app.vault.process(file, current => { if (current !== entry.raw) throw new Error("Companion changed during review. Reopen Review / relink."); return raw; });
      for (const session of locked) if (session !== active) session.error = "This companion was explicitly linked to another PDF. Local ink is preserved; review before editing.";
      if (active) {
        active.document = updated; active.path = entry.path; active.raw = raw; active.error = "";
        active.history.past = []; active.history.future = [];
      }
    } catch (error) {
      if (active) { active.error = error instanceof Error ? error.message : "Relinking failed. The annotation versions are preserved."; active.notify(); }
      throw error;
    } finally {
      for (const session of locked) { session.reviewing = false; session.notify(); }
    }
  }
}
