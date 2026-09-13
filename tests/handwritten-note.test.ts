import { describe, expect, it } from "vitest";
import {
  HANDWRITTEN_NOTE_KIND, UnsupportedHandwrittenNoteError, boundsForObjects, cloneHandwrittenObjects,
  createHandwrittenNote, normalizeContentHeight, parseHandwrittenNote, serializeHandwrittenNote, translateHandwrittenObject,
  type HandwrittenObject,
} from "../src/handwritten-note";

const objects: HandwrittenObject[] = [
  { kind: "ink", id: "ink-1", tool: "pen", penType: "fountain", color: "#123456", size: 4, opacity: .9, hasPressure: true, createdAt: 1, points: [{ x: 10, y: 20, pressure: .7, time: 1 }, { x: 40, y: 60, pressure: .6, time: 2 }] },
  { kind: "text", id: "text-1", x: 80, y: 90, width: 240, text: "Plain [[text]]", fontSize: 18, color: "#222222", align: "center" },
];

describe("handwritten-note format", () => {
  it("round-trips stable mixed object IDs, geometry, style, and plain text", () => {
    const note = createHandwrittenNote(); note.objects = cloneHandwrittenObjects(objects); normalizeContentHeight(note);
    expect(parseHandwrittenNote(serializeHandwrittenNote(note))).toEqual(note);
    expect(note.objects[1]).toMatchObject({ id: "text-1", text: "Plain [[text]]", fontSize: 18, align: "center" });
  });

  it("rejects unsupported versions without coercing the document", () => {
    expect(() => parseHandwrittenNote(JSON.stringify({ kind: HANDWRITTEN_NOTE_KIND, version: 99, objects: [] }))).toThrow(UnsupportedHandwrittenNoteError);
  });

  it("rejects duplicate object IDs", () => {
    const note = createHandwrittenNote(); note.objects = [objects[0]!, cloneHandwrittenObjects([objects[0]!])[0]!];
    expect(() => parseHandwrittenNote(serializeHandwrittenNote(note))).toThrow(/unique/i);
  });

  it("moves mixed selections while width-resizing text leaves font size unchanged", () => {
    const moved = objects.map((object) => translateHandwrittenObject(object, 25, 40));
    const bounds = boundsForObjects(moved); expect(bounds).not.toBeNull();
    expect(bounds!.minX).toBeCloseTo(35, 1); expect(bounds!.minY).toBeCloseTo(60, 1); expect(bounds!.maxX).toBe(345);
    const text = moved[1]; if (!text || text.kind !== "text") throw new Error("fixture");
    const resized = { ...text, width: 120 };
    expect(resized).toMatchObject({ width: 120, fontSize: 18, text: "Plain [[text]]" });
  });

  it("stores content extent separately from spare viewport space", () => {
    const source = objects[1]; if (!source || source.kind !== "text") throw new Error("fixture");
    const note = createHandwrittenNote(); note.objects = [{ ...source, y: 1800 }]; normalizeContentHeight(note);
    expect(note.contentHeight).toBeGreaterThan(1960);
    expect(serializeHandwrittenNote(note)).not.toContain("spareHeight");
  });
});

it.each([
  { objects: {} }, { objects: null }, { objects: undefined },
  { logicalWidth: "960" }, { logicalWidth: 0 }, { contentHeight: -1 },
  { viewport: null }, { viewport: { zoom: 1 } }, { viewport: { scrollTop: 0, zoom: 0 } },
  { objects: [{ ...objects[1], x: "bad" }] }, { objects: [{ ...objects[1], width: -1 }] },
  { objects: [{ ...objects[1], text: null }] }, { objects: [{ ...objects[1], align: "justify" }] },
  { objects: [{ ...objects[0], points: [{ x: 1, y: null, pressure: .5, time: 1 }] }] },
  { objects: [{ ...objects[0], points: [{ x: 1, y: 2, pressure: 2, time: 1 }] }] },
  { objects: [{ ...objects[0], hasPressure: "true" }] },
  { objects: [{ ...objects[0], penType: "unknown" }] },
])("rejects malformed required schema: %j", patch => {
  expect(() => parseHandwrittenNote(JSON.stringify({ ...createHandwrittenNote(), ...patch }))).toThrow();
});
it("preserves real timestamps and optional legacy ink styles without clamping", () => {
  const note = createHandwrittenNote();
  const ink = { ...objects[0]!, createdAt: 1789261200000 };
  if (ink.kind !== "ink") throw Error("fixture");
  delete ink.penType;
  ink.points = [{ x: -12, y: 20, pressure: .5, time: 987654321, tiltX: -45, tiltY: 90 }];
  note.objects = [ink];
  expect(parseHandwrittenNote(serializeHandwrittenNote(note))).toEqual(note);
});

it("requires every root, text and ink field in the v1 schema", () => {
  const required = [
    ["root", createHandwrittenNote(), ["logicalWidth", "contentHeight", "viewport", "objects"]],
    ["text", objects[1]!, ["id", "x", "y", "width", "text", "fontSize", "color", "align"]],
    ["ink", objects[0]!, ["id", "tool", "color", "size", "opacity", "points", "hasPressure", "createdAt"]],
  ] as const;
  for (const [kind, valid, keys] of required) for (const key of keys) {
    const malformed = { ...valid } as Record<string, unknown>; delete malformed[key];
    const note = kind === "root" ? malformed : { ...createHandwrittenNote(), objects: [malformed] };
    expect(() => parseHandwrittenNote(JSON.stringify(note)), `${kind}.${key}`).toThrow();
  }
});
