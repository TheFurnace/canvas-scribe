import type { InkStroke } from "../../src/types";
import { strokeCandidateBounds, transformInk } from "../../src/ink-operations";
import type { Box, Item } from "./indexes";

export const scenes = ["canvas", "clusters", "note", "crossing"] as const;
export type Scene = typeof scenes[number];
export function random(seed: number): () => number {
  let state = seed >>> 0;
  return () => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state / 4294967296; };
}
export function fixture(scene: Scene, count: number, seed = 91): Item[] {
  const rand = random(seed);
  return Array.from({ length: count }, (_, i) => {
    let x: number, y: number;
    if (scene === "note") { x = (i % 5) * 170; y = Math.floor(i / 5) * 35; }
    else if (scene === "clusters") { const cluster = i % 16; x = (cluster % 4) * 1600 - 2400 + rand() * 250; y = Math.floor(cluster / 4) * 1600 - 2400 + rand() * 250; }
    else { x = (rand() - .5) * 16000; y = (rand() - .5) * 16000; }
    const long = scene === "crossing" && i % 5 === 0;
    const highlighter = i % 7 === 0;
    const dx = long ? 24000 : 30 + rand() * 170, dy = long ? (i % 2 ? 24000 : -24000) : rand() * 20;
    if (long) { x = -12000; y = dy > 0 ? -12000 : 12000; }
    const points = Array.from({ length: 80 }, (_, p) => ({ x: x + dx * p / 79, y: y + dy * p / 79 + Math.sin(p / 8) * 5, pressure: .2 + (p % 10) / 15, time: p }));
    const stroke: InkStroke = { id: `s${i}`, tool: highlighter ? "highlighter" : "pen", ...(highlighter ? { highlighterType: "round" as const } : { penType: "fountain" as const }), size: highlighter ? 30 : 3.5, color: "#123456", opacity: .38, hasPressure: true, createdAt: 1, points };
    // Small frozen fragments exercise cases where samples no longer describe visible extent.
    if (i % 19 === 0 && !long) stroke.outline = [[[[x, y], [x + 25, y], [x + 25, y + 12], [x, y + 12]]]];
    return { stroke, order: i };
  });
}
export interface Query { kind: "eraser" | "empty" | "lasso" | "viewport"; box: Box; highlighterOnly: boolean; }
export function queries(items: readonly Item[], count = 256): Query[] {
  const rand = random(1234);
  return Array.from({ length: count }, (_, i) => {
    const stroke = items[Math.floor(rand() * items.length)]!.stroke;
    const bounds = strokeCandidateBounds(stroke)!;
    const kind = (["eraser", "empty", "lasso", "viewport"] as const)[i % 4]!;
    const radius = kind === "lasso" ? 180 : kind === "viewport" ? 600 : [9, 18, 36][i % 3]!;
    const x = kind === "empty" ? 50000 + i * 20 : (bounds.minX + bounds.maxX) / 2;
    const y = kind === "empty" ? -50000 : (bounds.minY + bounds.maxY) / 2;
    return { kind, box: { minX: x - radius, minY: y - radius, maxX: x + radius, maxY: y + radius }, highlighterOnly: i % 8 === 0 };
  });
}
export function editBatch(items: readonly Item[]): { next: Item[]; removed: Item[]; added: Item[] } {
  const removed: Item[] = [], added: Item[] = [];
  const next = items.flatMap((item, i): Item[] => {
    if (i % 100 >= 5) return [item]; // 5% change; layout/order unchanged elsewhere.
    removed.push(item);
    if (i % 100 === 3) return []; // Delete 1%; also move long crossing strokes at i % 100 === 0.
    const moved: Item = { order: item.order, stroke: transformInk(item.stroke, (x, y) => [x + 37, y - 21]) };
    added.push(moved);
    if (i % 100 !== 1) return [moved];
    const split: Item = { order: item.order + .5, stroke: { ...transformInk(item.stroke, (x, y) => [x + 90, y + 30]), id: `${item.stroke.id}-fragment` } };
    added.push(split); return [moved, split]; // Synthetic split replacement for maintenance timing.
  });
  return { next, removed, added };
}
