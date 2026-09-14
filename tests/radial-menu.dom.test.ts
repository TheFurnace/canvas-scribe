// @vitest-environment happy-dom

import { afterEach, describe, expect, it, vi } from "vitest";

import type { App } from "obsidian";

import { CanvasInkLayer } from "../src/canvas-ink-layer";
import type { CanvasTarget } from "../src/canvas-target";
import { FavoritePens } from "../src/favorite-pens";
import { DebugLogger } from "../src/debug-logger";
import { RadialMenu, type RadialMenuAction } from "../src/radial-menu";

afterEach(() => {
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

describe("RadialMenu DOM behavior", () => {
  it.each(["pen", "touch"])("keeps a long %s tap open and consumes its following click", pointerType => {
    const now = vi.spyOn(Date, "now").mockReturnValue(1000);
    const run = vi.fn(), close = vi.fn();
    const menu = new RadialMenu(document, [{ ...action("pen", run), longPress: true }], close);
    menu.open(150, 150);
    const button = requiredElement<HTMLElement>('[data-action="pen"]');
    button.dispatchEvent(pointerEvent("pointerdown", { pointerType, pointerId: 5, button: 0 }));
    now.mockReturnValue(1600);
    button.dispatchEvent(pointerEvent("pointerup", { pointerType, pointerId: 5, button: 0 }));
    expect(run).toHaveBeenCalledOnce(); expect(close).not.toHaveBeenCalled();
    requiredElement<HTMLElement>('[data-action="pen"]').dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, detail: 1 }));
    expect(run).toHaveBeenCalledOnce(); expect(close).not.toHaveBeenCalled();
    const next = requiredElement<HTMLElement>('[data-action="pen"]');
    next.dispatchEvent(pointerEvent("pointerdown", { pointerType, pointerId: 5, button: 0 }));
    next.dispatchEvent(pointerEvent("pointerup", { pointerType, pointerId: 5, button: 0 }));
    next.dispatchEvent(new MouseEvent("click", { bubbles: true, detail: 1 }));
    expect(run).toHaveBeenCalledTimes(2); expect(close).toHaveBeenCalledOnce();
  });

  it.each(["pointercancel", "pointermove"])("does not select a held tool after %s", type => {
    const now = vi.spyOn(Date, "now").mockReturnValue(1000), run = vi.fn();
    const menu = new RadialMenu(document, [{ ...action("pen", run), longPress: true }], vi.fn());
    menu.open(150, 150);
    const button = requiredElement<HTMLElement>('[data-action="pen"]');
    button.dispatchEvent(pointerEvent("pointerdown", { pointerType: "pen", pointerId: 5, button: 0 }));
    now.mockReturnValue(1600);
    button.dispatchEvent(pointerEvent(type, { pointerType: "pen", pointerId: 5, clientX: 30 }));
    button.dispatchEvent(pointerEvent("pointerup", { pointerType: "pen", pointerId: 5 }));
    button.dispatchEvent(new MouseEvent("click", { bubbles: true, detail: 1 }));
    expect(run).not.toHaveBeenCalled(); menu.close();
  });

  it("clamps the palette center inside the viewport", () => {
    setViewport(300, 200);
    const menu = new RadialMenu(document, [action("pen")], vi.fn());

    menu.open(290, 190);

    const palette = requiredElement<HTMLElement>(".canvas-scribe-radial-palette");
    expect(palette.style.left).toBe("188px");
    expect(palette.style.top).toBe("112px");
  });

  it.each([
    ["the backdrop", () => requiredElement<HTMLElement>(".canvas-scribe-radial-menu").dispatchEvent(pointerEvent("pointerdown"))],
    ["outside the radial", () => document.body.dispatchEvent(pointerEvent("pointerdown"))],
    ["Escape", () => requiredElement<HTMLElement>(".canvas-scribe-radial-menu").dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }))],
  ])("dismisses from %s", (_description, dismiss) => {
    const onClose = vi.fn();
    const menu = new RadialMenu(document, [action("pen")], onClose);
    menu.open(150, 150);

    dismiss();

    expect(document.querySelector(".canvas-scribe-radial-menu")).toBeNull();
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("closes before dispatching an enabled action and ignores disabled actions", () => {
    const observations: boolean[] = [];
    const runEnabled = vi.fn(() => observations.push(document.querySelector(".canvas-scribe-radial-menu") === null));
    const runDisabled = vi.fn();
    const menu = new RadialMenu(document, [
      action("pen", runEnabled),
      { ...action("undo", runDisabled), disabled: true },
    ], vi.fn());
    menu.open(150, 150);

    requiredElement<HTMLButtonElement>('[data-action="undo"]').click();
    expect(runDisabled).not.toHaveBeenCalled();
    expect(document.querySelector(".canvas-scribe-radial-menu")).not.toBeNull();

    requiredElement<HTMLButtonElement>('[data-action="pen"]').click();
    expect(runEnabled).toHaveBeenCalledOnce();
    expect(observations).toEqual([true]);
  });
});

