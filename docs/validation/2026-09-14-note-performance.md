# FER-80: Handwritten-note drawing performance

## Cause and change

At base `78c0c85`, every handwritten-note pointer movement calls the full page
renderer. It regenerates geometry for every stroke, replaces the ink/text DOM,
rewires text inputs, and measures text layout and document bounds. Work increases
with completed content. Canvas already retains its DOM and batches updates to
the active path using requestAnimationFrame.

The note editor now appends one live ink element, keeps completed content in
place, and updates only that path once per animation frame. Coalesced input
samples are retained, with one coordinate measurement per event. Pen lift,
cancellation, and lost capture finalize geometry and refresh page/text bounds.
Undo, document replacement, and disposal cancel pending ink callbacks.

## Automated evidence

`pnpm check` passed: version validation, production build, 36 files / 221 tests.
Ten new DOM regressions cover:

- 0, 10, 100, and 500 existing 60-sample strokes plus a text box. Twenty movement
  events produce zero geometry calls before the animation frame, then exactly
  one geometry call for live ink. Existing DOM is retained and text scrollHeight
  is not measured during these movements.
- Mixed ink/text layer order, final path geometry, one change notification at
  lift, and undo/redo.
- Coalesced positions, pressure and tilt, page growth, and finalization before
  a scheduled frame on pointerup, pointercancel, and lostpointercapture.
- Pending-frame cancellation during document replacement, undo, and disposal.

## Remaining acceptance

The automated checks are deterministic happy-dom operation counts, not browser
paint or device latency measurements. The desktop host smoke test below passed;
confirm sustained writing on the affected device, including Galaxy/S Pen if
applicable, before closing FER-80.
History snapshots, serialization, and stroke-end bounds/layout still scale with
document size; broader long-document budgets remain in FER-59.

No beta version was bumped or published by this change.

## Real Obsidian sandbox smoke test

Passed in Obsidian 1.12.7 on Windows using the isolated `fer-80-smoke` sandbox
from this worktree and source commit `ba7cf2d`. The installed build was verified
against local artifacts (main.js SHA-256
`26a301af0806a48ef734f96f38c252302d62d63cdcd7281d6373b9f42fb0daa9`).
The manifest remains beta.11; this is the local fix, not the published beta.11.

- Cleared the new sandbox's trust prompt and created `Untitled.scribe` through
  the plugin's Obsidian command.
- Drew 30 consecutive, distinct 61-sample strokes through the existing CDP pen
  driver with pressure 0.2-0.9 and tilt X=25 / Y=-15. All 1,800 move events were
  trusted pen events. All 30 strokes / 1,830 total samples persisted.
- Temporary instrumentation observed zero full page renders across the drawing
  run and retained the same page DOM element. No window errors were captured.
- First five versus last five strokes: pointerMove mean 0.037 vs 0.028 ms,
  p95 0.10 vs 0.10 ms; active-path update mean 0.093 vs 0.084 ms,
  p95 0.20 vs 0.20 ms. These are instrumented synchronous method durations,
  not pen-to-display latency or an approved performance budget. CDP interval
  was zero; event acknowledgments still govern delivery cadence.
- Clicked the real toolbar Undo (29 model objects / paths) and Redo (30).
- Reloaded the app after verifying the save. The note reopened with all 30
  strokes, 1,830 samples, pressure and tilt intact; 30 rendered paths and no
  dialog remained. Reload also removed temporary instrumentation.
- Visually inspected screenshots before and after reload; the 30 wave strokes
  remained visible and correctly positioned.

Generated evidence is under `.canvas-scribe-sandbox/artifacts/fer-80-smoke/`:
`results.json`, `reopened.json`, `30-strokes.png`, `reopened.png`, and input paths.
The sandbox remains open for inspection. Physical-device validation is pending.
