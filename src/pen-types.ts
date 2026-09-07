import type { InkPoint } from "./types";

export const PEN_TYPES = ["ballpoint", "fountain", "brush", "pencil"] as const;
export type PenType = typeof PEN_TYPES[number];
export const PEN_PROFILES = {
  ballpoint: { label: "Ballpoint", description: "Even, steady lines", thinning: 0, smoothing: 0.58, streamline: 0.34, taper: 0, opacity: 1, exponent: 1 },
  fountain: { label: "Fountain", description: "Natural pressure-sensitive ink", thinning: 0.5, smoothing: 0.58, streamline: 0.34, taper: 1.5, opacity: 1, exponent: 0.8 },
  brush: { label: "Brush", description: "Expressive light-to-bold strokes", thinning: 0.85, smoothing: 0.65, streamline: 0.4, taper: 3, opacity: 1, exponent: 1.5 },
  pencil: { label: "Pencil", description: "Textured graphite · tilt to shade", thinning: 0.5, smoothing: 0.35, streamline: 0.25, taper: 0, opacity: 0.72, exponent: 0.7 },
} as const;

export function isPenType(value: unknown): value is PenType {
  return typeof value === "string" && PEN_TYPES.includes(value as PenType);
}

export function penPressure(type: PenType, pressure: number, hasPressure = true): number {
  if (type === "ballpoint" || !hasPressure) return 0.5;
  return Math.pow(Number.isFinite(pressure) ? Math.max(0, Math.min(1, pressure)) : 0.5, PEN_PROFILES[type].exponent);
}

export function pencilTilt(point: Pick<InkPoint, "tiltX" | "tiltY">): number {
  const x = Number.isFinite(point.tiltX) ? point.tiltX! : 0;
  const y = Number.isFinite(point.tiltY) ? point.tiltY! : 0;
  return Math.min(1, Math.hypot(x, y) / 75);
}

export function clampPenSize(size: number): number {
  return Number.isFinite(size) ? Math.round(Math.max(1, Math.min(20, size)) * 2) / 2 : 3.5;
}
