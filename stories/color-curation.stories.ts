import type { Meta, StoryObj } from "@storybook/web-components-vite";

import { toolSwatches } from "../src/colors";

const pen = [...toolSwatches("pen")];
const highlighter = [...toolSwatches("highlighter")];
function preview() {
  const root = document.createElement("article"); root.style.cssText = "max-width:760px;padding:24px;line-height:1.5;background:var(--background-primary);color:var(--text-normal);font-family:system-ui,sans-serif;border-radius:12px;border:1px solid var(--background-modifier-border)";
  const heading = document.createElement("h2"); heading.textContent = "Color sets — approved swatches"; root.append(heading);
  const intro = document.createElement("p"); intro.textContent = "Approved sets, shared across all color menus. Theme and Default remain separate choices. Select a swatch to compare ink on light and dark backgrounds."; root.append(intro);
  const group = (title: string, colors: string[], opacity: number, note: string) => {
    const section = document.createElement("section"), h = document.createElement("h3"), text = document.createElement("p");
    h.textContent = title; text.textContent = note; section.append(h, text);
    const grid = document.createElement("div"); grid.style.cssText = "display:grid;grid-template-columns:repeat(8,minmax(0,1fr));gap:4px";
    const sample = document.createElement("div"); sample.style.cssText = "display:flex;gap:12px;margin:16px 0;flex-wrap:wrap";
    const samples = ["#ffffff", "#202124"].map(background => {
      const box = document.createElement("div"); box.style.cssText = `position:relative;background:${background};padding:16px;flex:1;min-width:160px;border-radius:8px;border:1px solid #888`;
      const ink = document.createElement("span");
      if (opacity < 1) {
        const label = document.createElement("span"); label.textContent = "A highlighted passage"; label.style.cssText = `position:relative;color:${background === "#ffffff" ? "#202124" : "#ffffff"}`;
        ink.style.cssText = `position:absolute;left:12px;right:12px;top:19px;height:22px;opacity:${opacity}`; box.append(ink, label);
      } else { ink.textContent = "Notes, ideas & details"; ink.style.fontWeight = "600"; box.append(ink); }
      sample.append(box); return ink;
    });
    const value = document.createElement("output"); value.style.fontFamily = "monospace";
    const buttons = colors.map(color => {
      const button = document.createElement("button"); button.type = "button"; button.title = color; button.setAttribute("aria-label", `Preview ${title} ${color}`);
      button.style.cssText = "height:44px;min-width:0;padding:6px;display:grid;place-items:center";
      const chip = document.createElement("span"); chip.style.cssText = `display:block;width:26px;height:26px;border-radius:50%;background:${color};box-shadow:inset 0 0 0 1px #8888`; button.append(chip);
      button.addEventListener("click", () => { buttons.forEach(b => b.setAttribute("aria-pressed", String(b === button))); samples.forEach(s => { if (opacity < 1) s.style.background = color; else s.style.color = color; }); value.textContent = `${color}${opacity < 1 ? " at 38% opacity" : " at 100% opacity"}`; });
      grid.append(button); return button;
    });
    section.append(grid, sample, value); root.append(section); buttons[0]!.click();
  };
  group("Pen · 24 colors", pen, 1, "Eight core hues, eight lighter companions, then five neutrals and three earth tones. Ordered by hue within each row.");
  group("Highlighter · 16 colors", highlighter, .38, "Eight vivid colors and eight pastel companions. Previewed at the current 38% default opacity; pastel highlights can be subtle.");
  const references = document.createElement("p"); references.textContent = "Reference basis: your Samsung Notes pen/highlighter screenshots from September 12 and Swatches picker screenshot from September 6. These suggest hue ordering, tone families, separate recents and a selected-color mark; the approved hex values are our own curation."; root.append(references);
  return root;
}
const meta = { title: "Canvas Scribe/Color Curation", render: preview, parameters: { obsidian: { placement: "content" } } } satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;
export const ProposedSets: Story = {};
export const Dark: Story = { globals: { obsidianTheme: "dark" } };
