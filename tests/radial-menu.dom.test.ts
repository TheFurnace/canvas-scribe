// @vitest-environment happy-dom

import { afterEach, describe, expect, it, vi } from "vitest";

import type { App } from "obsidian";

import { CanvasInkLayer } from "../src/canvas-ink-layer";
import type { CanvasTarget } from "../src/canvas-target";
import { DebugLogger } from "../src/debug-logger";
import { RadialMenu, type RadialMenuAction } from "../src/radial-menu";

afterEach(() => {
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

describe("RadialMenu DOM behavior", () => {
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
    ["the close button", () => requiredElement<HTMLButtonElement>(".canvas-scribe-radial-close").click()],
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

  it("replays one native contextmenu event on the original connected target", async () => {
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

    requiredElement<HTMLButtonElement>('[data-action="canvas-menu"]').click();

    expect(replayed).toHaveBeenCalledOnce();
    const replay = replayed.mock.calls[0]?.[0];
    expect(replay).toMatchObject({ clientX: 81, clientY: 93, button: 2 });
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

function setViewport(width: number, height: number): void {
  Object.defineProperty(window, "innerWidth", { configurable: true, value: width });
  Object.defineProperty(window, "innerHeight", { configurable: true, value: height });
}

function pointerEvent(type: string, init: PointerEventInit = {}): PointerEvent {
  return new PointerEvent(type, { bubbles: true, cancelable: true, ...init });
}

async function mountedLayer(): Promise<{
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
  const layer = new CanvasInkLayer(app, target, logger);
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
