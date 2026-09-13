import type { Meta, StoryObj } from "@storybook/web-components-vite";
import { createStyleGuide } from "./style-guide";

// Preserve original review URLs; canonical chapters live under Style Guide.
const meta = { title: "Canvas Scribe/Foundations", parameters: { obsidian: { placement: "overlay" } }, render: () => createStyleGuide("foundations") } satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;
export const Overview: Story = {};
export const Dark: Story = { globals: { obsidianTheme: "dark" } };
export const Tablet: Story = { globals: { obsidianPlatform: "mobile" } };
export const TabletDark: Story = { globals: { obsidianPlatform: "mobile", obsidianTheme: "dark" } };
