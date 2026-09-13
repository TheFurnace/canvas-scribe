import { createAction, createNumericControl, createSwatch } from "../src/ui-controls";
import { createToolIconButton } from "../src/tool-icon-button";
import { TOOL_ARTWORK, toolIconId, type ToolIcon } from "../src/tool-icons";
import { createPenPreview } from "../src/pen-menu";
import { toolSwatches, resolveColor, defaultColorLabel, type ColorTool } from "../src/colors";
import { InkToolState } from "../src/ink-tool-state";
import { createToolMenu, createToolColors, createToolRadial } from "../src/tool-suite";
import { createColorPicker } from "../src/color-picker";
import { RadialSession } from "../src/radial-session";
import { FavoritePens } from "../src/favorite-pens";
import { createCanvasControls, syncCanvasControls } from "../src/canvas-controls";
import { renderStoryIcon } from "./story-helpers";
import { createSharedToolsPreview } from "./shared-tools.stories";
import type { DrawingTool } from "../src/types";
import "./style-guide.css";

const chapters = [
  ["foundations", "Foundations", "Theme, ink, type, space and shape"],
  ["elements", "Basic elements", "Artwork, labels and state marks"],
  ["controls", "Controls", "Elements with a purpose and an interaction"],
  ["components", "Components", "Controls arranged into complete tasks"],
  ["surfaces", "Surface layouts", "One vocabulary across three drawing spaces"],
] as const;
type Chapter = typeof chapters[number][0];

function el<K extends keyof HTMLElementTagNameMap>(tag: K, text = "", className = ""): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag); node.textContent = text; node.className = className; return node;
}
function link(label: string, id: string): HTMLAnchorElement {
  const node = el("a", label);
  const params = new URLSearchParams(window.location.search);
  params.delete("path"); params.set("id", id); params.set("viewMode", "story");
  node.href = `./iframe.html?${params}`; return node;
}
function section(parent: HTMLElement, title: string, recipe: string, description: string) {
  const node = el("section", "", "scribe-guide-section");
  node.append(el("h2", title), el("p", recipe, "scribe-guide-recipe"), el("p", description)); parent.append(node); return node;
}
function source(parent: HTMLElement, files: string[], story?: [string, string]) {
  const details = el("details"); details.append(el("summary", "Implementation and further examples"));
  files.forEach(file => { const a = el("a", file); a.href = `https://github.com/TheFurnace/canvas-scribe/blob/3fc6dc7ec9c53428f21d00b03c602c5d1f14fcab/${file}`; a.target = "_blank"; a.rel = "noreferrer"; const p = el("p"); p.append(a); details.append(p); });
  if (story) details.append(link(story[0], story[1])); parent.append(details);
}
function table(parent: HTMLElement, headers: string[], rows: string[][]) {
  const node = el("table"), head = el("thead"), tr = el("tr");
  headers.forEach(label => { const th = el("th", label); th.scope = "col"; tr.append(th); }); head.append(tr); node.append(head);
  const body = el("tbody"); rows.forEach(row => { const r = el("tr"); row.forEach(cell => r.append(el("td", cell))); body.append(r); }); node.append(body); parent.append(node);
}
function note(parent: HTMLElement, text: string) { parent.append(el("p", text, "scribe-guide-note")); }
function figure(node: Node, caption: string) { const f = el("figure"); f.append(node, el("figcaption", caption)); return f; }

