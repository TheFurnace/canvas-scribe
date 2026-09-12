import { createAction, createMenuShell, createNumericControl } from "./ui-controls";
import type { IconRenderer } from "./canvas-controls";
import { toolIconId } from "./tool-icons";

export interface SelectionSettings { mode: "lasso" | "rectangle"; partial: boolean; }
export function createSelectionMenu(document: Document, options: {
  settings: SelectionSettings; count: number; onChange: (settings: SelectionSettings) => void;
  onScale: (scale: number) => void; onRecolor: () => void; onClose: () => void;
  renderIcon?: IconRenderer;
}): HTMLElement {
  const settings = { ...options.settings };
  const root = createMenuShell(document, "Selection", options.onClose);
  root.classList.add("canvas-scribe-mode-menu");
  const modes = document.createElement("div"); modes.className = "canvas-scribe-tip-choices";
  modes.setAttribute("role", "group"); modes.setAttribute("aria-label", "Selection mode");
  const choices = (["lasso", "rectangle"] as const).map((mode) => {
    const button = createAction(document, mode === "lasso" ? "Lasso" : "Rectangle", () => {
      settings.mode = mode; options.onChange({ ...settings }); sync();
    });
    const icon = document.createElement("span"); icon.setAttribute("aria-hidden", "true");
    options.renderIcon?.(icon, toolIconId(mode === "lasso" ? "lasso" : "selection-rectangle")); button.prepend(icon);
    button.dataset.selectionMode = mode; modes.append(button); return button;
  });
  root.append(modes);
  const label = document.createElement("label");
  const partial = document.createElement("input"); partial.type = "checkbox"; partial.checked = settings.partial;
  partial.addEventListener("change", () => { settings.partial = partial.checked; options.onChange({ ...settings }); });
  label.append(partial, " Include partially selected strokes"); root.append(label);
  const count = document.createElement("p"); count.textContent = options.count ? `${options.count} selected strokes` : "Draw around ink to select it.";
  root.append(count);
  let percent = 100;
  const numeric = createNumericControl(document, {
    label: "Selection scale", min: 10, max: 400, step: 5, value: percent, unit: "%",
    onChange: (value) => { percent = value; },
  });
  const scale = createAction(document, "Apply scale", () => { options.onScale(percent / 100); percent = 100; numeric.setValue(100); });
  const recolor = createAction(document, "Recolor selected ink…", options.onRecolor);
  scale.disabled = recolor.disabled = options.count === 0;
  root.append(numeric.root, scale, recolor);
  function sync() { choices.forEach((button) => button.setAttribute("aria-pressed", String(button.dataset.selectionMode === settings.mode))); }
  sync(); return root;
}
