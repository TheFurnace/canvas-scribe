import { renderStoryIcon } from "./story-helpers";
import type { Meta, StoryObj } from "@storybook/web-components-vite";
import { createEraserMenu, type EraserSettings } from "../src/eraser-menu";
import { createSelectionMenu, type SelectionSettings } from "../src/selection-menu";
import { eraseInk, eraserOutline, transformInk } from "../src/ink-operations";
import { strokeToSvgPath } from "../src/geometry";
import { selectRenderedStroke } from "../src/selection";
import { cloneStrokes, type InkStroke } from "../src/types";

function preview(tool: "eraser" | "selection", empty = false) {
  const root = document.createElement("div"); root.style.cssText = "display:flex;gap:20px;align-items:flex-start;flex-wrap:wrap;padding:16px";
  let strokes: InkStroke[] = empty ? [] : (["pen", "highlighter", "highlighter"] as const).map((kind, index) => ({
    id: `sample-${index}`, tool: kind, penType: kind === "pen" ? "fountain" : undefined,
    highlighterType: kind === "highlighter" ? index === 1 ? "round" : "chisel" : undefined,
    color: kind === "pen" ? "#2563eb" : "#fde047", size: kind === "pen" ? 5 : 20,
    opacity: kind === "pen" ? 1 : 0.38, createdAt: 1, hasPressure: false,
    points: Array.from({ length: 30 }, (_, i) => ({ x: 20 + i * 8, y: 50 + index * 55 + Math.sin(i / 3) * 7, pressure: 0.5, time: i })),
  }));
  const history: InkStroke[][] = [];
  const selected = new Set<string>();
  let eraser: EraserSettings = { mode: "area", highlighterOnly: false, radius: 18 };
  let selection: SelectionSettings = { mode: "rectangle", partial: true };
  const surface = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  surface.setAttribute("viewBox", "0 0 300 230"); surface.style.cssText = "width:300px;max-width:100%;border:1px solid var(--background-modifier-border);touch-action:none";
  surface.setAttribute("aria-label", "Ink operation preview; drag to erase or select");
  let start: { x: number; y: number } | null = null;
  let polygon: { x: number; y: number }[] = [];
  function position(event: PointerEvent) {
    const box = surface.getBoundingClientRect(); return { x: (event.clientX - box.left) * 300 / box.width, y: (event.clientY - box.top) * 230 / box.height };
  }
  const panel = document.createElement("div");
  const demo = document.createElement("div");
  const caption = document.createElement("p"); caption.textContent = "Drag on the sample ink. This fixture uses shared operations; it is not a live Obsidian Canvas.";
  const undo = document.createElement("button"); undo.textContent = "Undo preview";
  undo.addEventListener("click", () => { const previous = history.pop(); if (previous) strokes = previous; render(); });
  demo.append(caption, surface, undo); root.append(panel, demo);
  function menu() {
    const child = tool === "eraser" ? createEraserMenu(document, { renderIcon: renderStoryIcon,
      settings: eraser, onChange: (value) => { eraser = value; }, canClear: strokes.length > 0,
      onClear: () => { history.push(cloneStrokes(strokes)); strokes = []; render(); }, onClose: () => { panel.replaceChildren(); },
    }) : createSelectionMenu(document, { renderIcon: renderStoryIcon,
      settings: selection, count: selected.size, onChange: (value) => { selection = value; },
      onScale: (scale) => { history.push(cloneStrokes(strokes)); strokes = strokes.map((stroke) => selected.has(stroke.id) ? transformInk(stroke, (x, y) => [150 + (x - 150) * scale, 115 + (y - 115) * scale], scale) : stroke); render(); },
      onRecolor: () => { history.push(cloneStrokes(strokes)); strokes = strokes.map((stroke) => selected.has(stroke.id) ? { ...stroke, color: "#dc2626" } : stroke); render(); },
      onClose: () => { panel.replaceChildren(); },
    });
    child.style.position = "relative"; panel.replaceChildren(child);
  }
  function render() {
    surface.replaceChildren(...strokes.map((stroke) => {
      const path = document.createElementNS(surface.namespaceURI, "path");
      path.setAttribute("d", strokeToSvgPath(stroke)); path.setAttribute("fill", stroke.color); path.setAttribute("opacity", String(stroke.opacity));
      if (selected.has(stroke.id)) { path.setAttribute("stroke", "var(--interactive-accent)"); path.setAttribute("stroke-dasharray", "3 2"); }
      return path;
    }));
    undo.disabled = history.length === 0;
  }
  surface.addEventListener("pointerdown", (event) => {
    start = position(event); polygon = [start]; surface.setPointerCapture(event.pointerId);
    if (tool === "eraser") history.push(cloneStrokes(strokes));
  });
  surface.addEventListener("pointermove", (event) => {
    if (!start) return; const point = position(event);
    if (tool === "eraser") strokes = eraseInk(strokes, eraserOutline(point.x, point.y, eraser.radius), eraser).strokes;
    else polygon.push(point);
    render();
  });
  surface.addEventListener("pointerup", (event) => {
    if (!start) return;
    if (tool === "selection") {
      const end = position(event);
      const region = selection.mode === "rectangle" ? [start, { x: end.x, y: start.y }, end, { x: start.x, y: end.y }] : polygon;
      selected.clear(); strokes.filter((stroke) => selectRenderedStroke(stroke, region, selection.partial)).forEach((stroke) => selected.add(stroke.id));
    }
    start = null; surface.releasePointerCapture(event.pointerId); render(); menu();
  });
  surface.addEventListener("pointercancel", () => { start = null; });
  const reopen = document.createElement("button"); reopen.textContent = "Open settings"; reopen.addEventListener("click", menu); demo.append(reopen);
  render(); menu(); return root;
}
const meta = { title: "Canvas Scribe/Expanded Tools", render: () => preview("eraser") } satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;
export const Eraser: Story = {};
export const Selection: Story = { render: () => preview("selection") };
export const EmptySelection: Story = { render: () => preview("selection", true) };
export const Dark: Story = { globals: { obsidianTheme: "dark" } };
export const Tablet: Story = { globals: { obsidianPlatform: "mobile" } };
