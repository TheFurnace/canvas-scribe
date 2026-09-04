import type { Preview } from "@storybook/web-components-vite";

import "virtual:obsidian-app.css";
import "../styles.css";
import "../stories/storybook-theme.css";
import {
  createObsidianStoryEnvironment,
  type ObsidianStoryEnvironmentOptions,
  type ObsidianStoryPlatform,
  type ObsidianStoryTheme,
} from "../stories/obsidian-environment";

const preview: Preview = {
  parameters: {
    backgrounds: {
      disable: true,
    },
    controls: {
      expanded: true,
    },
    layout: "fullscreen",
    options: {
      storySort: {
        order: ["Canvas Scribe", ["Overview", "Toolbar", "Radial Menu", "Ink", "Diagnostics"]],
      },
    },
  },
  globalTypes: {
    obsidianTheme: {
      description: "Obsidian color scheme",
      toolbar: {
        icon: "paintbrush",
        items: [
          { value: "light", title: "Light" },
          { value: "dark", title: "Dark" },
        ],
      },
    },
    obsidianPlatform: {
      description: "Obsidian host platform",
      toolbar: {
        icon: "mobile",
        items: [
          { value: "desktop", title: "Desktop" },
          { value: "mobile", title: "Mobile" },
        ],
      },
    },
  },
  initialGlobals: {
    obsidianTheme: "light",
    obsidianPlatform: "desktop",
  },
  decorators: [
    (story, context) => {
      const storyOptions = context.parameters.obsidian as ObsidianStoryEnvironmentOptions | undefined;
      return createObsidianStoryEnvironment(story() as Node, {
        ...storyOptions,
        theme: context.globals.obsidianTheme as ObsidianStoryTheme,
        platform: context.globals.obsidianPlatform as ObsidianStoryPlatform,
      });
    },
  ],
};

export default preview;
