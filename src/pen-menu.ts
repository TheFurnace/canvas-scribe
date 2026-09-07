import { strokeToSvgPath } from "./geometry";
import { clampPenSize, PEN_PROFILES, PEN_TYPES, type PenType } from "./pen-types";
import type { InkStroke } from "./types";

export function penPreviewStroke(type: PenType, size: number, color: string, tilt = false): InkStroke {
  return {
    id: "preview", tool: "pen", penType: type, size, color, opacity: PEN_PROFILES[type].opacity,
    hasPressure: true, createdAt: 0,
    points: Array.from({ length: 65 }, (_, i) => ({
      x: 10 + i * 2, y: 25 + Math.sin(i / 8) * 10,
      pressure: 0.12 + Math.sin(i / 64 * Math.PI) * 0.85,
      tiltX: tilt ? 60 : 0, tiltY: tilt ? 25 : 0, time: i,
    })),
  };
}

export function createPenPreview(document: Document, type: PenType, size: number, color: string, tilt = false): SVGSVGElement {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 148 50");
  svg.setAttribute("aria-hidden", "true");
  const stroke = penPreviewStroke(type, size, color, tilt);
  const path = document.createElementNS(svg.namespaceURI, "path");
  path.setAttribute("d", strokeToSvgPath(stroke));
  path.setAttribute("fill", color);
  path.setAttribute("opacity", String(stroke.opacity));
  svg.append(path);
  return svg;
}

export interface PenMenuOptions {
  type: PenType;
  size: number;
  color: string;
  onType: (type: PenType) => void;
  onSize: (size: number) => void;
  onClose: () => void;
}

export function createPenMenu(document: Document, options: PenMenuOptions): HTMLElement {
  let type = options.type;
  let size = options.size;
  const root = document.createElement("section");
  root.className = "canvas-scribe-pen-menu";
  root.setAttribute("role", "dialog");
  root.setAttribute("aria-label", "Pen settings");
  const button = (parent: HTMLElement, label: string, run: () => void) => {
    const node = document.createElement("button");
    node.type = "button";
    node.textContent = label;
    node.addEventListener("click", run);
    parent.append(node);
    return node;
  };
  const header = document.createElement("header");
  const title = document.createElement("strong");
  title.textContent = "Pen";
  header.append(title);
  button(header, "×", options.onClose).setAttribute("aria-label", "Close pen settings");
  root.append(header);
  const types = document.createElement("div");
  types.className = "canvas-scribe-pen-types";
  types.setAttribute("role", "group");
  types.setAttribute("aria-label", "Pen type");
  root.append(types);
  const choices = PEN_TYPES.map((value) => {
    const node = button(types, "", () => { type = value; options.onType(value); sync(); });
    node.dataset.penType = value;
    node.setAttribute("aria-label", PEN_PROFILES[value].label);
    node.title = PEN_PROFILES[value].description;
    return node;
  });
  const widthHeading = document.createElement("div");
  widthHeading.className = "canvas-scribe-pen-width-heading";
  const label = document.createElement("span");
  label.textContent = "Thickness";
  const output = document.createElement("output");
  output.setAttribute("aria-live", "polite");
  widthHeading.append(label, output);
  root.append(widthHeading);
  const widths = document.createElement("div");
  widths.className = "canvas-scribe-pen-width";
  const changeSize = (value: number) => { size = clampPenSize(value); options.onSize(size); sync(); };
  const minus = button(widths, "−", () => changeSize(size - 0.5));
  minus.setAttribute("aria-label", "Decrease pen thickness");
  const slider = document.createElement("input");
  slider.type = "range";
  slider.min = "1"; slider.max = "20"; slider.step = "0.5";
  slider.setAttribute("aria-label", "Pen thickness");
  slider.addEventListener("input", () => changeSize(Number(slider.value)));
  widths.append(slider);
  const plus = button(widths, "+", () => changeSize(size + 0.5));
  plus.setAttribute("aria-label", "Increase pen thickness");
  root.append(widths);
  const description = document.createElement("p");
  description.className = "canvas-scribe-pen-description";
  root.append(description);
  function sync() {
    choices.forEach((node, index) => {
      const value = PEN_TYPES[index]!;
      node.setAttribute("aria-pressed", String(type === value));
      const name = document.createElement("span");
      name.textContent = PEN_PROFILES[value].label;
      node.replaceChildren(createPenPreview(document, value, size, options.color), name);
    });
    output.value = String(size);
    slider.value = String(size);
    slider.setAttribute("aria-valuetext", `${size} canvas units`);
    minus.disabled = size <= 1; plus.disabled = size >= 20;
    description.textContent = PEN_PROFILES[type].description;
  }
  root.addEventListener("keydown", (event) => {
    if (event.key === "Escape") { event.preventDefault(); options.onClose(); }
    event.stopPropagation();
  });
  for (const event of ["pointerdown", "pointerup", "pointermove", "click", "dblclick", "contextmenu"]) {
    root.addEventListener(event, (e) => e.stopPropagation());
  }
  sync();
  return root;
}
