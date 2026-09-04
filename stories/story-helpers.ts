export type IconName =
  | "eraser"
  | "highlighter"
  | "menu"
  | "pen-tool"
  | "pencil"
  | "redo"
  | "undo"
  | "x";

const ICON_PATHS: Record<IconName, string> = {
  pencil: '<path d="M21.2 7.2 16.8 2.8a2.4 2.4 0 0 0-3.4 0L3 13.2 2 22l8.8-1 10.4-10.4a2.4 2.4 0 0 0 0-3.4Z"/><path d="m12.5 3.7 7.8 7.8M3 13.2l7.8 7.8"/>',
  highlighter: '<path d="m9 11-6 6v4h4l6-6"/><path d="m13 15 8-8-4-4-8 8 4 4Z"/><path d="m3 21 8-2"/>',
  eraser: '<path d="m7 21-4-4a2 2 0 0 1 0-2.8L14.2 3a2 2 0 0 1 2.8 0l4 4a2 2 0 0 1 0 2.8L9.8 21H7Z"/><path d="m10 8 6 6M6 21h12"/>',
  undo: '<path d="M9 14 4 9l5-5"/><path d="M4 9h9a7 7 0 1 1 0 14h-1"/>',
  redo: '<path d="m15 14 5-5-5-5"/><path d="M20 9h-9a7 7 0 1 0 0 14h1"/>',
  "pen-tool": '<path d="m12 19 7-7 3 3-7 7-3-3Z"/><path d="m18 13-1.5-7.5L2 2l3.5 14.5L13 18l5-5Z"/><path d="m2 2 7.6 7.6"/><circle cx="11" cy="11" r="2"/>',
  menu: '<circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/>',
  x: '<path d="M18 6 6 18M6 6l12 12"/>',
};

export function icon(name: IconName): SVGSVGElement {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("aria-hidden", "true");
  svg.innerHTML = ICON_PATHS[name];
  return svg;
}

export function storyStage(child: Node, className = ""): HTMLElement {
  const stage = document.createElement("section");
  stage.className = `canvas-scribe-story-stage ${className}`.trim();
  stage.append(child);
  return stage;
}

export function storyCard(title: string, copy: string, child: Node): HTMLElement {
  const card = document.createElement("div");
  card.className = "canvas-scribe-story-card";

  const heading = document.createElement("h2");
  heading.className = "canvas-scribe-story-heading";
  heading.textContent = title;

  const description = document.createElement("p");
  description.className = "canvas-scribe-story-copy";
  description.textContent = copy;

  card.append(heading, description, child);
  return card;
}
