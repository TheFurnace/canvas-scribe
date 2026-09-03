import { describe, expect, it } from "vitest";

import { boundsForStrokes, pointInBounds, pointInPolygon, strokeInsidePolygon, translatePoints } from "../src/selection";
import type { InkStroke } from "../src/types";

function stroke(id: string, points: Array<[number, number]>): InkStroke {
  return {
    id,
    tool: "pen",
    color: "#000000",
    size: 2,
    opacity: 1,
    hasPressure: false,
    createdAt: 1,
    points: points.map(([x, y]) => ({ x, y, pressure: 0.5, time: 0 })),
  };
}

const square = [
  { x: 0, y: 0 },
  { x: 10, y: 0 },
  { x: 10, y: 10 },
  { x: 0, y: 10 },
];

describe("lasso selection", () => {
  it("detects points and complete strokes inside a polygon", () => {
    expect(pointInPolygon({ x: 5, y: 5 }, square)).toBe(true);
    expect(pointInPolygon({ x: 15, y: 5 }, square)).toBe(false);
    expect(strokeInsidePolygon(stroke("inside", [[2, 2], [8, 8]]), square)).toBe(true);
    expect(strokeInsidePolygon(stroke("crossing", [[2, 2], [12, 8]]), square)).toBe(false);
  });

  it("computes bounds and padding for a selected stroke group", () => {
    const bounds = boundsForStrokes([stroke("a", [[2, 3], [8, 9]]), stroke("b", [[-1, 4], [5, 12]])]);
    expect(bounds).toEqual({ minX: -1, minY: 3, maxX: 8, maxY: 12 });
    expect(bounds && pointInBounds({ x: 9, y: 12 }, bounds, 1)).toBe(true);
  });

  it("translates points without mutating the move snapshot", () => {
    const points = stroke("a", [[1, 2]]).points;
    const moved = translatePoints(points, 4, -1);
    expect(moved[0]).toMatchObject({ x: 5, y: 1 });
    expect(points[0]).toMatchObject({ x: 1, y: 2 });
  });
});
