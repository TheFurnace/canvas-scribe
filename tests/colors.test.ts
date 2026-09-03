import { describe, expect, it } from "vitest";

import { paletteColors, PINNED_TOOL_COLORS } from "../src/colors";

describe("quick color palettes", () => {
  it("offers distinct pinned colors for pen and highlighter", () => {
    expect(PINNED_TOOL_COLORS.pen).toHaveLength(5);
    expect(PINNED_TOOL_COLORS.highlighter).toHaveLength(5);
    expect(PINNED_TOOL_COLORS.pen).not.toEqual(PINNED_TOOL_COLORS.highlighter);
  });

  it("puts an unpinned current color first without duplicating pinned colors", () => {
    expect(paletteColors("pen", "#abcdef")[0]).toBe("#abcdef");
    expect(paletteColors("pen", "#1F2937")).toEqual(PINNED_TOOL_COLORS.pen);
  });
});
