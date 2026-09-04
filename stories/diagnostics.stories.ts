import type { Meta, StoryObj } from "@storybook/web-components-vite";

import { storyCard, storyStage } from "./story-helpers";

interface DiagnosticsArgs {
  pointerType: "pen" | "touch" | "mouse";
  pressure: number;
  tiltX: number;
  tiltY: number;
}

function createDiagnostics(args: DiagnosticsArgs): HTMLElement {
  const overlay = document.createElement("div");
  overlay.className = "canvas-scribe-input-diagnostics";
  overlay.textContent = [
    "Canvas Scribe input diagnostics",
    `pointerover #7 ${args.pointerType.padEnd(5)} button=-1 buttons=0 pressure=0.000 tilt=0,0 size=1x1`,
    `pointerdown #7 ${args.pointerType.padEnd(5)} button=0 buttons=1 pressure=${args.pressure.toFixed(3)} tilt=${args.tiltX},${args.tiltY} size=2x2`,
    `pointermove #7 ${args.pointerType.padEnd(5)} button=-1 buttons=1 pressure=${Math.min(1, args.pressure + 0.12).toFixed(3)} tilt=${args.tiltX + 2},${args.tiltY - 1} size=2x2`,
    `pointerup   #7 ${args.pointerType.padEnd(5)} button=0 buttons=0 pressure=0.000 tilt=${args.tiltX + 1},${args.tiltY} size=2x2`,
  ].join("\n");

  const fixture = document.createElement("div");
  fixture.className = "canvas-scribe-story-diagnostics";
  fixture.append(overlay);

  return storyStage(
    storyCard(
      "Input diagnostics",
      "A compact event trace used while tuning S Pen and pointer behavior on-device.",
      fixture,
    ),
  );
}

const meta: Meta<DiagnosticsArgs> = {
  title: "Canvas Scribe/Diagnostics",
  tags: ["autodocs"],
  render: (args) => createDiagnostics(args),
  args: {
    pointerType: "pen",
    pressure: 0.42,
    tiltX: 18,
    tiltY: -7,
  },
  argTypes: {
    pointerType: { control: "inline-radio", options: ["pen", "touch", "mouse"] },
    pressure: { control: { type: "range", min: 0, max: 1, step: 0.01 } },
    tiltX: { control: { type: "range", min: -90, max: 90, step: 1 } },
    tiltY: { control: { type: "range", min: -90, max: 90, step: 1 } },
  },
};

export default meta;
type Story = StoryObj<DiagnosticsArgs>;

export const SPenTrace: Story = {};
