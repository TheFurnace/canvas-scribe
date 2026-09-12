import type { IconRenderer } from "./canvas-controls";
import { createRadialMenuView, type RadialMenuItem } from "./radial-menu-view";

export interface RadialMenuAction extends RadialMenuItem {
  keepOpen?: boolean;
  pageId?: string;
  run?: () => void;
  children?: () => readonly RadialMenuAction[];
  onEnter?: () => void;
  content?: () => HTMLElement;
  panel?: (close: () => void, back?: () => void) => HTMLElement;
}

const lastPage = new WeakMap<Document, string>();

export class RadialSession {
  private rootEl: HTMLElement | null = null;
  private position = { x: 0, y: 0 };
  private parent: RadialMenuAction | null = null;
  private page = 0;
  private topPage = 0;
  private restoreFocus: HTMLElement | null = null;
  private readonly dismissOutside = (event: Event) => {
    if (this.rootEl && !this.rootEl.contains(event.target as Node)) this.close(false);
  };

  constructor(private readonly document: Document, private readonly actions: readonly RadialMenuAction[],
    private readonly onClose: () => void, private readonly renderIcon: IconRenderer,
    private readonly mount: HTMLElement = document.body) {}

  open(clientX: number, clientY: number): void {
    this.close();
    this.restoreFocus = this.document.activeElement as HTMLElement | null;
    this.position = clampRadialMenuPosition(clientX, clientY, this.document.defaultView, this.actions.some((item) => item.pageId));
    this.parent = null;
    this.page = 0;
    const pages = this.actions.filter((item) => item.pageId);
    this.topPage = Math.max(0, pages.findIndex((item) => item.pageId === lastPage.get(this.document)));
    this.render();
    this.document.addEventListener("pointerdown", this.dismissOutside, true);
  }

  close(restoreFocus = true): void {
    if (!this.rootEl) return;
    this.document.removeEventListener("pointerdown", this.dismissOutside, true);
    this.rootEl.remove(); this.rootEl = null;
    if (restoreFocus && this.restoreFocus?.isConnected) this.restoreFocus.focus({ preventScroll: true });
    this.onClose();
  }

  private render(focusId?: string): void {
    const topPages = this.actions.filter((item) => item.pageId);
    const top = topPages[this.topPage];
    const items = this.parent?.content ? [] : this.parent?.children?.() ?? top?.children?.() ?? this.actions;
    const capacity = top ? 9 : 6;
    const pages = Math.max(1, Math.ceil(items.length / capacity));
    this.page = Math.min(this.page, pages - 1);
    const visible = items.slice(this.page * capacity, this.page * capacity + capacity);
    const view = createRadialMenuView(this.document, visible, this.renderIcon, (id) => {
      const item = visible.find((candidate) => candidate.id === id);
      if (!item || item.disabled) return;
      if (item.children || item.content) { item.onEnter?.(); this.parent = item; this.page = 0; this.render(); }
      else if (item.panel) {
        const panel = item.panel(() => this.close(), () => { this.render(item.id); });
        view.palette.hidden = true;
        view.root.append(panel);
        panel.querySelector<HTMLElement>("button, input")?.focus();
      } else if (item.keepOpen) { item.run?.(); this.render(id); }
      else { this.close(); item.run?.(); }
    }, () => this.close(), {
      title: this.parent?.label ?? top?.label ?? "Pen actions",
      hero: top?.hero?.(), pageId: this.parent ? undefined : top?.pageId,
      back: this.parent ? () => { const id = this.parent!.id; this.parent = null; this.page = 0; this.render(id); } : undefined,
      page: this.page, pages,
      onPage: (page) => { this.page = page; this.render(page > 0 ? "next-page" : "previous-page"); },
      tabs: this.parent ? [] : topPages.map((item) => ({ label: item.label, icon: item.icon })), activeTab: this.topPage,
      onTab: (index) => {
        this.topPage = index; this.parent = null; this.page = 0;
        lastPage.set(this.document, topPages[index]!.pageId!); this.render();
        this.rootEl?.querySelector<HTMLElement>(`[data-tab="${index}"]`)?.focus({ preventScroll: true });
      },
    });
    if (topPages.length && !this.parent) view.palette.classList.add("has-tabs");
    if (this.parent) view.palette.classList.add("is-submenu");
    if (this.parent?.content) {
      view.palette.classList.add("has-control");
      view.palette.setAttribute("role", "dialog");
      view.palette.append(this.parent.content());
    }
    view.palette.style.left = `${this.position.x}px`;
    view.palette.style.top = `${this.position.y}px`;
    view.root.classList.add("is-open");
    this.rootEl?.remove();
    this.rootEl = view.root;
    this.mount.append(view.root);
    // Embedded previews can establish a fixed-position containing block. Convert
    // viewport coordinates to that block, rather than adding its offset twice.
    if (this.mount !== this.document.body) {
      const bounds = view.root.getBoundingClientRect();
      if (bounds.width && bounds.height) {
        const local = clampRadialMenuPosition(this.position.x - bounds.left, this.position.y - bounds.top,
          { innerWidth: bounds.width, innerHeight: bounds.height }, Boolean(topPages.length));
        view.palette.style.left = `${local.x}px`; view.palette.style.top = `${local.y}px`;
      }
    }
    const focus = focusId ? view.root.querySelector<HTMLElement>(`[data-action="${focusId}"]`) : null;
    (focus && !focus.hasAttribute("disabled") ? focus : view.palette.querySelector<HTMLElement>('[role=slider]') ?? view.palette.querySelector<HTMLElement>('button:not(:disabled)') ?? view.palette).focus({ preventScroll: true });
  }
}

export function clampRadialMenuPosition(clientX: number, clientY: number, view: Pick<Window, "innerWidth" | "innerHeight"> | null, hasTabs = false): { x: number; y: number } {
  const minimum = hasTabs ? 168 : 112;
  const maximumX = Math.max(minimum, (view?.innerWidth ?? clientX + minimum) - minimum);
  const maximumY = Math.max(minimum, (view?.innerHeight ?? clientY + minimum) - minimum - (hasTabs ? 84 : 48));
  return { x: Math.min(maximumX, Math.max(minimum, clientX)), y: Math.min(maximumY, Math.max(minimum, clientY)) };
}
