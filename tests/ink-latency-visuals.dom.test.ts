// @vitest-environment happy-dom
import { afterEach, expect, it } from "vitest";
import { InkLatencyVisuals } from "../src/ink-latency-visuals";
import type { InkPoint } from "../src/types";

afterEach(() => document.body.replaceChildren());
it("places contrasting markers in stroke coordinates with CSS-pixel sizes and clears them", () => {
  const area = document.createElement("div"); area.innerHTML = '<svg><path fill="black"/></svg>'; document.body.append(area);
  const path = area.querySelector("path")!;
  const visuals = new InkLatencyVisuals({ area, path, screenScale: 2 });
  const actual: InkPoint = { x: 100, y: 80, pressure: .5, time: 10 };
  visuals.render(actual, { ...actual, x: 120 });
  const group = area.querySelector(".canvas-scribe-latency-markers")!;
  const cyan = group.querySelector('[fill="#00e5ff"]')!, yellow = group.querySelector('[fill="#ffea00"]')!;
  expect(cyan.getAttribute("r")).toBe("2.5"); expect(cyan.getAttribute("cx")).toBe("100");
  expect(yellow.getAttribute("r")).toBe("3"); expect(yellow.getAttribute("cx")).toBe("120");
  expect(group.querySelector("line")!.getAttribute("stroke-width")).toBe("4");
  expect(group.getAttribute("pointer-events")).toBe("none"); expect(group.outerHTML).not.toContain("#ff00ff");
  visuals.render(actual, null); expect((yellow as SVGElement).style.display).toBe("none");
  visuals.end(); visuals.render(actual, actual); expect(group.isConnected).toBe(false);
});

it("removes markers when their original path is detached", () => {
  const area = document.createElement("div"); area.innerHTML = '<svg><path/></svg>'; document.body.append(area);
  const path = area.querySelector("path")!, visuals = new InkLatencyVisuals({ area, path, screenScale: 1 });
  path.remove(); visuals.render({ x: 10, y: 10, time: 1, pressure: .5 }, null);
  expect(area.querySelector(".canvas-scribe-latency-markers")).toBeNull();
});