function foundations(parent: HTMLElement) {
  const theme = section(parent, "Interface colors belong to the theme", "Foundation → surface, text and feedback roles", "Agreed direction · Obsidian provides the interface palette, typography and accent. Scribe defines how those roles are composed. Switch Light / Dark above to inspect the same roles in both themes.");
  const grid = el("div", "", "scribe-guide-grid");
  for (const [label, variable, usage] of [
    ["Surface", "--background-primary", "Menus and dialogs"], ["Secondary surface", "--background-secondary", "Grouped or raised controls"],
    ["Primary text", "--text-normal", "Labels and neutral artwork"], ["Supporting text", "--text-muted", "Descriptions and values"],
    ["Border", "--background-modifier-border", "Edges and group dividers"], ["Accent", "--interactive-accent", "Selection and keyboard focus"],
    ["On accent", "--text-on-accent", "Content on accent fills"], ["Hover modifier", "--background-modifier-hover", "Layer over the resting surface"],
  ]) {
    const item = el("div", "", "scribe-guide-sample"), chip = el("div", "", "scribe-guide-chip");
    chip.style.background = label === "Hover modifier" ? `linear-gradient(var(${variable}),var(${variable})),var(--background-secondary)` : `var(${variable})`;
    item.append(el("h3", label), chip, el("code", variable), el("small", usage)); grid.append(item);
  }
  theme.append(grid); source(theme, ["styles.css", "src/tool-indicator.ts"]);
  const ink = section(parent, "Ink has a separate palette", "Foundation → stored color + tool opacity", "Approved collections · 24 pen colors and 16 highlighter colors are shared across menus. Select a sample to see it on light and dark paper. These are ink choices, not interface accents.");
  for (const tool of ["pen", "highlighter"] as const) {
    ink.append(el("h3", tool === "pen" ? "Pen · core hues, lighter tones, neutrals and earth tones" : "Highlighter · vivid and pastel tones"));
    const palette = el("div", "", "scribe-guide-palette"), previews = el("div", "", "scribe-guide-preview");
    const output = el("output", "", "scribe-guide-live"); output.setAttribute("aria-live", "polite");
    const papers = ["#ffffff", "#202124"].map(background => {
      const paper = el("div", "", "scribe-guide-paper"); paper.style.background = background; paper.style.color = background === "#ffffff" ? "#202124" : "#ffffff";
      const label = el("span", background === "#ffffff" ? "Light paper" : "Dark paper"), sample = el("div"); paper.append(label, sample); previews.append(paper); return sample;
    });
    const buttons: HTMLButtonElement[] = [];
    const select = (color: string) => {
      buttons.forEach(b => b.setAttribute("aria-pressed", String(b.dataset.color === color)));
      papers.forEach(paper => {
        if (tool === "pen") paper.replaceChildren(createPenPreview(document, "fountain", 3.5, color));
        else { const line = el("p", "A highlighted passage"); line.style.cssText = `background:color-mix(in srgb, ${color} 38%, transparent);padding:4px`; paper.replaceChildren(line); }
      }); output.value = `${color} · ${tool === "pen" ? "100% opacity" : "38% default opacity"}`;
    };
    toolSwatches(tool).forEach(color => {
      const b = createAction(document, "", () => select(color)); b.dataset.color = color; b.setAttribute("aria-label", `Preview ${tool} ${color}`);
      const chip = el("span"); chip.style.background = color; b.append(chip, el("code", color)); buttons.push(b); palette.append(b);
    });
    select(toolSwatches(tool)[0]!); ink.append(palette, previews, output, el("p"));
  }
  table(ink, ["Choice", "Meaning"], [["Pen Theme", "New Canvas/note ink follows theme text. PDF uses dark ink on its white page."], ["Highlighter Default", "The tool’s fixed yellow fallback; independent of theme text."], ["Explicit swatch", "A fixed ink value, even when it looks identical to Theme or Default."], ["Existing marks", "Stored colors retain their appearance when the interface theme changes."]]);
  source(ink, ["src/colors.ts", "src/pdf-tools.ts"], ["Color curation", "canvas-scribe-color-curation--proposed-sets"]);
  const type = section(parent, "Typography and spacing", "Foundation → a readable hierarchy and a repeatable rhythm", "Approved standard · Use host font roles and a 4 / 8 / 12 / 16 / 24 spacing rhythm. Spacing describes grouping; document zoom must never resize the interface.");
  const types = el("div", "", "scribe-guide-grid");
  for (const [label, token] of [["Menu heading", "--font-ui-medium"], ["Control label", "--font-ui-small"], ["Supporting caption", "--font-ui-smaller"]]) { const item = el("div", "", "scribe-guide-sample"); const sample = el("p", label); sample.style.fontSize = `var(${token})`; item.append(sample, el("code", token)); types.append(item); } type.append(types);
  for (const [size, use] of [[4,"Within a compact swatch collection"],[8,"Related elements"],[12,"Between control groups"],[16,"Dialog padding"],[24,"Between larger sections"]] as const) { const row = el("div", "", "scribe-guide-metric"), bar = el("span", "", "scribe-guide-space"); bar.style.width = `${size}px`; row.append(bar, el("span", `${size} px · ${use}`)); type.append(row); }
  note(type, "Approved target P1 · Consolidate scattered 6, 10 and 14 px values when they express the same spacing role. Preserve optical exceptions in radial geometry and tool artwork.");
  const shape = section(parent, "Shape, edge and elevation", "Foundation → boundaries that explain purpose", "Approved standard · Circles identify ink and round actions; rounded rectangles contain settings. Use a theme border for separation and one host shadow for floating surfaces.");
  const shapes = el("div", "", "scribe-guide-row");
  for (const [label, radius] of [["Control · 8 px", "8px"], ["Tool menu · 20 px", "20px"], ["Swatch · circle", "50%"]]) { const s = el("div", "", "scribe-guide-shape"); s.style.borderRadius = radius; shapes.append(figure(s, label)); } shape.append(shapes);
  table(shape, ["Role", "Target specification"], [["Control target", "36 px compact desktop; at least 44 px for touch and radial actions."], ["Visible ink chip", "24 px in tool settings, 28 px in drawer/radial; hit area stays larger."], ["Border / focus", "1 px theme border; 2 px focus outline outside the selected treatment."], ["Floating surface", "Host --shadow-s; no shadow on every nested control."]]);
  note(shape, "Approved target P2 · Keep the revised 20 px tool-menu shell; extend the shared shell vocabulary to color drawers and dialogs, with documented compact exceptions. Their current radii differ. These samples are a target specification, not a global CSS change.");
  source(shape, ["styles.css"]);
}

