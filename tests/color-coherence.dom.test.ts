// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from "vitest";
import { InkToolState } from "../src/ink-tool-state";
import { FavoritePens } from "../src/favorite-pens";
import { createToolColors, createToolRadial } from "../src/tool-suite";
import { RadialSession } from "../src/radial-session";
import { createRadialColors, RadialColors } from "../src/radial-colors";
import { toolSwatches } from "../src/colors";
import { createQuickColors } from "../src/quick-colors";
import { createColorPicker } from "../src/color-picker";

afterEach(() => document.body.replaceChildren());
it("retains collection colors that also appear in history outside the radial", () => {
  const color = toolSwatches("pen")[0]!;
  const drawer = createQuickColors(document, { tool: "pen", current: color, defaultColor: "#111111", isDefault: false, recent: [color], onSelect: vi.fn(), onMore: vi.fn(), onClose: vi.fn() });
  expect(drawer.querySelector('[aria-label="Quick colors"]')!.querySelector(`[aria-label="Use ${color} for pen"]`)).not.toBeNull();
  expect(drawer.querySelector('[aria-label="Recent colors"]')!.querySelector(`[aria-label="Use ${color} for pen"]`)).not.toBeNull();
  const picker = createColorPicker(document, { tool: "pen", current: color, defaultColor: "#111111", recent: [color], onConfirm: vi.fn(), onCancel: vi.fn() });
  expect(picker.querySelectorAll('.canvas-scribe-picker-swatches button')).toHaveLength(toolSwatches("pen").length);
  expect(picker.querySelector('.canvas-scribe-picker-recent')!.querySelector(`[aria-label="Use ${color}"]`)).not.toBeNull();
  expect(new RadialColors("pen", color, [color]).swatches).not.toContain(color);
});
const click = (selector: string) => document.querySelector<HTMLButtonElement>(selector)!.click();
function radial(selected: string | null = "#2563eb") {
  const state = new InkToolState(); state.toolColors.confirm("pen", "#112233"); state.toolColors.confirm("pen", selected);
  const session = new RadialSession(document, createToolRadial(document, state, new FavoritePens(), {
    selectTool: vi.fn(), changed: vi.fn(), defaultColor: () => "#2563eb", undo: vi.fn(), redo: vi.fn(), canUndo: () => false, canRedo: () => false,
  }), vi.fn(), () => {});
  session.open(250, 250); click('[data-tab="1"]'); click('[data-action="colors"]');
  return { state, session };
}
it("keeps matching Theme and fixed choices independent and never seeds default into history", () => {
  const { state, session } = radial(null);
  expect(document.querySelector('[data-color="default"]')?.getAttribute("aria-pressed")).toBe("true");
  expect(document.querySelectorAll('[data-color="#2563eb"]')).toHaveLength(1);
  click('[data-color="#2563eb"]');
  expect(document.querySelectorAll('.canvas-scribe-radial-colors [aria-pressed="true"]')).toHaveLength(1);
  expect(state.toolColors.selection("pen")).toBe("#2563eb");
  click('[data-color="default"]'); session.close();
  expect(state.toolColors.selection("pen")).toBeNull(); expect(state.toolColors.recent("pen")).toEqual(["#112233"]);
});
it.each(["escape", "outside", "close"])("commits only the final color on %s even after leaving the submenu", dismissal => {
  const { state, session } = radial(); const history = state.toolColors.recent("pen");
  click('[data-color="#dc2626"]'); click('[data-color="#16a34a"]');
  click('[aria-label="Back to pen actions"]');
  expect(state.toolColors.recent("pen")).toEqual(history);
  click('[data-action="colors"]');
  expect(document.querySelector('[data-color-group="recent"]')?.getAttribute("data-color")).toBe("#2563eb");
  if (dismissal === "escape") document.querySelector('.canvas-scribe-radial-menu')!.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  else if (dismissal === "outside") document.body.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
  else session.close();
  expect(state.toolColors.recent("pen")).toEqual(["#16a34a", ...history]);
});
it("keeps picker cancellation local and defers Done until radial dismissal", () => {
  const { state, session } = radial(); const history = state.toolColors.recent("pen");
  click('[data-action="full-picker"]');
  const hex = document.querySelector<HTMLInputElement>('.canvas-scribe-picker-inputs input')!;
  hex.value = "abcdef"; hex.dispatchEvent(new Event("input"));
  const button = (label: string) => Array.from(document.querySelectorAll<HTMLButtonElement>('.canvas-scribe-picker button')).find(b => b.textContent === label)!.click();
  button("Cancel"); expect(state.toolColors.selection("pen")).toBe("#2563eb");
  expect(document.querySelector('.canvas-scribe-radial-colors')).not.toBeNull();
  click('[data-action="full-picker"]');
  const input = document.querySelector<HTMLInputElement>('.canvas-scribe-picker-inputs input')!; input.value = "fedcba"; input.dispatchEvent(new Event("input"));
  button("Done"); expect(state.toolColors.selection("pen")).toBe("#fedcba"); expect(state.toolColors.recent("pen")).toEqual(history);
  session.close(); expect(state.toolColors.recent("pen")).toEqual(["#fedcba", ...history]);
});
it("closes a drawer choice immediately and shares history with the next surface", () => {
  const state = new InkToolState(); let root: HTMLElement;
  const close = vi.fn(() => root.remove());
  root = createToolColors(document, state, "highlighter", { defaultColor: "#fde047", close, changed: vi.fn(), mount: menu => { root.remove(); root = menu; document.body.append(root); } });
  document.body.append(root); click('[aria-label="Use #fb7185 for highlighter"]');
  expect(close).toHaveBeenCalledOnce(); expect(root.isConnected).toBe(false);
  expect(state.toolColors.recent("highlighter")).toEqual(["#fb7185"]); expect(state.toolColors.recent("pen")).toEqual([]);
  const restored = new InkToolState(state.serialize()); expect(restored.toolColors.selection("highlighter")).toBe("#fb7185");
});
it("uses spare recent slots for swatches and supports keyboard access through the whole collection", () => {
  const model = new RadialColors("pen", null, []), select = vi.fn();
  const root = createRadialColors(document, model, { defaultColor: "#111111", selection: () => null, onSelect: select, onMore: vi.fn() }); document.body.append(root);
  expect(root.querySelectorAll('[data-color-group="swatch"]:not([hidden])')).toHaveLength(8);
  const arc = root.querySelector<HTMLElement>('.canvas-scribe-swatch-arc')!;
  arc.dispatchEvent(new KeyboardEvent("keydown", { key: "End", bubbles: true }));
  expect(document.activeElement?.getAttribute("data-color")).toBe(toolSwatches("pen")[toolSwatches("pen").length - 1]);
  expect(document.activeElement?.closest('[hidden]')).toBeNull(); expect(select).not.toHaveBeenCalled();
  (document.activeElement as HTMLButtonElement).click(); expect(select).toHaveBeenCalledWith(toolSwatches("pen")[toolSwatches("pen").length - 1]);
});
it("scrolls by dragging without selecting and preserves the scroll position when rebuilt", () => {
  const model = new RadialColors("pen", null, []), select = vi.fn();
  const root = createRadialColors(document, model, { defaultColor: "#111111", selection: () => null, onSelect: select, onMore: vi.fn() }); document.body.append(root);
  const arc = root.querySelector<HTMLElement>('.canvas-scribe-swatch-arc')!;
  arc.setPointerCapture = vi.fn();
  root.getBoundingClientRect = () => ({ left: 0, top: 0, width: 250, height: 250 } as DOMRect);
  const event = (name: string, x: number, y: number) => arc.dispatchEvent(new PointerEvent(name, { pointerId: 1, button: 0, clientX: x, clientY: y, bubbles: true }));
  event("pointerdown", 33, 125); event("pointermove", 50, 180); event("pointerup", 50, 180);
  root.querySelector<HTMLButtonElement>('[data-color-group="swatch"]:not([hidden])')!.dispatchEvent(new MouseEvent("click", { bubbles: true, detail: 1 }));
  expect(select).not.toHaveBeenCalled(); expect(model.offset).toBeGreaterThan(0);
  root.querySelector<HTMLButtonElement>('[data-color-group="swatch"]:not([hidden])')!.click();
  expect(select).toHaveBeenCalledOnce();
  const rebuilt = createRadialColors(document, model, { defaultColor: "#111111", selection: () => null, onSelect: select, onMore: vi.fn() });
  expect(rebuilt.querySelector('.canvas-scribe-swatch-arc')?.getAttribute('data-offset')).toBe(String(model.offset));
});
