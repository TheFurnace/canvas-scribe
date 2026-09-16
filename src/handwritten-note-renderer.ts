import { strokeToSvgPath } from "./geometry";
import type { HandwrittenInkObject, HandwrittenNoteDocument } from "./handwritten-note";

const SVG_NS = "http://www.w3.org/2000/svg";
const retainedInk = new WeakMap<SVGSVGElement, HandwrittenInkObject>();

export function renderHandwrittenInk(document: Document, object: HandwrittenInkObject, width: number, height: number, index: number, selected = false, complete = true): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.classList.add("canvas-scribe-note-ink"); svg.style.zIndex = String(index + 1);
  svg.setAttribute("viewBox", `0 0 ${width} ${height}`); svg.setAttribute("aria-hidden", "true");
  const path = document.createElementNS(SVG_NS, "path");
  path.classList.add("canvas-scribe-stroke", `is-${object.tool}`); path.classList.toggle("is-selected", selected);
  path.dataset.objectId = object.id; path.setAttribute("d", strokeToSvgPath(object, complete)); path.setAttribute("fill", object.color); path.setAttribute("opacity", String(object.opacity));
  svg.dataset.objectId = object.id; retainedInk.set(svg, object);
  svg.append(path); return svg;
}

export interface HandwrittenNoteRenderOptions {
  interactive?: boolean;
  selectedIds?: ReadonlySet<string>;
  page?: HTMLElement;
}

export function renderHandwrittenNotePage(document: Document, note: HandwrittenNoteDocument, options: HandwrittenNoteRenderOptions = {}): HTMLElement {
  const page = options.page ?? document.createElement("div");
  const existing = new Map(Array.from(page.children).flatMap(element => {
    const id = (element as HTMLElement).dataset.objectId;
    return id ? [[id, element] as const] : [];
  }));
  const children: Element[] = [];
  page.className = "canvas-scribe-note-page";
  page.style.setProperty("--canvas-scribe-note-width", `${note.logicalWidth}px`);
  page.style.setProperty("--canvas-scribe-note-height", `${note.contentHeight}px`);
  note.objects.forEach((object, index) => {
    if (object.kind === "ink") {
      const old = existing.get(object.id) as SVGSVGElement | undefined;
      const svg = old && retainedInk.get(old) === object ? old : renderHandwrittenInk(document, object, note.logicalWidth, note.contentHeight, index, options.selectedIds?.has(object.id));
      svg.dataset.objectId = object.id; svg.style.zIndex = String(index + 1);
      svg.setAttribute("viewBox", `0 0 ${note.logicalWidth} ${note.contentHeight}`);
      svg.querySelector("path")?.classList.toggle("is-selected", options.selectedIds?.has(object.id) === true);
      retainedInk.set(svg, object); children.push(svg); return;
    }
    if (!options.interactive) {
      const svg = document.createElementNS(SVG_NS, "svg"); svg.classList.add("canvas-scribe-note-ink"); svg.style.zIndex = String(index + 1);
      svg.setAttribute("viewBox", `0 0 ${note.logicalWidth} ${note.contentHeight}`);
      const foreign = document.createElementNS(SVG_NS, "foreignObject");
      foreign.setAttribute("x", String(object.x)); foreign.setAttribute("y", String(object.y));
      foreign.setAttribute("width", String(object.width)); foreign.setAttribute("height", String(Math.max(80, note.contentHeight - object.y)));
      const text = document.createElement("div"); text.className = "canvas-scribe-note-text canvas-scribe-note-text-readonly";
      text.style.fontSize = `${object.fontSize}px`; text.style.color = object.color; text.style.textAlign = object.align; text.textContent = object.text;
      text.setAttribute("aria-label", "Handwritten note text"); foreign.append(text); svg.append(foreign); children.push(svg); return;
    }
    const oldText = existing.get(object.id);
    const text = oldText?.tagName.toLowerCase() === "textarea" ? oldText as HTMLTextAreaElement : document.createElement("textarea");
    text.className = "canvas-scribe-note-text";
    text.classList.toggle("is-editing", text.dataset.editing === "true");
    text.dataset.objectId = object.id;
    text.classList.toggle("is-selected", options.selectedIds?.has(object.id) === true);
    text.style.zIndex = String(index + 1);
    text.style.left = `${object.x}px`; text.style.top = `${object.y}px`; text.style.width = `${object.width}px`;
    text.style.fontSize = `${object.fontSize}px`; text.style.color = object.color; text.style.textAlign = object.align;
    if (text.value !== object.text) text.value = object.text;
    children.push(text);
  });
  const wanted = new Set(children);
  for (const child of Array.from(page.children)) if (!wanted.has(child)) child.remove();
  let cursor = page.firstChild;
  for (const child of children) { if (child !== cursor) page.insertBefore(child, cursor); cursor = child.nextSibling; }
  return page;
}