function elements(parent: HTMLElement) {
  const icons = section(parent, "Artwork + ink + neutral detail", "Color roles + tool silhouette → recognizable tool identity", "Current production · A tool’s body carries ink color; neutral detail keeps the tip readable. Artwork is shared with the plugin. Compare at actual size before judging an enlarged illustration.");
  const row = el("div", "", "scribe-guide-row");
  for (const tool of Object.keys(TOOL_ARTWORK) as ToolIcon[]) { const art = el("span", "", "scribe-guide-art"); art.setAttribute("aria-hidden", "true"); renderStoryIcon(art, toolIconId(tool)); row.append(figure(art, TOOL_ARTWORK[tool].label)); }
  icons.append(row); source(icons, ["src/tool-icons.ts", "src/tool-indicator.ts"], ["Full tool icon family", "canvas-scribe-tool-icons--family"]);
  const labels = section(parent, "Labels, values and grouping", "Typography + space + divider → hierarchy", "Approved standard · Name an action with a verb, a setting with a noun, and a value with its unit. Keep the hierarchy understandable without color or hover.");
  table(labels, ["Element", "Example", "Rule"], [["Heading", "Pen", "Names the group; host medium type."], ["Setting / value", "Thickness · 3.5 units", "Label and value stay visible while adjusting."], ["Action", "More colors…", "Signals a further choice, not an immediate ink change."], ["Semantic choice", "Theme / Default", "Label the meaning; do not infer it from a hex match."], ["Divider", "Palette / recents", "Separate different sources of choices, not every control."]]);
  const states = section(parent, "Selection, focus and availability", "Boundary + meaning + accessible state → feedback", "Current production · The two swatches below use the same builder as the drawer. One is selected. Tab through them to inspect keyboard focus; hovering must leave the ink chip unchanged.");
  // The shared swatch relies on its production container for chip positioning.
  const swatchShell = el("div", "", "canvas-scribe-quick-colors scribe-guide-inline-menu");
  const examples = el("div", "", "scribe-guide-row canvas-scribe-quick-swatches");
  const colors = toolSwatches("pen").slice(0, 2); const buttons: HTMLButtonElement[] = [];
  colors.forEach((color, i) => { const button = createSwatch(document, { color, label: `State sample ${color}`, selected: i === 0, onSelect: () => buttons.forEach(b => b.setAttribute("aria-pressed", String(b === button))) }); buttons.push(button); examples.append(figure(button, i === 0 ? "Initially selected" : "Initially unselected")); });
  const disabled = createAction(document, "Unavailable", () => {}); disabled.disabled = true; examples.append(figure(disabled, "Disabled action")); swatchShell.append(examples); states.append(swatchShell);
  note(states, "Approved target P3 · Selection should remain visible when focus moves. Use an inner selection boundary and a separate outer accent focus ring. The following target specimen lets both states coexist.");
  const proposed = createAction(document, "", () => proposed.setAttribute("aria-pressed", String(proposed.getAttribute("aria-pressed") !== "true")));
  proposed.className = "scribe-guide-target-swatch"; proposed.setAttribute("aria-label", "Approved swatch state treatment"); proposed.setAttribute("aria-pressed", "true"); proposed.append(el("span")); states.append(proposed);
  table(states, ["State", "Design rule"], [["Rest", "Stable surface and readable content."], ["Hover", "Theme hover layer over that surface; retain the ink color."], ["Selected", "Persistent mark plus pressed/checked semantics."], ["Focus", "Outer keyboard outline, visible alongside selection."], ["Expanded", "Indicate the open settings separately from the selected tool."], ["Disabled", "Recognizable but unavailable; native disabled behavior."]]);
  source(states, ["src/ui-controls.ts", "styles.css"]);
}