describe("CanvasInkLayer radial-menu integration", () => {
  it("uses the outside pen contact only to dismiss the radial, then accepts the next stroke", async () => {
    const { layer, eventTarget } = await mountedLayer();
    eventTarget.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: 200, clientY: 200 }));
    const down = pointerEvent("pointerdown", { pointerId: 7, pointerType: "pen", button: 0, buttons: 1, pressure: .5, clientX: 24, clientY: 32 });
    eventTarget.dispatchEvent(down);
    eventTarget.dispatchEvent(pointerEvent("pointermove", { pointerId: 7, pointerType: "pen", buttons: 1, pressure: .5, clientX: 50, clientY: 32 }));
    eventTarget.dispatchEvent(pointerEvent("pointerup", { pointerId: 7, pointerType: "pen", buttons: 0, clientX: 50, clientY: 32 }));
    expect(down.defaultPrevented).toBe(true);
    expect(document.querySelector(".canvas-scribe-radial-menu")).toBeNull();
    expect(document.querySelectorAll(".canvas-scribe-render-layer path")).toHaveLength(0);
    eventTarget.dispatchEvent(pointerEvent("pointerdown", { pointerId: 7, pointerType: "pen", button: 0, buttons: 1, pressure: .5, clientX: 24, clientY: 32 }));
    expect(document.querySelectorAll(".canvas-scribe-render-layer path")).toHaveLength(1);
    layer.dispose();
  });

  it("keeps a long-selected Canvas tool active in the radial and toolbar", async () => {
    const { layer, eventTarget } = await mountedLayer();
    const now = vi.spyOn(Date, "now").mockReturnValue(1000);
    eventTarget.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: 200, clientY: 200 }));
    radialPage("Quick tools");
    const button = requiredElement<HTMLElement>('[data-action="eraser-area"]');
    button.dispatchEvent(pointerEvent("pointerdown", { pointerId: 7, pointerType: "pen", button: 0 }));
    now.mockReturnValue(1600);
    button.dispatchEvent(pointerEvent("pointerup", { pointerId: 7, pointerType: "pen", button: 0 }));
    expect(requiredElement<HTMLElement>('[data-action="eraser-area"]').getAttribute("aria-checked")).toBe("true");
    const eraser = requiredElement<HTMLElement>('.canvas-scribe-controls [data-action="eraser"]');
    expect(eraser.getAttribute("aria-pressed")).toBe("true");
    expect(eraser.title).toBe("Area eraser");
    expect(eraser.querySelector('[data-icon="canvas-scribe-eraser-area"]')).not.toBeNull();
    layer.dispose();
  });
  it("dismisses expanded settings on a pen stroke without losing the first ink point", async () => {
    const { eventTarget } = await mountedLayer();
    requiredElement<HTMLElement>('.canvas-scribe-controls [data-action="pen"]').dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    expect(document.querySelector('.canvas-scribe-pen-menu')).not.toBeNull();
    eventTarget.dispatchEvent(pointerEvent("pointerdown", { pointerId: 7, pointerType: "pen", button: 0, buttons: 1, pressure: .5, clientX: 24, clientY: 32 }));
    expect(document.querySelector('.canvas-scribe-pen-menu')).toBeNull();
    expect(document.querySelectorAll('.canvas-scribe-render-layer path')).toHaveLength(1);
    eventTarget.dispatchEvent(pointerEvent("pointerup", { pointerId: 7, pointerType: "pen", button: 0, buttons: 0, clientX: 24, clientY: 32 }));
  });
  it("cancels and rolls back an active pen gesture before opening the radial menu", async () => {
    const { layer, logger, wrapper, eventTarget } = await mountedLayer();

    eventTarget.dispatchEvent(pointerEvent("pointerdown", {
      pointerId: 7,
      pointerType: "pen",
      button: 0,
      buttons: 1,
      pressure: 0.5,
      clientX: 24,
      clientY: 32,
    }));
    expect(document.querySelectorAll(".canvas-scribe-render-layer path")).toHaveLength(1);

    eventTarget.dispatchEvent(new MouseEvent("contextmenu", {
      bubbles: true,
      cancelable: true,
      clientX: 24,
      clientY: 32,
      button: 2,
    }));

    expect(document.querySelectorAll(".canvas-scribe-render-layer path")).toHaveLength(0);
    expect(document.querySelector(".canvas-scribe-radial-menu")).not.toBeNull();
    expect(logger.snapshot().entries).toContainEqual(expect.objectContaining({
      category: "ink",
      event: "gesture_cancelled",
      data: { reason: "context_menu" },
    }));

    layer.dispose();
    expect(wrapper.querySelector(".canvas-scribe-render-layer")).toBeNull();
  });

  it("applies a favorite only to subsequent strokes and keeps menu gestures out of ink", async () => {
    const favorites = new FavoritePens([{ id: "blue-brush", name: "Blue brush", tool: "pen", penType: "brush", color: "#2563eb", size: 8, opacity: 0.6 }]);
    const { layer, eventTarget } = await mountedLayer(favorites);
    eventTarget.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: 200, clientY: 200 }));
    radialPage("Settings");
    requiredElement<HTMLButtonElement>('[data-action="colors"]').click();
    requiredElement<HTMLButtonElement>('[data-action="full-picker"]').click();
    requiredElement<HTMLElement>(".canvas-scribe-picker").dispatchEvent(pointerEvent("pointerdown", { pointerType: "pen", buttons: 1, button: 0 }));
    expect(document.querySelectorAll(".canvas-scribe-render-layer path")).toHaveLength(0);
    requiredElement<HTMLElement>(".canvas-scribe-picker").dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
    eventTarget.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: 200, clientY: 200 }));
    radialPage("Favorites");
    requiredElement<HTMLButtonElement>('[data-action="blue-brush"]').click();
    const penControl = requiredElement<HTMLElement>('.canvas-scribe-controls [data-action="pen"]');
    expect(penControl.dataset.penType).toBe("brush");
    expect(penControl.style.getPropertyValue("--canvas-scribe-tool-color")).toBe("#2563eb");
    expect(penControl.getAttribute("aria-label")).toBe("Brush pen · #2563eb · 8px · 60% opacity");
    eventTarget.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: 200, clientY: 200 }));
    radialPage("Quick tools");
    const radialPen = requiredElement<HTMLElement>('.canvas-scribe-radial-action[data-action="pen-brush"]');
    expect(radialPen.getAttribute("aria-label")).toBe("Brush");
    expect(radialPen.style.getPropertyValue("--canvas-scribe-tool-color")).toBe("#2563eb");
    document.body.dispatchEvent(pointerEvent("pointerdown"));
    eventTarget.dispatchEvent(pointerEvent("pointerdown", { pointerId: 8, pointerType: "pen", button: 0, buttons: 1, pressure: 0.5, clientX: 20, clientY: 30 }));
    const path = requiredElement<SVGPathElement>(".canvas-scribe-render-layer path");
    expect(path.getAttribute("fill")).toBe("#2563eb"); expect(path.getAttribute("opacity")).toBe("0.6");
    layer.dispose();
  });

  it("opens one native context menu at the radial button while retaining the original target", async () => {
    const { layer, eventTarget } = await mountedLayer();
    const replayed = vi.fn<(event: MouseEvent) => void>();
    eventTarget.addEventListener("contextmenu", replayed);

    const intercepted = new MouseEvent("contextmenu", {
      bubbles: true,
      cancelable: true,
      clientX: 81,
      clientY: 93,
      button: 2,
    });
    eventTarget.dispatchEvent(intercepted);
    expect(intercepted.defaultPrevented).toBe(true);
    expect(replayed).not.toHaveBeenCalled();

    radialPage("Settings");
    const menuButton = requiredElement<HTMLButtonElement>('[data-action="canvas-menu"]');
    vi.spyOn(menuButton, "getBoundingClientRect").mockReturnValue({ left: 200, top: 80, width: 44, height: 44 } as DOMRect);
    menuButton.click();

    expect(replayed).toHaveBeenCalledOnce();
    const replay = replayed.mock.calls[0]?.[0];
    expect(replay).toMatchObject({ clientX: 222, clientY: 102, button: 2 });
    expect(replay?.defaultPrevented).toBe(false);
    expect(document.querySelector(".canvas-scribe-radial-menu")).toBeNull();

    layer.dispose();
  });
});

