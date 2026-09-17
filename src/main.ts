import { InkLatencyExperiment } from "./ink-latency";
import { InkToolState } from "./ink-tool-state";
import { addIcon, Notice, Plugin } from "obsidian";
import { PdfController } from "./pdf-controller";
import { registerToolIcons } from "./tool-icons";

import { FavoritePens } from "./favorite-pens";
import { CanvasInkLayer } from "./canvas-ink-layer";
import { targetFromLeaf } from "./canvas-target";
import { DebugLogger } from "./debug-logger";
import { createDebugReport } from "./debug-report";
import { InputDiagnostics } from "./input-diagnostics";
import type { DrawingTool } from "./types";
import { HANDWRITTEN_NOTE_EXTENSION } from "./handwritten-note";
import { registerHandwrittenNoteEmbeds } from "./handwritten-note-embeds";
import { createNewHandwrittenNoteFile, HANDWRITTEN_NOTE_VIEW_TYPE, HandwrittenNoteView } from "./handwritten-note-view";

export default class CanvasScribePlugin extends Plugin {
  private favorites = new FavoritePens();
  private tools = new InkToolState();
  private saveQueue: Promise<void> = Promise.resolve();
  private readonly layers = new Map<HTMLElement, CanvasInkLayer>();
  private readonly logger = new DebugLogger();
  private readonly inkLatency = new InkLatencyExperiment(this.logger);
  private diagnostics: InputDiagnostics | null = null;
  private syncFrame: number | null = null;
  private pdfController: PdfController | null = null;

  async onload(): Promise<void> {
    registerToolIcons(addIcon);
    const stored = await this.loadData();
    const settings = stored && typeof stored === "object" ? stored : {};
    this.tools = new InkToolState(settings.inkTools);
    const persist = () => {
      const snapshot = { ...settings, favoritePens: this.favorites.list(), inkTools: this.tools.serialize() };
      this.saveQueue = this.saveQueue.then(() => this.saveData(snapshot)).catch((error) => {
        this.logger.recordError("tool_preferences_save_failed", error);
        new Notice("Could not save tool preferences. Please try again.");
      });
    };
    this.favorites = new FavoritePens(settings.favoritePens, persist);
    this.register(this.tools.subscribe(persist));
    this.logger.record("plugin", "loaded", { version: this.manifest.version });
    this.registerView(HANDWRITTEN_NOTE_VIEW_TYPE, (leaf) => new HandwrittenNoteView(leaf, this.favorites, this.tools, this.inkLatency));
    this.registerExtensions([HANDWRITTEN_NOTE_EXTENSION], HANDWRITTEN_NOTE_VIEW_TYPE);
    registerHandwrittenNoteEmbeds(this);
    this.pdfController = new PdfController(this, this.favorites, this.tools);
    this.diagnostics = new InputDiagnostics(document, this.logger);
    this.addCommand({
      id: "create-handwritten-note",
      name: "Create new handwritten note",
      callback: () => void this.createHandwrittenNote(),
    });
    this.addCommand({
      id: "toggle-stylus-input",
      name: "Toggle stylus input on active view",
      callback: () => this.withActiveLayer((layer) => layer.toggleEnabled()),
    });
    this.addCommand({
      id: "export-debug-report",
      name: "Export debug report",
      callback: () => void this.exportDebugReport(),
    });
    this.addCommand({
      id: "clear-debug-history",
      name: "Clear debug history",
      callback: () => {
        this.logger.clear();
        new Notice("Canvas Scribe debug history cleared.");
      },
    });

    for (const tool of ["pen", "highlighter", "eraser", "lasso"] as const) this.addToolCommand(tool);
    this.addCommand({
      id: "undo-ink",
      name: "Undo Scribe edit",
      callback: () => this.withActiveLayer((layer) => layer.undo()),
    });
    this.addCommand({
      id: "redo-ink",
      name: "Redo Scribe edit",
      callback: () => this.withActiveLayer((layer) => layer.redo()),
    });
    this.addCommand({
      id: "toggle-input-diagnostics",
      name: "Toggle stylus input diagnostics",
      callback: () => {
        const enabled = this.diagnostics?.toggle() ?? false;
        new Notice(`Canvas Scribe input diagnostics ${enabled ? "enabled" : "disabled"}.`);
      },
    });

    this.addCommand({
      id: "toggle-ink-prediction", name: "Cycle predicted ink tip: OFF / 16 / 24 / 32 ms (experimental)",
      callback: () => {
        const horizonMs = this.inkLatency.cyclePrediction();
        this.logger.record("ink-latency", "prediction_mode_changed", { enabled: this.inkLatency.prediction, horizonMs });
        new Notice(`Predicted ink tip: ${horizonMs ? `${horizonMs} ms` : "OFF"}; delegated ink OFF for new Canvas and note strokes. Resets on restart.`);
      },
    });
    this.addCommand({
      id: "toggle-ink-latency-colors", name: "Toggle bright ink diagnostics (cyan / yellow / magenta)",
      callback: () => {
        this.inkLatency.visualDiagnostics = !this.inkLatency.visualDiagnostics;
        this.logger.record("ink-latency", "visual_diagnostics_changed", { enabled: this.inkLatency.visualDiagnostics });
        new Notice(`Bright ink diagnostics ${this.inkLatency.visualDiagnostics ? "ON" : "OFF"} for new strokes. Cyan: actual endpoint. Yellow: prediction. Magenta: browser-only delegated trail. Resets on restart.`, 10000);
      },
    });
    this.addCommand({
      id: "toggle-delegated-ink", name: "Toggle delegated ink trail (experimental)",
      callback: () => {
        const enabled = this.inkLatency.toggleDelegated();
        this.logger.record("ink-latency", "delegated_mode_changed", { enabled, prediction: false });
        new Notice(`Delegated ink ${enabled ? "ON" : "OFF"}; prediction OFF for new Canvas and note strokes. Use an opaque ballpoint, fountain or brush pen. Export debug report after testing.`, 8000);
      },
    });
    this.addCommand({
      id: "toggle-ink-latency-diagnostics", name: "Toggle ink latency recording",
      callback: () => {
        this.inkLatency.diagnostics = !this.inkLatency.diagnostics;
        this.logger.record("ink-latency", "recording_toggled", { enabled: this.inkLatency.diagnostics });
        new Notice(`Ink latency recording ${this.inkLatency.diagnostics ? "ON" : "OFF"} for new strokes. Use Export debug report after testing.`);
      },
    });

    this.registerEvent(this.app.workspace.on("layout-change", () => this.scheduleSync()));
    this.registerEvent(this.app.workspace.on("active-leaf-change", () => this.scheduleSync()));
    this.app.workspace.onLayoutReady(() => this.scheduleSync());
  }

