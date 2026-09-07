// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { FavoritePens, readFavorites, type PenPreset } from "../src/favorite-pens";
import { ToolColors } from "../src/colors";
import { createPenActions } from "../src/pen-actions";
import { RadialSession } from "../src/radial-session";
import type { DrawingTool } from "../src/types";
const preset: PenPreset = { tool: "pen", penType: "brush", color: "#2563eb", size: 5, opacity: 0.7 };
afterEach(() => document.body.replaceChildren());
const click = (id: string) => {
  const button = document.querySelector<HTMLButtonElement>(`[data-action="${id}"]`);
  expect(button).not.toBeNull(); button!.click();
};
function setup(tool: DrawingTool = "pen", count = 0) {
  const colors = new ToolColors(); const saved = vi.fn();
  const favorites = new FavoritePens([], saved);
  for (let i = 0; i < count; i++) favorites.add(preset);
  const applied = vi.fn(), changed = vi.fn(), closed = vi.fn();
  const session = new RadialSession(document, createPenActions({ document, tool, colors, favorites,
    currentPreset: tool === "pen" || tool === "highlighter" ? preset : null,
    defaultColor: (tool) => tool === "pen" ? "#1f2937" : "#fde047",
    selectTool: vi.fn(), applyFavorite: applied, colorsChanged: changed, openCanvasMenu: vi.fn(),
  }), closed, () => undefined);
  session.open(300, 300);
  return { colors, favorites, saved, applied, changed, closed, session };
}
describe("radial pen actions", () => {
  it("keeps six home slots without undo/redo, navigates in place, and reopens at home", () => {
    const { session, closed } = setup();
    expect(Array.from(document.querySelectorAll('[data-action]')).map((node) => (node as HTMLElement).dataset.action))
      .toEqual(["pen", "highlighter", "eraser", "colors", "favorites", "more"]);
    const before = document.querySelector<HTMLElement>(".canvas-scribe-radial-palette")!.style.cssText;
    click("favorites");
    expect(document.querySelector<HTMLElement>(".canvas-scribe-radial-palette")!.style.cssText).toBe(before);
    expect(closed).not.toHaveBeenCalled();
    document.querySelector<HTMLButtonElement>('[aria-label="Back to pen actions"]')!.click();
    expect(document.querySelector('[data-action="pen"]')).not.toBeNull();
    click("colors"); session.close(); session.open(300, 300);
    expect(document.querySelector('[data-action="pen"]')).not.toBeNull();
  });
  it.each(["eraser", "lasso"] as const)("disables colors for %s", (tool) => {
    setup(tool); expect(document.querySelector<HTMLButtonElement>('[data-action="colors"]')!.disabled).toBe(true);
  });
  it("pages favorites and applies a complete preset", () => {
    const { favorites, applied } = setup("pen", 13);
    click("favorites"); click("next-page"); click("next-page");
    expect(document.querySelector(".canvas-scribe-radial-paging")!.textContent).toContain("3 / 3");
    click(favorites.list()[12]!.id);
    expect(applied).toHaveBeenCalledWith(expect.objectContaining(preset));
    expect(document.querySelector(".canvas-scribe-radial-menu")).toBeNull();
  });
  it("cancels picker edits without changing the tool color", () => {
    const { colors, changed } = setup();
    click("colors"); click("full-picker");
    document.querySelector<HTMLButtonElement>('.canvas-scribe-picker-chip')!.click();
    Array.from(document.querySelectorAll<HTMLButtonElement>('button')).find((b) => b.textContent === "Cancel")!.click();
    expect(colors.selection("pen")).toBeNull(); expect(changed).not.toHaveBeenCalled();
    expect(document.querySelector(".canvas-scribe-radial-menu")).toBeNull();
  });
  it("confirms picker edits into per-tool recent colors", () => {
    const { colors, changed } = setup("highlighter");
    click("colors"); click("full-picker");
    const chip = document.querySelector<HTMLButtonElement>('.canvas-scribe-picker-chip')!;
    const color = chip.getAttribute("aria-label")!.replace("Use ", ""); chip.click();
    Array.from(document.querySelectorAll<HTMLButtonElement>('button')).find((b) => b.textContent === "Done")!.click();
    expect(colors.selection("highlighter")).toBe(color); expect(colors.recent("highlighter")).toContain(color);
    expect(colors.recent("pen")).toEqual([]); expect(changed).toHaveBeenCalledOnce();
  });
  it("saves the current tool from an empty favorites collection", () => {
    const { favorites, saved } = setup(); click("favorites"); click("manage-favorites");
    Array.from(document.querySelectorAll<HTMLButtonElement>('button')).find((b) => b.textContent === "Save current tool")!.click();
    expect(favorites.list()).toHaveLength(1); expect(favorites.list()[0]).toMatchObject(preset);
    expect(saved).toHaveBeenCalledOnce();
  });
});
describe("favorite persistence", () => {
  it("roundtrips presets, order, edits and deletion without retaining malformed entries", () => {
    const saved = vi.fn(), store = new FavoritePens([], saved);
    store.add(preset); store.add({ ...preset, color: null, tool: "highlighter", size: 17 });
    const [first, second] = store.list(); store.update({ ...first!, name: "Blue brush" }); store.move(second!.id, -1);
    const restored = new FavoritePens(JSON.parse(JSON.stringify(saved.mock.lastCall![0])));
    expect(restored.list().map((item) => item.name)).toEqual([second!.name, "Blue brush"]);
    expect(restored.list()[0]!.color).toBeNull(); restored.remove(first!.id); expect(restored.list()).toHaveLength(1);
    expect(readFavorites([null, {}, { ...first, opacity: NaN }, first, first])).toHaveLength(1);
  });
});
