import type { InkPoint } from "./types";

export function isPenEvent(event: PointerEvent): boolean {
  return event.pointerType === "pen";
}

export function isPenContact(event: PointerEvent): boolean {
  return event.pressure > 0 || (event.buttons & 1) !== 0 || (event.type === "pointerdown" && event.button === 0);
}

export function isPenBarrelButton(event: PointerEvent): boolean {
  return event.button === 2 || (event.buttons & 2) !== 0;
}

export function isEraserTip(event: PointerEvent): boolean {
  return event.button === 5 || (event.buttons & 32) !== 0;
}

export function pointerSamples(event: PointerEvent): PointerEvent[] {
  const coalesced = typeof event.getCoalescedEvents === "function" ? event.getCoalescedEvents() : [];
  if (coalesced.length === 0 || coalesced[coalesced.length - 1] !== event) return [...coalesced, event];
  return coalesced;
}

export function shouldAppendReleasePoint(event: PointerEvent): boolean {
  return event.type === "pointerup";
}

export function pointerToInkPoint(event: PointerEvent, x: number, y: number): InkPoint {
  const pressure = event.pressure > 0 ? event.pressure : 0.5;
  const point: InkPoint = {
    x: round(x),
    y: round(y),
    pressure: round(Math.min(1, Math.max(0, pressure))),
    time: Math.round(event.timeStamp),
  };
  if (event.tiltX !== 0) point.tiltX = event.tiltX;
  if (event.tiltY !== 0) point.tiltY = event.tiltY;
  return point;
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}
