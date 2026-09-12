// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from "vitest";
import { createCircularSize } from "../src/circular-size";
import { createRadialPages } from "../src/radial-pages";
import { RadialSession } from "../src/radial-session";
import { ToolColors } from "../src/colors";
import { FavoritePens } from "../src/favorite-pens";
import { createEraserMenu } from "../src/eraser-menu";
import { createQuickColors } from "../src/quick-colors";
import { renderStoryIcon } from "../stories/story-helpers";

afterEach(() => document.body.replaceChildren());
it("remembers only the top radial page, renders every variant, and keeps history actions open", () => {
  let count = 1, size = 3.5, opacity = 1;
  const pages = createRadialPages({ document, tool: "pen", penType: "fountain", highlighterType: "round", eraserMode: "stroke",
    colors: new ToolColors(), favorites: new FavoritePens(), currentPreset: { tool: "pen", penType: "fountain", size, opacity: 1, color: null },
    defaultColor: () => "#111111", selectTool: vi.fn(), applyFavorite: vi.fn(), colorsChanged: vi.fn(), openCanvasMenu: vi.fn(),
    selectPen: vi.fn(), selectHighlighter: vi.fn(), selectEraser: vi.fn(), setSize: (value) => { size = value; }, getSize: () => size,
    undo: () => { count--; }, redo: () => { count++; }, canUndo: () => count > 0, canRedo: () => count === 0, getOpacity: () => opacity, setOpacity: (value) => { opacity = value; },
  });
  const session = new RadialSession(document, pages, vi.fn(), renderStoryIcon);
  const button = (text: string) => Array.from(document.querySelectorAll<HTMLButtonElement>("button")).find((node) => node.getAttribute("aria-label") === text)!;
  const action = (id: string) => document.querySelector<HTMLButtonElement>(`[data-action="${id}"]`)!;
  session.open(200, 200); button("Quick tools").click();
  expect(document.querySelectorAll(".canvas-scribe-radial-action")).toHaveLength(9);
  button("Settings").click(); action("undo").click();
  expect(action("undo").disabled).toBe(true); expect(action("redo").disabled).toBe(false);
  action("size").click();
  const ring = document.querySelector<HTMLElement>('[role="slider"]')!;
  expect(document.activeElement).toBe(ring);
  expect(document.querySelector(".canvas-scribe-radial-tabs")).toBeNull();
  expect(document.querySelector(".canvas-scribe-radial-close")).toBeNull();
  expect(document.querySelector("button.canvas-scribe-radial-hero")).not.toBeNull();
  expect(ring.closest('.canvas-scribe-radial-palette')).not.toBeNull();
  expect(ring.closest('.is-width-arc')).not.toBeNull();
  expect(document.querySelector('.canvas-scribe-radial-value-pill output')?.textContent).toBe("3.5px");
  expect(document.querySelector('.canvas-scribe-size-backdrop')).toBeNull();
  ring.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
  expect(size).toBe(4);
  document.querySelector<HTMLButtonElement>('[aria-label="Back to pen actions"]')!.click();
  expect(action("size")).toBeTruthy();
  expect(action("tool-settings")).toBeNull();
  expect(action("opacity")).toBeNull();
  action("colors").click(); session.close(); session.open(200, 200);
  expect(action("colors")).toBeTruthy(); expect(action("default-color")).toBeNull();
  session.close();
});

it("adjusts circular size across the angular seam, retains the panel on release, and cancels capture", () => {
  const change = vi.fn(); const root = createCircularSize(document, { label: "Thickness", value: 10, min: 1, max: 20, step: 0.5,
    onChange: change, onClose: vi.fn(), onBack: vi.fn(), preview: () => document.createElement("span") });
  document.body.append(root);
  const ring = root.querySelector<HTMLElement>('[role="slider"]')!;
  Object.defineProperty(ring, "getBoundingClientRect", { value: () => ({ left: 0, top: 0, width: 200, height: 200 }) });
  let captured = false;
  ring.setPointerCapture = () => { captured = true; }; ring.hasPointerCapture = () => captured; ring.releasePointerCapture = () => { captured = false; };
  const event = (name: string, x: number, y: number) => ring.dispatchEvent(new PointerEvent(name, { pointerId: 1, button: 0, clientX: x, clientY: y, bubbles: true }));
  event("pointerdown", 0, 101); event("pointermove", 0, 99);
  expect(Number(ring.getAttribute("aria-valuenow"))).toBeGreaterThanOrEqual(9.5);
  expect(Number(ring.getAttribute("aria-valuenow"))).toBeLessThanOrEqual(10.5);
  event("pointerup", 0, 99); expect(captured).toBe(false); expect(root.isConnected).toBe(true);
  event("pointerdown", 200, 100); event("pointercancel", 200, 100);
  const calls = change.mock.calls.length; event("pointermove", 100, 200);
  expect(captured).toBe(false); expect(change).toHaveBeenCalledTimes(calls);
});

it("requires a separate confirmation for clear-all and keeps mode/filter independent", () => {
  const clear = vi.fn(), change = vi.fn();
  const root = createEraserMenu(document, { settings: { mode: "stroke", highlighterOnly: true, radius: 18 }, canClear: true, onClear: clear, onChange: change, onClose: vi.fn() });
  document.body.append(root);
  root.querySelector<HTMLButtonElement>('[data-eraser-mode="area"]')!.click();
  expect(change).toHaveBeenLastCalledWith({ mode: "area", highlighterOnly: true, radius: 18 });
  const buttons = Array.from(root.querySelectorAll<HTMLButtonElement>("button"));
  buttons.find((node) => node.textContent === "Erase all ink on this Canvas…")!.click();
  expect(clear).not.toHaveBeenCalled();
  buttons.find((node) => node.textContent === "Keep ink")!.click(); expect(clear).not.toHaveBeenCalled();
  buttons.find((node) => node.textContent === "Erase all ink on this Canvas…")!.click();
  buttons.find((node) => node.textContent === "Erase all ink")!.click(); expect(clear).toHaveBeenCalledOnce();
});

