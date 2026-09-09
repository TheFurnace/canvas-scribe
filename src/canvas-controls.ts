import type { DrawingTool } from "./types";
import type { PenType } from "./pen-types";
import type { HighlighterType } from "./highlighter-types";
import { toolIconId } from "./tool-icons";
import { PEN_ICONS, toolDescription } from "./tool-indicator";

const renderers = new WeakMap<HTMLElement, IconRenderer>();

export type IconRenderer = (container: HTMLElement, icon: string) => void;

export interface CanvasControlsActions {
  setTool: (tool: DrawingTool) => void;
  toggleColorPalette: () => void;
  undo: () => void;
  redo: () => void;
  toggleEnabled: () => void;
}

export interface CanvasControlsState {
  highlighterType?: HighlighterType;
  activeTool: DrawingTool;
  activeColor?: string;
  penType?: PenType;
  penColor?: string;
  highlighterColor?: string;
  penSize?: number;
  penOpacity?: number;
  highlighterSize?: number;
  highlighterOpacity?: number;
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
    { action: "pen", icon: PEN_ICONS.fountain, label: "Pen", run: () => actions.setTool("pen") },
    { action: "highlighter", icon: toolIconId("highlighter-round"), label: "Highlighter", run: () => actions.setTool("highlighter") },
    { action: "eraser", icon: toolIconId("eraser-stroke"), label: "Eraser", run: () => actions.setTool("eraser") },
    { action: "lasso", icon: toolIconId("lasso"), label: "Lasso ink", run: () => actions.setTool("lasso") },
    { action: "color", icon: "palette", label: "Choose pen color", run: actions.toggleColorPalette },
    { action: "undo", icon: "undo-2", label: "Undo ink", run: actions.undo },
    { action: "redo", icon: "redo-2", label: "Redo ink", run: actions.redo },
    { action: "toggle", icon: "pencil", label: "Toggle stylus input", run: actions.toggleEnabled },
  ];

  const group = document.createElement("div");
  group.className = "canvas-control-group mod-raised canvas-scribe-controls";
  group.setAttribute("role", "group");
  group.setAttribute("aria-label", "Canvas Scribe tools");
  renderers.set(group, renderIcon);

  for (const control of controls) {
    const button = document.createElement("div");
    button.className = "canvas-control-item canvas-scribe-control-item";
    button.dataset.action = control.action;
    button.setAttribute("aria-label", control.label);
    button.setAttribute("title", control.label);
    button.setAttribute("role", "button");
    button.tabIndex = 0;
    const icon = document.createElement("span");
    icon.className = "canvas-scribe-tool-icon";
    icon.setAttribute("aria-hidden", "true");
    renderIcon(icon, control.icon);
    button.append(icon);
    if (control.action === "pen" || control.action === "highlighter") {
      button.style.setProperty("--canvas-scribe-tool-color", "var(--text-normal)");
    }

    const activate = (event: Event) => {
      event.preventDefault();
      event.stopPropagation();
      if (button.getAttribute("aria-disabled") === "true") return;
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
  const type = state.penType ?? "fountain";
  for (const tool of ["pen", "highlighter"] as const) {
    const button = group.querySelector<HTMLElement>(`[data-action="${tool}"]`);
    if (!button) continue;
    const ink = (tool === "pen" ? state.penColor : state.highlighterColor)
      ?? (state.activeTool === tool ? state.activeColor : undefined)
      ?? (tool === "pen" ? "var(--text-normal)" : "#fde047");
    button.style.setProperty("--canvas-scribe-tool-color", ink);
    const label = toolDescription(tool, type, ink,
      tool === "pen" ? state.penSize : state.highlighterSize,
      tool === "pen" ? state.penOpacity : state.highlighterOpacity);
    button.setAttribute("aria-label", label);
    button.setAttribute("title", label);
    if (tool === "highlighter") {
      const tip = state.highlighterType ?? "round";
      button.setAttribute("aria-label", `${tip === "round" ? "Round" : "Chisel"} ${label}`);
      if (button.dataset.highlighterType !== tip) {
        const icon = button.querySelector<HTMLElement>(".canvas-scribe-tool-icon");
        if (icon) { icon.replaceChildren(); renderers.get(group)?.(icon, toolIconId(`highlighter-${tip}`)); }
        button.dataset.highlighterType = tip;
      }
    }
    if (tool === "pen" && button.dataset.penType !== type) {
      const icon = button.querySelector<HTMLElement>(".canvas-scribe-tool-icon");
      if (icon) {
        icon.replaceChildren();
        renderers.get(group)?.(icon, PEN_ICONS[type]);
      }
      button.dataset.penType = type;
    }
  }
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
  const paletteColor = colorTool === "pen" ? state.penColor : colorTool === "highlighter" ? state.highlighterColor : undefined;
  if (colorTool) color?.style.setProperty("--canvas-scribe-active-color", paletteColor ?? state.activeColor ?? (colorTool === "pen" ? "var(--text-normal)" : "#fde047"));
  else color?.style.removeProperty("--canvas-scribe-active-color");

  syncHistoryControl(group, "undo", state.canUndo);
  syncHistoryControl(group, "redo", state.canRedo);
}

function syncHistoryControl(group: HTMLElement, action: "undo" | "redo", enabled: boolean): void {
  const button = group.querySelector<HTMLElement>(`[data-action=${action}]`);
  button?.classList.toggle("is-disabled", !enabled);
  button?.setAttribute("aria-disabled", String(!enabled));
}
