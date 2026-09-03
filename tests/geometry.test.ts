import { describe, expect, it } from "vitest";

import { outlineToSvgPath, strokeIntersectsCircle } from "../src/geometry";
import type { InkStroke } from "../src/types";

function stroke(points: Array<[number, number]>): InkStroke {
  return {
    id: "test",
    tool: "pen",
    color: "#000000",
    size: 2,
    opacity: 1,
    hasPressure: false,
    createdAt: 1,
    points: points.map(([x, y]) => ({ x, y, pressure: 0.5, time: 0 })),
  };
}

describe("outlineToSvgPath", () => {
  it("returns an empty path for no points", () => {
    expect(outlineToSvgPath([])).toBe("");
  });

  it("creates a closed path", () => {
    expect(outlineToSvgPath([[0, 0], [2, 0], [2, 2]])).toMatch(/^M .* Z$/);
  });
});

describe("strokeIntersectsCircle", () => {
  it("hits a point near a segment", () => {
    expect(strokeIntersectsCircle(stroke([[0, 0], [10, 0]]), 5, 1, 1)).toBe(true);
  });

  it("misses a distant point", () => {
    expect(strokeIntersectsCircle(stroke([[0, 0], [10, 0]]), 5, 20, 1)).toBe(false);
  });
});
