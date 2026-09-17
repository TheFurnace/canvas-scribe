import type { DebugSnapshot } from "./debug-logger";

export interface DebugConsoleState {
  version: string;
  prediction: number;
  delegated: boolean;
  colors: boolean;
  recording: boolean;
  input: boolean;
}

export class DebugConsole {
  readonly root: HTMLElement;
  private readonly buttons = new Map<string, HTMLButtonElement>();
  private readonly events: HTMLPreElement;
  private readonly summary: HTMLElement;
  constructor(document: Document, private readonly state: () => DebugConsoleState,
    private readonly snapshot: () => DebugSnapshot, run: (id: string) => void | Promise<void>,
    move: (side: "left" | "right") => void) {
    this.root = document.createElement("div"); this.root.className = "canvas-scribe-debug-console";
    const title = document.createElement("h3"); title.textContent = "Scribe debug"; this.root.append(title);
    this.summary = document.createElement("p"); this.root.append(this.summary);
    const hint = document.createElement("p"); hint.className = "canvas-scribe-debug-hint";
    hint.textContent = "Experiments apply to new Canvas and note strokes. Switches reset OFF on restart. Prediction and delegated ink are mutually exclusive.";
    this.root.append(hint);
    const controls = document.createElement("div"); controls.className = "canvas-scribe-debug-controls"; this.root.append(controls);
    for (const id of ["toggle-ink-prediction", "toggle-delegated-ink", "toggle-ink-latency-colors", "toggle-ink-latency-diagnostics", "toggle-input-diagnostics", "export-debug-report", "clear-debug-history"]) {
      const button = document.createElement("button"); button.type = "button"; button.dataset.debugAction = id;
      button.addEventListener("click", async () => { button.disabled = true; try { await run(id); } finally { button.disabled = false; this.refresh(); } });
      controls.append(button); this.buttons.set(id, button);
    }
    const legend = document.createElement("p"); legend.className = "canvas-scribe-debug-hint";
    legend.textContent = "Cyan: actual input. Yellow: prediction. Magenta: browser delegated ink (may not render on this device)."; this.root.append(legend);
    const sides = document.createElement("div"); sides.className = "canvas-scribe-debug-controls";
    for (const side of ["left", "right"] as const) {
      const button = document.createElement("button"); button.type = "button"; button.textContent = `Move to ${side} sidebar`;
      button.addEventListener("click", () => move(side)); sides.append(button);
    }
    this.root.append(sides);
    const refresh = document.createElement("button"); refresh.type = "button"; refresh.textContent = "Refresh recent events";
    refresh.addEventListener("click", () => this.refresh()); this.root.append(refresh);
    this.events = document.createElement("pre"); this.events.setAttribute("aria-label", "Recent debug events"); this.root.append(this.events);
    this.refresh();
  }
  refresh(): void {
    const s = this.state();
    this.summary.textContent = `Canvas Scribe ${s.version}`;
    const labels: Record<string, [string, boolean?]> = {
      "toggle-ink-prediction": [`Prediction: ${s.prediction ? `${s.prediction} ms` : "OFF"} · Tap to cycle`],
      "toggle-delegated-ink": ["Delegated ink", s.delegated],
      "toggle-ink-latency-colors": ["Bright diagnostic colors", s.colors],
      "toggle-ink-latency-diagnostics": ["Latency recording", s.recording],
      "toggle-input-diagnostics": ["Input overlay", s.input],
      "export-debug-report": ["Export debug report"],
      "clear-debug-history": ["Clear debug history"],
    };
    for (const [id, [label, pressed]] of Object.entries(labels)) {
      const button = this.buttons.get(id)!;
      button.textContent = pressed === undefined ? label : `${label}: ${pressed ? "ON" : "OFF"}`;
      if (pressed !== undefined) button.setAttribute("aria-pressed", String(pressed));
    }
    const log = this.snapshot();
    this.events.textContent = `Latest ${Math.min(40, log.entries.length)} events · ${log.droppedEntries} older entries dropped\nRefresh after drawing to update.\n\n` +
      log.entries.slice(-40).map(e => `${e.timestamp.slice(11, 23)} ${e.category} / ${e.event}${e.data ? `\n${JSON.stringify(e.data)}` : ""}`).join("\n\n");
  }
  destroy(): void { this.root.remove(); }
}
