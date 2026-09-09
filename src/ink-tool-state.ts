import { ToolColors } from "./colors";
import type { DrawingTool } from "./types";
import type { PenType } from "./pen-types";
import type { HighlighterType } from "./highlighter-types";
import type { EraserSettings } from "./eraser-menu";
import type { SelectionSettings } from "./selection-menu";

/** Editor-local tool choices. UI builders receive callbacks, never a host view. */
export class InkToolState {
  activeTool: DrawingTool = "pen";
  penType: PenType = "fountain";
  penSize = 3.5;
  penOpacity: number | null = null;
  highlighterType: HighlighterType = "round";
  highlighterSize = 17;
  highlighterOpacity = 0.38;
  readonly toolColors = new ToolColors();
  eraserSettings: EraserSettings = { mode: "stroke", highlighterOnly: false, radius: 18 };
  selectionSettings: SelectionSettings = { mode: "lasso", partial: true };
}
