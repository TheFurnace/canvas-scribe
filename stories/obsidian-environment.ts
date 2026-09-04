export type ObsidianStoryPlacement = "canvas" | "controls" | "overlay";
export type ObsidianStoryPlatform = "desktop" | "mobile";
export type ObsidianStoryTheme = "light" | "dark";

export interface ObsidianStoryEnvironmentOptions {
  placement?: ObsidianStoryPlacement;
  platform?: ObsidianStoryPlatform;
  theme?: ObsidianStoryTheme;
}

let patternId = 0;

export function createObsidianStoryEnvironment(
  child: Node,
  options: ObsidianStoryEnvironmentOptions = {},
): HTMLElement {
  const document = child.ownerDocument ?? window.document;
  const theme = options.theme ?? "light";
  const platform = options.platform ?? "desktop";
  const placement = options.placement ?? "canvas";
  applyBodyClasses(document, theme, platform);

  const host = element(document, `canvas-scribe-obsidian-host theme-${theme} is-${platform}`);
  host.dataset.platform = platform;
  host.dataset.placement = placement;

  const appContainer = element(document, "app-container");
  const workspace = element(document, "workspace");
  const split = element(document, "workspace-split mod-root");
  const tabs = element(document, "workspace-tabs mod-active");
  const leaf = element(document, "workspace-leaf mod-active");
  const leafContent = element(document, "workspace-leaf-content");
  leafContent.dataset.type = "canvas";
  const viewContent = element(document, "view-content");
  const canvasWrapper = element(document, "canvas-wrapper");
  const canvasMover = element(document, "canvas-mover");
  const canvas = element(document, "canvas");
  canvas.append(createCanvasBackdrop(document));

  canvasWrapper.append(createCanvasBackground(document), canvasMover, canvas);
  viewContent.append(canvasWrapper);
  leafContent.append(viewContent);
  leaf.append(leafContent);
  tabs.append(leaf);
  split.append(tabs);
  workspace.append(split);
  appContainer.append(workspace);
  host.append(appContainer);

  if (placement === "controls") {
    const controls = element(document, "canvas-controls");
    controls.append(child);
    canvasWrapper.append(controls);
  } else if (placement === "overlay") {
    canvasWrapper.append(child);
  } else {
    const mount = element(document, "canvas-scribe-story-content");
    mount.append(child);
    canvasWrapper.append(mount);
  }

  return host;
}

function createCanvasBackdrop(document: Document): HTMLElement {
  const backdrop = element(document, "canvas-scribe-story-backdrop");
  backdrop.setAttribute("aria-hidden", "true");
  backdrop.append(
    createBackdropEdges(document),
    createBackdropNode(document, "ideas", "mod-canvas-color-6", "Ideas", "Shape the pen-first flow"),
    createBackdropNode(document, "references", "mod-canvas-color-5", "References", "Native Canvas controls"),
    createBackdropNode(document, "device", "mod-canvas-color-4", "Device notes", "Pressure · tilt · hover"),
    createBackdropNode(document, "review", "mod-canvas-color-2", "Review", "Polish interaction states"),
  );
  return backdrop;
}

function createBackdropEdges(document: Document): SVGSVGElement {
  const namespace = "http://www.w3.org/2000/svg";
  const edges = document.createElementNS(namespace, "svg");
  edges.classList.add("canvas-edges", "canvas-scribe-story-edges");
  edges.setAttribute("viewBox", "0 0 1000 600");
  edges.setAttribute("preserveAspectRatio", "none");

  const paths = [
    { color: "mod-canvas-color-6", d: "M 245 145 C 390 145, 380 250, 510 285" },
    { color: "mod-canvas-color-5", d: "M 790 175 C 650 175, 665 255, 510 285" },
    { color: "mod-canvas-color-4", d: "M 250 475 C 390 470, 380 350, 510 315" },
    { color: "mod-canvas-color-2", d: "M 790 455 C 650 455, 665 350, 510 315" },
  ];
  for (const definition of paths) {
    const group = document.createElementNS(namespace, "g");
    group.classList.add(definition.color);
    const path = document.createElementNS(namespace, "path");
    path.classList.add("canvas-display-path");
    path.setAttribute("d", definition.d);
    group.append(path);
    edges.append(group);
  }
  return edges;
}

function createBackdropNode(
  document: Document,
  slot: string,
  color: string,
  title: string,
  detail: string,
): HTMLElement {
  const node = element(document, `canvas-node is-themed ${color} canvas-scribe-story-node`);
  node.dataset.slot = slot;

  const container = element(document, "canvas-node-container");
  const content = element(document, "canvas-node-content");
  const copy = element(document, "canvas-scribe-story-node-copy");
  const heading = document.createElement("strong");
  heading.textContent = title;
  const description = document.createElement("span");
  description.textContent = detail;
  copy.append(heading, description);
  content.append(copy);
  container.append(content);
  node.append(container);
  return node;
}

function applyBodyClasses(
  document: Document,
  theme: ObsidianStoryTheme,
  platform: ObsidianStoryPlatform,
): void {
  document.body.classList.toggle("theme-light", theme === "light");
  document.body.classList.toggle("theme-dark", theme === "dark");
  document.body.classList.toggle("is-desktop", platform === "desktop");
  document.body.classList.toggle("is-mobile", platform === "mobile");
}

function createCanvasBackground(document: Document): SVGSVGElement {
  const namespace = "http://www.w3.org/2000/svg";
  const background = document.createElementNS(namespace, "svg");
  background.classList.add("canvas-background");
  background.setAttribute("aria-hidden", "true");
  background.setAttribute("width", "100%");
  background.setAttribute("height", "100%");

  const definitions = document.createElementNS(namespace, "defs");
  const pattern = document.createElementNS(namespace, "pattern");
  const id = `canvas-scribe-grid-${patternId++}`;
  pattern.id = id;
  pattern.setAttribute("width", "24");
  pattern.setAttribute("height", "24");
  pattern.setAttribute("patternUnits", "userSpaceOnUse");
  const dot = document.createElementNS(namespace, "circle");
  dot.setAttribute("cx", "2");
  dot.setAttribute("cy", "2");
  dot.setAttribute("r", "1");
  pattern.append(dot);
  definitions.append(pattern);

  const fill = document.createElementNS(namespace, "rect");
  fill.setAttribute("width", "100%");
  fill.setAttribute("height", "100%");
  fill.setAttribute("fill", `url(#${id})`);
  background.append(definitions, fill);
  return background;
}

function element(document: Document, className: string): HTMLElement {
  const node = document.createElement("div");
  node.className = className;
  return node;
}
