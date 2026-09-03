import { describe, expect, it, vi } from "vitest";

import { DebugLogger } from "../src/debug-logger";

describe("DebugLogger", () => {
  it("keeps a bounded rolling history", () => {
    const logger = new DebugLogger(2);
    logger.record("test", "one");
    logger.record("test", "two");
    logger.record("test", "three");

    const snapshot = logger.snapshot();
    expect(snapshot.droppedEntries).toBe(1);
    expect(snapshot.entries.map((entry) => entry.event)).toEqual(["two", "three"]);
  });

  it("copies snapshots so later records do not mutate an export", () => {
    const logger = new DebugLogger();
    logger.record("test", "before", { value: 1 });
    const snapshot = logger.snapshot();
    logger.record("test", "after");

    expect(snapshot.entries).toHaveLength(1);
    expect(snapshot.entries[0]?.data).toEqual({ value: 1 });
  });

  it("throttles pointer moves while retaining button transitions", () => {
    const logger = new DebugLogger();
    const pointer = (type: string, timeStamp: number) =>
      ({
        type,
        timeStamp,
        pointerId: 7,
        pointerType: "pen",
        isPrimary: true,
        button: type === "pointerdown" ? 0 : -1,
        buttons: 1,
        pressure: 0.5,
        tangentialPressure: 0,
        tiltX: 2,
        tiltY: 3,
        twist: 0,
        width: 1,
        height: 1,
        getCoalescedEvents: vi.fn(() => []),
      }) as unknown as PointerEvent;

    logger.recordPointer(pointer("pointermove", 100));
    logger.recordPointer(pointer("pointermove", 120));
    logger.recordPointer(pointer("pointermove", 151));
    logger.recordPointer(pointer("pointerdown", 152));

    expect(logger.snapshot().entries.map((entry) => entry.event)).toEqual([
      "pointermove",
      "pointermove",
      "pointerdown",
    ]);
  });

  it("records secondary mouse-style input without coordinates", () => {
    const logger = new DebugLogger();
    const event = {
      type: "contextmenu",
      constructor: { name: "PointerEvent" },
      pointerId: 9,
      pointerType: "pen",
      pressure: 0,
      button: 2,
      buttons: 2,
      detail: 0,
      ctrlKey: false,
      shiftKey: false,
      altKey: false,
      metaKey: false,
    } as unknown as MouseEvent;

    logger.recordMouse(event);

    expect(logger.snapshot().entries[0]).toMatchObject({
      category: "mouse",
      event: "contextmenu",
      data: {
        eventClass: "PointerEvent",
        pointerId: 9,
        pointerType: "pen",
        button: 2,
        buttons: 2,
      },
    });
    expect(logger.snapshot().entries[0]?.data).not.toHaveProperty("clientX");
    expect(logger.snapshot().entries[0]?.data).not.toHaveProperty("clientY");
  });
});
