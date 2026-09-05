# Canvas Scribe

Canvas Scribe is an experimental, stylus-first handwriting layer for Obsidian Canvas. Its core interaction model is intentionally simple:

- A stylus writes directly on the Canvas, including over cards.
- A finger keeps Obsidian's native pan and pinch-zoom behavior.
- A mouse keeps Obsidian's native Canvas behavior.
- While stylus input is enabled, Canvas context-menu gestures open a radial palette for pen, highlighter, eraser, undo, redo, and the original Canvas menu.

The initial release includes a pressure-aware pen, highlighter, whole-stroke eraser, and ink-specific undo/redo. Ink is stored as structured JSON under the `canvasScribe` property in the existing `.canvas` file.

For device testing, run **Canvas Scribe: Toggle stylus input diagnostics** from the command palette. The overlay reports the browser's stylus pointer type, pressure, tilt, and button mappings without changing input behavior. Run **Canvas Scribe: Export debug report** afterward to create a fill-in report and structured log in the vault's `Canvas Scribe Debug` folder. Logs exclude note text, canvas names, vault names, and raw stylus coordinates.

Android handwriting-to-text support and the Galaxy test matrix are documented in [docs/stylus-to-text.md](docs/stylus-to-text.md). Stylus events that begin inside an active HTML editor are left to Obsidian and Android's input method instead of being captured as ink.

## Galaxy tablet installation

After the first GitHub release is available, install **Obsidian42 - BRAT**, run **BRAT: Add a beta plugin for testing**, and enter:

```text
https://github.com/TheFurnace/canvas-scribe
```

BRAT can then install future tablet builds from this repository's releases. See [docs/debug-workflow.md](docs/debug-workflow.md) for the full test and feedback loop.

Project work is tracked in Linear. Use [Draw on Canvas v1](https://linear.app/fdqr/project/draw-on-canvas-v1-7dae1cdf674c) for planned product and engineering work, and [Canvas Scribe User Feedback](https://linear.app/fdqr/project/canvas-scribe-user-feedback-3b845a98c8ed) for pain points and feature requests discovered through real use.

## Development

See [CONTRIBUTING.md](CONTRIBUTING.md) for the branch/worktree convention and the beta-versus-stable release policy.

```sh
pnpm install
pnpm check
```

Run the Obsidian-hosted component workshop at `http://localhost:6006`:

```sh
pnpm storybook
```

Storybook automatically extracts `app.css` and its referenced assets from the locally installed Obsidian build. The generated files are proprietary, machine-local, and git-ignored. Use `pnpm sync:obsidian-css -- --path <obsidian.asar-or-app.css>` when automatic discovery is unavailable, or set `CANVAS_SCRIBE_OBSIDIAN_STYLES` to that path. A small committed fallback keeps CI builds usable without pretending to reproduce Obsidian exactly.

Use `pnpm build:storybook` to refresh the local Obsidian styles, type-check the stories, and create a static build in `storybook-static/`. See [docs/storybook-obsidian-environment.md](docs/storybook-obsidian-environment.md) for the fixture structure and story API.

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
- [Blackboard](https://github.com/jameswolensky/obsidian-blackboard): stylus-first event routing, touch/stylus separation, and pressure-aware freehand rendering.

[Ink](https://github.com/daledesilva/obsidian_ink) was reviewed only at the product level. Its repository is licensed CC BY-NC-ND 4.0 and no code was copied or adapted from it.
