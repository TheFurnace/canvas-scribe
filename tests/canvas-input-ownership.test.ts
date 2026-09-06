import { beforeEach, describe, expect, it, vi } from "vitest";

import { CanvasInkLayer } from "../src/canvas-ink-layer";
import type { CanvasTarget } from "../src/canvas-target";
import type { DebugLogger } from "../src/debug-logger";
import type { CanvasInkData } from "../src/types";

class FakeElement {
  readonly attributes = new Map<string, string>();
  readonly capturedPointers = new Set<number>();
  readonly children: FakeElement[] = [];
  readonly classList = { add: vi.fn(), remove: vi.fn(), toggle: vi.fn() };
  readonly dataset: Record<string, string> = {};
  isConnected = true;
  parentElement: FakeElement | null = null;

  constructor(
    readonly ownerDocument: FakeDocument,
    private readonly editable = false,
  ) {}

  appendChild<T extends FakeElement>(child: T): T {
    child.parentElement = this;
    this.children.push(child);
    return child;
  }

  contains(target: FakeElement): boolean {
    return target === this || this.children.some((child) => child.contains(target));
  }

  replaceChildren(...children: FakeElement[]): void {
    this.children.splice(0, this.children.length, ...children);
  }

  replaceWith(replacement: FakeElement): void {
    const index = this.parentElement?.children.indexOf(this) ?? -1;
    if (index < 0 || !this.parentElement) return;
    replacement.parentElement = this.parentElement;
    this.parentElement.children.splice(index, 1, replacement);
    this.parentElement = null;
  }

  remove(): void {
    this.isConnected = false;
  }

  setAttribute(name: string, value: string): void {
    this.attributes.set(name, value);
  }

  closest(selector: string): FakeElement | null {
    return this.editable && selector.includes("[contenteditable]") ? this : null;
  }

  setPointerCapture(pointerId: number): void {
    this.capturedPointers.add(pointerId);
  }

  hasPointerCapture(pointerId: number): boolean {
    return this.capturedPointers.has(pointerId);
  }

  releasePointerCapture(pointerId: number): void {
    this.capturedPointers.delete(pointerId);
  }

  getScreenCTM(): DOMMatrix {
    return {
      a: 1,
      b: 0,
      c: 0,
      d: 1,
      e: 0,
      f: 0,
      inverse: () => this.getScreenCTM(),
    } as DOMMatrix;
  }
}

class FakeDocument {
  readonly defaultView = {
    Element: FakeElement,
    getComputedStyle: () => ({ getPropertyValue: () => "#111111" }),
  };

  createElementNS(): FakeElement {
    return new FakeElement(this);
  }
}

interface LayerHarness {
  activePointerId: number | null;
  data: CanvasInkData;
  onPointerDown(event: PointerEvent): void;
  onPointerUp(event: PointerEvent): void;
  svgEl: FakeElement;
  wrapperEl: FakeElement;
}

function pointer(type: "pointerdown" | "pointerup", target: FakeElement) {
  const preventDefault = vi.fn();
  const stopImmediatePropagation = vi.fn();
  return {
    event: {
      type,
      pointerId: 7,
      pointerType: "pen",
      button: type === "pointerdown" ? 0 : -1,
      buttons: type === "pointerdown" ? 1 : 0,
      pressure: type === "pointerdown" ? 0.5 : 0,
      clientX: type === "pointerdown" ? 10 : 12,
      clientY: type === "pointerdown" ? 20 : 21,
      timeStamp: type === "pointerdown" ? 1 : 2,
      tiltX: 0,
      tiltY: 0,
      cancelable: true,
      target,
      preventDefault,
      stopImmediatePropagation,
    } as unknown as PointerEvent,
    preventDefault,
    stopImmediatePropagation,
  };
}

describe("Canvas drawing input ownership", () => {
  beforeEach(() => {
    vi.stubGlobal("Element", FakeElement);
    vi.stubGlobal("window", {
      requestAnimationFrame: vi.fn(() => 1),
      cancelAnimationFrame: vi.fn(),
      setTimeout: vi.fn(() => 1),
      clearTimeout: vi.fn(),
    });
  });

  it("records one continuous short pen stroke over an editable Canvas card", () => {
    const document = new FakeDocument();
    const wrapper = new FakeElement(document);
    const world = new FakeElement(document);
    const cardEditor = new FakeElement(document, true);
    wrapper.appendChild(cardEditor);
    const container = new FakeElement(document) as FakeElement & {
      querySelector(selector: string): FakeElement | null;
    };
    container.querySelector = (selector) => selector === ".canvas-wrapper" ? wrapper : selector === ".canvas" ? world : null;
    const logger = { record: vi.fn(), recordError: vi.fn() } as unknown as DebugLogger;
    const layer = new CanvasInkLayer(
      {} as ConstructorParameters<typeof CanvasInkLayer>[0],
      { containerEl: container } as unknown as CanvasTarget,
      logger,
    ) as unknown as LayerHarness;
    layer.wrapperEl = wrapper;
    layer.svgEl = new FakeElement(document);
    layer.svgEl.parentElement = world;

    const down = pointer("pointerdown", cardEditor);
    layer.onPointerDown(down.event);
    expect(wrapper.capturedPointers).toContain(7);
    expect(down.preventDefault).toHaveBeenCalledOnce();
    expect(down.stopImmediatePropagation).toHaveBeenCalledOnce();

    const duplicateDown = pointer("pointerdown", cardEditor);
    layer.onPointerDown(duplicateDown.event);
    expect(duplicateDown.preventDefault).toHaveBeenCalledOnce();
    expect(layer.data.strokes).toHaveLength(1);

    const up = pointer("pointerup", cardEditor);
    layer.onPointerUp(up.event);
    expect(up.preventDefault).toHaveBeenCalledOnce();
    expect(up.stopImmediatePropagation).toHaveBeenCalledOnce();
    expect(wrapper.capturedPointers).not.toContain(7);
    expect(layer.activePointerId).toBeNull();
    expect(layer.data.strokes).toHaveLength(1);
    expect(layer.data.strokes[0]?.points).toHaveLength(2);
  });
});