it("offers tool-specific quick colors, recent custom colors, and an explicit default", () => {
  const select = vi.fn(); const more = vi.fn();
  const root = createQuickColors(document, { tool: "highlighter", current: "#754c98", defaultColor: "#fde047", isDefault: false,
    recent: ["#754c98", "#754c98", "#fde047"], onSelect: select, onMore: more, onClose: vi.fn() });
  document.body.append(root);
  expect(root.querySelector('[aria-label="Recent colors"]')!.querySelectorAll("button")).toHaveLength(1);
  root.querySelector<HTMLButtonElement>('[aria-label="Use default color"]')!.click(); expect(select).toHaveBeenCalledWith(null);
  root.querySelector<HTMLButtonElement>('[aria-label="Use #fb7185 for highlighter"]')!.click(); expect(select).toHaveBeenCalledWith("#fb7185");
  Array.from(root.querySelectorAll("button")).find((node) => node.textContent === "More colors…")!.click(); expect(more).toHaveBeenCalledOnce();
});

it.each(["round", "chisel"] as const)("keeps %s highlighter width and opacity independent in a split submenu", (highlighterType) => {
  let size = 17, opacity = .4;
  const pages = createRadialPages({ document, tool: "highlighter", penType: "fountain", highlighterType, eraserMode: "stroke",
    colors: new ToolColors(), favorites: new FavoritePens(), currentPreset: { tool: "highlighter", penType: "fountain", highlighterType, size, opacity, color: null },
    defaultColor: () => "#fde047", selectTool: vi.fn(), applyFavorite: vi.fn(), colorsChanged: vi.fn(), openCanvasMenu: vi.fn(),
    selectPen: vi.fn(), selectHighlighter: vi.fn(), selectEraser: vi.fn(), setSize: (value) => { size = value; }, getSize: () => size,
    undo: vi.fn(), redo: vi.fn(), canUndo: () => false, canRedo: () => false, getOpacity: () => opacity, setOpacity: (value) => { opacity = value; } });
  const session = new RadialSession(document, pages, vi.fn(), renderStoryIcon);
  session.open(200, 200);
  document.querySelector<HTMLButtonElement>('[data-tab="1"]')!.click();
  const opener = document.querySelector<HTMLButtonElement>('[data-action="size"]')!;
  expect(opener.textContent).toBe("");
  expect(opener.querySelector<HTMLElement>('.canvas-scribe-size-dot')!.style.opacity).toBe("0.4");
  opener.click();
  const width = document.querySelector<HTMLElement>('[aria-label="Tool thickness"]')!;
  const alpha = document.querySelector<HTMLElement>('[aria-label="Tool opacity"]')!;
  expect(document.querySelectorAll('[role="slider"]')).toHaveLength(2);
  width.dispatchEvent(new KeyboardEvent("keydown", {key:"ArrowRight", bubbles:true}));
  expect(size).toBe(18); expect(opacity).toBe(.4);
  alpha.dispatchEvent(new KeyboardEvent("keydown", {key:"ArrowRight", bubbles:true}));
  expect(size).toBe(18); expect(opacity).toBe(.45); expect(width.isConnected).toBe(true);
  document.querySelector<HTMLButtonElement>('button.canvas-scribe-radial-hero')!.click();
  expect(document.querySelector<HTMLElement>('[data-action="size"] .canvas-scribe-size-dot')!.style.opacity).toBe("0.45");
  session.close();
});

it("rotates the embedded disk with the drag beneath a stationary value pill", () => {
  const change = vi.fn();
  const root = createCircularSize(document, {label: "Opacity", value:75, min:0, max:100, step:1,
    embedded:true, half:"right", unit:"%", onChange:change,onClose:vi.fn(),onBack:vi.fn(),preview:()=>document.createElement("span")});
  document.body.append(root);
  const ring = root.querySelector<HTMLElement>('[role=slider]')!;
  const pill = root.querySelector('.canvas-scribe-radial-value-pill')!;
  const disk = root.querySelector('.canvas-scribe-adjustment-disk g')!;
  const before = Number(disk.getAttribute('transform')!.match(/rotate\(([-\d.]+)/)![1]);
  ring.getBoundingClientRect = () => ({left:0,top:0,width:200,height:200} as DOMRect);
  ring.setPointerCapture = vi.fn(); ring.hasPointerCapture = () => true; ring.releasePointerCapture = vi.fn();
  ring.dispatchEvent(new PointerEvent('pointerdown',{pointerId:1,button:0,clientX:200,clientY:100,bubbles:true}));
  ring.dispatchEvent(new PointerEvent('pointermove',{pointerId:1,clientX:100,clientY:200,bubbles:true}));
  expect(Number(ring.getAttribute('aria-valuenow'))).toBeLessThan(75);
  expect(Number(disk.getAttribute('transform')!.match(/rotate\(([-\d.]+)/)![1])).toBeGreaterThan(before);
  expect(root.querySelector('.canvas-scribe-radial-value-pill')).toBe(pill);
  ring.dispatchEvent(new PointerEvent('pointercancel',{pointerId:1,bubbles:true}));
  const calls = change.mock.calls.length;
  ring.dispatchEvent(new PointerEvent('pointermove',{pointerId:1,clientX:0,clientY:100,bubbles:true}));
  expect(change).toHaveBeenCalledTimes(calls);
});
