import type { Preview } from "@storybook/web-components-vite";

import "../styles.css";
import "../stories/storybook-theme.css";

const preview: Preview = {
  parameters: {
    backgrounds: {
      disable: true,
    },
    controls: {
      expanded: true,
    },
    layout: "centered",
    options: {
      storySort: {
        order: ["Canvas Scribe", ["Overview", "Toolbar", "Radial Menu", "Ink", "Diagnostics"]],
      },
    },
  },
  decorators: [
    (story) => {
      const shell = document.createElement("div");
      shell.className = "theme-light canvas-scribe-storybook-shell";
      shell.append(story() as Node);
      return shell;
    },
  ],
};

export default preview;
