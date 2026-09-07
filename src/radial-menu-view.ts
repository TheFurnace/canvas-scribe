import type { IconRenderer } from "./canvas-controls";

export interface RadialMenuItem {
  id: string; label: string; icon: string;
  active?: boolean; disabled?: boolean;
  color?: string;
  preview?: (document: Document) => Element;
}
export interface RadialMenuView { root: HTMLElement; palette: HTMLElement; closeButton: HTMLButtonElement; }
export function createRadialMenuView(document: Document, items: readonly RadialMenuItem[], renderIcon: IconRenderer,
  onAction: (id: string) => void, onClose: () => void,
  navigation: { title?: string; back?: () => void; page?: number; pages?: number; onPage?: (page: number) => void } = {},
): RadialMenuView {
  const root = document.createElement("div");
  root.className = "canvas-scribe-radial-menu";
  root.setAttribute("role", "presentation");
  const palette = document.createElement("div");
  palette.className = "canvas-scribe-radial-palette";
  palette.setAttribute("role", "menu");
  palette.setAttribute("aria-label", navigation.title ?? "Canvas Scribe pen actions");
  const title = document.createElement("div");
  title.className = "canvas-scribe-radial-title";
  title.textContent = navigation.title ?? "Pen actions";
  palette.append(title);
  items.forEach((item, index) => {
    const button = document.createElement("button");
    button.className = "canvas-scribe-radial-action";
    button.dataset.action = item.id; button.type = "button";
    button.setAttribute("aria-label", item.label); button.title = item.label;
    button.setAttribute("role", typeof item.active === "boolean" ? "menuitemradio" : "menuitem");
    if (typeof item.active === "boolean") {
      button.setAttribute("aria-checked", String(item.active));
      button.classList.toggle("is-active", item.active);
    }
    button.disabled = item.disabled ?? false;
    const angle = -90 + index * 60;
    button.style.setProperty("--canvas-scribe-radial-angle", `${angle}deg`);
    button.style.setProperty("--canvas-scribe-radial-angle-inverse", `${-angle}deg`);
    if (item.preview) { button.append(item.preview(document)); button.classList.add("has-preview"); }
    else if (item.color) {
      const swatch = document.createElement("span");
      swatch.className = "canvas-scribe-color-swatch-preview";
      swatch.style.backgroundColor = item.color; button.append(swatch);
    } else renderIcon(button, item.icon);
    button.addEventListener("click", (event) => { consume(event); if (!button.disabled) onAction(item.id); });
    palette.append(button);
  });
  const closeButton = document.createElement("button");
  closeButton.className = "canvas-scribe-radial-close"; closeButton.type = "button";
  closeButton.setAttribute("role", "menuitem");
  closeButton.setAttribute("aria-label", navigation.back ? "Back to pen actions" : "Close pen actions");
  closeButton.title = navigation.back ? "Back" : "Close";
  renderIcon(closeButton, navigation.back ? "arrow-left" : "x");
  closeButton.addEventListener("click", (event) => { consume(event); (navigation.back ?? onClose)(); });
  palette.append(closeButton);
  if ((navigation.pages ?? 1) > 1) {
    const paging = document.createElement("div"); paging.className = "canvas-scribe-radial-paging";
    const page = navigation.page ?? 0, pages = navigation.pages ?? 1;
    const addPage = (label: string, next: number, id: string) => {
      const node = document.createElement("button"); node.type = "button";
      node.textContent = label; node.dataset.action = id; node.disabled = next < 0 || next >= pages;
      node.addEventListener("click", (event) => { consume(event); navigation.onPage?.(next); }); paging.append(node);
    };
    addPage("Previous", page - 1, "previous-page");
    const status = document.createElement("span"); status.setAttribute("aria-live", "polite");
    status.textContent = `${page + 1} / ${pages}`; paging.append(status);
    addPage("Next", page + 1, "next-page"); palette.append(paging);
  }
  root.append(palette);
  root.addEventListener("pointerdown", (event) => {
    if (event.target === root) { consume(event); onClose(); }
    else event.stopPropagation();
  });
  root.addEventListener("pointerup", (event) => event.stopPropagation());
  root.addEventListener("click", (event) => event.stopPropagation());
  root.addEventListener("contextmenu", consume);
  root.addEventListener("keydown", (event) => {
    if (event.key === "Tab") {
      const nodes = Array.from(root.querySelectorAll<HTMLElement>('button:not(:disabled), input, select')).filter((item) => !item.closest("[hidden]"));
      const index = nodes.indexOf(document.activeElement as HTMLElement);
      const next = nodes[(index + (event.shiftKey ? -1 : 1) + nodes.length) % nodes.length];
      if (next) { consume(event); next.focus(); } return;
    }
    if (event.key !== "Escape") return;
    consume(event); onClose();
  });
  return { root, palette, closeButton };
}
function consume(event: Event): void { if (event.cancelable) event.preventDefault(); event.stopPropagation(); }
