import { ItemView, type WorkspaceLeaf } from "obsidian";
import { DebugConsole, type DebugConsoleState } from "./debug-console";
import type { DebugSnapshot } from "./debug-logger";

export const DEBUG_CONSOLE_VIEW_TYPE = "canvas-scribe-debug-console";
export class DebugConsoleView extends ItemView {
  private console: DebugConsole | null = null;
  constructor(leaf: WorkspaceLeaf, private readonly state: () => DebugConsoleState,
    private readonly snapshot: () => DebugSnapshot, private readonly run: (id: string) => void | Promise<void>,
    private readonly move: (side: "left" | "right") => void) { super(leaf); }
  getViewType(): string { return DEBUG_CONSOLE_VIEW_TYPE; }
  getDisplayText(): string { return "Scribe debug"; }
  getIcon(): string { return "bug"; }
  async onOpen(): Promise<void> {
    this.console?.destroy();
    this.console = new DebugConsole(this.contentEl.ownerDocument, this.state, this.snapshot, this.run, this.move);
    this.contentEl.replaceChildren(this.console.root);
  }
  refresh(): void { this.console?.refresh(); }
  async onClose(): Promise<void> { this.console?.destroy(); this.console = null; }
}
