import { expect, it } from "vitest";
import { DocumentHistory } from "../src/document-history";

it("restores mixed object identity, layer order, and nested data through undo/redo", () => {
  const original = [{ id: "ink", type: "ink", data: { points: [1, 2], text: "" } }, { id: "text", type: "text", data: { points: [], text: "[[ordinary text]]" } }];
  const history = new DocumentHistory<typeof original[number]>();
  history.checkpoint(original);
  const edited = [...original].reverse().map((item) => ({ ...item, data: { ...item.data, text: "new" } }));
  const restored = history.undo(edited)!;
  expect(restored).toEqual(original);
  expect(restored[0]!.data).not.toBe(original[0]!.data);
  expect(history.redo(restored)).toEqual(edited);
  history.checkpoint(edited);
  expect(history.future).toHaveLength(0);
  expect(() => history.checkpoint([original[0]!, original[0]!])).toThrow("unique IDs");
});
