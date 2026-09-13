import { type App, type MarkdownPostProcessorContext, type Plugin, TFile } from "obsidian";
import { HANDWRITTEN_NOTE_EXTENSION, parseHandwrittenNote } from "./handwritten-note";
import { renderHandwrittenNotePage } from "./handwritten-note-renderer";

const EMBED_CLASS = "canvas-scribe-note-embed";

export function registerHandwrittenNoteEmbeds(plugin: Plugin): void {
  const manager = new HandwrittenNoteEmbedManager(plugin.app);
  plugin.registerMarkdownPostProcessor((element, context) => manager.processMarkdown(element, context));
  const observer = new MutationObserver(() => manager.scan(document.body));
  observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["src", "data-path"] });
  plugin.register(() => { observer.disconnect(); manager.dispose(); });
  plugin.registerEvent(plugin.app.vault.on("modify", (file) => manager.refresh(file)));
  plugin.registerEvent(plugin.app.vault.on("rename", (file, oldPath) => manager.rename(file, oldPath)));
  plugin.registerEvent(plugin.app.vault.on("delete", (file) => manager.remove(file)));
  manager.scan(document.body);
}

class HandwrittenNoteEmbedManager {
  private readonly embeds = new Map<HTMLElement, string>();
  private scanning = false;
  private readonly contexts = new WeakMap<HTMLElement, string>();
  private readonly sources = new WeakMap<HTMLElement, { link: string; path: string }>();
  private readonly revisions = new WeakMap<HTMLElement, number>();
  constructor(private readonly app: App) {}

  processMarkdown(element: HTMLElement, context: MarkdownPostProcessorContext): void {
    this.contexts.set(element, context.sourcePath);
    for (const embed of [ ...(element.matches(".internal-embed") ? [element] : []), ...Array.from(element.querySelectorAll<HTMLElement>(".internal-embed")) ]) {
      const source = embed.getAttribute("src") ?? embed.dataset.src;
      if (!source?.toLowerCase().includes(`.${HANDWRITTEN_NOTE_EXTENSION}`)) continue;
      const file = this.app.metadataCache.getFirstLinkpathDest(source.split("#")[0]!, context.sourcePath);
      this.sources.set(embed, { link: source, path: file?.path ?? source });
      void this.mount(embed, file?.path ?? source);
    }
  }

  scan(root: ParentNode): void {
    if (this.scanning) return; this.scanning = true;
    try {
      for (const [frame] of this.embeds) if (!frame.isConnected) this.embeds.delete(frame);
      for (const candidate of Array.from(root.querySelectorAll(`.internal-embed[src*=".${HANDWRITTEN_NOTE_EXTENSION}"],  .canvas-node[data-path$=".${HANDWRITTEN_NOTE_EXTENSION}"]`)) as HTMLElement[]) {
        if (candidate.closest(`.${EMBED_CLASS}`) || candidate.querySelector(`.${EMBED_CLASS}`)) continue;
        const path = candidate.getAttribute("src") ?? candidate.dataset.path; if (!path) continue;
        const target = candidate.matches(".canvas-node") ? (candidate.querySelector(".canvas-node-content") as HTMLElement | null) ?? candidate : candidate;
        const known = this.sources.get(candidate);
        let canonical = known?.link === path ? known.path : undefined;
        if (!canonical && !candidate.matches(".canvas-node")) {
          let context: string | undefined;
          for (let parent: HTMLElement | null = candidate; parent; parent = parent.parentElement) {
            context = this.contexts.get(parent); if (context !== undefined) break;
          }
          // Live Preview can bypass postprocessing. Resolve against its own leaf.
          if (context === undefined) for (const leaf of this.app.workspace.getLeavesOfType("markdown")) {
            const view = leaf.view as unknown as { containerEl?: HTMLElement; file?: TFile };
            if (view.containerEl?.contains(candidate)) { context = view.file?.path; break; }
          }
          if (context !== undefined) canonical = this.app.metadataCache.getFirstLinkpathDest(path.split("#")[0]!, context)?.path;
        }
        canonical ??= path;
        this.sources.set(candidate, { link: path, path: canonical });
        void this.mount(target, canonical);
      }
      // Canvas file nodes do not expose their file path as a DOM attribute.
      // Keep this private-host seam bounded to existing Canvas leaves and nodes.
      for (const leaf of this.app.workspace.getLeavesOfType("canvas")) {
        const view = leaf.view as unknown as { canvas?: { nodes?: Map<string, { file?: { path: string }; filePath?: string; contentEl?: HTMLElement }> } };
        for (const node of view.canvas?.nodes?.values() ?? []) {
          const path = node.file?.path ?? node.filePath;
          const host = node.contentEl;
          if (!path?.toLowerCase().endsWith(`.${HANDWRITTEN_NOTE_EXTENSION}`) || !host?.isConnected || host.querySelector(`.${EMBED_CLASS}`)) continue;
          void this.mount(host, path);
        }
      }
    } finally { this.scanning = false; }
  }

