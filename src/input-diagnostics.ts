import type { DebugLogger } from "./debug-logger";

const DIAGNOSTIC_EVENTS = [
  "pointerover",
  "pointerdown",
  "pointermove",
  "pointerup",
  "pointercancel",
] as const;

const SECONDARY_INPUT_EVENTS = ["mousedown", "mouseup", "auxclick", "contextmenu"] as const;

export class InputDiagnostics {
  private overlay: HTMLElement | null = null;
  private readonly lines: string[] = [];
  private lastMoveAt = 0;

  constructor(
    private readonly document: Document,
    private readonly logger: DebugLogger,
  ) {}

  get enabled(): boolean {
    return this.overlay !== null;
  }

  toggle(): boolean {
    if (this.overlay) {
      this.disable();
      return false;
    }
    this.enable();
    return true;
  }

  dispose(): void {
    this.disable();
  }

  private enable(): void {
    const overlay = this.document.createElement("div");
    overlay.className = "canvas-scribe-input-diagnostics";
    overlay.textContent = "Canvas Scribe input diagnostics\nTouch the canvas with the S Pen.";
    this.document.body.appendChild(overlay);
    this.overlay = overlay;
    this.logger.record("diagnostics", "overlay_enabled");
    for (const eventName of DIAGNOSTIC_EVENTS) this.document.addEventListener(eventName, this.onPointerEvent, true);
    for (const eventName of SECONDARY_INPUT_EVENTS) this.document.addEventListener(eventName, this.onMouseEvent, true);
  }

  private disable(): void {
    if (this.overlay) this.logger.record("diagnostics", "overlay_disabled");
    for (const eventName of DIAGNOSTIC_EVENTS) this.document.removeEventListener(eventName, this.onPointerEvent, true);
    for (const eventName of SECONDARY_INPUT_EVENTS) this.document.removeEventListener(eventName, this.onMouseEvent, true);
    this.overlay?.remove();
    this.overlay = null;
    this.lines.length = 0;
  }

  private readonly onPointerEvent = (event: PointerEvent): void => {
    if (!this.overlay) return;
    if (event.type === "pointermove" && event.timeStamp - this.lastMoveAt < 80) return;
    if (event.type === "pointermove") this.lastMoveAt = event.timeStamp;
    this.logger.recordPointer(event);
    const line = [
      event.type.padEnd(11),
      `#${event.pointerId}`,
      event.pointerType.padEnd(5),
      `button=${event.button}`,
      `buttons=${event.buttons}`,
      `pressure=${event.pressure.toFixed(3)}`,
      `tilt=${event.tiltX},${event.tiltY}`,
      `size=${Math.round(event.width)}x${Math.round(event.height)}`,
    ].join(" ");
    this.lines.push(line);
    if (this.lines.length > 14) this.lines.shift();
    this.overlay.textContent = `Canvas Scribe input diagnostics\n${this.lines.join("\n")}`;
  };

  private readonly onMouseEvent = (event: MouseEvent): void => {
    if (!this.overlay) return;
    this.logger.recordMouse(event);
    const pointerType = "pointerType" in event && typeof event.pointerType === "string" ? event.pointerType : "unknown";
    const line = [
      event.type.padEnd(11),
      pointerType.padEnd(5),
      `button=${event.button}`,
      `buttons=${event.buttons}`,
      `detail=${event.detail}`,
      `class=${event.constructor.name}`,
    ].join(" ");
    this.lines.push(line);
    if (this.lines.length > 14) this.lines.shift();
    this.overlay.textContent = `Canvas Scribe input diagnostics\n${this.lines.join("\n")}`;
  };
}
