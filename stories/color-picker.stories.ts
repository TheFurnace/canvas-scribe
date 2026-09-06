import type { Meta, StoryObj } from "@storybook/web-components-vite";
import { createColorPicker } from "../src/color-picker";
import { resolveColor, ToolColors, type ColorTool } from "../src/colors";

interface Args { tool: ColorTool; view: "Swatches" | "Spectrum"; invalid: boolean; }
const meta: Meta<Args> = {
  title: "Canvas Scribe/Color Picker",
  args: { tool: "pen", view: "Swatches", invalid: false },
  render: (args) => {
    const host = document.createElement("div");
    host.style.padding = "24px";
    const colors = new ToolColors();
    colors.confirm(args.tool, "#2563eb");
    colors.confirm(args.tool, "#9333ea");
    colors.confirm(args.tool, "#dc2626");
    const status = document.createElement("p");
    const open = document.createElement("button");
    open.textContent = "Choose color";
    host.append(status, open);
    const launch = () => {
      const defaultColor = args.tool === "pen" ? resolveColor(document, getComputedStyle(host).getPropertyValue("--text-normal").trim() || "#1f2937") : "#fde047";
      const current = colors.current(args.tool, defaultColor);
      const picker = createColorPicker(document, {
        tool: args.tool, current, defaultColor, recent: colors.recent(args.tool), view: args.view,
        onCancel: () => { status.textContent = `Canceled. Tool color remains ${current}.`; picker.remove(); open.focus(); },
        onConfirm: (color) => { colors.confirm(args.tool, color); status.textContent = `Applied ${color ?? "tool default"}. Open again to inspect recent colors.`; picker.remove(); open.focus(); },
      });
      host.append(picker);
      if (args.invalid) {
        const input = picker.querySelector<HTMLInputElement>(".canvas-scribe-picker-inputs input")!;
        input.value = "#12xz";
        input.dispatchEvent(new Event("input"));
      }
      picker.querySelector<HTMLElement>("button")?.focus();
    };
    open.addEventListener("click", launch);
    requestAnimationFrame(() => { if (host.isConnected) launch(); });
    return host;
  },
};
export default meta;
type Story = StoryObj<Args>;
export const Swatches: Story = {};
export const Spectrum: Story = { args: { view: "Spectrum" } };
export const InvalidDirectInput: Story = { args: { invalid: true } };
export const HighlighterReset: Story = { args: { tool: "highlighter" } };
export const DarkTheme: Story = { globals: { obsidianTheme: "dark" } };
export const Mobile: Story = { globals: { obsidianPlatform: "mobile" } };
