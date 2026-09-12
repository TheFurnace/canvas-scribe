/** Original upright artwork. Open contours stay readable at 24 CSS pixels. */
export const TOOL_ARTWORK = {
  ballpoint: {
    label: "Ballpoint", color: true,
    shape: "M9 22.5V12L12 3L15 12V22.5Z",
    tip: "M11 6L12 3L13 6Z",
    detail: "M9 12H15",
  },
  fountain: {
    label: "Fountain", color: true,
    shape: "M8 22.5V16L6 12L12 3L18 12L16 16V22.5Z",
    tip: "",
    detail: "M8 16H16M12 3V10M12 10A1.5 1.5 0 1 0 12 13A1.5 1.5 0 1 0 12 10",
  },
  brush: {
    label: "Brush", color: true,
    shape: "M9 22.5L9.5 14C4 11 12 7 14 3C17 8 17 12 14.5 14L15 22.5Z",
    tip: "",
    detail: "M9.5 14H14.5M10 11Q12 10 13 7",
  },
  pencil: {
    label: "Pencil", color: true,
    shape: "M7.5 22.5V11L12 3L16.5 11V22.5Z",
    tip: "M10.4 6L12 3L13.6 6Z",
    detail: "M7.5 11L10 12L12 10.5L14 12L16.5 11M12 13V22.5",
  },
  "highlighter-chisel": {
    label: "Chisel highlighter", color: true,
    shape: "M6 22.5V14L8 11V7L16 3V11L18 14V22.5Z",
    tip: "",
    detail: "M8 11H16M6 15H18",
  },
  "highlighter-round": {
    label: "Round highlighter", color: true,
    shape: "M6 22.5V14L8 11V7A4 4 0 0 1 16 7V11L18 14V22.5Z",
    tip: "",
    detail: "M8 11H16M6 15H18",
  },
  "eraser-stroke": {
    label: "Stroke eraser", color: false,
    shape: "M6 22.5V7L10 3H18V22.5Z",
    tip: "",
    detail: "M6 12H18M9 17H15",
  },
  "eraser-area": {
    label: "Area eraser", color: false,
    shape: "M9 22.5V8A3 3 0 0 1 15 8V22.5Z",
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

const TOOL_BODIES: Partial<Record<keyof typeof TOOL_ARTWORK, string>> = {
  ballpoint: "M9.8 12.8H14.2V21.7H9.8Z",
  fountain: "M8.8 16.8H15.2V21.7H8.8Z",
  brush: "M10.2 14.8H13.8L14.1 21.7H9.9Z",
  pencil: "M8.3 12.3L10 12.8L12 11.5L14 12.8L15.7 12.3V21.7H8.3Z",
  "highlighter-chisel": "M6.8 15.8H17.2V21.7H6.8Z",
  "highlighter-round": "M6.8 15.8H17.2V21.7H6.8Z",
};

export type ToolIcon = keyof typeof TOOL_ARTWORK;
export type ToolIconStyle = "silhouette" | "tip" | "full";

export function toolIconId(tool: ToolIcon, style: ToolIconStyle = "silhouette"): string {
  return `canvas-scribe-${tool}${style === "silhouette" ? "" : `-${style}`}`;
}

/** SVG body for Obsidian addIcon's 100-unit viewport; no theme or ink colors baked in. */
export function toolIconSvg(tool: ToolIcon, style: ToolIconStyle = "silhouette"): string {
  if (style !== "silhouette" && tool in FULL_TOOL_ARTWORK) return fullToolSvg(tool as keyof typeof FULL_TOOL_ARTWORK);
  const art = TOOL_ARTWORK[tool];
  const illustrated = style === "tip";
  // One clean outer contour; no stroked cutouts or stacked strokes to close up small gaps.
  const shading = illustrated && art.shape ? `<path fill="currentColor" opacity=".06" stroke="none" d="${art.shape}"/>` : "";
  const body = TOOL_BODIES[tool] ? `<path fill="var(--canvas-scribe-tool-color, currentColor)" stroke="none" d="${TOOL_BODIES[tool]}"/>` : "";
  const outline = art.shape ? `<path fill="none" stroke="currentColor" stroke-width="1.6" d="${art.shape}"/>` : "";
  const tip = art.tip ? `<path fill="currentColor" stroke="none" d="${art.tip}"/>` : "";
  const textBorder = tool === "text" ? `<path fill="none" stroke="currentColor" stroke-width="3.2" d="${art.detail}"/>` : "";
  const detail = art.detail ? `<path fill="none" stroke="currentColor" stroke-width="1.6" style="stroke: ${tool === "text" ? "var(--canvas-scribe-tool-color, currentColor)" : "currentColor"}" d="${art.detail}"/>` : "";
  return `<g transform="scale(4.1666666667)" stroke-linecap="round" stroke-linejoin="round">${shading}${body}${outline}${tip}${textBorder}${detail}</g>`;
}

/** Inject Obsidian addIcon in production; Storybook registers these same SVG bodies. */
export function registerToolIcons(addIcon: (id: string, svg: string) => void): void {
  for (const tool of Object.keys(TOOL_ARTWORK) as ToolIcon[]) {
    for (const style of ["silhouette", "tip", "full"] as const) addIcon(toolIconId(tool, style), toolIconSvg(tool, style));
  }
}

/** Original expanded tools on a 100-unit grid, optically drawn for shelves and radial centers. */
export const FULL_TOOL_ARTWORK = {
  ballpoint: { nib: "M43 39L48 12Q50 6 52 12L57 39Z", detail: "M48 13H52M45 31H55", collar: "M41 39H59V49H41Z", barrel: "M41 49H59L61 94H39Z" },
  fountain: { nib: "M42 43Q29 31 40 18L50 5L60 18Q71 31 58 43Z", detail: "M50 6V27M50 27a2.5 2.5 0 1 0 0 5a2.5 2.5 0 1 0 0-5", collar: "M39 43H61L63 55H37Z", barrel: "M38 55H62V94H38Z" },
  brush: { nib: "M42 43C23 29 54 22 57 5C72 26 67 38 58 43Z", detail: "M42 37Q54 31 57 17", collar: "M41 43H59L61 56H39Z", barrel: "M39 56H61L58 94H42Z" },
  pencil: { nib: "M37 43L50 6L63 43L56 40L50 44L44 40Z", detail: "M46 18L50 6L54 18Z", collar: "M37 43L44 40L50 44L56 40L63 43V50H37Z", barrel: "M37 50H63V94H37Z" },
  "highlighter-round": { nib: "M43 30V17a7 7 0 0 1 14 0V30Z", detail: "M43 25H57", collar: "M40 30H60V40L65 47V54H35V47L40 40Z", barrel: "M35 54H65L67 94H33Z" },
  "highlighter-chisel": { nib: "M39 30V17L61 7V30Z", detail: "M39 25H61", collar: "M37 30H63V40L67 47V54H33V47L37 40Z", barrel: "M33 54H67L69 94H31Z" },
} as const;

function fullToolSvg(tool: keyof typeof FULL_TOOL_ARTWORK): string {
  const art = FULL_TOOL_ARTWORK[tool];
  const ink = "var(--canvas-scribe-tool-color, currentColor)";
  const coloredNib = tool === "brush" || tool.startsWith("highlighter");
  return `<g stroke-linejoin="round" stroke-linecap="round">
    <path d="${art.barrel}" fill="${ink}" stroke="currentColor" stroke-width="1.3"/>
    <path d="${art.nib}" fill="${coloredNib ? ink : "var(--background-primary, #fff)"}" stroke="currentColor" stroke-width="1.4"/>
    <path d="${art.nib}" fill="currentColor" opacity=".09"/>
    <path d="${art.collar}" fill="var(--text-muted, currentColor)" stroke="currentColor" stroke-width="1.3"/>
    <path d="${art.detail}" fill="none" stroke="currentColor" stroke-width="1.7"/>
    <path d="M44 58V90" stroke="white" opacity=".3" stroke-width="4"/>
    <path d="M56 58V90" stroke="black" opacity=".1" stroke-width="3"/>
  </g>`;
}
