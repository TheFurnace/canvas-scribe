/** Original upright artwork. Geometry is authored on a 24-unit grid. */
export const TOOL_ARTWORK = {
  ballpoint: {
    label: "Ballpoint", color: true,
    shape: "M9 21V12L11.1 4Q12 2 12.9 4L15 12V21ZM10.7 13V19H11.8V13Z",
    tip: "M11.1 4Q12 2 12.9 4L13.6 7H10.4Z",
    detail: "M9 12H15M9 15H15",
  },
  fountain: {
    label: "Fountain", color: true,
    shape: "M8 21V16L6.5 12L12 2L17.5 12L16 16V21ZM11.4 4.9V9.6A1.5 1.5 0 1 0 12.6 9.6V4.9Z",
    tip: "M6.5 12L12 2L17.5 12L16 16H8ZM11.4 4.9V9.6A1.5 1.5 0 1 0 12.6 9.6V4.9Z",
    detail: "M8 16H16M8 18.5H16",
  },
  brush: {
    label: "Brush", color: true,
    shape: "M8.5 21L9 14C4.8 10 12.8 6.5 14 2C17.5 8.2 17 11.5 15 14L15.5 21ZM12 7.5Q8 11 10.7 12L10.9 10Z",
    tip: "M9 14C4.8 10 12.8 6.5 14 2C17.5 8.2 17 11.5 15 14ZM12 7.5Q8 11 10.7 12L10.9 10Z",
    detail: "M9 14H15M8.9 16.5H15.1",
  },
  pencil: {
    label: "Pencil", color: true,
    shape: "M7.5 21V11L12 2L16.5 11V21ZM11.4 12.5V20H12.6V12.5ZM9.3 10.4H14.7L12 5Z",
    tip: "M10.3 5.4L12 2L13.7 5.4Z",
    detail: "M7.5 11L10 12L12 10.5L14 12L16.5 11M10 12V21M14 12V21",
  },
  "highlighter-chisel": {
    label: "Chisel highlighter", color: true,
    shape: "M6 21V13L8 10V6L16 2V10L18 13V21ZM8 14V15.3H16V14Z",
    tip: "M8 6L16 2V10H8Z",
    detail: "M8 10H16M6 13H18M8.5 17V21M15.5 17V21",
  },
  "highlighter-round": {
    label: "Round highlighter", color: true,
    shape: "M6 21V13L8 10V6A4 4 0 0 1 16 6V10L18 13V21ZM8 14V15.3H16V14Z",
    tip: "M8 10V6A4 4 0 0 1 16 6V10Z",
    detail: "M8 10H16M6 13H18M8.5 17V21M15.5 17V21",
  },
  "eraser-stroke": {
    label: "Stroke eraser", color: false,
    shape: "M6 21V7Q6 3 10 3H14Q18 3 18 7V21ZM8 11V12.5H16V11ZM8.5 16V17.5H15.5V16Z",
    tip: "M6 10V7Q6 3 10 3H14Q18 3 18 7V10Z",
    detail: "M6 11.5H18M9 17H15",
  },
  "eraser-area": {
    label: "Area eraser", color: false,
    shape: "M8 21V8A4 4 0 0 1 16 8V21ZM9.5 12V13.5H14.5V12ZM10.5 16V19H13.5V16Z M3 5H4.5V8H3ZM19.5 5H21V8H19.5ZM3 10H4.5V13H3ZM19.5 10H21V13H19.5Z",
    tip: "M8 11V8A4 4 0 0 1 16 8V11Z",
    detail: "M8 12.5H16M10.5 16.5H13.5V19H10.5Z",
  },
  lasso: {
    label: "Lasso selection", color: false,
    shape: "",
    tip: "",
    detail: "M5 15C1 11 3 5 8 4C14 1.5 21 5 21 10C21 15 15 17.5 9 16M7.5 16C7.5 13 3.5 13 3.5 16C3.5 19 9 19 9 16ZM7 18Q7 21 11 21",
  },
  "selection-rectangle": {
    label: "Rectangle selection", color: false,
    shape: "",
    tip: "",
    detail: "M4 8V4H8M11 4H13M16 4H20V8M20 11V13M20 16V20H16M13 20H11M8 20H4V16M4 13V11",
  },
  text: {
    label: "Text", color: true,
    shape: "M4 4H20V8H18V6H13.2V19H16V21H8V19H10.8V6H6V8H4Z",
    tip: "", detail: "",
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
  const illustrated = style === "tip" && art.tip !== "";
  const body = art.shape ? `<path fill="currentColor" fill-rule="evenodd" stroke="none"${illustrated ? ' opacity=".16"' : ""} d="${art.shape}"/>` : "";
  const tip = illustrated ? `<path fill="none" stroke="currentColor" stroke-width="1.4" d="${art.shape}"/><path fill="currentColor" fill-rule="evenodd" stroke="none" d="${art.tip}"/>` : "";
  const detail = (illustrated || !art.shape) && art.detail ? `<path fill="none" stroke="currentColor" stroke-width="${illustrated ? 1.4 : 1.8}" d="${art.detail}"/>` : "";
  return `<g transform="scale(4.1666666667)" stroke-linecap="round" stroke-linejoin="round">${body}${tip}${detail}</g>`;
}

/** Inject Obsidian addIcon in production; Storybook registers these same SVG bodies. */
export function registerToolIcons(addIcon: (id: string, svg: string) => void): void {
  for (const tool of Object.keys(TOOL_ARTWORK) as ToolIcon[]) {
    for (const style of ["silhouette", "tip"] as const) addIcon(toolIconId(tool, style), toolIconSvg(tool, style));
  }
}