function controls(parent: HTMLElement) {
  const tools = section(parent, "Tool button", "Artwork + ink + target + selected state → tool choice", "Current production · Select a tool below. Its identity comes from the artwork; the surrounding boundary carries selection. The enlarged variant belongs in settings, where there is room to inspect it.");
  const row = el("div", "", "scribe-guide-row"), buttons: HTMLButtonElement[] = [];
  for (const tool of ["fountain", "ballpoint", "brush", "pencil"] as const) { const b = createToolIconButton(document, renderStoryIcon, { tool, color: toolSwatches("pen")[5], selected: tool === "fountain", onSelect: () => buttons.forEach(other => other.setAttribute("aria-pressed", String(b === other))) }); buttons.push(b); row.append(figure(b, TOOL_ARTWORK[tool].label)); } tools.append(row);
  source(tools, ["src/tool-icon-button.ts", "src/canvas-controls.ts"]);
  const numeric = section(parent, "Numeric control and stroke preview", "Label + value + decrement / slider / increment + preview → adjustment", "Current production · Change thickness with the buttons or keyboard. The numeric control enforces its bounds; the preview uses the production stroke renderer. Width is measured in document units.");
  const sample = el("div", "", "scribe-guide-demo"), preview = el("div"); preview.style.maxWidth = "360px";
  const update = (size: number) => preview.replaceChildren(createPenPreview(document, "fountain", size, "var(--text-normal)"));
  const control = createNumericControl(document, { label:"Thickness", value:3.5, min:1, max:20, step:.5, unit:"units", onChange:update }); sample.append(control.root, preview); update(3.5); numeric.append(sample);
  source(numeric, ["src/ui-controls.ts", "src/pen-menu.ts"]);
  const color = section(parent, "Color choice", "Ink chip + target + semantic label + selected state → a color control", "Agreed behavior · Theme or Default is a distinct choice from an explicit color with the same appearance. The current choice and color history are separate concepts.");
  table(color, ["Ingredient", "Responsibility"], [["Ink chip", "Show the actual color, with an edge that survives black and white ink."], ["Button target", "Make the chip easy to acquire with pen, finger or mouse."], ["Selection mark", "Mark the actual choice only; preserve semantic identity."], ["Label", "Explain Theme / Default; give every unlabeled chip an accessible name."], ["History", "Store confirmed explicit choices per tool, shared across drawing surfaces."]]);
  color.append(link("Try these controls inside the color drawer →", "canvas-scribe-style-guide--components"));
  const composition = section(parent, "Composition recipe", "Ingredients stay stable as their arrangement changes", "A toolbar uses a compact tool target. A settings menu combines richer artwork with the same ink identity. A radial rearranges those controls around the pen without changing their meaning.");
  table(composition, ["Control", "Built from", "Used in"], [["Tool choice", "Artwork + target + state", "Toolbar, tool menu, radial"], ["Color choice", "Chip + border + mark + name", "Drawer, picker, tool menu, radial"], ["Thickness", "Label + bounded value + adjustment + preview", "Tool menu and radial adjustment disk"], ["Close / Back", "Action icon + target + accessible verb", "Popover, dialog, radial navigation"]]);
}

