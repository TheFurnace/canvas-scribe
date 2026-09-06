import { describe, expect, it } from "vitest";

import { isHandwritingRegionTarget, resolveHandwritingRegion } from "../src/handwriting-affordance";

describe("handwriting region affordance", () => {
  it("follows the focused editor when the stylus is not hovering", () => {
    expect(resolveHandwritingRegion(false, null, "focused-card")).toBe("focused-card");
  });

  it("follows the editor beneath a hovering stylus", () => {
    expect(resolveHandwritingRegion(true, "hovered-card", "focused-card")).toBe("hovered-card");
  });

  it("clears while the stylus hovers over the drawing surface", () => {
    expect(resolveHandwritingRegion(true, null, "focused-card")).toBeNull();
  });

  it("recognizes editable elements and editing Canvas iframe bodies", () => {
    expect(isHandwritingRegionTarget(true, false, false)).toBe(true);
    expect(isHandwritingRegionTarget(false, true, true)).toBe(true);
    expect(isHandwritingRegionTarget(false, false, true)).toBe(false);
    expect(isHandwritingRegionTarget(false, true, false)).toBe(false);
  });
});
