import type { Meta, StoryObj } from "@storybook/web-components-vite";
import { createToolColors, createToolMenu, createToolRadial, observeToolTheme } from "../src/tool-suite";
import { createColorPicker } from "../src/color-picker";
import { InkToolState } from "../src/ink-tool-state";
import { FavoritePens } from "../src/favorite-pens";
import { RadialSession } from "../src/radial-session";
import { toolSwatches, resolveColor, type ColorTool } from "../src/colors";
import { renderStoryIcon } from "./story-helpers";

// Contract fixtures, not vendored themes. Nord values: Minimal's nord.scss.
const fixtures: Record<string, string> = {
  host: "",
  nord: "--color-red:#bf616a;--color-orange:#d08770;--color-yellow:#ebcb8b;--color-green:#a3be8c;--color-cyan:#88c0d0;--color-blue:#81a1c1;--color-purple:#b48ead;--color-pink:#b48ead;",
  formats: "--color-red:rgb(12,34,56);--color-orange:hsl(30,100%,50%);--color-yellow:#123456;--color-green:var(--color-yellow);--color-cyan:invalid;--color-blue:rgba(10,20,30,.5);--color-purple:transparent;--color-pink:#abcdef;--canvas-scribe-color-yellow:#fedcba;",
};

function preview(): HTMLElement {
  const root = document.createElement("section");
  root.style.cssText = "position:absolute;inset:0;overflow:auto;padding:24px;background:var(--background-primary);color:var(--text-normal);font-family:var(--font-interface);font-size:var(--font-ui-small);display:flex;flex-direction:column;gap:16px";
  const title = document.createElement("h1"); title.textContent = "Theme colors & Style Settings";
  const intro = document.createElement("p"); intro.textContent = "Optional theme ink colors, shared by all Scribe tools. Choose a swatch, then change the scheme: your chosen ink stays fixed. Interface colors and Theme ink still follow the host.";
  root.append(title, intro);
  const settings = document.createElement("div"); settings.style.cssText = "display:flex;gap:20px;flex-wrap:wrap;align-items:center";
  const label = document.createElement("label"), toggle = document.createElement("input"); toggle.type = "checkbox"; toggle.checked = true;
  label.append(toggle, " Include theme ink colors");
  const schemeLabel = document.createElement("label"); schemeLabel.textContent = "Scheme fixture ";
  const scheme = document.createElement("select"); scheme.setAttribute("aria-label", "Scheme fixture");
  for (const [value, text] of [["host", "Active Obsidian colors"], ["nord", "Minimal Nord color mapping"], ["formats", "Color formats and fallback"]]) {
    const option = document.createElement("option"); option.value = value!; option.textContent = text!; scheme.append(option);
  }
  scheme.value = "nord"; schemeLabel.append(scheme); settings.append(label, schemeLabel); root.append(settings);
  const note = document.createElement("p"); note.textContent = "This fixture exercises the CSS contract; it does not load the Style Settings plugin or a complete third-party theme. Use Storybook's Light/Dark toolbar to inspect host appearance."; root.append(note);
  const source = document.createElement("a"); source.href = "https://github.com/kepano/obsidian-minimal/blob/master/src/scss/color-schemes/nord.scss"; source.textContent = "Source: Minimal Nord mapping"; root.append(source);
  const style = document.createElement("style"); style.dataset.scribeThemeFixture = "true"; document.head.append(style);
  const wasEnabled = document.body.classList.contains("canvas-scribe-theme-palette");
  document.body.classList.add("canvas-scribe-theme-palette");
  const apply = () => { style.textContent = `body.canvas-scribe-theme-palette { ${fixtures[scheme.value]} }`; };
  scheme.addEventListener("change", apply); apply();
  toggle.addEventListener("change", () => document.body.classList.toggle("canvas-scribe-theme-palette", toggle.checked));
  const state = new InkToolState(), favorites = new FavoritePens();
  const status = document.createElement("output"); status.setAttribute("aria-label", "Confirmed ink"); root.append(status);
  const rows = document.createElement("div"); rows.style.cssText = "display:flex;flex-wrap:wrap;gap:24px"; root.append(rows);
  const panel = document.createElement("div"); panel.style.cssText = "position:relative;min-height:280px"; root.append(panel);
  let radial: RadialSession | null = null;
  const close = () => { panel.replaceChildren(); radial?.close(false); radial = null; };
  const mount = (menu: HTMLElement) => { close(); menu.style.position = "relative"; menu.style.inset = "auto"; panel.append(menu); };
  const defaultColor = (tool: ColorTool) => tool === "highlighter" ? "#fde047" : resolveColor(document, getComputedStyle(document.body).color);
  const confirm = (tool: ColorTool, color: string | null) => { state.toolColors.confirm(tool, color); close(); sync(); };
  function sync() {
    status.textContent = `Pen: ${state.toolColors.selection("pen") ?? "Theme"} · Highlighter: ${state.toolColors.selection("highlighter") ?? "Default"} · Pen recents: ${state.toolColors.recent("pen").join(", ") || "none"}`;
    rows.replaceChildren();
    for (const tool of ["pen", "highlighter"] as const) {
      const section = document.createElement("section"); section.style.cssText = "flex:1 1 300px;min-width:0";
      const heading = document.createElement("h2"); heading.textContent = `${tool === "pen" ? "Pen" : "Highlighter"} palette`; section.append(heading);
      const strip = document.createElement("div"); strip.style.cssText = "display:flex;flex-wrap:wrap;gap:8px;margin-bottom:16px";
      strip.setAttribute("aria-label", `${tool} resolved palette`);
      for (const color of toolSwatches(tool, document)) {
        const chip = document.createElement("button"); chip.type = "button"; chip.title = color; chip.setAttribute("aria-label", `Choose ${color} for ${tool}`);
        chip.style.cssText = `width:36px;height:36px;padding:4px;border:1px solid var(--background-modifier-border);border-radius:50%;background:var(--background-primary)`;
        const ink = document.createElement("span"); ink.style.cssText = `display:block;width:100%;height:100%;border-radius:50%;background:${color};opacity:${tool === "pen" ? 1 : .38}`; chip.append(ink);
        chip.addEventListener("click", () => confirm(tool, color)); strip.append(chip);
      }
      section.append(strip);
      const actions = document.createElement("div"); actions.style.cssText = "display:flex;flex-wrap:wrap;gap:8px";
      const button = (text: string, run: () => void) => { const b = document.createElement("button"); b.textContent = text; b.addEventListener("click", run); actions.append(b); };
      button(`${tool} drawer`, () => mount(createToolColors(document, state, tool, { defaultColor: defaultColor(tool), mount, close, changed: sync })));
      button(`${tool} picker`, () => mount(createColorPicker(document, { tool, current: state.toolColors.current(tool, defaultColor(tool)), defaultColor: defaultColor(tool), isDefault: state.toolColors.selection(tool) === null,
        recent: state.toolColors.recent(tool), onConfirm: color => confirm(tool, color), onCancel: close })));
      button(`${tool} menu`, () => { state.activeTool = tool; mount(createToolMenu(document, renderStoryIcon, state, { color: value => state.toolColors.current(value, defaultColor(value)), colors: () => mount(createToolColors(document, state, tool, { defaultColor: defaultColor(tool), mount, close, changed: sync })), close, changed: sync, count: 0, canClear: false, scale: () => {}, clear: () => {}, recolor: () => {} })); });
      button(`${tool} radial`, () => { close(); state.activeTool = tool;
        radial = new RadialSession(document, createToolRadial(document, state, favorites, { selectTool: value => { state.activeTool = value; }, changed: sync, defaultColor,
          undo: () => {}, redo: () => {}, canUndo: () => false, canRedo: () => false }), () => { radial = null; }, renderStoryIcon);
        radial.open(window.innerWidth / 2, window.innerHeight / 2);
      });
      section.append(actions); rows.append(section);
    }
  }
  const stop = observeToolTheme(document, () => { close(); sync(); }); sync();
  let mounted = false;
  const cleanup = new MutationObserver(() => {
    if (root.isConnected) mounted = true;
    else if (mounted) { cleanup.disconnect(); stop(); close(); style.remove(); document.body.classList.toggle("canvas-scribe-theme-palette", wasEnabled); }
  });
  cleanup.observe(document.body, { childList: true, subtree: true });
  return root;
}

const meta = { title: "Canvas Scribe/Style Settings", parameters: { obsidian: { placement: "overlay" } }, render: preview } satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;
export const ThemeColors: Story = {};
export const Dark: Story = { globals: { obsidianTheme: "dark" } };
export const Tablet: Story = { globals: { obsidianPlatform: "mobile" } };