  refresh(file: { path: string }): void { for (const [element, path] of [...this.embeds]) if (path === file.path) void this.mount(element, path); }
  rename(file: { path: string }, oldPath: string): void {
    for (const [element, path] of [...this.embeds]) if (path === oldPath) { this.embeds.set(element, file.path);
      const host = element.parentElement, source = host && this.sources.get(host);
      if (source) source.path = file.path;
      void this.mount(element, file.path); }
  }
  remove(file: { path: string }): void {
    for (const [frame, path] of this.embeds) if (path === file.path) {
      this.revisions.set(frame, (this.revisions.get(frame) ?? 0) + 1);
      this.status(frame, "Handwritten note unavailable", "The source file is missing or moved.");
    }
  }
  dispose(): void { this.embeds.clear(); }

  private async mount(host: HTMLElement, path: string): Promise<void> {
    const cleanPath = decodeURIComponent(path.split("#")[0]!).replace(/^\/+/, "");
    if (!cleanPath.toLowerCase().endsWith(`.${HANDWRITTEN_NOTE_EXTENSION}`)) return;
    const file = this.app.vault.getAbstractFileByPath(cleanPath);
    const frame = host.classList.contains(EMBED_CLASS) ? host : host.ownerDocument.createElement("section");
    const revision = (this.revisions.get(frame) ?? 0) + 1;
    this.revisions.set(frame, revision);
    frame.className = EMBED_CLASS; frame.dataset.path = cleanPath; frame.tabIndex = 0;
    if (frame !== host) { host.dataset.canvasScribeNoteMounted = "true"; host.replaceChildren(frame); }
    if (host !== frame) this.embeds.delete(host);
    this.embeds.set(frame, cleanPath);
    if (!(file instanceof TFile)) { this.status(frame, "Handwritten note unavailable", "The source file is missing or moved."); return; }
    try {
      const raw = await this.app.vault.cachedRead(file);
      if (this.revisions.get(frame) !== revision || !frame.isConnected) return;
      const note = parseHandwrittenNote(raw);
      const viewport = frame.ownerDocument.createElement("div"); viewport.className = "canvas-scribe-note-embed-viewport"; viewport.tabIndex = 0;
      const page = renderHandwrittenNotePage(frame.ownerDocument, note);
      page.style.width = "100%"; page.style.height = "auto"; page.style.aspectRatio = `${note.logicalWidth} / ${note.contentHeight}`; viewport.append(page);
      const footer = frame.ownerDocument.createElement("footer");
      const label = frame.ownerDocument.createElement("span"); label.textContent = file.basename;
      const open = frame.ownerDocument.createElement("button"); open.type = "button"; open.textContent = "Open note";
      open.addEventListener("pointerdown", (event) => event.stopPropagation());
      open.addEventListener("click", () => void this.app.workspace.getLeaf(false).openFile(file));
      footer.append(label, open); frame.replaceChildren(viewport, footer);
      viewport.addEventListener("wheel", (event) => { if (viewport.scrollHeight > viewport.clientHeight) event.stopPropagation(); }, { passive: true });
      viewport.addEventListener("pointerdown", (event) => { if (event.pointerType === "touch") event.stopPropagation(); });
    } catch (error) { if (this.revisions.get(frame) !== revision) return; this.status(frame, "Handwritten note unavailable", error instanceof Error ? error.message : "The document could not be read."); }
  }

  private status(frame: HTMLElement, title: string, message: string): void {
    const heading = frame.ownerDocument.createElement("strong"); heading.textContent = title;
    const detail = frame.ownerDocument.createElement("span"); detail.textContent = message;
    frame.replaceChildren(heading, detail);
  }
}
