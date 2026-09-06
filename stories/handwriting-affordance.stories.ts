import type { Meta, StoryObj } from "@storybook/web-components-vite";

import { createHandwritingHint } from "../src/handwriting-affordance";

interface HandwritingAffordanceArgs {
  handwritingActive: boolean;
  noteText: string;
}

function createHandwritingAffordance(args: HandwritingAffordanceArgs): HTMLElement {
  const preview = document.createElement("div");
  preview.className = "canvas-scribe-story-handwriting";

  const node = document.createElement("div");
  node.className = "canvas-node canvas-scribe-story-handwriting-node";
  node.classList.toggle("canvas-scribe-handwriting-region", args.handwritingActive);

  const container = document.createElement("div");
  container.className = "canvas-node-container";
  const content = document.createElement("div");
  content.className = "canvas-node-content";
  const editor = document.createElement("div");
  editor.className = "cm-content canvas-scribe-story-handwriting-editor";
  editor.contentEditable = "true";
  editor.setAttribute("role", "textbox");
  editor.setAttribute("aria-label", "Canvas card editor preview");
  editor.textContent = args.noteText;
  content.appendChild(editor);
  container.appendChild(content);
  node.appendChild(container);

  if (args.handwritingActive) node.appendChild(createHandwritingHint(document));

  const caption = document.createElement("div");
  caption.className = "canvas-scribe-story-handwriting-caption";
  caption.textContent = args.handwritingActive
    ? "Stylus over the editor · next gesture becomes text"
    : "Stylus over the Canvas · next gesture becomes ink";

  preview.append(node, caption);
  return preview;
}

const meta: Meta<HandwritingAffordanceArgs> = {
  title: "Canvas Scribe/Handwriting Affordance",
  tags: ["autodocs"],
  parameters: {
    docs: {
      description: {
        component:
          "The production handwriting-region cue on an editable Obsidian Canvas card. Toggle the active state to compare text and ink routing before stylus contact.",
      },
    },
  },
  render: (args) => createHandwritingAffordance(args),
  args: {
    handwritingActive: true,
    noteText: "Write here with your stylus. Canvas Scribe leaves this editor to Android handwriting-to-text.",
  },
  argTypes: {
    handwritingActive: { control: "boolean", name: "Handwriting region active" },
    noteText: { control: "text", name: "Card text" },
  },
};

export default meta;
type Story = StoryObj<HandwritingAffordanceArgs>;

export const TextRegionActive: Story = {};

export const DrawingSurfaceActive: Story = {
  args: {
    handwritingActive: false,
  },
};
