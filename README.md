# Canvas Scribe

Canvas Scribe is an experimental, pen-first handwriting layer for Obsidian Canvas. Its core interaction model is intentionally simple:

- A stylus writes directly on the Canvas, including over cards.
- A finger keeps Obsidian's native pan and pinch-zoom behavior.
- A mouse keeps Obsidian's native Canvas behavior.
- While stylus input is enabled, Canvas context-menu gestures open a radial palette for pen, highlighter, eraser, undo, redo, and the original Canvas menu.

The initial release includes a pressure-aware pen, highlighter, whole-stroke eraser, and ink-specific undo/redo. Ink is stored as structured JSON under the `canvasScribe` property in the existing `.canvas` file.

For device testing, run **Canvas Scribe: Toggle S Pen input diagnostics** from the command palette. The overlay reports the browser's pen type, pressure, tilt, and button mappings without changing input behavior. Run **Canvas Scribe: Export debug report** afterward to create a fill-in report and structured log in the vault's `Canvas Scribe Debug` folder. Logs exclude note text, canvas names, vault names, and raw pen coordinates.

## Galaxy tablet installation

After the first GitHub release is available, install **Obsidian42 - BRAT**, run **BRAT: Add a beta plugin for testing**, and enter:

```text
https://github.com/TheFurnace/canvas-scribe
```

BRAT can then install future tablet builds from this repository's releases. See [docs/debug-workflow.md](docs/debug-workflow.md) for the full test and feedback loop.

Tester-reported polish items are tracked in [docs/nitpick-backlog.md](docs/nitpick-backlog.md) for a later focused pass.

## Development

```sh
pnpm install
pnpm check
```

On Windows, build, test, and copy the plugin into a desktop or synced vault with:

```powershell
pnpm deploy:vault -VaultPath "C:\path\to\your\vault"
```

Add `-Watch` to redeploy after every source change. Obsidian still needs to reload the plugin after a JavaScript rebuild. See [docs/debug-workflow.md](docs/debug-workflow.md) for Galaxy tablet installation, updates, and feedback collection.

## Status

This is an MVP intended for real-device input testing, especially Obsidian Mobile on Samsung Galaxy Tab hardware. Obsidian's Canvas internals are not a public API, so DOM integration is isolated in `src/canvas-ink-layer.ts` and will need compatibility testing across Obsidian releases.

## Prior art and licensing

The architecture was informed by two MIT-licensed Obsidian plugins:

- [Draw in Canvas](https://github.com/xRyul/draw-in-canvas): Canvas-world SVG layering, coordinate transforms, coalesced pointer samples, and JSON Canvas extension data.
- [Blackboard](https://github.com/jameswolensky/obsidian-blackboard): stylus-first event routing, touch/pen separation, and pressure-aware freehand rendering.

[Ink](https://github.com/daledesilva/obsidian_ink) was reviewed only at the product level. Its repository is licensed CC BY-NC-ND 4.0 and no code was copied or adapted from it.
