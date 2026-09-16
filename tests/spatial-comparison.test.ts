import { expect, it } from "vitest";
import { algorithms, createIndex, type Item } from "../scripts/spatial/indexes";
import { editBatch, fixture, queries, scenes } from "../scripts/spatial/fixtures";

it.each(algorithms)("%s matches ordered scan candidates before edits, after replacements and undo", algorithm => {
  for (const scene of scenes) {
    const items = fixture(scene, 100), index = createIndex(algorithm), oracle = createIndex("scan");
    const verify = (values: Item[]) => {
      oracle.load(values);
      for (const q of queries(values, 64)) expect(index.search(q.box, q.highlighterOnly)).toEqual(oracle.search(q.box, q.highlighterOnly));
    };
    index.load(items); verify(items);
    const edit = editBatch(items); index.update(edit.next, edit.removed, edit.added); verify(edit.next);
    index.update(items, edit.added, edit.removed); verify(items);
    const reloaded = structuredClone(items); index.load(reloaded); verify(reloaded);
  }
});
it.each(algorithms)("%s handles negative boundaries, duplicate-cell hits, empty ink and giant extents", algorithm => {
  const base = fixture("canvas", 1)[0]!.stroke;
  const items: Item[] = [
    { order: 0, stroke: { ...base, id: "negative", outline: [[[[-64, -64], [0, -64], [0, 0], [-64, 0]]]] } },
    { order: 1, stroke: { ...base, id: "giant", outline: [[[[-100000, -100000], [100000, -100000], [100000, 100000], [-100000, 100000]]]] } },
    { order: 2, stroke: { ...base, id: "empty", outline: undefined, points: [] } },
  ];
  const index = createIndex(algorithm); index.load(items);
  expect(index.search({ minX: 0, minY: 0, maxX: 0, maxY: 0 }).map(i => i.stroke.id)).toEqual(["negative", "giant"]);
  expect(index.search({ minX: -200000, minY: -200000, maxX: 200000, maxY: 200000 }).map(i => i.stroke.id)).toEqual(["negative", "giant"]);
  index.update([items[0]!], [items[1]!, items[2]!], []);
  expect(index.search({ minX: 1, minY: 1, maxX: 5, maxY: 5 })).toEqual([]);
  const live = items[2]!; live.stroke.points.push({ x: 200, y: 200, pressure: .5, time: 1 });
  index.update([items[0]!, live], [live], [live]);
  expect(index.search({ minX: 200, minY: 200, maxX: 201, maxY: 201 }).map(i => i.stroke.id)).toEqual(["empty"]);
  live.stroke.points.push({ x: 300, y: 300, pressure: .5, time: 2 });
  index.update([items[0]!, live], [live], [live]);
  expect(index.search({ minX: 300, minY: 300, maxX: 301, maxY: 301 }).map(i => i.stroke.id)).toEqual(["empty"]);
});
