import { setIcon } from "obsidian";

import { createRadialMenuView } from "./radial-menu-view";

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
    const view = createRadialMenuView(
      this.document,
      this.actions,
      setIcon,
      (id) => {
        const action = this.actions.find((candidate) => candidate.id === id);
        if (!action) return;
        this.close();
        action.run();
      },
      () => this.close(),
    );
    const { root, palette, closeButton } = view;
    const position = clampRadialMenuPosition(clientX, clientY, this.document.defaultView);
    palette.style.left = `${position.x}px`;
    palette.style.top = `${position.y}px`;

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
