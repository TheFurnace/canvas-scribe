// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
import { registerToolIcons } from "../src/tool-icons";
import { createCanvasControls, syncCanvasControls } from "../src/canvas-controls";
import { createPenMenu } from "../src/pen-menu";
import { createToolIconButton } from "../src/tool-icon-button";

describe("registered tool artwork integration", () => {
  it("resolves production toolbar and pen-menu artwork through the registered Obsidian IDs", () => {
    const registry = new Map<string, string>();
    registerToolIcons((id, svg) => registry.set(id, svg));
    const rendered: string[] = [];
    const render = (container: HTMLElement, id: string) => {
      if (!id.startsWith("canvas-scribe-")) return; // Host-owned action icons.
      const body = registry.get(id);
      expect(body, `Unregistered icon: ${id}`).toBeDefined();
      const svg = new DOMParser().parseFromString(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">${body}</svg>`, "image/svg+xml");
      expect(svg.querySelector("parsererror")).toBeNull();
      expect(svg.querySelector("path[d]")).not.toBeNull();
      container.replaceChildren(document.importNode(svg.documentElement, true));
      rendered.push(id);
    };
    const group = createCanvasControls(document, render, { setTool: vi.fn(), toggleColorPalette: vi.fn(), undo: vi.fn(), redo: vi.fn(), toggleEnabled: vi.fn() });
    for (const penType of ["ballpoint", "fountain", "brush", "pencil"] as const) {
      syncCanvasControls(group, { activeTool: "pen", penType, enabled: true, canUndo: false, canRedo: false });
    }
    const menu = createPenMenu(document, { renderIcon: render, type: "fountain", size: 3.5, color: "#ffffff", onType: vi.fn(), onSize: vi.fn(), onClose: vi.fn() });
    expect(new Set(rendered).size).toBe(11); // Four pens, four tips, highlighter, eraser and lasso.
    expect(menu.querySelectorAll('.canvas-scribe-illustrated-tip svg')).toHaveLength(4);
    expect(menu.querySelector('[data-pen-type="fountain"]')?.getAttribute("aria-pressed")).toBe("true");
    // Validate planned variants as well, without placing them in live controls.
    for (const id of registry.keys()) render(document.createElement("span"), id);
  });

  it("keeps artwork decorative and exposes name, ink, selection and disabled state on the control", () => {
    const select = vi.fn();
    const button = createToolIconButton(document, () => undefined, { tool: "fountain", color: "#ffffff", selected: true, disabled: true, onSelect: select });
    expect(button.getAttribute("aria-label")).toBe("Fountain · #ffffff");
    expect(button.getAttribute("aria-pressed")).toBe("true");
    expect(button.style.getPropertyValue("--canvas-scribe-tool-color")).toBe("#ffffff");
    expect(button.querySelector(".canvas-scribe-tool-color")).toBeNull();
    expect(button.querySelector('.canvas-scribe-tool-icon')?.getAttribute("aria-hidden")).toBe("true");
    button.click(); expect(select).not.toHaveBeenCalled();
    const eraser = createToolIconButton(document, () => undefined, { tool: "eraser-area", color: "#ffffff" });
    expect(eraser.querySelector('.canvas-scribe-tool-color')).toBeNull();
  });
});
