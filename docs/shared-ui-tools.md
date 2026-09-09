# Shared UI and expanded tools

Implementation for FER-51, FER-42, FER-23, FER-22, FER-39, FER-38, and the reusable foundations portion of FER-50. This is a review build; Galaxy acceptance and the FER-47/48 real-host feasibility dependencies remain open.

## Controls and behavior

The toolbar selects an inactive tool and toggles settings when the current tool is tapped again. Shared menu shells, action buttons, numeric controls, and swatches support the pen, highlighter, eraser, selection, and quick-color controls. Targets are at least 36 CSS px on desktop and 44 CSS px in the mobile host.

Radial pages are Quick tools, Settings, and Favorites. Quick tools has four pens, two highlighters, two erasers, and one selection slot. The eraser's highlighter filter is independent of stroke/area mode. Tabs and horizontal swipes navigate top-level pages; the last top-level page is remembered in the owning application document for the current session. Submenus are never remembered. Settings includes color, a continuous circular thickness control, undo/redo, tool settings, and native Canvas menu access. Releasing the thickness control keeps it open. Back returns to Settings; Close/Escape dismisses it. Drawing outside dismisses without consuming the intended Canvas input.

The compact color drawer identifies the current/default selection, offers five tool-specific pinned colors, and shows up to three distinct recent custom colors. A quick choice applies and closes. More colors retains the existing transactional picker.

Round highlighters use a constant circular footprint; chisel highlighters sweep an upright rectangular nib. Each stroke is one SVG fill with one opacity application, so self-crossings do not compound opacity. Different strokes composite separately using normal source-over. Defaults are 17 document units and 38% opacity. The settings range is 2–60 units and 5–80% opacity. Legacy highlights keep their existing perfect-freehand rendering. Automatic text-aware thickness is omitted: the Canvas adapter has no reliable shared text-layout contract, and enabling it would falsely imply support across Canvas card types. Straightening remains FER-25.

Area erasing subtracts a circular footprint from flattened rendered ink using polygon-clipping. Curve flattening uses a 0.1 screen-pixel target at the current zoom. Surviving disconnected polygons retain style metadata and ordered, unique object IDs. Their outlines are persisted, so moving/scaling/recoloring does not restore erased regions or regenerate a different pen texture. A filtered eraser leaves pen/pencil ink untouched. Clear-all has a separate confirmation, affects ink only, and is undoable.

Selection supports lasso and rectangle regions. Partial selection includes rendered ink touching the closed region boundary; full selection requires all rendered ink to be contained, including width. Scaling is uniform around the selection center and scales stroke width. Recolor uses the full picker and preserves opacity, tip type, pressure, and cutout geometry. Empty selections disable actions.

## Shared modules and compatibility

- `ui-controls.ts`: action, menu, numeric, and swatch primitives.
- `ink-tool-state.ts`: editor-local tool state, separate from UI and host navigation.
- `geometry.ts` and `ink-operations.ts`: rendering paths, outline conversion, erasing, and transforms.
- `selection.ts`: rendered-geometry region selection and bounds.
- `document-history.ts`: ordered object snapshots, including mixed object types, with stable IDs.
- `ink-surface.ts`: Canvas load/save and coordinate adapter plus the generic adapter contract. Canvas continues to use its native save owner.

Existing v1 ink without new extensions round-trips as v1. Highlighter tip settings and frozen cutout outlines write schema v2. This reader accepts v1/v2, preserves unknown auxiliary fields, and rejects unknown versions/tools, duplicate IDs, invalid coordinates, and invalid cutouts before writes. A failed mount cannot save on disposal. Test schema-v2 files in a copy of the vault: older Canvas Scribe builds do not understand cutout outlines and can discard them when saving. Returning to an older build requires restoring the copied v1 documents.

The generic adapter and history API do not select the PDF viewer or handwritten-note format. FER-47 and FER-48 still own those prototypes and host evidence. No PDF or handwritten-note adapter is claimed here.

## Measurements

Local Node 24 measurements on 2026-09-08, using 300 fountain strokes / 24,000 points, four runs with the first excluded. Reproduce by bundling `scripts/measure-ink.ts` with esbuild for Node and running the resulting module.

| Operation | Median before bounds filtering | Median after |
| --- | ---: | ---: |
| SVG path generation, without DOM | 15.58 ms | 16.67 ms |
| Deep history snapshot | 0.59 ms | 0.68 ms |
| One area-erase footprint | 85.97 ms | 4.89 ms |

Only the conservative bounds filter was selected from this measurement. No renderer replacement or geometry cache was introduced. These values exclude browser layout, SVG paint, and tablet hardware; they are not redraw/device acceptance evidence.

## Acceptance still to run

Production-component Storybook previews cover the new menus and radial pages. Automated tests cover geometry/filtering, stable IDs/history, serialization, legacy rendering, unsafe-load protection, pointer ownership, menu isolation, radial memory, and circular-slider seam/cancellation/keyboard behavior.

Before marking the milestone complete, review all controls in the real Obsidian sandbox and on Galaxy Tab/S Pen: light/dark themes, viewport edges, large text, different Canvas zooms, native mouse/touch navigation, stray ink, barrel activation, pen lift/cancel, selection transforms, save/reopen, and repeated undo/redo. Record actual tablet feedback for FER-39. Complete FER-47/48 host feasibility evidence before closing their dependent shared-foundations issue.

## Desktop host evidence — 2026-09-09

Tested beta.2 (`48791985d30c63e945cd992f6f8ae44d93d4fd96`) in Obsidian 1.13.7 on Windows using a disposable Canvas fixture. Installed plugin files were backed up before deployment and restored afterward with matching SHA-256 hashes; the temporary fixture was removed after testing.

Synthetic pen PointerEvents and supported toolbar keyboard activation exercised the production layer in the real Canvas view. Ten assertions passed: empty fixture, pen stroke creation, repeat-activation highlighter menu, no changes to existing ink during settings edits, subsequent chisel stroke, undo, redo, indicator clearing on lift, native-card preservation, and equality between saved and live strokes. Reopening the Canvas retained round/chisel metadata and matched saved strokes. A real-host screenshot showed both distinct highlight shapes and the preserved native card in the active light theme.

The initially hidden window deferred the plugin's animation-frame synchronization; the pass invoked its normal synchronization method and then showed the test window for rendering. This is limited desktop evidence, not a startup-timing test, trusted hardware input test, pan/zoom acceptance, or Galaxy validation. Area erasing, selection transforms, native navigation, the full theme/viewport matrix, and the FER-47/48 prototypes still need host evidence.
