import { createAction, createMenuShell, createNumericControl } from "./ui-controls";

export interface EraserSettings { mode: "stroke" | "area"; highlighterOnly: boolean; radius: number; }
export function createEraserMenu(document: Document, options: {
  settings: EraserSettings; onChange: (settings: EraserSettings) => void;
  canClear: boolean; onClear: () => void; onClose: () => void;
  clearLabel?: string; clearMessage?: string;
}): HTMLElement {
  const settings = { ...options.settings };
  const root = createMenuShell(document, "Eraser", options.onClose);
  const modes = document.createElement("div"); modes.className = "canvas-scribe-tip-choices";
  modes.setAttribute("role", "group"); modes.setAttribute("aria-label", "Eraser mode");
  const buttons = (["stroke", "area"] as const).map((mode) => {
    const button = createAction(document, mode === "stroke" ? "Stroke eraser" : "Area eraser", () => {
      settings.mode = mode; options.onChange({ ...settings }); sync();
    });
    button.dataset.eraserMode = mode; modes.append(button); return button;
  });
  root.append(modes);
  const filter = document.createElement("label");
  const checkbox = document.createElement("input"); checkbox.type = "checkbox"; checkbox.checked = settings.highlighterOnly;
  checkbox.addEventListener("change", () => { settings.highlighterOnly = checkbox.checked; options.onChange({ ...settings }); });
  filter.append(checkbox, " Erase highlighter only"); root.append(filter);
  root.append(createNumericControl(document, {
    label: "Eraser diameter", value: settings.radius * 2, min: 8, max: 100, step: 2, unit: "screen px",
    onChange: (value) => { settings.radius = value / 2; options.onChange({ ...settings }); },
  }).root);
  const clear = createAction(document, options.clearLabel ?? "Erase all ink on this Canvas…", () => { confirmation.hidden = false; confirm.focus(); });
  clear.classList.add("canvas-scribe-destructive"); clear.disabled = !options.canClear;
  const confirmation = document.createElement("div"); confirmation.hidden = true;
  const message = document.createElement("p"); message.textContent = options.clearMessage ?? "Erase all pen and highlighter ink? Canvas cards stay in place. You can undo this.";
  const confirm = createAction(document, "Erase all ink", () => { options.onClear(); options.onClose(); });
  const cancel = createAction(document, "Keep ink", () => { confirmation.hidden = true; clear.focus(); });
  confirmation.append(message, cancel, confirm); root.append(clear, confirmation);
  function sync() { buttons.forEach((button) => button.setAttribute("aria-pressed", String(button.dataset.eraserMode === settings.mode))); }
  sync(); return root;
}