function components(parent: HTMLElement, cleanups: Array<() => void>) {
  const menu = section(parent, "One set of controls, several compositions", "Tool identity + numeric controls + colors + shell → a complete settings task", "Current production · These examples share one temporary tool state. Open a menu, select colors, adjust thickness, or explore the radial. Your plugin settings and documents are unaffected.");
  const state = new InkToolState(), favorites = new FavoritePens(); favorites.add({tool:"pen", penType:"pencil", size:6, color:toolSwatches("pen")[5]!, opacity:.7});
  const launchers = el("div", "", "scribe-guide-row"), stage = el("div", "", "scribe-guide-demo"), status = el("p", "", "scribe-guide-live"); status.setAttribute("aria-live", "polite");
  let radial: RadialSession | null = null, modal: HTMLElement | null = null, opener: HTMLElement | null = null;
  const defaultColor = (tool: ColorTool) => tool === "pen" ? resolveColor(document, getComputedStyle(parent).getPropertyValue("--text-normal").trim() || "#1f2937") : "#fde047";
  const current = (tool: ColorTool) => state.toolColors.current(tool, defaultColor(tool));
  const activeColorTool = () => state.activeTool === "highlighter" ? "highlighter" : "pen";
  const sync = () => { const tool = activeColorTool(); status.textContent = `${state.activeTool} · ${state.toolColors.selection(tool) === null ? defaultColorLabel(tool) : current(tool)} · ${tool === "pen" ? state.penSize : state.highlighterSize} units · recent: ${state.toolColors.recent(tool).join(", ") || "none"}`; };
  const close = () => { stage.replaceChildren(); stage.style.minHeight = ""; modal?.remove(); modal = null; radial?.close(false); radial = null; sync(); opener?.focus({preventScroll:true}); };
  const mount = (node: HTMLElement) => { stage.replaceChildren(); modal?.remove(); modal = null;
    if (node.classList.contains("canvas-scribe-picker-backdrop")) { modal = node; parent.append(node); }
    else { node.classList.add("scribe-guide-inline-menu"); stage.append(node); }
    node.querySelector<HTMLElement>("button,input")?.focus();
  };
  const colors = () => mount(createToolColors(document, state, activeColorTool(), {defaultColor:defaultColor(activeColorTool()), mount, close, changed:sync}));
  const settings = () => mount(createToolMenu(document, renderStoryIcon, state, {color:current, colors, close, changed:sync, count:0, canClear:false, clear:()=>{}, scale:()=>{}, recolor:colors}));
  const launch = (label: string, run: () => void) => { const b = createAction(document, label, () => { close(); opener = b; run(); sync(); }); launchers.append(b); return b; };
  launch("Pen settings", () => { state.activeTool = "pen"; settings(); });
  launch("Highlighter settings", () => { state.activeTool = "highlighter"; settings(); });
  launch("Color drawer", colors);
  launch("Full picker", () => { const tool = activeColorTool(); mount(createColorPicker(document, {tool, current:current(tool), defaultColor:defaultColor(tool), isDefault:state.toolColors.selection(tool) === null, recent:state.toolColors.recent(tool), onConfirm:value=>{state.toolColors.confirm(tool,value);close();}, onCancel:close})); });
  launch("Radial and favorites", () => {
    stage.style.minHeight = "360px";
    stage.append(el("small", "Explore Quick tools, Settings and Favorites. Escape closes the radial."));
    const actions = createToolRadial(document, state, favorites, {defaultColor, changed:sync, selectTool:tool=>{state.activeTool=tool;sync();}, undo:()=>{},redo:()=>{},canUndo:()=>false,canRedo:()=>false});
    const session = new RadialSession(document, actions, () => { radial = null; stage.replaceChildren(); stage.style.minHeight = ""; sync(); }, renderStoryIcon, parent);
    const rect = stage.getBoundingClientRect(); session.open(rect.left + rect.width / 2, Math.max(180, Math.min(window.innerHeight - 180, rect.top + 160))); radial = session;
  });
  menu.append(launchers, stage, status); sync();
  cleanups.push(() => { opener = null; close(); });
  const recipes = section(parent, "Read the component from the inside out", "Foundation → element → control → composition", "The layout follows the task. Shared ingredients keep the interface recognizable even where confirmation and dismissal differ.");
  table(recipes, ["Component", "Composition and behavior"], [["Pen / highlighter settings", "Shell + illustrated tool choices + stroke preview + numeric controls + color choices. Adjustments affect subsequent marks."], ["Color drawer", "Heading + ten pinned swatches in two rows + a third Theme/Default and recents row + More colors. Selection applies and closes."], ["Full picker", "Swatches / Spectrum + pending preview + numeric color fields + Cancel / Done. Changes remain pending until Done."], ["Radial colors", "Fixed default/current/recent slots + clipped swatch arc + More colors. Selection applies and stays open; final explicit choice enters history on full dismissal."], ["Favorites", "Tool artwork + ink + thickness/opacity → a reusable preset. Apply from the radial; manage through the favorites page."]]);
  note(recipes, "Current exception · Only the radial removes duplicate explicit colors across recents and swatches. Drawer and picker preserve their stable collections. A semantic Theme/Default choice is never removed because its resolved hex matches a swatch.");
  source(recipes, ["src/tool-suite.ts", "src/quick-colors.ts", "src/radial-colors.ts", "src/color-picker.ts", "src/favorite-manager.ts"]);
  const behavior = section(parent, "Dismissal is part of the component", "Interaction contract → predictable commitment", "Agreed behavior · A quick adjustment and a full editing dialog have different commitment points. Label and demonstrate that difference consistently.");
  table(behavior, ["Interaction", "Result"], [["Radial color tap", "Apply immediately; stay open; keep slot positions stable."], ["Radial Back", "Return to parent; do not record history yet."], ["Radial full dismissal", "Record only the final explicit selection."], ["Nested picker Cancel", "Restore entry selection; return to the radial."], ["Nested picker Done", "Apply; defer history until radial dismissal."], ["Drawer selection", "Apply, commit history, close."], ["Picker Cancel / Escape", "Discard pending edits."]]);
  note(behavior, "Approved target P4 · Explicit close and Escape should return focus to the opener consistently across adapters; pointer dismissal should preserve drawing intent. The examples restore focus locally, while host-wide adoption remains implementation work.");
}

