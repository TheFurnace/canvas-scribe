import { strokeToSvgPath } from "./geometry";
import type { HandwrittenNoteDocument } from "./handwritten-note";

const SVG_NS = "http://www.w3.org/2000/svg";

export interface HandwrittenNoteRenderOptions {
  interactive?: boolean;
  selectedIds?: ReadonlySet<string>;
}

export function renderHandwrittenNotePage(document: Document, note: HandwrittenNoteDocument, options: HandwrittenNoteRenderOptions = {}): HTMLElement {
  const page = document.createElement("div");
  page.className = "canvas-scribe-note-page";
  page.style.setProperty("--canvas-scribe-note-width", `${note.logicalWidth}px`);
  page.style.setProperty("--canvas-scribe-note-height", `${note.contentHeight}px`);
  note.objects.forEach((object, index) => {
    if (object.kind === "ink") {
      const svg = document.createElementNS(SVG_NS, "svg");
      svg.classList.add("canvas-scribe-note-ink"); svg.style.zIndex = String(index + 1);
      svg.setAttribute("viewBox", `0 0 ${note.logicalWidth} ${note.contentHeight}`); svg.setAttribute("aria-hidden", "true");
      const path = document.createElementNS(SVG_NS, "path");
      path.classList.add("canvas-scribe-stroke", `is-${object.tool}`); path.classList.toggle("is-selected", options.selectedIds?.has(object.id) === true);
      path.dataset.objectId = object.id; path.setAttribute("d", strokeToSvgPath(object)); path.setAttribute("fill", object.color); path.setAttribute("opacity", String(object.opacity));
      svg.append(path); page.append(svg); return;
    }
    if (!options.interactive) {
      const svg = document.createElementNS(SVG_NS, "svg"); svg.classList.add("canvas-scribe-note-ink"); svg.style.zIndex = String(index + 1);
      svg.setAttribute("viewBox", `0 0 ${note.logicalWidth} ${note.contentHeight}`);
      const foreign = document.createElementNS(SVG_NS, "foreignObject");
      foreign.setAttribute("x", String(object.x)); foreign.setAttribute("y", String(object.y));
      foreign.setAttribute("width", String(object.width)); foreign.setAttribute("height", String(Math.max(80, note.contentHeight - object.y)));
      const text = document.createElement("div"); text.className = "canvas-scribe-note-text canvas-scribe-note-text-readonly";
      text.style.fontSize = `${object.fontSize}px`; text.style.color = object.color; text.style.textAlign = object.align; text.textContent = object.text;
      text.setAttribute("aria-label", "Handwritten note text"); foreign.append(text); svg.append(foreign); page.append(svg); return;
    }
    const text = document.createElement(options.interactive ? "textarea" : "div");
    text.className = "canvas-scribe-note-text";
    text.dataset.objectId = object.id;
    text.classList.toggle("is-selected", options.selectedIds?.has(object.id) === true);
    text.style.zIndex = String(index + 1);
    text.style.left = `${object.x}px`; text.style.top = `${object.y}px`; text.style.width = `${object.width}px`;
    text.style.fontSize = `${object.fontSize}px`; text.style.color = object.color; text.style.textAlign = object.align;
    if (text instanceof HTMLTextAreaElement) text.value = object.text; else text.textContent = object.text;
    page.append(text);
  });
  return page;
}
