import type { IconRenderer } from "./canvas-controls";
import { createToolColor } from "./tool-indicator";

export interface RadialMenuItem {
  id: string; label: string; icon: string;
  active?: boolean; disabled?: boolean;
  color?: string;
  inkColor?: string;
  preview?: (document: Document) => Element;
  hero?: () => { icon: string; label: string; color?: string };
}
export interface RadialMenuView { root: HTMLElement; palette: HTMLElement; }
export function createRadialMenuView(document: Document, items: readonly RadialMenuItem[], renderIcon: IconRenderer,
  onAction: (id: string) => void, onClose: () => void,
  navigation: { title?: string; back?: () => void; page?: number; pages?: number; onPage?: (page: number) => void;
    tabs?: { label: string; icon: string }[]; activeTab?: number; onTab?: (index: number) => void;
    hero?: { icon: string; label: string; color?: string }; pageId?: string } = {},
): RadialMenuView {
  const root = document.createElement("div");
  root.className = "canvas-scribe-radial-menu";
  root.setAttribute("role", "presentation");
  const palette = document.createElement("div");
  palette.className = "canvas-scribe-radial-palette";
  palette.setAttribute("role", "menu");
  palette.tabIndex = -1;
  palette.setAttribute("aria-label", navigation.title ?? "Canvas Scribe pen actions");
  if (navigation.hero) {
    palette.classList.add("has-hero");
    const hero = document.createElement(navigation.back ? "button" : "div"); hero.className = "canvas-scribe-radial-hero";
    if (navigation.back) {
      hero.setAttribute("type", "button"); hero.setAttribute("aria-label", "Back to pen actions");
      hero.title = "Back to pen actions";
      hero.addEventListener("click", (event) => { consume(event); navigation.back!(); });
    } else hero.setAttribute("aria-hidden", "true");
    renderIcon(hero, navigation.hero.icon);
    if (navigation.hero.color) { hero.classList.add("is-ink"); hero.style.setProperty("--canvas-scribe-tool-color", navigation.hero.color); }
    palette.append(hero);
  }
  const title = document.createElement("div");
  title.className = "canvas-scribe-radial-title";
  title.textContent = navigation.title ?? "Pen actions";
  if (navigation.back) palette.append(title);
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
    const angle = -90 + index * (items.length > 6 ? 360 / items.length : 60);
    button.style.setProperty("--canvas-scribe-radial-angle", `${angle}deg`);
    button.style.setProperty("--canvas-scribe-radial-angle-inverse", `${-angle}deg`);
    if (navigation.hero) {
      const settingsAngles: Record<string, number> = { colors: 0, size: 180, undo: -135, redo: -45, "canvas-menu": -90 };
      const degrees = navigation.pageId === "settings" && item.id in settingsAngles ? settingsAngles[item.id]!
        : -200 + index * (220 / Math.max(1, items.length - 1));
      const radians = degrees * Math.PI / 180;
      button.style.left = `calc(50% + ${Math.cos(radians)} * (50% - 31px))`;
      button.style.top = `calc(50% + ${Math.sin(radians)} * (50% - 31px))`;
    }
    if (item.preview) { button.append(item.preview(document)); button.classList.add("has-preview"); }
    else if (item.color) {
      const swatch = document.createElement("span");
      swatch.className = "canvas-scribe-color-swatch-preview";
      swatch.style.backgroundColor = item.color; button.append(swatch);
    } else renderIcon(button, item.icon);
    if (item.inkColor) {
      button.style.setProperty("--canvas-scribe-tool-color", item.inkColor);
      if (!item.color && !item.icon.startsWith("canvas-scribe-")) button.append(createToolColor(document, item.inkColor));
    }
    button.addEventListener("click", (event) => { consume(event); if (!button.disabled) onAction(item.id); });
    palette.append(button);
  });
  if (navigation.back && !navigation.hero) {
    const backButton = document.createElement("button");
    backButton.className = "canvas-scribe-radial-close"; backButton.type = "button";
    backButton.setAttribute("role", "menuitem");
    backButton.setAttribute("aria-label", "Back to pen actions"); backButton.title = "Back";
    renderIcon(backButton, "arrow-left");
    backButton.addEventListener("click", (event) => { consume(event); navigation.back!(); });
    palette.append(backButton);
  }
  if (navigation.tabs?.length) {
    const tabs = document.createElement("div"); tabs.className = "canvas-scribe-radial-tabs";
    tabs.setAttribute("role", "group"); tabs.setAttribute("aria-label", "Radial pages");
    navigation.tabs.forEach((tab, index) => {
      const button = document.createElement("button"); button.type = "button"; button.setAttribute("aria-label", tab.label); button.title = tab.label;
      renderIcon(button, tab.icon);
      button.dataset.tab = String(index);
      button.setAttribute("aria-pressed", String(index === navigation.activeTab));
      button.addEventListener("click", (event) => { consume(event); navigation.onTab?.(index); }); tabs.append(button);
    });
    palette.append(tabs);
    let start: { x: number; y: number; id: number } | null = null;
    palette.addEventListener("pointerdown", (event) => {
      if ((event.target as Element).closest("button, input, [role=slider]")) return;
      start = { x: event.clientX, y: event.clientY, id: event.pointerId };
    });
    palette.addEventListener("pointercancel", () => { start = null; });
    palette.addEventListener("pointerup", (event) => {
      if (!start || event.pointerId !== start.id) return;
      const dx = event.clientX - start.x, dy = event.clientY - start.y; start = null;
      if (Math.abs(dx) < 40 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
      const index = ((navigation.activeTab ?? 0) + (dx < 0 ? 1 : -1) + navigation.tabs!.length) % navigation.tabs!.length;
      navigation.onTab?.(index);
    });
  }
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
      const nodes = Array.from(root.querySelectorAll<HTMLElement>('button:not(:disabled), input, select, [role=slider]')).filter((item) => !item.closest("[hidden]"));
      const index = nodes.indexOf(document.activeElement as HTMLElement);
      const next = nodes[(index + (event.shiftKey ? -1 : 1) + nodes.length) % nodes.length];
      if (next) { consume(event); next.focus(); } return;
    }
    if (event.key !== "Escape") return;
    consume(event); onClose();
  });
  return { root, palette };
}
function consume(event: Event): void { if (event.cancelable) event.preventDefault(); event.stopPropagation(); }
