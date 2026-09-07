import type { Meta, StoryObj } from "@storybook/web-components-vite";
import { createPenMenu, createPenPreview } from "../src/pen-menu";
import { createColorPicker } from "../src/color-picker";
import { PEN_PROFILES, PEN_TYPES, type PenType } from "../src/pen-types";
import { strokeToSvgPath } from "../src/geometry";
import type { InkStroke } from "../src/types";

function playground() {
  let type: PenType = "fountain";
  let size = 3.5;
  let color = "var(--text-normal)";
  const root = document.createElement("div");
  root.style.cssText = "display:flex;flex-wrap:wrap;gap:24px;padding:24px;align-items:flex-start;width:100%;max-width:1120px;box-sizing:border-box;font-family:var(--font-interface,system-ui,sans-serif)";
  const samples = document.createElement("div");
  samples.style.cssText = "flex:1;min-width:240px";
  const heading = document.createElement("h2");
  heading.textContent = "Find your pen";
  const hint = document.createElement("p");
  hint.textContent = "Compare the same stroke, then draw below. Changes apply to your next stroke.";
  const gallery = document.createElement("div");
  const pad = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  pad.setAttribute("viewBox", "0 0 560 220");
  pad.setAttribute("aria-label", "Try your pen here");
  pad.style.cssText = "width:100%;height:220px;touch-action:none;border:1px solid var(--background-modifier-border);border-radius:12px;background:var(--background-primary)";
  const clear = document.createElement("button");
  clear.textContent = "Clear drawing";
  clear.onclick = () => pad.replaceChildren();
  samples.append(heading, hint, gallery, pad, clear);
  const menuHost = document.createElement("div");
  root.append(samples, menuHost);
  function refreshGallery() {
    gallery.replaceChildren();
    for (const value of PEN_TYPES) {
      const row = document.createElement("div");
      row.style.cssText = "display:flex;align-items:center;gap:12px";
      const label = document.createElement("span");
      label.textContent = PEN_PROFILES[value].label;
      label.style.cssText = "width:80px;font-size:13px";
      const preview = createPenPreview(document, value, size, color);
      preview.style.cssText = "width:180px;height:56px";
      row.append(label, preview);
      if (value === "pencil") {
        const tilted = createPenPreview(document, value, size, color, true);
        tilted.style.cssText = "width:180px;height:56px";
        tilted.setAttribute("role", "img");
        tilted.removeAttribute("aria-hidden");
        tilted.setAttribute("aria-label", "Pencil tilted for shading");
        const tiltLabel = document.createElement("span");
        tiltLabel.textContent = "Tilted";
        tiltLabel.style.cssText = "font-size:12px;color:var(--text-muted)";
        row.append(tilted, tiltLabel);
      }
      gallery.append(row);
    }
  }
  function showMenu() {
    const menu = createPenMenu(document, {
      type, size, color,
      onType: (value) => { type = value; },
      onSize: (value) => { size = value; refreshGallery(); },
      onColor: () => {
        const picker = createColorPicker(document, {
          tool: "pen", current: color.startsWith("#") ? color : "#333333", defaultColor: "#333333", recent: [],
          onConfirm: (value) => { color = value ?? "var(--text-normal)"; picker.remove(); showMenu(); refreshGallery(); },
          onCancel: () => picker.remove(),
        });
        root.append(picker);
      },
      onClose: () => {
        const open = document.createElement("button");
        open.textContent = "Open pen settings";
        open.onclick = showMenu;
        menuHost.replaceChildren(open);
      },
    });
    menu.style.position = "relative";
    menuHost.replaceChildren(menu);
  }
  let stroke: InkStroke | null = null;
  let path: SVGPathElement | null = null;
  let pointer: number | null = null;
  function append(event: PointerEvent) {
    if (!stroke || !path) return;
    const matrix = pad.getScreenCTM()?.inverse();
    if (!matrix) return;
    const point = new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix);
    stroke.points.push({ x: point.x, y: point.y, pressure: event.pressure || 0.5, tiltX: event.tiltX, tiltY: event.tiltY, time: event.timeStamp });
    path.setAttribute("d", strokeToSvgPath(stroke, false));
  }
  pad.addEventListener("pointerdown", (event) => {
    if (pointer !== null) return;
    pointer = event.pointerId;
    pad.setPointerCapture(pointer);
    stroke = { id: "draw", tool: "pen", penType: type, size, color, opacity: PEN_PROFILES[type].opacity,
      points: [], hasPressure: event.pointerType === "pen", createdAt: 0 };
    path = document.createElementNS(pad.namespaceURI, "path") as SVGPathElement;
    path.setAttribute("fill", color); path.setAttribute("opacity", String(stroke.opacity));
    pad.append(path); append(event);
  });
  pad.addEventListener("pointermove", (event) => { if (event.pointerId === pointer) append(event); });
  for (const name of ["pointerup", "pointercancel"] as const) pad.addEventListener(name, (event) => {
    if (event.pointerId !== pointer) return;
    if (stroke && path) path.setAttribute("d", strokeToSvgPath(stroke));
    pointer = null; stroke = null; path = null;
  });
  refreshGallery(); showMenu();
  return root;
}

const meta = { title: "Canvas Scribe/Pen Menu", render: playground } satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;
export const Light: Story = { globals: { obsidianTheme: "light" } };
export const Dark: Story = { globals: { obsidianTheme: "dark" } };
export const Tablet: Story = { globals: { obsidianTheme: "light", obsidianPlatform: "mobile" } };
