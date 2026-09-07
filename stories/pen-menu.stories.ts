import type { Meta, StoryObj } from "@storybook/web-components-vite";
import { createPenMenu } from "../src/pen-menu";
import { createCanvasControls, syncCanvasControls } from "../src/canvas-controls";
import { positionPopup } from "../src/popover";
import type { PenType } from "../src/pen-types";
import type { DrawingTool } from "../src/types";
import { renderStoryIcon } from "./story-helpers";

function toolbarPreview() {
  let type: PenType = "fountain";
  let size = 3.5;
  let activeTool: DrawingTool = "pen";
  let enabled = true;
  let menu: HTMLElement | null = null;
  const root = document.createElement("div");
  root.className = "canvas-scribe-story-toolbar-preview";
  const group = createCanvasControls(document, renderStoryIcon, {
    setTool: (tool) => {
      if (tool === "pen" && activeTool === "pen") {
        if (menu) close(); else open();
      } else {
        activeTool = tool;
        close();
      }
      sync();
    },
    toggleColorPalette: close,
    undo: () => undefined,
    redo: () => undefined,
    toggleEnabled: () => { enabled = !enabled; close(); sync(); },
  });
  root.append(group);
  function sync() {
    syncCanvasControls(group, { activeTool, enabled, penType: type, penColor: "var(--text-normal)", highlighterColor: "#fde047", canUndo: false, canRedo: false });
    group.querySelector('[data-action="pen"]')?.setAttribute("aria-expanded", String(menu !== null));
    group.querySelector('[data-action="pen"]')?.setAttribute("aria-haspopup", "dialog");
  }
  function close() {
    menu?.remove();
    menu = null;
    sync();
  }
  function position() {
    const canvas = root.closest<HTMLElement>(".canvas-wrapper");
    const anchor = group.querySelector<HTMLElement>('[data-action="pen"]');
    if (!canvas || !anchor || !menu) return;
    const canvasRect = canvas.getBoundingClientRect();
    const buttonRect = anchor.getBoundingClientRect();
    menu.style.maxWidth = `${Math.max(0, canvasRect.width - 24)}px`;
    const point = positionPopup({
      top: buttonRect.top - canvasRect.top, bottom: buttonRect.bottom - canvasRect.top,
      left: buttonRect.left - canvasRect.left, right: buttonRect.right - canvasRect.left,
      width: buttonRect.width, height: buttonRect.height,
    }, menu.getBoundingClientRect(), canvasRect.width, canvasRect.height);
    menu.style.left = `${point.left}px`;
    menu.style.top = `${point.top}px`;
  }
  function open() {
    const canvas = root.closest<HTMLElement>(".canvas-wrapper");
    if (!canvas) return;
    menu = createPenMenu(document, {
      type, size, color: "var(--text-normal)",
      onType: (value) => { type = value; sync(); },
      onSize: (value) => { size = value; },
      onClose: () => { close(); group.querySelector<HTMLElement>('[data-action="pen"]')?.focus(); },
    });
    menu.style.position = "absolute";
    canvas.append(menu);
    position();
    sync();
  }
  sync();
  document.defaultView?.requestAnimationFrame(() => {
    if (!root.isConnected) return;
    open();
    const canvas = root.closest<HTMLElement>(".canvas-wrapper");
    if (!canvas) return;
    // The host owns the menu; a Storybook rerender removes both together.
    const observer = new ResizeObserver(() => {
      if (!root.isConnected) { observer.disconnect(); return; }
      position();
    });
    observer.observe(canvas);
  });
  return root;
}

const meta = {
  title: "Canvas Scribe/Pen Menu",
  parameters: { obsidian: { placement: "controls" } },
  render: toolbarPreview,
} satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;
// Keep the existing preview URL; the theme is controlled by Storybook globals.
export const Light: Story = { name: "Toolbar" };
export const Tablet: Story = { globals: { obsidianPlatform: "mobile" } };