  onunload(): void {
    this.pdfController?.destroy(); this.pdfController = null;
    this.logger.record("plugin", "unloading", { layerCount: this.layers.size });
    if (this.syncFrame !== null) window.cancelAnimationFrame(this.syncFrame);
    for (const layer of this.layers.values()) layer.dispose();
    this.layers.clear();
    this.diagnostics?.dispose();
    this.diagnostics = null;
  }

  private addToolCommand(tool: DrawingTool): void {
    this.addCommand({
      id: `use-${tool}`,
      name: `Use ${tool}`,
      callback: () => this.withActiveLayer((layer) => layer.setTool(tool)),
    });
  }

  private scheduleSync(): void {
    if (this.syncFrame !== null) return;
    this.syncFrame = window.requestAnimationFrame(() => {
      this.syncFrame = null;
      void this.syncLayers();
    });
  }

  private async syncLayers(): Promise<void> {
    const liveContainers = new Set<HTMLElement>();
    for (const leaf of this.app.workspace.getLeavesOfType("canvas")) {
      const target = targetFromLeaf(leaf);
      if (!target) continue;
      liveContainers.add(target.containerEl);
      const existing = this.layers.get(target.containerEl);
      if (existing?.isFor(target)) continue;
      existing?.dispose();
      const layer = new CanvasInkLayer(this.app, target, this.logger, this.favorites, this.tools, this.inkLatency);
      this.layers.set(target.containerEl, layer);
      try {
        await layer.mount();
      } catch (error) {
        this.logger.recordError("layer_mount_failed", error);
        console.error("Canvas Scribe could not attach to a canvas", error);
        new Notice("Canvas Scribe could not open this canvas. See the developer console.");
      }
    }

    for (const [container, layer] of this.layers) {
      if (!liveContainers.has(container) || !container.isConnected) {
        layer.dispose();
        this.layers.delete(container);
      }
    }
  }

  private withActiveLayer(callback: (layer: { setTool(tool: DrawingTool): void; undo(): void; redo(): void; toggleEnabled(): void }) => void): void {
    const leaf = this.app.workspace.getMostRecentLeaf();
    if (!leaf) return;
    const layer = this.layers.get(leaf.view.containerEl) ?? (leaf.view instanceof HandwrittenNoteView ? leaf.view.commands() : this.pdfController?.commands(leaf.view.containerEl));
    if (layer) callback(layer);
  }

  private async exportDebugReport(): Promise<void> {
    try {
      const files = await createDebugReport(this.app, this.logger, this.manifest.version);
      new Notice(`Canvas Scribe report saved to ${files.markdown.path}.`);
      await this.app.workspace.getLeaf(false).openFile(files.markdown);
    } catch (error) {
      this.logger.recordError("report_export_failed", error);
      console.error("Canvas Scribe could not export its debug report", error);
      new Notice("Canvas Scribe could not export its debug report. See the developer console.");
    }
  }

  private async createHandwrittenNote(): Promise<void> {
    try {
      const leaf = this.app.workspace.getLeaf(false);
      await createNewHandwrittenNoteFile(
        (path, data) => this.app.vault.create(path, data),
        (path) => this.app.vault.getAbstractFileByPath(path) !== null,
      ).then((file) => leaf.openFile(file));
    } catch (error) {
      this.logger.recordError("handwritten_note_create_failed", error);
      new Notice("Could not create the handwritten note.");
    }
  }
}