function surfaces(parent: HTMLElement) {
  const rules = section(parent, "Shared vocabulary, surface-specific composition", "Controls + document boundaries + navigation → a drawing workspace", "Agreed direction · Tool meaning and preferences remain consistent across views. Each surface owns its page layout, document actions and navigation.");
  table(rules, ["Surface", "Composition", "Specific rule"], [["Canvas", "Native Canvas controls + Scribe tools + anchored menus", "Preserve native card selection, pan and zoom."], ["Handwritten note", "Transparent grid-backed page + outline/shadow + right-floating tools", "Plain text and ink share the document; page/text actions stay here."], ["PDF", "Native PDF page + ink overlay + shared tools", "Dark default pen on white paper; retain native navigation and text/link access."]]);
  const canvas = section(parent, "Canvas toolbar composition", "Native control rail + tool identity + action states", "Current production controls · Select a tool below; history remains disabled because this specimen has no document. Use the Components chapter for the complete settings and color flows.");
  let tool: DrawingTool = "pen", enabled = true;
  const status = el("p", "", "scribe-guide-live"); status.setAttribute("aria-live","polite");
  const controls = createCanvasControls(document, renderStoryIcon, {setTool:value=>{tool=value;sync();}, toggleEnabled:()=>{enabled=!enabled;sync();}, toggleColorPalette:()=>{status.textContent="Open the Components chapter to inspect the color drawer.";}, undo:()=>{},redo:()=>{}});
  function sync() { syncCanvasControls(controls,{activeTool:tool,enabled,penType:"fountain",penColor:"var(--text-normal)",highlighterColor:"#fde047",canUndo:false,canRedo:false}); status.textContent=`${tool} selected · drawing ${enabled ? "enabled" : "disabled"}`; }
  const rail = el("div", "", "canvas-controls"); rail.style.cssText="position:relative;inset:auto;width:fit-content"; rail.append(controls); canvas.append(rail,status); sync();
  canvas.append(link("Complete component interactions", "canvas-scribe-style-guide--components"));
  const live = section(parent, "Note and PDF share their tools", "The same tool state + two surface adapters", "Current production adapters · Change a pen or color in either view. Right-click for the radial. The note supports mouse drawing for this preview; the PDF is a tools fixture rather than the native viewer.");
  const preview = createSharedToolsPreview(); preview.style.position = "relative"; preview.style.inset = "auto"; preview.style.padding = "0"; preview.style.height = "auto"; live.append(preview);
  source(live, ["src/handwritten-note-editor.ts", "src/pdf-tools.ts", "src/canvas-controls.ts"], ["Full shared-tools workspace", "canvas-scribe-shared-tools--desktop"]);
  const review = section(parent, "Review the system at the boundaries", "Theme + input + viewport + document → acceptance", "A coherent guide includes the difficult states. These checks are requirements for adoption, not a claim that a browser specimen proves physical-device behavior.");
  table(review,["Review", "Inspect"],[["Light / dark", "Ink visibility, muted labels, selected and focused controls, hover contrast."],["Narrow / large text", "No clipped labels, reachable close/actions, preserved touch targets."],["Keyboard", "Tab order, focus restoration, Escape, bounded numeric input."],["Pen / touch", "No stray ink from controls; no simultaneous ink and pan; reliable drag cancellation."],["Real host / device", "Native Canvas/PDF integration and physical Galaxy/S Pen acceptance remain separate."]]);
}

