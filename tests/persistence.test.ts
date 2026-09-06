import type { App, TFile, View } from "obsidian";
import { describe, expect, it, vi } from "vitest";

import { saveInkData } from "../src/persistence";
import { CANVAS_INK_VERSION, type CanvasInkData, type JsonCanvasDocument } from "../src/types";

const ink: CanvasInkData = {
  version: CANVAS_INK_VERSION,
  strokes: [
    {
      id: "stroke-1",
      tool: "pen",
      color: "#111111",
      size: 3,
      opacity: 1,
      points: [{ x: 10, y: 20, pressure: 0.5, time: 1 }],
      hasPressure: false,
      createdAt: 1,
    },
  ],
};

describe("saveInkData", () => {
  it("joins the native Canvas save lifecycle when the file is open", async () => {
    const process = vi.fn();
    const app = { vault: { process } } as unknown as App;
    const file = { path: "Board.canvas" } as TFile;
    const data: JsonCanvasDocument = {
      nodes: [{ id: "native-edit", type: "text", text: "kept" }],
      edges: [],
    };
    const requestedDocuments: JsonCanvasDocument[] = [];
    const requestSave = vi.fn((_pushHistory?: boolean) => requestedDocuments.push(structuredClone(data)));
    const saveImmediately = vi.fn(async () => undefined);
    const view = { canvas: { data, requestSave }, saveImmediately } as unknown as View;

    await saveInkData(app, file, ink, view);

    expect(requestedDocuments).toEqual([
      expect.objectContaining({
        nodes: [{ id: "native-edit", type: "text", text: "kept" }],
        canvasScribe: ink,
      }),
    ]);
    expect(requestSave).toHaveBeenCalledWith(false);
    expect(saveImmediately).toHaveBeenCalledOnce();
    expect(process).not.toHaveBeenCalled();
  });

  it("atomically preserves file changes when no native Canvas save lifecycle is available", async () => {
    let fileContents = `${JSON.stringify({
      nodes: [{ id: "external-edit", type: "text", text: "kept" }],
      edges: [],
    })}\n`;
    const process = vi.fn(async (_file: TFile, update: (raw: string) => string) => {
      fileContents = update(fileContents);
    });
    const app = { vault: { process } } as unknown as App;
    const file = { path: "Board.canvas" } as TFile;

    await saveInkData(app, file, ink);

    expect(process).toHaveBeenCalledOnce();
    expect(JSON.parse(fileContents)).toEqual({
      nodes: [{ id: "external-edit", type: "text", text: "kept" }],
      edges: [],
      canvasScribe: ink,
    });
  });
});
