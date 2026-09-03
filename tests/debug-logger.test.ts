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
    const pointer = (type: string, timeStamp: number, button = -1, buttons = 1) =>
      ({
        type,
        timeStamp,
        pointerId: 7,
        pointerType: "pen",
        isPrimary: true,
        button: type === "pointerdown" ? 0 : button,
        buttons,
        pressure: 0.5,
        tangentialPressure: 0,
        tiltX: 2,
        tiltY: 3,
        twist: 0,
        width: 1,
        height: 1,
        getCoalescedEvents: vi.fn(() => []),
      }) as unknown as PointerEvent;

    logger.recordPointer(pointer("pointermove", 100, -1, 1));
    logger.recordPointer(pointer("pointermove", 120, 2, 3));
    logger.recordPointer(pointer("pointermove", 130, 2, 3));
    logger.recordPointer(pointer("pointermove", 171, -1, 3));
    logger.recordPointer(pointer("pointerdown", 152));

    const entries = logger.snapshot().entries;
    expect(entries.map((entry) => entry.event)).toEqual(["pointermove", "pointermove", "pointermove", "pointerdown"]);
    expect(entries.map((entry) => entry.data?.button)).toEqual([-1, 2, -1, 0]);
    expect(entries.map((entry) => entry.data?.buttons)).toEqual([1, 3, 3, 1]);
  });

  it("records selection state without selected text", () => {
    const logger = new DebugLogger();
    const event = { type: "selectstart", cancelable: true, defaultPrevented: false } as Event;
    const selection = { rangeCount: 1, isCollapsed: true, type: "Caret" } as Selection;

    logger.recordSelection(event, selection);

    expect(logger.snapshot().entries[0]).toMatchObject({
      category: "selection",
      event: "selectstart",
      data: {
        cancelable: true,
        defaultPrevented: false,
        rangeCount: 1,
        isCollapsed: true,
        selectionType: "Caret",
      },
    });
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