export function createStyleGuide(chapter: Chapter, narrow = false): HTMLElement {
  const root = el("article", "", `scribe-guide${narrow ? " is-narrow" : ""}`), inner = el("div", "", "scribe-guide-inner"); root.append(inner);
  const entry = chapters.find(item=>item[0]===chapter)!;
  inner.append(el("div", "Canvas Scribe / V2 design system", "scribe-guide-kicker"),el("h1",entry[1]),el("p",entry[2]));
  const themeLinks = el("div", "", "scribe-guide-row");
  for (const theme of ["light","dark"]) { const a = link(theme === "light" ? "Light" : "Dark",`canvas-scribe-style-guide--${chapter}`); const url = new URL(a.href); const globals = new URLSearchParams(window.location.search).get("globals") ?? ""; const rest = globals.split(";").filter(v=>v && !v.startsWith("obsidianTheme:")); url.searchParams.set("globals",[...rest,`obsidianTheme:${theme}`].join(";")); a.href=url.href; themeLinks.append(a); }
  inner.append(themeLinks);
  const nav = el("nav", "", "scribe-guide-nav"); nav.setAttribute("aria-label","Style guide chapters");
  chapters.forEach(([id,title],index)=>{const a=link(`${String(index+1).padStart(2,"0")} ${title}`,`canvas-scribe-style-guide--${id}`); if(id===chapter)a.setAttribute("aria-current","page");nav.append(a);});inner.append(nav);
  note(inner,"Agreed direction: Obsidian theme, type and accent; Scribe shapes, spacing and artwork. Production examples use PR #24 at 3fc6dc7. Guide and targets P1–P4 approved on 2026-09-13. Production adoption remains separate work.");
  const cleanups: Array<()=>void> = [];
  if(chapter==="foundations")foundations(inner);
  if(chapter==="elements")elements(inner);
  if(chapter==="controls")controls(inner);
  if(chapter==="components")components(inner,cleanups);
  if(chapter==="surfaces")surfaces(inner);
  const next=chapters[chapters.findIndex(item=>item[0]===chapter)+1];
  if(next){const a=link(`Next: ${next[1]} →`,`canvas-scribe-style-guide--${next[0]}`);a.className="scribe-guide-next";inner.append(a);}
  let mounted=false;
  const observer=new MutationObserver(()=>{if(root.isConnected)mounted=true;else if(mounted){observer.disconnect();cleanups.forEach(run=>run());}});
  observer.observe(document.body,{childList:true,subtree:true});
  return root;
}
