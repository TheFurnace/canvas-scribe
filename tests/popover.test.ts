import { describe, expect, it } from "vitest";

import { positionPopup } from "../src/popover";

const anchor = { top: 20, right: 50, bottom: 60, left: 10, width: 40, height: 40 };

describe("positionPopup", () => {
  it("places a popup beside its anchor when space is available", () => {
    expect(positionPopup(anchor, { width: 100, height: 40 }, 300, 200)).toEqual({ left: 58, top: 20 });
  });

  it("flips and clamps a popup inside a narrow viewport", () => {
    const nearRightEdge = { ...anchor, right: 290, left: 250 };
    expect(positionPopup(nearRightEdge, { width: 100, height: 190 }, 300, 200)).toEqual({ left: 142, top: 8 });
  });
});
