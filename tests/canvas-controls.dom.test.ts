// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
import { createCanvasControls, syncCanvasControls, type CanvasControlsState } from "../src/canvas-controls";

describe("toolbar configuration indicators", () => {
  const state: CanvasControlsState = {
    activeTool: "pen", penType: "fountain", penColor: "#ffffff", highlighterColor: "#fde047",
    enabled: true, canUndo: false, canRedo: false,
  };
  function setup() {
    const setTool = vi.fn();
    const group = createCanvasControls(document, (container, name) => {
      const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      svg.dataset.icon = name;
      container.append(svg);
    }, { setTool, toggleColorPalette: vi.fn(), undo: vi.fn(), redo: vi.fn(), toggleEnabled: vi.fn() });
    return { group, setTool };
  }
  it("preserves independent colors while switching to highlighter or lasso", () => {
    const { group } = setup();
    for (const activeTool of ["pen", "highlighter", "lasso"] as const) {
      syncCanvasControls(group, { ...state, activeTool });
      for (const [tool, color] of [["pen", "#ffffff"], ["highlighter", "#fde047"]]) {
        const button = group.querySelector<HTMLElement>(`[data-action=${tool}]`)!;
        expect(button.style.getPropertyValue("--canvas-scribe-tool-color")).toBe(color);
        expect(button.getAttribute("aria-pressed")).toBe(String(activeTool === tool));
      }
    }
  });
  it("updates each silhouette and label without replacing the focused button or its actions", () => {
    const { group, setTool } = setup();
    document.body.append(group);
    const pen = group.querySelector<HTMLElement>("[data-action=pen]")!;
    pen.focus();
    for (const penType of ["ballpoint", "fountain", "brush", "pencil"] as const) {
      syncCanvasControls(group, { ...state, penType });
      expect(pen.querySelectorAll("svg")).toHaveLength(1);
      expect(pen.getAttribute("aria-label")?.toLowerCase()).toContain(penType);
      expect(document.activeElement).toBe(pen);
    }
    pen.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    expect(setTool).toHaveBeenCalledWith("pen");
    group.remove();
  });
  it("retains configuration while input is off and allows theme default ink", () => {
    const { group } = setup();
    syncCanvasControls(group, { ...state, enabled: false, penColor: "var(--text-normal)" });
    const pen = group.querySelector<HTMLElement>("[data-action=pen]")!;
    expect(pen.getAttribute("aria-pressed")).toBe("false");
    expect(pen.title).toContain("Default color");
    expect(pen.style.getPropertyValue("--canvas-scribe-tool-color")).toBe("var(--text-normal)");
  });
});
