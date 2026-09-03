export type DebugValue = string | number | boolean | null;
export type DebugData = Record<string, DebugValue>;

export interface DebugEntry {
  sequence: number;
  timestamp: string;
  elapsedMs: number;
  category: string;
  event: string;
  data?: DebugData;
}

export interface DebugSnapshot {
  schemaVersion: 1;
  exportedAt: string;
  startedAt: string;
  droppedEntries: number;
  entries: DebugEntry[];
}

interface PointerButtonState {
  button: number;
  buttons: number;
}

const DEFAULT_MAX_ENTRIES = 1200;
const POINTER_MOVE_INTERVAL_MS = 50;

export class DebugLogger {
  private readonly entries: DebugEntry[] = [];
  private startedAtMs = Date.now();
  private droppedEntries = 0;
  private sequence = 0;
  private lastPointerMoveAt = 0;
  private readonly pointerButtonStates = new Map<number, PointerButtonState>();

  constructor(private readonly maxEntries = DEFAULT_MAX_ENTRIES) {
    if (!Number.isInteger(maxEntries) || maxEntries < 1) throw new Error("maxEntries must be a positive integer.");
  }

  record(category: string, event: string, data?: DebugData): void {
    const now = Date.now();
    const entry: DebugEntry = {
      sequence: ++this.sequence,
      timestamp: new Date(now).toISOString(),
      elapsedMs: now - this.startedAtMs,
      category,
      event,
    };
    if (data && Object.keys(data).length > 0) entry.data = data;
    this.entries.push(entry);
    if (this.entries.length > this.maxEntries) {
      this.entries.shift();
      this.droppedEntries += 1;
    }
  }

  recordPointer(event: PointerEvent): void {
    const previousState = this.pointerButtonStates.get(event.pointerId);
    const buttonStateChanged = previousState?.button !== event.button || previousState.buttons !== event.buttons;
    if (event.type === "pointermove") {
      if (!buttonStateChanged && event.timeStamp - this.lastPointerMoveAt < POINTER_MOVE_INTERVAL_MS) return;
      this.lastPointerMoveAt = event.timeStamp;
    }
    this.pointerButtonStates.set(event.pointerId, { button: event.button, buttons: event.buttons });
    const coalescedCount = typeof event.getCoalescedEvents === "function" ? event.getCoalescedEvents().length : 0;
    this.record("pointer", event.type, {
      pointerId: event.pointerId,
      pointerType: event.pointerType || "unknown",
      isPrimary: event.isPrimary,
      button: event.button,
      buttons: event.buttons,
      pressure: round(event.pressure),
      tangentialPressure: round(event.tangentialPressure),
      tiltX: event.tiltX,
      tiltY: event.tiltY,
      twist: event.twist,
      width: round(event.width),
      height: round(event.height),
      coalescedCount,
    });
    if (event.type === "pointerup" || event.type === "pointercancel") this.pointerButtonStates.delete(event.pointerId);
  }

  recordSelection(event: Event, selection: Selection | null): void {
    this.record("selection", event.type, {
      cancelable: event.cancelable,
      defaultPrevented: event.defaultPrevented,
      rangeCount: selection?.rangeCount ?? 0,
      isCollapsed: selection?.isCollapsed ?? true,
      selectionType: selection?.type ?? "None",
    });
  }

  recordMouse(event: MouseEvent): void {
    const pointerLike = event as MouseEvent & {
      pointerId?: unknown;
      pointerType?: unknown;
      pressure?: unknown;
    };
    this.record("mouse", event.type, {
      eventClass: event.constructor.name,
      pointerId: typeof pointerLike.pointerId === "number" ? pointerLike.pointerId : -1,
      pointerType: typeof pointerLike.pointerType === "string" ? pointerLike.pointerType : "unknown",
      button: event.button,
      buttons: event.buttons,
      pressure: typeof pointerLike.pressure === "number" ? round(pointerLike.pressure) : 0,
      detail: event.detail,
      ctrlKey: event.ctrlKey,
      shiftKey: event.shiftKey,
      altKey: event.altKey,
      metaKey: event.metaKey,
    });
  }

  recordError(event: string, error: unknown): void {
    const normalized = normalizeError(error);
    this.record("error", event, normalized);
  }

  clear(): void {
    this.entries.length = 0;
    this.droppedEntries = 0;
    this.sequence = 0;
    this.lastPointerMoveAt = 0;
    this.pointerButtonStates.clear();
    this.startedAtMs = Date.now();
    this.record("debug", "history_cleared");
  }

  snapshot(): DebugSnapshot {
    return {
      schemaVersion: 1,
      exportedAt: new Date().toISOString(),
      startedAt: new Date(this.startedAtMs).toISOString(),
      droppedEntries: this.droppedEntries,
      entries: this.entries.map((entry) => ({ ...entry, data: entry.data ? { ...entry.data } : undefined })),
    };
  }
}

function normalizeError(error: unknown): DebugData {
  if (error instanceof Error) {
    return {
      name: truncate(error.name, 100),
      message: truncate(error.message, 600),
      stack: truncate(error.stack ?? "", 2000),
    };
  }
  return { message: truncate(String(error), 600) };
}

function truncate(value: string, maximum: number): string {
  return value.length <= maximum ? value : `${value.slice(0, maximum)}…`;
}

function round(value: number): number {
  return Number.isFinite(value) ? Math.round(value * 1000) / 1000 : 0;
}
