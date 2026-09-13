import type { Meta, StoryObj } from "@storybook/web-components-vite";
import { createStyleGuide } from "./style-guide";

const meta = { title: "Canvas Scribe/Style Guide", parameters: { obsidian: { placement: "overlay" } }, render: () => createStyleGuide("foundations") } satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;
export const Foundations: Story = { name: "01 Foundations" };
export const Elements: Story = { name: "02 Basic elements", render: () => createStyleGuide("elements") };
export const Controls: Story = { name: "03 Controls", render: () => createStyleGuide("controls") };
export const Components: Story = { name: "04 Components", render: () => createStyleGuide("components") };
export const Surfaces: Story = { name: "05 Surface layouts", render: () => createStyleGuide("surfaces") };
export const Dark: Story = { globals: { obsidianTheme: "dark" } };
export const Narrow: Story = { globals: { obsidianPlatform: "mobile" }, render: () => createStyleGuide("foundations", true) };
