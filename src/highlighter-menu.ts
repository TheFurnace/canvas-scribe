import type { IconRenderer } from "./canvas-controls";
import { strokeToSvgPath } from "./geometry";
import { HIGHLIGHTER_TYPES, type HighlighterType } from "./highlighter-types";
import { toolIconId } from "./tool-icons";
import { createAction, createMenuShell, createNumericControl } from "./ui-controls";
import { createToolMenuColors } from "./tool-menu-colors";

export function createHighlighterMenu(document: Document, options: {
  type: HighlighterType; size: number; opacity: number; color: string;
  renderIcon: IconRenderer; onType: (type: HighlighterType) => void;
  onSize: (value: number) => void; onOpacity: (value: number) => void;
  onColors: () => void; onClose: () => void;
  onColor?: (color: string) => void;
}): HTMLElement {
  let { type, size, opacity } = options;
  let color = options.color;
  const root = createMenuShell(document, "Highlighter", options.onClose);
  root.classList.add("canvas-scribe-highlighter-menu");
  const types = document.createElement("div"); types.className = "canvas-scribe-tip-choices";
  types.setAttribute("role", "group"); types.setAttribute("aria-label", "Highlighter type");
  const choices = HIGHLIGHTER_TYPES.map((value) => {
    const button = createAction(document, "", () => { type = value; options.onType(value); sync(); });
    button.dataset.highlighterType = value;
    const icon = document.createElement("span"); icon.className = "canvas-scribe-illustrated-tip";
    icon.setAttribute("aria-hidden", "true");
    options.renderIcon(icon, toolIconId(`highlighter-${value}`, "full"));
    icon.style.setProperty("--canvas-scribe-tool-color", options.color);
    const label = document.createElement("span"); label.textContent = value === "round" ? "Round" : "Chisel";
    button.append(icon, label); types.append(button); return button;
  });
  root.append(types);
  root.append(createNumericControl(document, {
    label: "Highlighter thickness", min: 2, max: 60, step: 1, value: size, unit: "units",
    onChange: (value) => { size = value; options.onSize(value); sync(); },
  }).root);
  root.append(createNumericControl(document, {
    label: "Highlighter opacity", min: 5, max: 80, step: 1, value: Math.round(opacity * 100), unit: "%",
    onChange: (value) => { opacity = value / 100; options.onOpacity(opacity); sync(); },
  }).root);
  const preview = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  preview.setAttribute("viewBox", "0 0 280 95"); preview.setAttribute("role", "img");
  preview.setAttribute("aria-label", "Overlapping highlights over sample text");
  root.append(preview);
  if (options.onColor) root.append(createToolMenuColors(document, { tool: "highlighter", color,
    onColor: value => { color = value; options.onColor!(value); sync(); }, onColors: options.onColors }));
  else root.append(createAction(document, "Colors…", options.onColors));
  function sync() {
    root.style.setProperty("--canvas-scribe-tool-color", color);
    types.querySelectorAll<HTMLElement>(".canvas-scribe-illustrated-tip").forEach(icon => icon.style.setProperty("--canvas-scribe-tool-color", color));
    choices.forEach((button, index) => button.setAttribute("aria-pressed", String(type === HIGHLIGHTER_TYPES[index])));
    const text = document.createElementNS(preview.namespaceURI, "text");
    text.setAttribute("x", "10"); text.setAttribute("y", "47"); text.setAttribute("fill", "var(--text-normal)");
    text.setAttribute("font-size", "17"); text.textContent = "Keep important ideas visible";
    preview.replaceChildren(text);
    for (const [x, y] of [[12, 42], [120, 55]]) {
      const path = document.createElementNS(preview.namespaceURI, "path");
      path.setAttribute("d", strokeToSvgPath({
        id: "preview", tool: "highlighter", highlighterType: type, color,
        size, opacity, hasPressure: false, createdAt: 0,
        points: [{ x: x!, y: y!, pressure: 0.5, time: 0 }, { x: 258, y: y!, pressure: 0.5, time: 1 }],
      }));
      path.setAttribute("fill", color); path.setAttribute("opacity", String(opacity));
      preview.append(path);
    }
  }
  sync(); return root;
}
