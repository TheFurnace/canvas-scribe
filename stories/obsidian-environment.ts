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