function action(id: string, run = vi.fn()): RadialMenuAction {
  return { id, label: id, icon: id, run };
}

function requiredElement<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`Expected ${selector} to exist.`);
  return element;
}

function radialPage(label: string): void {
  const button = Array.from(document.querySelectorAll<HTMLButtonElement>(".canvas-scribe-radial-tabs button")).find((node) => node.getAttribute("aria-label") === label);
  if (!button) throw new Error(`Missing radial page ${label}`);
  button.click();
}

function setViewport(width: number, height: number): void {
  Object.defineProperty(window, "innerWidth", { configurable: true, value: width });
  Object.defineProperty(window, "innerHeight", { configurable: true, value: height });
}

function pointerEvent(type: string, init: PointerEventInit = {}): PointerEvent {
  return new PointerEvent(type, { bubbles: true, cancelable: true, ...init });
}

async function mountedLayer(favorites = new FavoritePens()): Promise<{
  layer: CanvasInkLayer;
  logger: DebugLogger;
  wrapper: HTMLElement;
  eventTarget: HTMLElement;
}> {
  document.body.innerHTML = `
    <div id="container">
      <div class="canvas-wrapper">
        <div class="canvas"><div class="canvas-node"></div></div>
      </div>
      <div class="canvas-controls"></div>
    </div>
  `;
  const container = requiredElement<HTMLElement>("#container");
  const wrapper = requiredElement<HTMLElement>(".canvas-wrapper");
  const eventTarget = requiredElement<HTMLElement>(".canvas-node");
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
  const logger = new DebugLogger();
  const layer = new CanvasInkLayer(app, target, logger, favorites);
  await layer.mount();

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

  return { layer, logger, wrapper, eventTarget };
}
