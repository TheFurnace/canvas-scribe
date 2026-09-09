import { createPenPreview } from "./pen-menu";
import { PEN_PROFILES, PEN_TYPES } from "./pen-types";
import { FavoritePens, type FavoritePen, type PenPreset } from "./favorite-pens";
import { strokeToSvgPath } from "./geometry";

export function favoritePreview(document: Document, preset: PenPreset, defaultColor: string): Element {
  const color = preset.color ?? defaultColor;
  const preview = createPenPreview(document, preset.penType, preset.size, color);
  if (preset.tool === "highlighter") {
    preview.replaceChildren();
    const line = document.createElementNS(preview.namespaceURI, "path");
    line.setAttribute("d", strokeToSvgPath({
      id: "favorite-preview", tool: "highlighter", highlighterType: preset.highlighterType ?? "round",
      color, size: preset.size, opacity: preset.opacity, hasPressure: false, createdAt: 0,
      points: [{ x: 12, y: 28, pressure: 0.5, time: 0 }, { x: 136, y: 22, pressure: 0.5, time: 1 }],
    }));
    line.setAttribute("fill", color); preview.append(line);
  }
  preview.setAttribute("opacity", String(preset.opacity));
  preview.querySelector("path")?.removeAttribute("opacity");
  return preview;
}

export function createFavoriteManager(document: Document, store: FavoritePens, current: PenPreset | null,
  defaultColor: (preset: PenPreset) => string, close: () => void): HTMLElement {
  const backdrop = document.createElement("div"); backdrop.className = "canvas-scribe-picker-backdrop";
  const panel = document.createElement("section"); panel.className = "canvas-scribe-favorites-manager";
  panel.setAttribute("role", "dialog"); panel.setAttribute("aria-modal", "true"); panel.setAttribute("aria-label", "Manage favorite pens");
  backdrop.append(panel);
  const button = (parent: HTMLElement, label: string, run: () => void) => {
    const node = document.createElement("button"); node.type = "button"; node.textContent = label;
    node.addEventListener("click", run); parent.append(node); return node;
  };
  const render = (focusId?: string) => {
    panel.replaceChildren();
    const header = document.createElement("header"), heading = document.createElement("h3");
    heading.textContent = "Favorite pens"; header.append(heading); button(header, "Done", close); panel.append(header);
    const add = button(panel, "Save current tool", () => { store.add(current!); render(); });
    add.disabled = current === null;
    if (!current) add.title = "Select Pen or Highlighter to save a favorite";
    const items = store.list();
    if (!items.length) {
      const empty = document.createElement("p"); empty.textContent = "Save your current tool, color, thickness, and opacity as a favorite."; panel.append(empty);
    }
    items.forEach((item, index) => {
      const row = document.createElement("div"); row.className = "canvas-scribe-favorite-row"; row.dataset.favorite = item.id;
      row.append(favoritePreview(document, item, defaultColor(item)));
      const name = document.createElement("input"); name.value = item.name; name.maxLength = 80;
      name.setAttribute("aria-label", `Favorite ${index + 1} name`);
      name.addEventListener("change", () => { if (name.value.trim()) { item.name = name.value.trim(); store.update(item); } else name.value = item.name; });
      row.append(name);
      button(row, "Edit", () => edit(item));
      button(row, "↑", () => { store.move(item.id, -1); render(item.id); }).disabled = index === 0;
      row.lastElementChild!.setAttribute("aria-label", `Move ${item.name} earlier`);
      button(row, "↓", () => { store.move(item.id, 1); render(item.id); }).disabled = index === items.length - 1;
      row.lastElementChild!.setAttribute("aria-label", `Move ${item.name} later`);
      button(row, "Remove", () => { store.remove(item.id); render(); }).setAttribute("aria-label", `Remove ${item.name}`);
      panel.append(row);
    });
    (focusId ? panel.querySelector<HTMLElement>(`[data-favorite="${focusId}"] input`) : panel.querySelector<HTMLElement>("button"))?.focus();
  };
  const edit = (item: FavoritePen) => {
    panel.replaceChildren();
    const title = document.createElement("h3"); title.textContent = `Edit ${item.name}`; panel.append(title);
    const draft = { ...item };
    const field = (label: string, input: HTMLElement) => {
      const wrapper = document.createElement("label"); wrapper.textContent = label; wrapper.append(input); panel.append(wrapper);
    };
    const types = document.createElement("select");
    [...PEN_TYPES, "highlighter" as const].forEach((type) => {
      const option = document.createElement("option"); option.value = type;
      option.textContent = type === "highlighter" ? "Highlighter" : PEN_PROFILES[type].label;
      types.append(option);
    });
    types.value = item.tool === "highlighter" ? "highlighter" : item.penType;
    field("Tool", types);
    const color = document.createElement("input"); color.type = "color"; color.value = item.color ?? defaultColor(item); field("Color", color);
    const followDefault = document.createElement("input"); followDefault.type = "checkbox"; followDefault.checked = item.color === null; field("Follow tool default", followDefault);
    color.disabled = followDefault.checked;
    followDefault.addEventListener("change", () => { color.disabled = followDefault.checked; });
    const size = document.createElement("input"); size.type = "number"; size.min = "1"; size.max = "40"; size.step = "0.5"; size.value = String(item.size); field("Thickness", size);
    const opacity = document.createElement("input"); opacity.type = "number"; opacity.min = "1"; opacity.max = "100"; opacity.step = "1"; opacity.value = String(Math.round(item.opacity * 100)); field("Opacity (%)", opacity);
    const error = document.createElement("p"); error.setAttribute("role", "alert"); panel.append(error);
    button(panel, "Save changes", () => {
      const max = types.value === "highlighter" ? 40 : 20;
      if (!size.checkValidity() || !opacity.checkValidity() || Number(size.value) > max || !size.value || !opacity.value) {
        error.textContent = `Thickness must be 1–${max}; opacity must be 1–100%.`; return;
      }
      draft.tool = types.value === "highlighter" ? "highlighter" : "pen";
      if (draft.tool === "pen") draft.penType = types.value as FavoritePen["penType"];
      draft.size = Number(size.value); draft.opacity = Number(opacity.value) / 100;
      draft.color = followDefault.checked ? null : color.value;
      store.update(draft); render(item.id);
    });
    button(panel, "Cancel", () => render(item.id)); types.focus();
  };
  backdrop.addEventListener("pointerdown", (event) => { if (event.target === backdrop) { event.preventDefault(); close(); } });
  render(); return backdrop;
}
