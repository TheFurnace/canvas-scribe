import type { IconRenderer } from "./canvas-controls";
import { createRadialMenuView, type RadialMenuItem } from "./radial-menu-view";

export interface RadialMenuAction extends RadialMenuItem {
  run?: () => void;
  children?: () => readonly RadialMenuAction[];
  panel?: (close: () => void) => HTMLElement;
}

export class RadialSession {
  private rootEl: HTMLElement | null = null;
  private position = { x: 0, y: 0 };
  private parent: RadialMenuAction | null = null;
  private page = 0;
  private restoreFocus: HTMLElement | null = null;

  constructor(private readonly document: Document, private readonly actions: readonly RadialMenuAction[],
    private readonly onClose: () => void, private readonly renderIcon: IconRenderer,
    private readonly mount: HTMLElement = document.body) {}

  open(clientX: number, clientY: number): void {
    this.close();
    this.restoreFocus = this.document.activeElement as HTMLElement | null;
    this.position = clampRadialMenuPosition(clientX, clientY, this.document.defaultView);
    this.parent = null;
    this.page = 0;
    this.render();
  }

  close(): void {
    if (!this.rootEl) return;
    this.rootEl.remove(); this.rootEl = null;
    if (this.restoreFocus?.isConnected) this.restoreFocus.focus({ preventScroll: true });
    this.onClose();
  }

  private render(focusId?: string): void {
    const items = this.parent?.children?.() ?? this.actions;
    const pages = Math.max(1, Math.ceil(items.length / 6));
    this.page = Math.min(this.page, pages - 1);
    const visible = items.slice(this.page * 6, this.page * 6 + 6);
    const view = createRadialMenuView(this.document, visible, this.renderIcon, (id) => {
      const item = visible.find((candidate) => candidate.id === id);
      if (!item || item.disabled) return;
      if (item.children) { this.parent = item; this.page = 0; this.render(); }
      else if (item.panel) {
        const panel = item.panel(() => this.close());
        view.palette.hidden = true;
        view.root.append(panel);
        panel.querySelector<HTMLElement>("button, input")?.focus();
      } else { this.close(); item.run?.(); }
    }, () => this.close(), {
      title: this.parent?.label ?? "Pen actions",
      back: this.parent ? () => { const id = this.parent!.id; this.parent = null; this.page = 0; this.render(id); } : undefined,
      page: this.page, pages,
      onPage: (page) => { this.page = page; this.render(page > 0 ? "next-page" : "previous-page"); },
    });
    view.palette.style.left = `${this.position.x}px`;
    view.palette.style.top = `${this.position.y}px`;
    view.root.classList.add("is-open");
    this.rootEl?.remove();
    this.rootEl = view.root;
    this.mount.append(view.root);
    const focus = focusId ? view.root.querySelector<HTMLElement>(`[data-action="${focusId}"]`) : null;
    (focus && !focus.hasAttribute("disabled") ? focus : view.closeButton).focus({ preventScroll: true });
  }
}

export function clampRadialMenuPosition(clientX: number, clientY: number, view: Window | null): { x: number; y: number } {
  const minimum = 112;
  const maximumX = Math.max(minimum, (view?.innerWidth ?? clientX + minimum) - minimum);
  const maximumY = Math.max(minimum, (view?.innerHeight ?? clientY + minimum) - minimum - 48);
  return { x: Math.min(maximumX, Math.max(minimum, clientX)), y: Math.min(maximumY, Math.max(minimum, clientY)) };
}
