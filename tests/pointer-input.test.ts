import { describe, expect, it } from "vitest";

import { isPenContact, isTemporaryEraser, shouldAppendReleasePoint } from "../src/pointer-input";

function pointer(values: Partial<PointerEvent>): PointerEvent {
  return {
    type: "pointermove",
    button: -1,
    buttons: 0,
    pressure: 0,
    ...values,
  } as PointerEvent;
}

describe("S Pen input normalization", () => {
  it("recognizes a contacting pen tip", () => {
    expect(isPenContact(pointer({ pressure: 0.4, buttons: 1 }))).toBe(true);
  });

  it("does not treat barrel-button hover as screen contact", () => {
    expect(isPenContact(pointer({ button: 2, buttons: 2, pressure: 0 }))).toBe(false);
  });

  it("recognizes barrel-button and eraser-tip bitmasks", () => {
    expect(isTemporaryEraser(pointer({ buttons: 2 }))).toBe(true);
    expect(isTemporaryEraser(pointer({ buttons: 32 }))).toBe(true);
  });

  it("does not append the invalid terminal coordinates from pointer cancellation", () => {
    expect(shouldAppendReleasePoint(pointer({ type: "pointerup" }))).toBe(true);
    expect(shouldAppendReleasePoint(pointer({ type: "pointercancel" }))).toBe(false);
  });
});
