// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { createHandwrittenNote } from "../src/handwritten-note";
import { renderHandwrittenNotePage } from "../src/handwritten-note-renderer";

describe("handwritten-note renderer", () => {
  it("renders ink and plain text in source layer order without interactive controls", () => {
    const note = createHandwrittenNote();
    note.objects = [
      { kind: "ink", id: "i", tool: "pen", color: "#000", size: 3, opacity: 1, points: [{ x: 1, y: 2, pressure: .5, time: 1 }], hasPressure: false, createdAt: 1 },
      { kind: "text", id: "t", x: 10, y: 20, width: 200, text: "**plain** [[link]]", fontSize: 18, color: "#111", align: "left" },
    ];
    const page = renderHandwrittenNotePage(document, note);
    expect(page.querySelector("path")?.dataset.objectId).toBe("i");
    expect(page.querySelector("foreignObject")?.textContent).toBe("**plain** [[link]]");
    expect(page.querySelector("textarea,button,a")).toBeNull();
  });
});
