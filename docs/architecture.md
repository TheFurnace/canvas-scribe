# Architecture and product direction

## Product thesis

Obsidian Canvas should remain the note-management and spatial-thinking system. Canvas Scribe adds ink as a native-feeling input layer instead of replacing Canvas with a separate drawing editor.

The interaction contract is based on Samsung Notes:

1. Stylus contact writes immediately; there is no open-to-edit step.
2. Finger input navigates and never creates ink.
3. Stylus pressure affects the stroke, and coalesced pointer samples preserve fast handwriting detail.
4. The stylus barrel button is a momentary eraser when the platform exposes it.
5. Tool state is persistent and reachable from a compact Canvas toolbar.

## Components

- `main.ts`: plugin lifecycle, commands, and one layer per open Canvas view.
- `canvas-ink-layer.ts`: Canvas DOM attachment, toolbar, gesture lifecycle, history, and rendering orchestration.
- `pointer-input.ts`: standard Pointer Events normalization, barrel-button detection, and coalesced input.
- `geometry.ts`: perfect-freehand outlines and eraser hit testing.
- `persistence.ts`: versioned, validated `canvasScribe` data embedded in JSON Canvas.
- `canvas-target.ts`: the narrow adapter around Obsidian's file-backed Canvas view.

## Persistence choice

Ink is stored in the `.canvas` file rather than a plugin settings folder or opaque database. This keeps the spatial board and its handwriting atomic for sync, backup, duplication, and version control. Standard JSON Canvas readers ignore the additional top-level property.

## Known MVP risks

- Obsidian does not expose a stable public Canvas extension API; DOM selectors may change.
- Android/WebView mappings for stylus barrel buttons vary by device. Input diagnostics and real-device event traces are the next priority.
- A palm that lands before stylus contact can begin a native Canvas gesture. Stylus-hover detection and a short palm-suppression window should be evaluated on-device.
- Directly rewriting the Canvas JSON can race with native Canvas saves. A future adapter should coordinate with the internal `requestSave()` lifecycle or use an atomic vault processing API where supported.
- SVG is ideal for an MVP and editable strokes. Dense boards will eventually need viewport culling and raster tile caching.

## Next milestones

1. Device-input harness: record `pointerType`, `button`, `buttons`, pressure, tilt, hover, and event timing on a Galaxy Tab.
2. Stylus fidelity: pressure curves, stabilization presets, predicted-event preview, tilt-aware pencil, and zoom-normalized tool sizes.
3. Editing: lasso/rectangle selection, move/scale/recolor, area eraser, and highlighter-only erase.
4. Samsung Notes parity: favorite pens, momentary eraser, shape cleanup, handwriting straighten, and zoom lock/easy writing pad.
5. Obsidian synthesis: convert selected ink to a Canvas card, link ink selections to notes, OCR/search metadata, and portable SVG/PDF export.
