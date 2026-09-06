// @vitest-environment happy-dom

import { afterEach, describe, expect, it, vi } from "vitest";

import type { App } from "obsidian";

import { asElement, CanvasInkLayer } from "../src/canvas-ink-layer";
import type { CanvasTarget } from "../src/canvas-target";
import { DebugLogger } from "../src/debug-logger";

afterEach(() => {
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

describe("Canvas drawing input ordering", () => {
  it("recognizes an element using its owner document's realm", () => {
    const iframe = document.createElement("iframe");
    document.body.appendChild(iframe);
    const foreignElement = iframe.contentDocument?.createElement("div");
    expect(foreignElement).toBeTruthy();
    expect(asElement(foreignElement ?? null)).toBe(foreignElement);
  });

  it("owns a pen gesture and its click before existing Canvas card capture handlers", async () => {
    const { wrapper, card } = fixture();
    const nativeCardPointerDown = vi.fn();
    const nativeCardClick = vi.fn();
    wrapper.addEventListener("pointerdown", nativeCardPointerDown, true);
    wrapper.addEventListener("click", nativeCardClick, true);
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
    const click = pointerEvent("click", {
      pointerId: 7,
      pointerType: "pen",
      button: 0,
      buttons: 0,
      pressure: 0,
    });
    card.dispatchEvent(click);

    expect(down.defaultPrevented).toBe(true);
    expect(up.defaultPrevented).toBe(true);
    expect(click.defaultPrevented).toBe(true);
    expect(nativeCardPointerDown).not.toHaveBeenCalled();
    expect(nativeCardClick).not.toHaveBeenCalled();
    expect(document.querySelectorAll(".canvas-scribe-render-layer path")).toHaveLength(1);

    layer.dispose();
  });

  it("suppresses a legacy click immediately following an owned pen gesture", async () => {
    const { wrapper, card } = fixture();
    const nativeCardClick = vi.fn();
    wrapper.addEventListener("click", nativeCardClick, true);
    stubPointerCapture(wrapper);

    const layer = await mountLayer();
    stubCanvasTransform();
    card.dispatchEvent(pointerEvent("pointerdown", {
      pointerId: 9,
      pointerType: "pen",
      button: 0,
      buttons: 1,
      pressure: 0.5,
    }));
    card.dispatchEvent(pointerEvent("pointerup", {
      pointerId: 9,
      pointerType: "pen",
      button: 0,
      buttons: 0,
      pressure: 0,
    }));

    const click = new MouseEvent("click", { bubbles: true, cancelable: true, button: 0, detail: 1 });
    card.dispatchEvent(click);

    expect(click.defaultPrevented).toBe(true);
    expect(nativeCardClick).not.toHaveBeenCalled();

    layer.dispose();
  });

  it("correlates a click whose pointer type is misreported", async () => {
    const { wrapper, card } = fixture();
    const nativeCardClick = vi.fn();
    wrapper.addEventListener("click", nativeCardClick, true);
    stubPointerCapture(wrapper);

    const layer = await mountLayer();
    stubCanvasTransform();
    dispatchPenGesture(card, 12);

    const click = pointerEvent("click", {
      pointerId: 12,
      pointerType: "mouse",
      button: 0,
      buttons: 0,
      detail: 1,
    });
    card.dispatchEvent(click);

    expect(click.defaultPrevented).toBe(true);
    expect(nativeCardClick).not.toHaveBeenCalled();

    layer.dispose();
  });

  it("allows unrelated mouse and keyboard clicks after a pen gesture", async () => {
    const { wrapper, card } = fixture();
    const nativeCardClick = vi.fn();
    const nativeCardDoubleClick = vi.fn();
    wrapper.addEventListener("click", nativeCardClick, true);
    wrapper.addEventListener("dblclick", nativeCardDoubleClick, true);
    stubPointerCapture(wrapper);

    const layer = await mountLayer();
    stubCanvasTransform();
    dispatchPenGesture(card, 13);

    const mouseClick = pointerEvent("click", {
      pointerId: 1,
      pointerType: "mouse",
      button: 0,
      buttons: 0,
      detail: 1,
    });
    card.dispatchEvent(mouseClick);
    const keyboardClick = new MouseEvent("click", { bubbles: true, cancelable: true, detail: 0 });
    card.dispatchEvent(keyboardClick);
    const mouseDoubleClick = new MouseEvent("dblclick", { bubbles: true, cancelable: true, detail: 2 });
    card.dispatchEvent(mouseDoubleClick);

    expect(mouseClick.defaultPrevented).toBe(false);
    expect(keyboardClick.defaultPrevented).toBe(false);
    expect(mouseDoubleClick.defaultPrevented).toBe(false);
    expect(nativeCardClick).toHaveBeenCalledTimes(2);
    expect(nativeCardDoubleClick).toHaveBeenCalledOnce();

    layer.dispose();
  });

  it.each(["mouse", "touch"])("invalidates legacy pen correlation on intervening %s input", async (pointerType) => {
    const { wrapper, card } = fixture();
    const nativeCardClick = vi.fn();
    wrapper.addEventListener("click", nativeCardClick, true);
    stubPointerCapture(wrapper);

    const layer = await mountLayer();
    stubCanvasTransform();
    dispatchPenGesture(card, 16);
    card.dispatchEvent(pointerEvent("pointerdown", {
      pointerId: 17,
      pointerType,
      button: 0,
      buttons: 1,
      pressure: pointerType === "touch" ? 1 : 0.5,
    }));
    card.dispatchEvent(pointerEvent("pointerup", {
      pointerId: 17,
      pointerType,
      button: 0,
      buttons: 0,
      pressure: 0,
    }));
    const legacyClick = new MouseEvent("click", { bubbles: true, cancelable: true, detail: 1 });
    card.dispatchEvent(legacyClick);

    expect(legacyClick.defaultPrevented).toBe(false);
    expect(nativeCardClick).toHaveBeenCalledOnce();

    layer.dispose();
  });

  it("does not correlate a legacy click on another card", async () => {
    const { wrapper, card } = fixture();
    const otherCard = requiredElement<HTMLElement>(".other-card");
    const nativeCardClick = vi.fn();
    wrapper.addEventListener("click", nativeCardClick, true);
    stubPointerCapture(wrapper);

    const layer = await mountLayer();
    stubCanvasTransform();
    dispatchPenGesture(card, 18);
    const legacyClick = new MouseEvent("click", { bubbles: true, cancelable: true, detail: 1 });
    otherCard.dispatchEvent(legacyClick);

    expect(legacyClick.defaultPrevented).toBe(false);
    expect(nativeCardClick).toHaveBeenCalledOnce();

    layer.dispose();
  });

  it("leaves plugin control activation native", async () => {
    fixture();
    const control = requiredElement<HTMLElement>(".canvas-controls");
    const nativeControlClick = vi.fn();
    control.addEventListener("click", nativeControlClick);

    const layer = await mountLayer();
    const click = pointerEvent("click", {
      pointerId: 19,
      pointerType: "pen",
      button: 0,
      buttons: 0,
      detail: 1,
    });
    control.dispatchEvent(click);

    expect(click.defaultPrevented).toBe(false);
    expect(nativeControlClick).toHaveBeenCalledOnce();

    layer.dispose();
  });

  it("does not arm click suppression after pointer cancellation", async () => {
    const { wrapper, card } = fixture();
    const nativeCardClick = vi.fn();
    wrapper.addEventListener("click", nativeCardClick, true);
    stubPointerCapture(wrapper);

    const layer = await mountLayer();
    stubCanvasTransform();
    dispatchPenGesture(card, 14, "pointercancel");

    const click = new MouseEvent("click", { bubbles: true, cancelable: true, detail: 1 });
    card.dispatchEvent(click);

    expect(click.defaultPrevented).toBe(false);
    expect(nativeCardClick).toHaveBeenCalledOnce();

    layer.dispose();
  });

  it("suppresses capture-retargeted clicks and anchors a delayed dblclick to the consumed click", async () => {
    let now = 0;
    vi.spyOn(performance, "now").mockImplementation(() => now);
    const { wrapper, card } = fixture();
    const nativeClick = vi.fn();
    const nativeDoubleClick = vi.fn();
    wrapper.addEventListener("click", nativeClick, true);
    wrapper.addEventListener("dblclick", nativeDoubleClick, true);
    stubPointerCapture(wrapper);

    const layer = await mountLayer();
    stubCanvasTransform();
    card.dispatchEvent(pointerEvent("pointerdown", {
      pointerId: 15,
      pointerType: "pen",
      button: 0,
      buttons: 1,
      pressure: 0.5,
    }));
    wrapper.dispatchEvent(pointerEvent("pointerup", {
      pointerId: 15,
      pointerType: "pen",
      button: 0,
      buttons: 0,
      pressure: 0,
    }));

    now = 700;
    const click = new MouseEvent("click", { bubbles: true, cancelable: true, detail: 2 });
    wrapper.dispatchEvent(click);
    now = 1400;
    const doubleClick = new MouseEvent("dblclick", { bubbles: true, cancelable: true, detail: 2 });
    wrapper.dispatchEvent(doubleClick);

    expect(click.defaultPrevented).toBe(true);
    expect(doubleClick.defaultPrevented).toBe(true);
    expect(nativeClick).not.toHaveBeenCalled();
    expect(nativeDoubleClick).not.toHaveBeenCalled();

    layer.dispose();
  });

  it("suppresses dblclick after two owned pen taps", async () => {
    const { wrapper, card } = fixture();
    const nativeCardDoubleClick = vi.fn();
    wrapper.addEventListener("dblclick", nativeCardDoubleClick, true);
    stubPointerCapture(wrapper);

    const layer = await mountLayer();
    stubCanvasTransform();
    for (const pointerId of [10, 11]) {
      card.dispatchEvent(pointerEvent("pointerdown", {
        pointerId,
        pointerType: "pen",
        button: 0,
        buttons: 1,
        pressure: 0.5,
      }));
      card.dispatchEvent(pointerEvent("pointerup", {
        pointerId,
        pointerType: "pen",
        button: 0,
        buttons: 0,
        pressure: 0,
      }));
      card.dispatchEvent(pointerEvent("click", {
        pointerId,
        pointerType: "pen",
        button: 0,
        buttons: 0,
        pressure: 0,
      }));
    }

    const doubleClick = new MouseEvent("dblclick", { bubbles: true, cancelable: true, button: 0 });
    card.dispatchEvent(doubleClick);

    expect(doubleClick.defaultPrevented).toBe(true);
    expect(nativeCardDoubleClick).not.toHaveBeenCalled();

    layer.dispose();
  });

  it("leaves touch input inside the Canvas to native handlers", async () => {
    const { wrapper, card } = fixture();
    const nativeCardPointerDown = vi.fn();
    const nativeCardClick = vi.fn();
    wrapper.addEventListener("pointerdown", nativeCardPointerDown, true);
    wrapper.addEventListener("click", nativeCardClick, true);

    const layer = await mountLayer();
    card.dispatchEvent(pointerEvent("pointerdown", {
      pointerId: 8,
      pointerType: "touch",
      button: 0,
      buttons: 1,
      pressure: 1,
    }));
    card.dispatchEvent(pointerEvent("click", {
      pointerId: 8,
      pointerType: "touch",
      button: 0,
      buttons: 0,
      pressure: 0,
    }));

    expect(nativeCardPointerDown).toHaveBeenCalledOnce();
    expect(nativeCardClick).toHaveBeenCalledOnce();

    layer.dispose();
  });
});

describe("Canvas full color picker integration", () => {
  it("opens from quick colors, commits only Done, scopes tools, and cleans up on dispose", async () => {
    fixture();
    const layer = await mountLayer();
    const activate = (action: string) => requiredElement<HTMLElement>(`[data-action=${action}]`).dispatchEvent(pointerEvent("pointerdown", { pointerType: "pen", pointerId: 51 }));
    const open = () => {
      activate("color");
      requiredElement<HTMLButtonElement>(".canvas-scribe-color-palette > button:last-child").click();
    };
    const click = (name: string) => Array.from(document.querySelectorAll<HTMLButtonElement>(".canvas-scribe-picker button")).find((b) => b.textContent === name)!.click();
    const colorControl = () => requiredElement<HTMLElement>("[data-action=color]").style.getPropertyValue("--canvas-scribe-active-color");
    const initial = colorControl();
    open();
    const input = requiredElement<HTMLInputElement>(".canvas-scribe-picker-inputs input");
    dispatchPenGesture(input, 52);
    expect(document.querySelectorAll(".canvas-scribe-render-layer path")).toHaveLength(0);
    input.value = "#abcdef";
    input.dispatchEvent(new Event("input"));
    expect(colorControl()).toBe(initial);
    click("Done");
    expect(colorControl()).toBe("#abcdef");
    open();
    click("Reset to default");
    click("Cancel");
    expect(colorControl()).toBe("#abcdef");
    activate("highlighter");
    open();
    expect(document.querySelectorAll(".canvas-scribe-picker-recent button")).toHaveLength(0);
    click("Cancel");
    activate("pen");
    open();
    expect(document.querySelectorAll(".canvas-scribe-picker-recent button")).toHaveLength(1);
    click("Reset to default");
    click("Done");
    expect(colorControl()).toBe(initial);
    open();
    layer.dispose();
    expect(document.querySelector(".canvas-scribe-picker-backdrop")).toBeNull();
  });
});

function fixture(): { wrapper: HTMLElement; card: HTMLElement } {
  document.body.innerHTML = `
    <div id="container">
      <div class="canvas-wrapper">
        <div class="canvas">
          <div class="canvas-node"><div class="cm-content" contenteditable="true"></div></div>
          <div class="canvas-node other-card"></div>
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
      process: vi.fn(async (_file: unknown, update: (raw: string) => string) => update("{}")),
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

function dispatchPenGesture(target: Element, pointerId: number, endType = "pointerup"): void {
  target.dispatchEvent(pointerEvent("pointerdown", {
    pointerId,
    pointerType: "pen",
    button: 0,
    buttons: 1,
    pressure: 0.5,
  }));
  target.dispatchEvent(pointerEvent(endType, {
    pointerId,
    pointerType: "pen",
    button: 0,
    buttons: 0,
    pressure: 0,
  }));
}

function requiredElement<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`Expected ${selector} to exist.`);
  return element;
}
