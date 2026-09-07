import type { Preview } from "@storybook/web-components-vite";

import obsidianCss from "virtual:obsidian-app.css?inline";
import pluginCss from "../styles.css?inline";
import storyCss from "../stories/storybook-theme.css?inline";
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
        order: ["Canvas Scribe", ["Overview", "Toolbar", "Radial Menu", "Ink", "Handwriting Affordance", "Diagnostics"]],
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
      const child = story() as Node;
      const options: ObsidianStoryEnvironmentOptions = {
        ...storyOptions,
        theme: context.globals.obsidianTheme as ObsidianStoryTheme,
        platform: context.globals.obsidianPlatform as ObsidianStoryPlatform,
        viewMode: "story",
      };
      const renderHost = (node: Node) => {
        const host = createObsidianStoryEnvironment(node, options);
        const styles = host.ownerDocument.createElement("style");
        styles.dataset.obsidianPreviewStyles = "true";
        styles.textContent = [obsidianCss, pluginCss, storyCss].join("\n");
        host.prepend(styles);
        return host;
      };
      if (context.viewMode !== "docs") return renderHost(child);

      // Keep Storybook's inline rendering/arg updates, but give the actual
      // Obsidian host its own CSS document. Each arg/global change renders a
      // fresh child and frame instead of an independent Storybook instance.
      const frame = document.createElement("iframe");
      frame.title = `${context.name} preview`;
      frame.style.cssText = "display:block;width:100%;height:520px;border:0";
      frame.addEventListener("load", () => {
        const target = frame.contentDocument;
        if (!target) return;
        target.body.style.margin = "0";
        target.body.append(renderHost(target.adoptNode(child)));
      }, { once: true });
      return frame;
    },
  ],
};

export default preview;
