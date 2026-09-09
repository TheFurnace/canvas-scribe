/** Original upright artwork. Open contours stay readable at 24 CSS pixels. */
export const TOOL_ARTWORK = {
  ballpoint: {
    label: "Ballpoint", color: true,
    shape: "M9 21V12L12 3L15 12V21Z",
    tip: "M11 6L12 3L13 6Z",
    detail: "M9 12H15",
  },
  fountain: {
    label: "Fountain", color: true,
    shape: "M8 21V16L6 12L12 3L18 12L16 16V21Z",
    tip: "",
    detail: "M8 16H16M12 3V10M12 10A1.5 1.5 0 1 0 12 13A1.5 1.5 0 1 0 12 10",
  },
  brush: {
    label: "Brush", color: true,
    shape: "M9 21L9.5 14C4 11 12 7 14 3C17 8 17 12 14.5 14L15 21Z",
    tip: "",
    detail: "M9.5 14H14.5M10 11Q12 10 13 7",
  },
  pencil: {
    label: "Pencil", color: true,
    shape: "M7.5 21V11L12 3L16.5 11V21Z",
    tip: "M10.4 6L12 3L13.6 6Z",
    detail: "M7.5 11L10 12L12 10.5L14 12L16.5 11M12 13V21",
  },
  "highlighter-chisel": {
    label: "Chisel highlighter", color: true,
    shape: "M6 21V14L8 11V7L16 3V11L18 14V21Z",
    tip: "",
    detail: "M8 11H16M6 15H18",
  },
  "highlighter-round": {
    label: "Round highlighter", color: true,
    shape: "M6 21V14L8 11V7A4 4 0 0 1 16 7V11L18 14V21Z",
    tip: "",
    detail: "M8 11H16M6 15H18",
  },
  "eraser-stroke": {
    label: "Stroke eraser", color: false,
    shape: "M6 21V7L10 3H18V21Z",
    tip: "",
    detail: "M6 12H18M9 17H15",
  },
  "eraser-area": {
    label: "Area eraser", color: false,
    shape: "M9 21V8A3 3 0 0 1 15 8V21Z",
    tip: "",
    detail: "M9 13H15M3 8V5H5M19 5H21V8M3 12V15H5M19 15H21V12",
  },
  lasso: {
    label: "Lasso selection", color: false,
    shape: "",
    tip: "",
    detail: "M6 16C2 14 2 7 7 5C12 2 21 5 21 10C21 14 16 17 10 16M7 14C3 13 3 18 6 18C9 18 10 14 7 14M7 18Q7 21 11 21",
  },
  "selection-rectangle": {
    label: "Rectangle selection", color: false,
    shape: "",
    tip: "",
    detail: "M4 8V4H8M11 4H13M16 4H20V8M20 11V13M20 16V20H16M13 20H11M8 20H4V16M4 13V11",
  },
  text: {
    label: "Text", color: true,
    shape: "", tip: "",
    detail: "M5 7V4H19V7M12 4V21M8 21H16",
  },
} as const;

export type ToolIcon = keyof typeof TOOL_ARTWORK;
export type ToolIconStyle = "silhouette" | "tip";

export function toolIconId(tool: ToolIcon, style: ToolIconStyle = "silhouette"): string {
  return `canvas-scribe-${tool}${style === "tip" ? "-tip" : ""}`;
}

/** SVG body for Obsidian addIcon's 100-unit viewport; no theme or ink colors baked in. */
export function toolIconSvg(tool: ToolIcon, style: ToolIconStyle = "silhouette"): string {
  const art = TOOL_ARTWORK[tool];
  const illustrated = style === "tip";
  // One clean outer contour; no stroked cutouts or stacked strokes to close up small gaps.
  const shading = illustrated && art.shape ? `<path fill="currentColor" opacity=".06" stroke="none" d="${art.shape}"/>` : "";
  const outline = art.shape ? `<path fill="none" stroke="currentColor" stroke-width="1.6" d="${art.shape}"/>` : "";
  const tip = art.tip ? `<path fill="currentColor" stroke="none" d="${art.tip}"/>` : "";
  const detail = art.detail ? `<path fill="none" stroke="currentColor" stroke-width="1.6" d="${art.detail}"/>` : "";
  return `<g transform="scale(4.1666666667)" stroke-linecap="round" stroke-linejoin="round">${shading}${outline}${tip}${detail}</g>`;
}

/** Inject Obsidian addIcon in production; Storybook registers these same SVG bodies. */
export function registerToolIcons(addIcon: (id: string, svg: string) => void): void {
  for (const tool of Object.keys(TOOL_ARTWORK) as ToolIcon[]) {
    for (const style of ["silhouette", "tip"] as const) addIcon(toolIconId(tool, style), toolIconSvg(tool, style));
  }
}
