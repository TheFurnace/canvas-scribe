import { defaultColorLabel, defaultColorDescription, recentColors, toolSwatches, type ColorTool } from "./colors";
import { createAction, createSwatch } from "./ui-controls";

export function createQuickColors(document: Document, options: {
  tool: ColorTool; current: string; defaultColor: string; isDefault: boolean;
  recent: readonly string[]; onSelect: (color: string | null) => void;
  onMore: () => void; onClose: () => void;
}): HTMLElement {
  const root = document.createElement("section");
  root.className = "canvas-scribe-color-palette canvas-scribe-quick-colors";
  root.setAttribute("aria-label", `${options.tool} colors`);
  const heading = document.createElement("header");
  const title = document.createElement("strong");
  title.textContent = options.tool === "pen" ? "Pen colors" : "Highlighter colors";
  const close = createAction(document, "×", options.onClose);
  close.setAttribute("aria-label", "Close quick colors");
  heading.append(title, close); root.append(heading);
  const row = document.createElement("div");
  row.className = "canvas-scribe-quick-swatches canvas-scribe-quick-palette";
  row.setAttribute("role", "group"); row.setAttribute("aria-label", "Quick colors");
  const defaultButton = createSwatch(document, {
    color: options.defaultColor, label: defaultColorDescription(options.tool), selected: options.isDefault,
    onSelect: () => options.onSelect(null),
  });
  const defaultLabel = document.createElement("span"); defaultLabel.textContent = defaultColorLabel(options.tool);
  defaultLabel.setAttribute("aria-hidden", "true"); defaultButton.append(defaultLabel);
  const recent = recentColors(options.isDefault ? null : options.current, options.recent);
  const pinned = toolSwatches(options.tool).slice(0, 10);
  const add = (parent: HTMLElement, color: string) => parent.append(createSwatch(document, {
    color, label: `Use ${color} for ${options.tool}`,
    selected: !options.isDefault && color.toLowerCase() === options.current.toLowerCase(),
    onSelect: () => options.onSelect(color),
  }));
  pinned.forEach((color) => add(row, color)); root.append(row);
  const group = document.createElement("div");
  group.className = "canvas-scribe-quick-swatches canvas-scribe-quick-recents";
  group.setAttribute("role", "group"); group.setAttribute("aria-label", "Recent colors");
  group.append(defaultButton);
  recent.forEach((color) => add(group, color)); root.append(group);
  root.append(createAction(document, "More colors…", options.onMore));
  root.addEventListener("keydown", (event) => {
    if (event.key === "Escape") { event.preventDefault(); options.onClose(); }
    event.stopPropagation();
  });
  for (const name of ["pointerdown", "pointerup", "pointermove", "click", "dblclick", "contextmenu"]) {
    root.addEventListener(name, (event) => event.stopPropagation());
  }
  return root;
}
