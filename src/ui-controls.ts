/** Shared, host-independent controls. Document changes belong to the caller. */
export function bindDialogKeyboard(root: HTMLElement, dialog: HTMLElement, cancel: () => void): void {
  root.addEventListener("keydown", (event) => {
    event.stopPropagation();
    if (event.key === "Escape") { event.preventDefault(); cancel(); return; }
    if (event.key !== "Tab") return;
    const focusable = Array.from(dialog.querySelectorAll<HTMLElement>("button, input, select, textarea, [tabindex='0']"))
      .filter((element) => !element.closest("[hidden]") && !element.hasAttribute("disabled"));
    const first = focusable[0], last = focusable[focusable.length - 1];
    if (!first || !last) { event.preventDefault(); return; }
    const active = dialog.ownerDocument.activeElement;
    if (event.shiftKey && active === first) { event.preventDefault(); last.focus(); }
    else if ((!event.shiftKey && active === last) || !dialog.contains(active)) { event.preventDefault(); first.focus(); }
  });
}

export function createAction(document: Document, label: string, run: () => void): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "canvas-scribe-ui-button";
  button.textContent = label;
  button.addEventListener("click", () => { if (!button.disabled) run(); });
  return button;
}

export function createMenuShell(document: Document, title: string, onClose: () => void): HTMLElement {
  const root = document.createElement("section");
  root.className = "canvas-scribe-tool-menu";
  root.setAttribute("role", "dialog");
  root.setAttribute("aria-label", `${title} settings`);
  const header = document.createElement("header");
  const heading = document.createElement("strong");
  heading.textContent = title;
  const close = createAction(document, "×", onClose);
  close.setAttribute("aria-label", `Close ${title.toLowerCase()} settings`);
  header.append(heading, close);
  root.append(header);
  root.addEventListener("keydown", (event) => {
    if (event.key === "Escape") { event.preventDefault(); onClose(); }
    event.stopPropagation();
  });
  for (const name of ["pointerdown", "pointerup", "pointermove", "click", "dblclick", "contextmenu"]) {
    root.addEventListener(name, (event) => event.stopPropagation());
  }
  return root;
}

export function createNumericControl(document: Document, options: {
  label: string; value: number; min: number; max: number; step: number;
  unit?: string; onChange: (value: number) => void;
}): { root: HTMLElement; setValue: (value: number) => void } {
  const root = document.createElement("div");
  root.className = "canvas-scribe-numeric";
  const label = document.createElement("label");
  const caption = document.createElement("span");
  caption.textContent = options.label;
  const output = document.createElement("output");
  const row = document.createElement("div");
  row.className = "canvas-scribe-numeric-row";
  let value = options.value;
  const change = (next: number) => { setValue(next); options.onChange(value); };
  const minus = createAction(document, "−", () => change(value - options.step));
  minus.setAttribute("aria-label", `Decrease ${options.label.toLowerCase()}`);
  const plus = createAction(document, "+", () => change(value + options.step));
  plus.setAttribute("aria-label", `Increase ${options.label.toLowerCase()}`);
  const slider = document.createElement("input");
  slider.type = "range";
  slider.min = String(options.min); slider.max = String(options.max); slider.step = String(options.step);
  slider.setAttribute("aria-label", options.label);
  slider.addEventListener("input", () => change(Number(slider.value)));
  function setValue(next: number) {
    if (!Number.isFinite(next)) next = options.min;
    value = Math.min(options.max, Math.max(options.min, Number((Math.round((next - options.min) / options.step) * options.step + options.min).toFixed(6))));
    slider.value = String(value);
    output.value = `${value}${options.unit ? ` ${options.unit}` : ""}`;
    slider.setAttribute("aria-valuetext", output.value);
    minus.disabled = value <= options.min; plus.disabled = value >= options.max;
  }
  label.append(caption, output, slider);
  row.append(minus, label, plus); root.append(row);
  setValue(value);
  return { root, setValue };
}

export function createSwatch(document: Document, options: {
  color: string; label: string; selected: boolean; onSelect: () => void;
}): HTMLButtonElement {
  const button = createAction(document, "", options.onSelect);
  button.classList.add("canvas-scribe-color-swatch");
  button.setAttribute("aria-label", options.label);
  button.title = options.label;
  button.setAttribute("aria-pressed", String(options.selected));
  const preview = document.createElement("span");
  preview.className = "canvas-scribe-color-swatch-preview";
  preview.style.backgroundColor = options.color;
  button.append(preview);
  return button;
}
