import type { DrawingTool } from "./types";

export type IconRenderer = (container: HTMLElement, icon: string) => void;

export interface CanvasControlsActions {
  setTool: (tool: DrawingTool) => void;
  toggleColorPalette: () => void;
  undo: () => void;
  redo: () => void;
  toggleEnabled: () => void;
}

export interface CanvasControlsState {
  activeTool: DrawingTool;
  activeColor?: string;
  paletteOpen?: boolean;
  enabled: boolean;
  canUndo: boolean;
  canRedo: boolean;
}

interface ControlDefinition {
  action: string;
  icon: string;
  label: string;
  run: () => void;
}

export function createCanvasControls(
  document: Document,
  renderIcon: IconRenderer,
  actions: CanvasControlsActions,
): HTMLElement {
  const controls: readonly ControlDefinition[] = [
    { action: "pen", icon: "pen-tool", label: "Pen", run: () => actions.setTool("pen") },
    { action: "highlighter", icon: "highlighter", label: "Highlighter", run: () => actions.setTool("highlighter") },
    { action: "eraser", icon: "eraser", label: "Eraser", run: () => actions.setTool("eraser") },
    { action: "lasso", icon: "lasso-select", label: "Lasso ink", run: () => actions.setTool("lasso") },
    { action: "color", icon: "palette", label: "Choose pen color", run: actions.toggleColorPalette },
    { action: "undo", icon: "undo-2", label: "Undo ink", run: actions.undo },
    { action: "redo", icon: "redo-2", label: "Redo ink", run: actions.redo },
    { action: "toggle", icon: "pencil", label: "Toggle stylus input", run: actions.toggleEnabled },
  ];

  const group = document.createElement("div");
  group.className = "canvas-control-group mod-raised canvas-scribe-controls";
  group.setAttribute("aria-label", "Canvas Scribe tools");

  for (const control of controls) {
    const button = document.createElement("div");
    button.className = "canvas-control-item canvas-scribe-control-item";
    button.dataset.action = control.action;
    button.setAttribute("aria-label", control.label);
    button.setAttribute("title", control.label);
    button.setAttribute("role", "button");
    button.tabIndex = 0;
    renderIcon(button, control.icon);

    const activate = (event: Event) => {
      event.preventDefault();
      event.stopPropagation();
      control.run();
    };
    button.addEventListener("pointerdown", activate);
    button.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") activate(event);
    });
    group.append(button);
  }
  return group;
}

export function syncCanvasControls(group: HTMLElement, state: CanvasControlsState): void {
  for (const tool of ["pen", "highlighter", "eraser", "lasso"] as const) {
    const button = group.querySelector<HTMLElement>(`[data-action="${tool}"]`);
    const active = state.activeTool === tool && state.enabled;
    button?.classList.toggle("is-active", active);
    button?.setAttribute("aria-pressed", String(active));
  }

  const toggle = group.querySelector<HTMLElement>("[data-action=toggle]");
  toggle?.classList.toggle("is-active", state.enabled);
  toggle?.setAttribute("aria-pressed", String(state.enabled));

  const color = group.querySelector<HTMLElement>("[data-action=color]");
  const colorTool = state.activeTool === "pen" || state.activeTool === "highlighter" ? state.activeTool : null;
  const colorLabel = colorTool ? `Choose ${colorTool} color` : "Choose a pen or highlighter first";
  color?.classList.toggle("is-disabled", colorTool === null);
  color?.classList.toggle("is-active", colorTool !== null && state.paletteOpen === true);
  color?.setAttribute("aria-disabled", String(colorTool === null));
  color?.setAttribute("aria-label", colorLabel);
  color?.setAttribute("title", colorLabel);
  if (colorTool && state.activeColor) color?.style.setProperty("--canvas-scribe-active-color", state.activeColor);

  syncHistoryControl(group, "undo", state.canUndo);
  syncHistoryControl(group, "redo", state.canRedo);
}

function syncHistoryControl(group: HTMLElement, action: "undo" | "redo", enabled: boolean): void {
  const button = group.querySelector<HTMLElement>(`[data-action=${action}]`);
  button?.classList.toggle("is-disabled", !enabled);
  button?.setAttribute("aria-disabled", String(!enabled));
}
