import { describe, expect, it } from "vitest";

import { PEN_ACTIVATION_WINDOW_MS, PenActivationGuard, type ActivationEvidence } from "../src/pen-activation";

const origin = {} as EventTarget;
const other = {} as EventTarget;
const targetsMatch = (left: EventTarget | null, right: EventTarget | null): boolean => left === right;

describe("PenActivationGuard", () => {
  it("correlates misreported and legacy clicks to an owned pen release", () => {
    const guard = new PenActivationGuard();
    guard.recordPenRelease(7, origin, 100);
    expect(guard.shouldSuppress(click({ pointerId: 7, pointerType: "mouse", timestamp: 110 }), targetsMatch)).toBe(true);

    guard.recordPenRelease(8, origin, 200);
    expect(guard.shouldSuppress(click({ detail: 1, timestamp: 210 }), targetsMatch)).toBe(true);
  });

  it("rejects mismatched targets and pointer identities", () => {
    const guard = new PenActivationGuard();
    guard.recordPenRelease(7, origin, 100);
    expect(guard.shouldSuppress(click({ pointerId: 1, pointerType: "mouse", timestamp: 110 }), targetsMatch)).toBe(false);

    guard.recordPenRelease(7, origin, 200);
    expect(guard.shouldSuppress(click({ detail: 1, target: other, timestamp: 210 }), targetsMatch)).toBe(false);
  });

  it("invalidates ambiguous legacy correlation on non-pen input or cancellation", () => {
    const guard = new PenActivationGuard();
    guard.recordPenRelease(7, origin, 100);
    guard.recordNonPenPointerDown();
    expect(guard.shouldSuppress(click({ detail: 1, timestamp: 110 }), targetsMatch)).toBe(false);

    guard.recordPenRelease(8, origin, 200);
    guard.recordPenCancellation();
    expect(guard.shouldSuppress(click({ detail: 1, timestamp: 210 }), targetsMatch)).toBe(false);
  });

  it("uses inclusive expiry boundaries for click correlation", () => {
    const guard = new PenActivationGuard();
    guard.recordPenRelease(7, origin, 100);
    expect(guard.shouldSuppress(click({ detail: 1, timestamp: 100 + PEN_ACTIVATION_WINDOW_MS }), targetsMatch)).toBe(true);

    guard.recordPenRelease(8, origin, 200);
    expect(guard.shouldSuppress(click({ detail: 1, timestamp: 201 + PEN_ACTIVATION_WINDOW_MS }), targetsMatch)).toBe(false);
  });

  it("anchors double-click correlation to the consumed click", () => {
    const guard = new PenActivationGuard();
    guard.recordPenRelease(7, origin, 0);
    expect(guard.shouldSuppress(click({ detail: 2, timestamp: 700 }), targetsMatch)).toBe(true);
    expect(guard.shouldSuppress(doubleClick({ timestamp: 1400 }), targetsMatch)).toBe(true);
    expect(guard.shouldSuppress(doubleClick({ timestamp: 1401 }), targetsMatch)).toBe(false);
  });
});

function click(overrides: Partial<ActivationEvidence> = {}): ActivationEvidence {
  return {
    detail: 0,
    kind: "click",
    pointerId: null,
    pointerType: "",
    target: origin,
    timestamp: 0,
    ...overrides,
  };
}

function doubleClick(overrides: Partial<ActivationEvidence> = {}): ActivationEvidence {
  return { ...click(overrides), kind: "dblclick" };
}
