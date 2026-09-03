# Galaxy device test

## Install

1. Follow the BRAT or synced-vault setup in [debug-workflow.md](debug-workflow.md).
2. Install the current build on the Galaxy tablet.
3. Reload Obsidian and enable **Canvas Scribe** under **Settings → Community plugins**.
4. Open or create a `.canvas` file.

## Core checks

1. Write slowly and quickly with the S Pen. Ink should begin on contact and follow the nib.
2. Vary pressure. The pen width should respond without abrupt jumps.
3. Rest a palm after starting a pen stroke. It should not pan the Canvas or create ink.
4. Pan with one finger and pinch with two fingers when the pen is not touching. Native Canvas navigation should remain available.
5. Hold the S Pen button, then touch and drag across ink. Whole strokes should erase and releasing the button should restore the selected tool for the next contact.
6. Switch among pen, highlighter, and eraser in the Canvas toolbar, then verify ink undo and redo.
7. Close and reopen the Canvas. All strokes should reload at the same positions.

## Capture device mappings

Run **Canvas Scribe: Clear debug history**, then **Canvas Scribe: Toggle S Pen input diagnostics** from the command palette. Test these gestures:

- Hover without pressing a button.
- Write with light and heavy pressure.
- Hold the barrel button while hovering.
- Hold the barrel button and touch the screen.
- Release the barrel button while the nib remains down.

The important fields are `button`, `buttons`, and `pressure`. These mappings can differ across Galaxy model, Android version, and Obsidian's bundled WebView.

When finished, run **Canvas Scribe: Export debug report**. Fill in the generated report and let the `Canvas Scribe Debug` folder sync back to the development computer. The paired Markdown log contains structured JSON with the exact button and pressure mappings.
