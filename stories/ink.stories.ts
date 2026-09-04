import type { Meta, StoryObj } from "@storybook/web-components-vite";

function createInkSample(): HTMLElement {
  const wrapper = document.createElement("div");
  wrapper.className = "canvas-scribe-story-ink";

  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 580 230");
  svg.setAttribute("role", "img");
  svg.setAttribute("aria-label", "Canvas Scribe pen and highlighter samples");

  const highlighter = document.createElementNS("http://www.w3.org/2000/svg", "path");
  highlighter.classList.add("canvas-scribe-stroke", "is-highlighter");
  highlighter.setAttribute("d", "M47 155 C133 143 209 147 293 153 C374 159 455 151 533 143 L536 163 C452 173 369 180 290 172 C209 164 133 164 49 176 Z");
  highlighter.setAttribute("fill", "#fde047");
  highlighter.setAttribute("opacity", "0.38");

  const pen = document.createElementNS("http://www.w3.org/2000/svg", "path");
  pen.classList.add("canvas-scribe-stroke", "is-pen");
  pen.setAttribute("d", "M45 122 C70 73 99 68 112 111 C124 148 132 148 151 96 C164 60 174 78 179 112 C186 151 198 153 221 100 C237 63 252 74 253 111 C254 145 274 146 295 113 C314 84 337 87 346 114 C358 148 380 148 405 110 C425 80 449 80 458 108 C470 145 489 145 536 102 L538 108 C489 157 463 158 451 119 C443 95 430 96 412 121 C380 166 350 162 338 124 C331 103 320 102 302 125 C269 166 247 157 245 117 C244 89 237 87 228 108 C200 171 179 172 170 119 C166 96 163 93 158 108 C133 174 112 170 101 120 C94 87 77 92 52 126 Z");
  pen.setAttribute("fill", "var(--text-normal)");
  pen.setAttribute("opacity", "1");

  svg.append(highlighter, pen);

  const labels = document.createElement("div");
  labels.className = "canvas-scribe-story-ink-labels";
  const penLabel = document.createElement("span");
  penLabel.textContent = "Pen · pressure-sensitive";
  const highlighterLabel = document.createElement("span");
  highlighterLabel.textContent = "Highlighter · 38% opacity";
  labels.append(penLabel, highlighterLabel);

  wrapper.append(svg, labels);
  return wrapper;
}

const meta = {
  title: "Canvas Scribe/Ink",
  tags: ["autodocs"],
  parameters: {
    docs: {
      description: {
        component: "Production stroke classes rendered on the current Obsidian Canvas surface.",
      },
    },
  },
  render: () => createInkSample(),
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

export const PenAndHighlighter: Story = {};
