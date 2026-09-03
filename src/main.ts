import { Notice, Plugin } from "obsidian";

import { CanvasInkLayer } from "./canvas-ink-layer";
import { targetFromLeaf } from "./canvas-target";
import { DebugLogger } from "./debug-logger";
import { createDebugReport } from "./debug-report";
import { InputDiagnostics } from "./input-diagnostics";
import type { DrawingTool } from "./types";

export default class CanvasScribePlugin extends Plugin {
  private readonly layers = new Map<HTMLElement, CanvasInkLayer>();
  private readonly logger = new DebugLogger();
  private diagnostics: InputDiagnostics | null = null;
  private syncFrame: number | null = null;

  async onload(): Promise<void> {
    this.logger.record("plugin", "loaded", { version: this.manifest.version });
    this.diagnostics = new InputDiagnostics(document, this.logger);
    this.addCommand({
      id: "toggle-stylus-input",
      name: "Toggle stylus input on active canvas",
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
      name: "Undo canvas ink",
      callback: () => this.withActiveLayer((layer) => layer.undo()),
    });
    this.addCommand({
      id: "redo-ink",
      name: "Redo canvas ink",
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

    this.registerEvent(this.app.workspace.on("layout-change", () => this.scheduleSync()));
    this.registerEvent(this.app.workspace.on("active-leaf-change", () => this.scheduleSync()));
    this.app.workspace.onLayoutReady(() => this.scheduleSync());
  }

  onunload(): void {
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
      name: `Use ${tool} on canvas`,
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
      const layer = new CanvasInkLayer(this.app, target, this.logger);
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

  private withActiveLayer(callback: (layer: CanvasInkLayer) => void): void {
    const leaf = this.app.workspace.getMostRecentLeaf();
    if (!leaf) return;
    const layer = this.layers.get(leaf.view.containerEl);
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
}
