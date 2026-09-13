import { strokeToSvgPath } from "./geometry";
import { clampPenSize, PEN_PROFILES, PEN_TYPES, type PenType } from "./pen-types";
import type { InkStroke } from "./types";
import { toolIconId } from "./tool-icons";
import type { IconRenderer } from "./canvas-controls";
import { createAction, createMenuShell, createNumericControl } from "./ui-controls";
import { createToolMenuColors } from "./tool-menu-colors";


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
  renderIcon: IconRenderer;
  type: PenType;
  size: number;
  color: string;
  onType: (type: PenType) => void;
  onSize: (size: number) => void;
  onClose: () => void;
  onColor?: (color: string) => void;
  onColors?: () => void;
}

export function createPenMenu(document: Document, options: PenMenuOptions): HTMLElement {
  let type = options.type;
  let size = options.size;
  let color = options.color;
  const root = createMenuShell(document, "Pen", options.onClose);
  root.classList.add("canvas-scribe-pen-menu");
  const button = (parent: HTMLElement, label: string, run: () => void) => {
    const node = createAction(document, label, run);
    parent.append(node);
    return node;
  };
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
  const numeric = createNumericControl(document, {
    label: "Pen thickness", value: size, min: 1, max: 20, step: 0.5, unit: "units",
    onChange: (value) => { size = clampPenSize(value); options.onSize(size); sync(); },
  });
  root.append(numeric.root);
  const description = document.createElement("p");
  description.className = "canvas-scribe-pen-description";
  root.append(description);
  const preview = document.createElement("div"); preview.className = "canvas-scribe-menu-preview";
  root.insertBefore(preview, numeric.root);
  if (options.onColor) root.append(createToolMenuColors(document, { tool: "pen", color,
    onColor: value => { color = value; options.onColor!(value); sync(); }, onColors: options.onColors }));
  function sync() {
    choices.forEach((node, index) => {
      const value = PEN_TYPES[index]!;
      node.setAttribute("aria-pressed", String(type === value));
      const name = document.createElement("span");
      name.textContent = PEN_PROFILES[value].label;
      const artwork = document.createElement("span");
      artwork.className = "canvas-scribe-pen-artwork";
      artwork.setAttribute("aria-hidden", "true");
      const tip = document.createElement("span");
      tip.className = "canvas-scribe-illustrated-tip";
      options.renderIcon(tip, toolIconId(value, "full"));
      tip.style.setProperty("--canvas-scribe-tool-color", color);
      artwork.append(tip);
      node.replaceChildren(artwork, name);
    });
    numeric.setValue(size);
    description.textContent = PEN_PROFILES[type].description;
    preview.replaceChildren(createPenPreview(document, type, size, color));
  }
  sync();
  return root;
}
