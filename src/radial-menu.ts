import { setIcon } from "obsidian";

export interface RadialMenuAction {
  id: string;
  label: string;
  icon: string;
  active?: boolean;
  disabled?: boolean;
  run: () => void;
}

const MENU_SIZE_PX = 208;
const MENU_MARGIN_PX = 8;

export class RadialMenu {
  private rootEl: HTMLElement | null = null;

  constructor(
    private readonly document: Document,
    private readonly actions: readonly RadialMenuAction[],
    private readonly onClose: () => void,
  ) {}

  open(clientX: number, clientY: number): void {
    this.close();
    const root = this.document.createElement("div");
    root.className = "canvas-scribe-radial-menu";
    root.setAttribute("role", "presentation");

    const palette = this.document.createElement("div");
    palette.className = "canvas-scribe-radial-palette";
    palette.setAttribute("role", "menu");
    palette.setAttribute("aria-label", "Canvas Scribe pen actions");
    const position = clampRadialMenuPosition(clientX, clientY, this.document.defaultView);
    palette.style.left = `${position.x}px`;
    palette.style.top = `${position.y}px`;

    this.actions.forEach((action, index) => {
      const button = this.document.createElement("button");
      button.className = "canvas-scribe-radial-action";
      button.dataset.action = action.id;
      button.type = "button";
      button.setAttribute("aria-label", action.label);
      button.setAttribute("title", action.label);
      if (typeof action.active === "boolean") {
        button.setAttribute("role", "menuitemradio");
        button.setAttribute("aria-checked", String(action.active));
        if (action.active) button.classList.add("is-active");
      } else {
        button.setAttribute("role", "menuitem");
      }
      button.disabled = action.disabled ?? false;
      const angle = -90 + index * (360 / this.actions.length);
      button.style.setProperty("--canvas-scribe-radial-angle", `${angle}deg`);
      button.style.setProperty("--canvas-scribe-radial-angle-inverse", `${-angle}deg`);
      setIcon(button, action.icon);
      button.addEventListener("click", (event) => {
        consume(event);
        if (button.disabled) return;
        this.close();
        action.run();
      });
      palette.appendChild(button);
    });

    const closeButton = this.document.createElement("button");
    closeButton.className = "canvas-scribe-radial-close";
    closeButton.type = "button";
    closeButton.setAttribute("role", "menuitem");
    closeButton.setAttribute("aria-label", "Close pen actions");
    closeButton.setAttribute("title", "Close");
    setIcon(closeButton, "x");
    closeButton.addEventListener("click", (event) => {
      consume(event);
      this.close();
    });
    palette.appendChild(closeButton);
    root.appendChild(palette);

    root.addEventListener("pointerdown", (event) => {
      if (event.target === root) {
        consume(event);
        this.close();
      }
    });
    root.addEventListener("contextmenu", consume);
    root.addEventListener("keydown", (event) => {
      if (event.key !== "Escape") return;
      consume(event);
      this.close();
    });

    this.document.body.appendChild(root);
    this.rootEl = root;
    closeButton.focus({ preventScroll: true });
    this.document.defaultView?.requestAnimationFrame(() => root.classList.add("is-open"));
  }

  close(): void {
    if (!this.rootEl) return;
    this.rootEl.remove();
    this.rootEl = null;
    this.onClose();
  }
}

export function clampRadialMenuPosition(
  clientX: number,
  clientY: number,
  view: Window | null,
): { x: number; y: number } {
  const radius = MENU_SIZE_PX / 2;
  const minimum = radius + MENU_MARGIN_PX;
  const maximumX = Math.max(minimum, (view?.innerWidth ?? clientX + minimum) - minimum);
  const maximumY = Math.max(minimum, (view?.innerHeight ?? clientY + minimum) - minimum);
  return {
    x: Math.min(maximumX, Math.max(minimum, clientX)),
    y: Math.min(maximumY, Math.max(minimum, clientY)),
  };
}

function consume(event: Event): void {
  if (event.cancelable) event.preventDefault();
  event.stopPropagation();
}
