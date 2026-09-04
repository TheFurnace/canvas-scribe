import type { StorybookConfig } from "@storybook/web-components-vite";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const configDirectory = dirname(fileURLToPath(import.meta.url));
const generatedObsidianCss = resolve(configDirectory, "generated/obsidian-app.css");
const fallbackObsidianCss = resolve(configDirectory, "../stories/obsidian-fallback.css");
const obsidianCss = existsSync(generatedObsidianCss) ? generatedObsidianCss : fallbackObsidianCss;

const config: StorybookConfig = {
  stories: ["../stories/**/*.stories.ts"],
  addons: ["@storybook/addon-docs", "@storybook/addon-a11y"],
  framework: "@storybook/web-components-vite",
  docs: {
    defaultName: "Documentation",
  },
  viteFinal: (viteConfig) => {
    viteConfig.resolve ??= {};
    viteConfig.resolve.alias = {
      ...viteConfig.resolve.alias,
      "virtual:obsidian-app.css": obsidianCss,
    };
    return viteConfig;
  },
};

export default config;
