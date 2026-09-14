import { defaultColorDescription, defaultColorLabel, nearestSwatch, recentColors, toolSwatches, type ColorTool } from "./colors";

/** A snapshot for one radial lifetime; scrolling and selection never reorder it. */
export class RadialColors {
  readonly recent: string[];
  readonly swatches: readonly string[];
  readonly slots: number;
  offset: number;
  constructor(readonly tool: ColorTool, selected: string | null, history: readonly string[]) {
    this.recent = recentColors(selected, history);
    this.swatches = toolSwatches(tool).filter(color => !this.recent.includes(color));
    this.slots = 8 - this.recent.length;
    this.offset = Math.max(0, Math.min(this.swatches.length - this.slots,
      nearestSwatch(this.swatches, selected) - Math.floor(this.slots / 2)));
  }
}

export function createRadialColors(document: Document, model: RadialColors, options: {
  defaultColor: string; selection(): string | null; onSelect(color: string | null): void; onMore(): void;
}): HTMLElement {
  const root = document.createElement("div"); root.className = "canvas-scribe-radial-colors";
  root.setAttribute("role", "group"); root.setAttribute("aria-label", `${model.tool} colors`);
  const choices: { button: HTMLButtonElement; color: string | null }[] = [];
  const place = (button: HTMLElement, angle: number) => {
    button.style.left = `${125 + 92 * Math.cos(angle * Math.PI / 180)}px`;
    button.style.top = `${125 + 92 * Math.sin(angle * Math.PI / 180)}px`;
  };
  const refresh = () => {
    for (const { button, color } of choices) button.setAttribute("aria-pressed", String(options.selection() === color));
    const hero = root.parentElement?.querySelector<HTMLElement>(".canvas-scribe-radial-hero");
    hero?.style.setProperty("--canvas-scribe-tool-color", options.selection() ?? options.defaultColor);
  };
  const chip = (color: string | null, parent: HTMLElement, angle: number, group: string) => {
    const button = document.createElement("button"); button.type = "button";
    button.className = "canvas-scribe-arc-color"; button.dataset.colorGroup = group;
    button.dataset.color = color ?? "default";
    button.setAttribute("aria-label", color ? `Use ${color}` : defaultColorDescription(model.tool));
    button.title = color ?? `${defaultColorLabel(model.tool)} · ${defaultColorDescription(model.tool)}`;
    const sample = document.createElement("span"); sample.style.background = color ?? options.defaultColor;
    button.append(sample); place(button, angle); choices.push({ button, color });
    button.addEventListener("click", () => { options.onSelect(color); refresh(); });
    parent.append(button); return button;
  };
  chip(null, root, 144, "default");
  model.recent.forEach((color, index) => chip(color, root, 180 + index * 36, "recent"));
  const arc = document.createElement("div"); arc.className = "canvas-scribe-swatch-arc";
  arc.tabIndex = 0; arc.setAttribute("role", "group");
  arc.setAttribute("aria-label", "Tool swatches. Drag along the arc, scroll, or use arrow keys.");
  const start = 180 + model.recent.length * 36, end = 432;
  const polygon: string[] = [];
  for (let a = start - 17; a <= end + 17; a += 2) polygon.push(`${125 + 122 * Math.cos(a * Math.PI / 180)}px ${125 + 122 * Math.sin(a * Math.PI / 180)}px`);
  for (let a = end + 17; a >= start - 17; a -= 2) polygon.push(`${125 + 64 * Math.cos(a * Math.PI / 180)}px ${125 + 64 * Math.sin(a * Math.PI / 180)}px`);
  arc.style.clipPath = `polygon(${polygon.join(",")})`;
  root.append(arc);
  const swatches = model.swatches.map(color => chip(color, arc, 0, "swatch"));
  const layout = () => {
    swatches.forEach((button, index) => {
      const slot = index - model.offset;
      // Prevent colors wrapping around the circle and leaking into the viewport.
      button.hidden = slot < -.5 || slot > model.slots - .5;
      button.tabIndex = slot < 0 || slot > model.slots - 1 ? -1 : 0;
      place(button, start + slot * 36);
    });
    arc.dataset.offset = String(model.offset);
  };
  const scroll = (offset: number) => { model.offset = Math.max(0, Math.min(Math.max(0, swatches.length - model.slots), offset)); layout(); };
  arc.addEventListener("wheel", event => { event.preventDefault(); event.stopPropagation(); scroll(model.offset + (event.deltaY || event.deltaX) / 90); }, { passive: false });
  arc.addEventListener("keydown", event => {
    const direction = ["ArrowRight", "ArrowDown"].includes(event.key) ? 1 : ["ArrowLeft", "ArrowUp"].includes(event.key) ? -1 : 0;
    if (!direction && !["Home", "End"].includes(event.key)) return;
    event.preventDefault(); event.stopPropagation();
    const index = swatches.indexOf(document.activeElement as HTMLButtonElement);
    const next = event.key === "Home" ? 0 : event.key === "End" ? swatches.length - 1 : Math.max(0, Math.min(swatches.length - 1, (index < 0 ? Math.round(model.offset) : index) + direction));
    scroll(next < model.offset ? next : next >= model.offset + model.slots ? next - model.slots + 1 : model.offset);
    swatches[next]?.focus({ preventScroll: true });
  });
  let drag: { id: number; angle: number; offset: number; moved: boolean; x: number; y: number; button: HTMLButtonElement | null } | null = null;
  let suppressClick = false;
  const angle = (event: PointerEvent) => {
    const bounds = root.getBoundingClientRect(); return Math.atan2(event.clientY - bounds.top - bounds.height / 2, event.clientX - bounds.left - bounds.width / 2) * 180 / Math.PI;
  };
  arc.addEventListener("pointerdown", event => {
    if (drag || event.button !== 0) return;
    suppressClick = false; drag = { id: event.pointerId, angle: angle(event), offset: model.offset, moved: false, x: event.clientX, y: event.clientY, button: (event.target as Element).closest<HTMLButtonElement>(".canvas-scribe-arc-color") };
    arc.setPointerCapture(event.pointerId);
    event.stopPropagation();
  });
  arc.addEventListener("pointermove", event => {
    if (!drag || drag.id !== event.pointerId) return;
    if (!drag.moved && Math.hypot(event.clientX - drag.x, event.clientY - drag.y) < 6) return;
    drag.moved = true;
    event.preventDefault();
    const delta = (angle(event) - drag.angle + 540) % 360 - 180;
    scroll(drag.offset - delta / 36);
    drag.angle = angle(event); drag.offset = model.offset;
  });
  const finish = (event: PointerEvent) => {
    if (!drag || drag.id !== event.pointerId) return;
    const completed = drag; drag = null;
    if (completed.moved) scroll(Math.round(model.offset));
    else if (event.type === "pointerup") completed.button?.click();
    suppressClick = true;
    if (arc.hasPointerCapture(event.pointerId)) arc.releasePointerCapture(event.pointerId);
  };
  arc.addEventListener("pointerup", finish); arc.addEventListener("pointercancel", finish); arc.addEventListener("lostpointercapture", finish);
  arc.addEventListener("click", event => {
    if (suppressClick && event.detail !== 0) { event.preventDefault(); event.stopImmediatePropagation(); }
    suppressClick = false;
  }, true);
  const more = document.createElement("button"); more.type = "button"; more.className = "canvas-scribe-arc-color canvas-scribe-arc-more";
  more.dataset.action = "full-picker";
  more.textContent = "+"; more.setAttribute("aria-label", "More colors…"); more.title = "More colors…";
  place(more, 108); more.addEventListener("click", options.onMore); root.append(more);
  layout(); refresh(); return root;
}
