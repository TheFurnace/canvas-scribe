// @vitest-environment happy-dom

import { afterEach, describe, expect, it, vi } from "vitest";

import type { App } from "obsidian";

import { CanvasInkLayer } from "../src/canvas-ink-layer";
import type { CanvasTarget } from "../src/canvas-target";
import { DebugLogger } from "../src/debug-logger";

afterEach(() => {
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

describe("Canvas drawing input ordering", () => {
  it("owns a pen gesture before an existing Canvas card capture handler", async () => {
    const { wrapper, card } = fixture();
    const nativeCardPointerDown = vi.fn();
    wrapper.addEventListener("pointerdown", nativeCardPointerDown, true);
    stubPointerCapture(wrapper);

    const layer = await mountLayer();
    stubCanvasTransform();

    const down = pointerEvent("pointerdown", {
      pointerId: 7,
      pointerType: "pen",
      button: 0,
      buttons: 1,
      pressure: 0.5,
      clientX: 24,
      clientY: 32,
    });
    card.dispatchEvent(down);

    const up = pointerEvent("pointerup", {
      pointerId: 7,
      pointerType: "pen",
      button: 0,
      buttons: 0,
      pressure: 0,
      clientX: 26,
      clientY: 33,
    });
    card.dispatchEvent(up);

    expect(down.defaultPrevented).toBe(true);
    expect(up.defaultPrevented).toBe(true);
    expect(nativeCardPointerDown).not.toHaveBeenCalled();
    expect(document.querySelectorAll(".canvas-scribe-render-layer path")).toHaveLength(1);

    layer.dispose();
  });

  it("leaves touch input inside the Canvas to native handlers", async () => {
    const { wrapper, card } = fixture();
    const nativeCardPointerDown = vi.fn();
    wrapper.addEventListener("pointerdown", nativeCardPointerDown, true);

    const layer = await mountLayer();
    card.dispatchEvent(pointerEvent("pointerdown", {
      pointerId: 8,
      pointerType: "touch",
      button: 0,
      buttons: 1,
      pressure: 1,
    }));

    expect(nativeCardPointerDown).toHaveBeenCalledOnce();

    layer.dispose();
  });
});

function fixture(): { wrapper: HTMLElement; card: HTMLElement } {
  document.body.innerHTML = `
    <div id="container">
      <div class="canvas-wrapper">
        <div class="canvas">
          <div class="canvas-node"><div class="cm-content" contenteditable="true"></div></div>
        </div>
      </div>
      <div class="canvas-controls"></div>
    </div>
  `;
  return {
    wrapper: requiredElement<HTMLElement>(".canvas-wrapper"),
    card: requiredElement<HTMLElement>(".cm-content"),
  };
}

async function mountLayer(): Promise<CanvasInkLayer> {
  const container = requiredElement<HTMLElement>("#container");
  const app = {
    vault: {
      read: vi.fn(async () => "{}"),
      modify: vi.fn(async () => undefined),
    },
  } as unknown as App;
  const target = {
    containerEl: container,
    file: { path: "fixture.canvas" },
    view: {},
    leaf: {},
  } as unknown as CanvasTarget;
  const layer = new CanvasInkLayer(app, target, new DebugLogger());
  await layer.mount();
  return layer;
}

function stubCanvasTransform(): void {
  const svg = requiredElement<SVGSVGElement>(".canvas-scribe-render-layer");
  Object.defineProperty(svg, "getScreenCTM", {
    configurable: true,
    value: () => ({
      a: 1,
      b: 0,
      c: 0,
      d: 1,
      e: 0,
      f: 0,
      inverse() {
        return this;
      },
    }),
  });
}

function stubPointerCapture(wrapper: HTMLElement): void {
  const captured = new Set<number>();
  Object.defineProperties(wrapper, {
    setPointerCapture: { configurable: true, value: (pointerId: number) => captured.add(pointerId) },
    hasPointerCapture: { configurable: true, value: (pointerId: number) => captured.has(pointerId) },
    releasePointerCapture: { configurable: true, value: (pointerId: number) => captured.delete(pointerId) },
  });
}

function pointerEvent(type: string, init: PointerEventInit): PointerEvent {
  return new PointerEvent(type, { bubbles: true, cancelable: true, ...init });
}

function requiredElement<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`Expected ${selector} to exist.`);
  return element;
}
