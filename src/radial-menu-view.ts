import type { IconRenderer } from "./canvas-controls";

export interface RadialMenuItem {
  id: string;
  label: string;
  icon: string;
  active?: boolean;
  disabled?: boolean;
}

export interface RadialMenuView {
  root: HTMLElement;
  palette: HTMLElement;
  closeButton: HTMLButtonElement;
}

export function createRadialMenuView(
  document: Document,
  items: readonly RadialMenuItem[],
  renderIcon: IconRenderer,
  onAction: (id: string) => void,
  onClose: () => void,
): RadialMenuView {
  const root = document.createElement("div");
  root.className = "canvas-scribe-radial-menu";
  root.setAttribute("role", "presentation");

  const palette = document.createElement("div");
  palette.className = "canvas-scribe-radial-palette";
  palette.setAttribute("role", "menu");
  palette.setAttribute("aria-label", "Canvas Scribe pen actions");

  items.forEach((item, index) => {
    const button = document.createElement("button");
    button.className = "canvas-scribe-radial-action";
    button.dataset.action = item.id;
    button.type = "button";
    button.setAttribute("aria-label", item.label);
    button.setAttribute("title", item.label);
    if (typeof item.active === "boolean") {
      button.setAttribute("role", "menuitemradio");
      button.setAttribute("aria-checked", String(item.active));
      if (item.active) button.classList.add("is-active");
    } else {
      button.setAttribute("role", "menuitem");
    }
    button.disabled = item.disabled ?? false;
    const angle = -90 + index * (360 / items.length);
    button.style.setProperty("--canvas-scribe-radial-angle", `${angle}deg`);
    button.style.setProperty("--canvas-scribe-radial-angle-inverse", `${-angle}deg`);
    renderIcon(button, item.icon);
    button.addEventListener("click", (event) => {
      consume(event);
      if (!button.disabled) onAction(item.id);
    });
    palette.append(button);
  });

  const closeButton = document.createElement("button");
  closeButton.className = "canvas-scribe-radial-close";
  closeButton.type = "button";
  closeButton.setAttribute("role", "menuitem");
  closeButton.setAttribute("aria-label", "Close pen actions");
  closeButton.setAttribute("title", "Close");
  renderIcon(closeButton, "x");
  closeButton.addEventListener("click", (event) => {
    consume(event);
    onClose();
  });
  palette.append(closeButton);
  root.append(palette);

  root.addEventListener("pointerdown", (event) => {
    if (event.target === root) {
      consume(event);
      onClose();
    }
  });
  root.addEventListener("contextmenu", consume);
  root.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    consume(event);
    onClose();
  });

  return { root, palette, closeButton };
}

function consume(event: Event): void {
  if (event.cancelable) event.preventDefault();
  event.stopPropagation();
}
