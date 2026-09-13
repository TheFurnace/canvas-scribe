import { describe, expect, it } from "vitest";

import { ToolColors, paletteColors, PINNED_TOOL_COLORS, parseHex, hexToRgb, rgbToHex, hexToHsv, hsvToHex } from "../src/colors";

it("seeds history with the default and preserves it after the first radial color change", () => {
  const colors = new ToolColors();
  colors.initializeHistory("pen", "#ABC");
  expect(colors.recent("pen")).toEqual(["#aabbcc"]);
  expect(colors.selection("pen")).toBeNull();
  colors.confirm("pen", "#112233", false);
  expect(colors.recent("pen")).toEqual(["#aabbcc"]);
  colors.confirm("pen", "#112233");
  colors.initializeHistory("pen", "#ffffff");
  expect(colors.recent("pen")).toEqual(["#112233", "#aabbcc"]);
  expect(colors.recent("highlighter")).toEqual([]);
});

describe("color conversions", () => {
  it("normalizes shorthand and rejects malformed hex and RGB", () => {
    expect(parseHex(" #AbC ")).toBe("#aabbcc");
    for (const value of ["", "#12", "#abcd", "#12345678", "red", "##abcdef"]) expect(parseHex(value)).toBeNull();
    for (const value of [[256, 0, 0], [-1, 0, 0], [1.5, 0, 0], [NaN, 0, 0], [1, 2]]) expect(rgbToHex(value)).toBeNull();
  });
  it("round-trips the RGB cube through hex and HSV including grayscale and extrema", () => {
    for (let r = 0; r <= 255; r += 17) for (let g = 0; g <= 255; g += 17) for (let b = 0; b <= 255; b += 17) {
      const hex = rgbToHex([r, g, b])!;
      expect(hexToRgb(hex)).toEqual([r, g, b]);
      expect(hsvToHex(...hexToHsv(hex))).toBe(hex);
    }
  });
});

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
