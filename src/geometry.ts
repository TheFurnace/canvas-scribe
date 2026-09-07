import { getStroke } from "perfect-freehand";
import { PEN_PROFILES, penPressure, pencilTilt } from "./pen-types";

import type { InkStroke } from "./types";

type Coordinate = readonly [number, number];

export function strokeToSvgPath(stroke: InkStroke, complete = true): string {
  if (stroke.tool === "pen" && stroke.penType) return typedPenPath(stroke, complete);
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

function typedPenPath(stroke: InkStroke, complete: boolean): string {
  const type = stroke.penType!;
  const profile = PEN_PROFILES[type];
  const strands = type === "pencil" ? 7 : 1;
  return Array.from({ length: strands }, (_, strand) => {
    const points = stroke.points.map((point, index) => {
      const pressure = penPressure(type, point.pressure, stroke.hasPressure);
      if (type !== "pencil") return [point.x, point.y, pressure];
      const before = stroke.points[Math.max(0, index - 1)]!;
      const after = stroke.points[Math.min(stroke.points.length - 1, index + 1)]!;
      const dx = after.x - before.x;
      const dy = after.y - before.y;
      const length = Math.hypot(dx, dy) || 1;
      // Fixed strand noise depends on sample index, so moving/reloading ink keeps its texture.
      const grain = Math.sin(index * 12.9898 + strand * 78.233) * 0.045;
      const spread = (0.45 + pressure * 0.55) * (1 + pencilTilt(point));
      const offset = ((strand - 3) / 7 + grain) * stroke.size * spread;
      return [point.x - (dy / length) * offset, point.y + (dx / length || (dy === 0 ? 1 : 0)) * offset, pressure];
    });
    return outlineToSvgPath(getStroke(points, {
      size: stroke.size * (strands === 1 ? 1 : 0.11),
      thinning: profile.thinning, smoothing: profile.smoothing, streamline: profile.streamline,
      simulatePressure: false, start: { cap: true, taper: profile.taper },
      end: { cap: true, taper: profile.taper }, last: complete,
    }));
  }).join(" ");
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

export function strokeIntersectsCircle(
  stroke: InkStroke,
  x: number,
  y: number,
  radius: number,
): boolean {
  const hitRadius = radius + stroke.size * (stroke.penType === "pencil" ? 1 : 0.5);
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
