import { PINNED_TOOL_COLORS, type ColorTool } from "./colors";
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
  const current = document.createElement("div");
  current.className = "canvas-scribe-quick-current";
  const mark = document.createElement("span");
  mark.className = "canvas-scribe-color-swatch-preview";
  mark.style.backgroundColor = options.current;
  const label = document.createElement("span");
  label.textContent = options.isDefault ? "Current: Default" : `Current: ${options.current}`;
  current.append(mark, label); root.append(current);
  const row = document.createElement("div");
  row.className = "canvas-scribe-quick-swatches";
  row.setAttribute("role", "group"); row.setAttribute("aria-label", "Quick colors");
  const defaultButton = createSwatch(document, {
    color: options.defaultColor, label: "Use default color", selected: options.isDefault,
    onSelect: () => options.onSelect(null),
  });
  const defaultLabel = document.createElement("span"); defaultLabel.textContent = "D";
  defaultLabel.setAttribute("aria-hidden", "true"); defaultButton.append(defaultLabel);
  row.append(defaultButton);
  const pinned = PINNED_TOOL_COLORS[options.tool];
  const add = (parent: HTMLElement, color: string) => parent.append(createSwatch(document, {
    color, label: `Use ${color} for ${options.tool}`,
    selected: !options.isDefault && color.toLowerCase() === options.current.toLowerCase(),
    onSelect: () => options.onSelect(color),
  }));
  pinned.forEach((color) => add(row, color)); root.append(row);
  const recent = [...new Set(options.recent.map((color) => color.toLowerCase()))]
    .filter((color) => !pinned.includes(color)).slice(0, 3);
  if (recent.length) {
    const group = document.createElement("div");
    group.className = "canvas-scribe-quick-swatches";
    group.setAttribute("role", "group"); group.setAttribute("aria-label", "Recent colors");
    const caption = document.createElement("span"); caption.textContent = "Recent"; group.append(caption);
    recent.forEach((color) => add(group, color)); root.append(group);
  }
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
