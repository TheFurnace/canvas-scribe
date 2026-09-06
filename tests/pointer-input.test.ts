import { describe, expect, it } from "vitest";

import {
  isEraserTip,
  isStylusBarrelButton,
  isStylusContact,
  shouldAppendReleasePoint,
  stylusPointerDownAction,
} from "../src/pointer-input";

function pointer(values: Partial<PointerEvent>): PointerEvent {
  return {
    type: "pointermove",
    button: -1,
    buttons: 0,
    pressure: 0,
    ...values,
  } as PointerEvent;
}

describe("stylus input normalization", () => {
  it("recognizes a contacting stylus tip", () => {
    expect(isStylusContact(pointer({ pressure: 0.4, buttons: 1 }))).toBe(true);
  });

  it("does not treat barrel-button hover as screen contact", () => {
    expect(isStylusContact(pointer({ button: 2, buttons: 2, pressure: 0 }))).toBe(false);
  });

  it("distinguishes the barrel button from an eraser tip", () => {
    expect(isStylusBarrelButton(pointer({ buttons: 2 }))).toBe(true);
    expect(isEraserTip(pointer({ buttons: 2 }))).toBe(false);
    expect(isEraserTip(pointer({ buttons: 32 }))).toBe(true);
  });

  it("does not append the invalid terminal coordinates from pointer cancellation", () => {
    expect(shouldAppendReleasePoint(pointer({ type: "pointerup" }))).toBe(true);
    expect(shouldAppendReleasePoint(pointer({ type: "pointercancel" }))).toBe(false);
  });

  it("owns exactly one short pen gesture over editable card content", () => {
    const down = pointer({ type: "pointerdown", pointerType: "pen", button: 0, buttons: 1, pressure: 0.5 });

    expect(stylusPointerDownAction(down, {
      enabled: true,
      gestureActive: false,
      controlTarget: false,
    })).toBe("begin-gesture");
    expect(stylusPointerDownAction(down, {
      enabled: true,
      gestureActive: true,
      controlTarget: false,
    })).toBe("consume");
    expect(shouldAppendReleasePoint(pointer({ type: "pointerup", pointerType: "pen" }))).toBe(true);
  });

  it("leaves inactive-mode and non-pen pointer downs to Canvas", () => {
    expect(stylusPointerDownAction(pointer({ type: "pointerdown", pointerType: "pen", button: 0 }), {
      enabled: false,
      gestureActive: false,
      controlTarget: false,
    })).toBe("ignore");
    expect(stylusPointerDownAction(pointer({ type: "pointerdown", pointerType: "mouse", button: 0 }), {
      enabled: true,
      gestureActive: false,
      controlTarget: false,
    })).toBe("ignore");
    expect(stylusPointerDownAction(pointer({ type: "pointerdown", pointerType: "touch", button: 0 }), {
      enabled: true,
      gestureActive: false,
      controlTarget: false,
    })).toBe("ignore");
  });
});
