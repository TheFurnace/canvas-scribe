import type { Meta, StoryObj } from "@storybook/web-components-vite";
import { createQuickColors } from "../src/quick-colors";
import { createColorPicker } from "../src/color-picker";
import { ToolColors, type ColorTool } from "../src/colors";

function preview(tool: ColorTool = "pen") {
  const root = document.createElement("div");
  const colors = new ToolColors();
  const defaultColor = tool === "pen" ? "#1f2937" : "#fde047";
  const status = document.createElement("p");
  const opener = document.createElement("button");
  opener.textContent = "Quick colors";
  colors.confirm(tool, "#754c98"); colors.confirm(tool, "#327b76");
  let menu: HTMLElement | null = null;
  const close = () => { menu?.remove(); menu = null; opener.focus(); };
  function open() {
    close();
    menu = createQuickColors(document, {
      tool, current: colors.current(tool, defaultColor), defaultColor,
      isDefault: colors.selection(tool) === null, recent: colors.recent(tool),
      onSelect: (color) => { colors.confirm(tool, color); status.textContent = `Selected: ${color ?? "Default"}`; close(); },
      onMore: () => {
        close();
        menu = createColorPicker(document, {
          tool, current: colors.current(tool, defaultColor), defaultColor, recent: colors.recent(tool),
          onConfirm: (color) => { colors.confirm(tool, color); close(); open(); },
          onCancel: open,
        });
        root.append(menu);
      }, onClose: close,
    });
    menu.style.position = "relative"; menu.style.left = "auto"; menu.style.top = "auto";
    root.append(menu);
  }
  opener.addEventListener("click", open);
  root.append(opener, status); open();
  return root;
}
const meta = {
  title: "Canvas Scribe/Quick Colors", render: () => preview(),
  parameters: { obsidian: { placement: "content" } },
} satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;
export const Pen: Story = {};
export const Highlighter: Story = { render: () => preview("highlighter") };
export const Tablet: Story = { globals: { obsidianPlatform: "mobile" } };
export const Dark: Story = { globals: { obsidianTheme: "dark" } };
