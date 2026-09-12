// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from "vitest";
import { createPenMenu } from "../src/pen-menu";
import { createHighlighterMenu } from "../src/highlighter-menu";
import { createRadialPages } from "../src/radial-pages";
import { RadialSession } from "../src/radial-session";
import { ToolColors } from "../src/colors";
import { FavoritePens } from "../src/favorite-pens";
import { renderStoryIcon } from "../stories/story-helpers";

afterEach(() => document.body.replaceChildren());

it("applies menu quick colors to the model, preview and tool shelf without dismissing", () => {
  const onColor = vi.fn(), onClose = vi.fn();
  for (const menu of [createPenMenu(document, { type: "fountain", size: 3.5, color: "#111111", renderIcon: renderStoryIcon, onType: vi.fn(), onSize: vi.fn(), onColor, onClose }),
    createHighlighterMenu(document, { type: "round", size: 17, opacity: .38, color: "#111111", renderIcon: renderStoryIcon, onType: vi.fn(), onSize: vi.fn(), onOpacity: vi.fn(), onColors: vi.fn(), onColor, onClose })]) {
    document.body.append(menu);
    const colors = menu.querySelectorAll<HTMLButtonElement>(".canvas-scribe-menu-colors button");
    const chosen = colors[1]!; chosen.click();
    expect(onColor).toHaveBeenLastCalledWith(chosen.getAttribute("aria-label")!.replace("Use ", ""));
    expect(chosen.getAttribute("aria-pressed")).toBe("true");
    expect(menu.querySelectorAll('.canvas-scribe-menu-colors [aria-pressed="true"]')).toHaveLength(1);
    expect(menu.querySelector<HTMLElement>(".canvas-scribe-illustrated-tip")!.style.getPropertyValue("--canvas-scribe-tool-color"))
      .toBe(onColor.mock.lastCall![0]);
    expect(onClose).not.toHaveBeenCalled();
    expect(menu.isConnected).toBe(true);
  }
});

it("keeps all radial colors and More colors reachable, cancel transactional, and page focus stable", () => {
  const colors = new ToolColors(); colors.confirm("pen", "#2563eb");
  const pages = createRadialPages({ document, tool: "pen", penType: "fountain", highlighterType: "round", eraserMode: "stroke", colors,
    favorites: new FavoritePens(), currentPreset: { tool: "pen", penType: "fountain", size: 3.5, opacity: 1, color: "#2563eb" },
    defaultColor: () => "#111111", selectTool: vi.fn(), applyFavorite: vi.fn(), colorsChanged: vi.fn(), openCanvasMenu: vi.fn(),
    selectPen: vi.fn(), selectHighlighter: vi.fn(), selectEraser: vi.fn(), setSize: vi.fn(), getSize: () => 3.5,
    undo: vi.fn(), redo: vi.fn(), canUndo: () => false, canRedo: () => false, openSettings: vi.fn() });
  const session = new RadialSession(document, pages, vi.fn(), renderStoryIcon);
  session.open(200, 200);
  document.querySelector<HTMLButtonElement>('[data-tab="1"]')!.click();
  expect(document.activeElement?.getAttribute("data-tab")).toBe("1");
  document.querySelector<HTMLButtonElement>('[data-action="colors"]')!.click();
  expect(document.querySelector(".canvas-scribe-radial-paging")).toBeNull();
  document.querySelector<HTMLButtonElement>('[data-action="full-picker"]')!.click();
  document.querySelector<HTMLElement>(".canvas-scribe-picker-backdrop")!
    .dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
  expect(colors.current("pen", "#111111")).toBe("#2563eb");
  session.open(200, 200);
  expect(document.querySelector('[data-action="colors"]')).not.toBeNull();
  expect(document.querySelector('[data-action="full-picker"]')).toBeNull();
  session.close();
});
