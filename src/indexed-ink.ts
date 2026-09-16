import type { InkStroke } from "./types";
import { eraseInk } from "./ink-operations";
import { polygonBounds, replaceSpatialCandidates, type SpatialIndex } from "./spatial-index";

export function eraseIndexedInk<T extends InkStroke>(strokes: T[], index: SpatialIndex<T>,
  region: Parameters<typeof eraseInk>[1], options: Parameters<typeof eraseInk>[2], partition = 0): { strokes: T[]; changed: boolean } {
  const bounds = polygonBounds(region.flatMap(polygon => polygon.flatMap(ring => ring.map(([x, y]) => ({ x, y })))));
  if (!bounds) return { strokes, changed: false };
  const result = replaceSpatialCandidates(strokes, index, bounds, stroke => {
    if (options.highlighterOnly && stroke.tool !== "highlighter") return [stroke];
    // eraseInk spreads the source stroke when splitting, retaining kind/page metadata.
    const erased = eraseInk([stroke], region, options);
    return erased.changed ? erased.strokes as T[] : [stroke];
  }, partition);
  return { strokes: result.values, changed: result.changed };
}
