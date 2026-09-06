import { CURATED_SWATCHES, hexToHsv, hexToRgb, hsvToHex, parseHex, rgbToHex, type ColorTool } from "./colors";

export interface ColorPickerOptions {
  tool: ColorTool;
  current: string;
  defaultColor: string;
  recent: readonly string[];
  view?: "Swatches" | "Spectrum";
  onConfirm: (color: string | null) => void;
  onCancel: () => void;
}

/** Pending edits belong to this view; only Done calls onConfirm. Null means follow the tool default. */
export function createColorPicker(document: Document, options: ColorPickerOptions): HTMLElement {
  const root = document.createElement("div");
  root.className = "canvas-scribe-picker-backdrop";
  const dialog = document.createElement("section");
  dialog.className = "canvas-scribe-picker";
  dialog.setAttribute("role", "dialog");
  dialog.setAttribute("aria-modal", "true");
  dialog.setAttribute("aria-label", `${options.tool === "pen" ? "Pen" : "Highlighter"} color`);
  root.append(dialog);
  let pending = options.current;
  let reset = false;
  let hsv = hexToHsv(pending);
  const button = (label: string, parent: HTMLElement, run: () => void) => {
    const node = document.createElement("button");
    node.type = "button";
    node.textContent = label;
    node.addEventListener("click", run);
    parent.append(node);
    return node;
  };
  const heading = document.createElement("h3");
  heading.textContent = `${options.tool === "pen" ? "Pen" : "Highlighter"} color`;
  dialog.append(heading);
  const tabs = document.createElement("div");
  tabs.className = "canvas-scribe-picker-tabs";
  tabs.setAttribute("role", "group");
  tabs.setAttribute("aria-label", "Color picker view");
  dialog.append(tabs);
  const swatches = document.createElement("div");
  swatches.className = "canvas-scribe-picker-swatches";
  const spectrum = document.createElement("div");
  spectrum.className = "canvas-scribe-picker-spectrum";
  dialog.append(swatches, spectrum);
  const tabButtons = ["Swatches", "Spectrum"].map((name) => button(name, tabs, () => showView(name)));
  function showView(name: string) {
    swatches.hidden = name !== "Swatches";
    spectrum.hidden = name !== "Spectrum";
    tabButtons.forEach((tab) => tab.setAttribute("aria-pressed", String(tab.textContent === name)));
  }
  const chips: HTMLButtonElement[] = [];
  const addChip = (color: string, parent: HTMLElement) => {
    const chip = button("", parent, () => select(color));
    chip.className = "canvas-scribe-picker-chip";
    chip.style.setProperty("--chip-color", color);
    chip.setAttribute("aria-label", `Use ${color}`);
    chips.push(chip);
  };
  CURATED_SWATCHES.forEach((color) => addChip(color, swatches));
  const field = document.createElement("div");
  field.className = "canvas-scribe-picker-field";
  field.tabIndex = 0;
  field.setAttribute("role", "group");
  field.setAttribute("aria-label", "Hue and saturation. Arrow keys change hue and saturation.");
  const marker = document.createElement("span");
  marker.className = "canvas-scribe-picker-marker";
  field.append(marker);
  spectrum.append(field);
  let pointer: number | null = null;
  const pick = (event: PointerEvent) => {
    const rect = field.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    hsv[0] = Math.max(0, Math.min(359.99, (event.clientX - rect.left) / rect.width * 360));
    hsv[1] = Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height));
    select(hsvToHex(...hsv), true);
  };
  field.addEventListener("pointerdown", (event) => {
    if (pointer !== null) return;
    event.preventDefault();
    pointer = event.pointerId;
    field.focus();
    field.setPointerCapture(event.pointerId);
    pick(event);
  });
  field.addEventListener("pointermove", (event) => { if (event.pointerId === pointer) pick(event); });
  field.addEventListener("pointerup", (event) => {
    if (event.pointerId !== pointer) return;
    pick(event);
    pointer = null;
    field.releasePointerCapture(event.pointerId);
  });
  field.addEventListener("lostpointercapture", () => { pointer = null; });
  field.addEventListener("pointercancel", () => { pointer = null; });
  field.addEventListener("keydown", (event) => {
    if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) return;
    event.preventDefault();
    hsv[0] = (hsv[0] + (event.key === "ArrowRight" ? 3 : event.key === "ArrowLeft" ? -3 : 0) + 360) % 360;
    hsv[1] = Math.max(0, Math.min(1, hsv[1] + (event.key === "ArrowDown" ? 0.01 : event.key === "ArrowUp" ? -0.01 : 0)));
    select(hsvToHex(...hsv), true);
  });
  const brightnessLabel = document.createElement("label");
  brightnessLabel.textContent = "Brightness";
  const brightness = document.createElement("input");
  brightness.type = "range";
  brightness.min = "0";
  brightness.max = "100";
  brightness.step = "0.1";
  brightnessLabel.append(brightness);
  spectrum.append(brightnessLabel);
  brightness.addEventListener("input", () => { hsv[2] = Number(brightness.value) / 100; select(hsvToHex(...hsv), true); });
  const comparison = document.createElement("div");
  comparison.className = "canvas-scribe-picker-comparison";
  const preview = (label: string, color: string) => {
    const item = document.createElement("div");
    const text = document.createElement("span");
    text.textContent = label;
    const sample = document.createElement("span");
    sample.className = "canvas-scribe-picker-sample";
    sample.style.backgroundColor = color;
    item.append(text, sample);
    comparison.append(item);
    return sample;
  };
  preview("Current", options.current);
  const pendingPreview = preview("New", pending);
  dialog.append(comparison);
  const inputs = document.createElement("div");
  inputs.className = "canvas-scribe-picker-inputs";
  dialog.append(inputs);
  const fields = ["Hex", "Red", "Green", "Blue"].map((name) => {
    const label = document.createElement("label");
    label.textContent = name;
    const input = document.createElement("input");
    input.type = "text";
    input.inputMode = name === "Hex" ? "text" : "numeric";
    input.spellcheck = false;
    input.autocomplete = "off";
    label.append(input);
    inputs.append(label);
    return input;
  });
  const error = document.createElement("div");
  error.className = "canvas-scribe-picker-error";
  error.setAttribute("role", "status");
  dialog.append(error);
  fields.forEach((input, index) => input.addEventListener("input", () => {
    const rgbValid = fields.slice(1).every((f) => /^\d{1,3}$/.test(f.value) && Number(f.value) <= 255);
    const color = index === 0 ? parseHex(input.value) : rgbValid ? rgbToHex(fields.slice(1).map((f) => Number(f.value))) : null;
    fields.forEach((f, i) => f.setAttribute("aria-invalid", String(color === null && (index === 0 ? i === 0 : i > 0))));
    done.disabled = color === null;
    error.textContent = color === null ? (index === 0 ? "Enter 3 or 6 hexadecimal digits." : "Enter whole RGB values from 0 to 255.") : "";
    if (color) {
      const raw = input.value, caret = input.selectionStart;
      select(color);
      input.value = raw;
      input.setSelectionRange(caret, caret);
    }
  }));
  const recentLabel = document.createElement("div");
  recentLabel.textContent = options.recent.length ? "Recent colors" : "Confirmed colors will appear here";
  recentLabel.className = "canvas-scribe-picker-recent-label";
  const recent = document.createElement("div");
  recent.className = "canvas-scribe-picker-recent";
  options.recent.forEach((color) => addChip(color, recent));
  dialog.append(recentLabel, recent);
  button("Reset to default", dialog, () => { select(options.defaultColor); reset = true; error.textContent = "Default selected. Choose Done to apply."; });
  const footer = document.createElement("div");
  footer.className = "canvas-scribe-picker-footer";
  dialog.append(footer);
  button("Cancel", footer, options.onCancel);
  const done = button("Done", footer, () => { if (!done.disabled) options.onConfirm(reset ? null : pending); });
  done.className = "mod-cta";
  function select(color: string, keepHsv = false) {
    pending = color;
    reset = false;
    if (!keepHsv) hsv = hexToHsv(color);
    fields[0].value = color;
    hexToRgb(color).forEach((c, i) => { fields[i + 1].value = String(c); });
    fields.forEach((f) => f.setAttribute("aria-invalid", "false"));
    pendingPreview.style.backgroundColor = color;
    pendingPreview.setAttribute("aria-label", `New color ${color}`);
    brightness.value = String(hsv[2] * 100);
    field.style.setProperty("--spectrum-value", String(hsv[2]));
    marker.style.left = `${hsv[0] / 360 * 100}%`;
    marker.style.top = `${hsv[1] * 100}%`;
    chips.forEach((chip) => chip.setAttribute("aria-pressed", String(chip.getAttribute("aria-label") === `Use ${color}`)));
    done.disabled = false;
    error.textContent = "";
  }
  root.addEventListener("pointerdown", (event) => { event.stopPropagation(); if (event.target === root) options.onCancel(); });
  root.addEventListener("keydown", (event) => {
    event.stopPropagation();
    if (event.key === "Escape") { event.preventDefault(); options.onCancel(); }
    if (event.key !== "Tab") return;
    const focusable = Array.from(dialog.querySelectorAll<HTMLElement>("button, input, [tabindex='0']")).filter((el) => !el.closest("[hidden]") && !el.hasAttribute("disabled"));
    const first = focusable[0], last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  });
  showView(options.view ?? "Swatches");
  select(pending);
  return root;
}
