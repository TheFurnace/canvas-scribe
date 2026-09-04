export type IconName =
  | "eraser"
  | "highlighter"
  | "lasso-select"
  | "menu"
  | "palette"
  | "pen-tool"
  | "pencil"
  | "redo"
  | "redo-2"
  | "undo"
  | "undo-2"
  | "x";

const ICON_PATHS: Record<IconName, string> = {
  pencil: '<path d="M21.2 7.2 16.8 2.8a2.4 2.4 0 0 0-3.4 0L3 13.2 2 22l8.8-1 10.4-10.4a2.4 2.4 0 0 0 0-3.4Z"/><path d="m12.5 3.7 7.8 7.8M3 13.2l7.8 7.8"/>',
  highlighter: '<path d="m9 11-6 6v4h4l6-6"/><path d="m13 15 8-8-4-4-8 8 4 4Z"/><path d="m3 21 8-2"/>',
  eraser: '<path d="m7 21-4-4a2 2 0 0 1 0-2.8L14.2 3a2 2 0 0 1 2.8 0l4 4a2 2 0 0 1 0 2.8L9.8 21H7Z"/><path d="m10 8 6 6M6 21h12"/>',
  "lasso-select": '<path d="M7 22a5 5 0 0 1-2-4"/><path d="M3.3 14A6.8 6.8 0 0 1 2 10c0-4.4 4.5-8 10-8s10 3.6 10 8-4.5 8-10 8a12 12 0 0 1-5-1"/><path d="M5 18a2 2 0 1 0-4 0 2 2 0 0 0 4 0Z"/>',
  palette: '<circle cx="13.5" cy="6.5" r=".5" fill="currentColor"/><circle cx="17.5" cy="10.5" r=".5" fill="currentColor"/><circle cx="8.5" cy="7.5" r=".5" fill="currentColor"/><circle cx="6.5" cy="12.5" r=".5" fill="currentColor"/><path d="M12 2a10 10 0 0 0 0 20c.9 0 1.6-.7 1.6-1.7 0-.4-.2-.8-.4-1.1-.3-.3-.4-.7-.4-1.1a1.6 1.6 0 0 1 1.7-1.7h2c3 0 5.5-2.5 5.5-5.5C22 6.5 17.5 2 12 2Z"/>',
  undo: '<path d="M9 14 4 9l5-5"/><path d="M4 9h9a7 7 0 1 1 0 14h-1"/>',
  "undo-2": '<path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/>',
  redo: '<path d="m15 14 5-5-5-5"/><path d="M20 9h-9a7 7 0 1 0 0 14h1"/>',
  "redo-2": '<path d="m15 14 5-5-5-5"/><path d="M20 9H9.5a5.5 5.5 0 0 0 0 11H13"/>',
  "pen-tool": '<path d="m12 19 7-7 3 3-7 7-3-3Z"/><path d="m18 13-1.5-7.5L2 2l3.5 14.5L13 18l5-5Z"/><path d="m2 2 7.6 7.6"/><circle cx="11" cy="11" r="2"/>',
  menu: '<circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/>',
  x: '<path d="M18 6 6 18M6 6l12 12"/>',
};

export function icon(name: IconName): SVGSVGElement {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.classList.add("svg-icon");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-linecap", "round");
  svg.setAttribute("stroke-linejoin", "round");
  svg.setAttribute("stroke-width", "2");
  svg.innerHTML = ICON_PATHS[name];
  return svg;
}

export function renderStoryIcon(container: HTMLElement, name: string): void {
  if (!(name in ICON_PATHS)) throw new Error(`Missing Storybook icon fixture: ${name}`);
  container.append(icon(name as IconName));
}
