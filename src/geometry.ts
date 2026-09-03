import { getStroke } from "perfect-freehand";

import type { InkStroke } from "./types";

type Coordinate = readonly [number, number];

export function strokeToSvgPath(stroke: InkStroke, complete = true): string {
  const outline = getStroke(
    stroke.points.map((point) => [point.x, point.y, point.pressure]),
    {
      size: stroke.size,
      thinning: stroke.tool === "highlighter" ? 0.15 : 0.62,
      smoothing: stroke.tool === "highlighter" ? 0.45 : 0.58,
      streamline: stroke.tool === "highlighter" ? 0.42 : 0.34,
      simulatePressure: !stroke.hasPressure,
      start: { cap: true, taper: stroke.tool === "pen" ? 1.5 : 0 },
      end: { cap: true, taper: stroke.tool === "pen" ? 1.5 : 0 },
      last: complete,
    },
  );

  return outlineToSvgPath(outline);
}

export function screenSizeToCanvasSize(screenSize: number, screenScale: number): number {
  return screenSize / (Number.isFinite(screenScale) && screenScale > 0 ? screenScale : 1);
}

export function outlineToSvgPath(points: readonly Coordinate[]): string {
  if (points.length === 0) return "";

  const first = points[0];
  if (!first) return "";
  if (points.length === 1) {
    return `M ${first[0]} ${first[1]} L ${first[0] + 0.01} ${first[1] + 0.01} Z`;
  }

  const commands = [`M ${first[0].toFixed(3)} ${first[1].toFixed(3)}`];
  for (let index = 1; index < points.length - 1; index += 1) {
    const current = points[index];
    const next = points[index + 1];
    if (!current || !next) continue;
    const midX = (current[0] + next[0]) / 2;
    const midY = (current[1] + next[1]) / 2;
    commands.push(`Q ${current[0].toFixed(3)} ${current[1].toFixed(3)} ${midX.toFixed(3)} ${midY.toFixed(3)}`);
  }
  commands.push("Z");
  return commands.join(" ");
}

export function strokeIntersectsCircle(stroke: InkStroke, x: number, y: number, radius: number): boolean {
  const hitRadius = radius + stroke.size / 2;
  const hitRadiusSquared = hitRadius * hitRadius;
  const points = stroke.points;
  if (points.length === 0) return false;
  if (points.length === 1) {
    const point = points[0];
    return point ? squaredDistance(point.x, point.y, x, y) <= hitRadiusSquared : false;
  }

  for (let index = 1; index < points.length; index += 1) {
    const start = points[index - 1];
    const end = points[index];
    if (start && end && squaredDistanceToSegment(x, y, start.x, start.y, end.x, end.y) <= hitRadiusSquared) {
      return true;
    }
  }
  return false;
}

function squaredDistance(ax: number, ay: number, bx: number, by: number): number {
  const dx = ax - bx;
  const dy = ay - by;
  return dx * dx + dy * dy;
}

function squaredDistanceToSegment(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
): number {
  const dx = bx - ax;
  const dy = by - ay;
  if (dx === 0 && dy === 0) return squaredDistance(px, py, ax, ay);
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)));
  return squaredDistance(px, py, ax + t * dx, ay + t * dy);
}
