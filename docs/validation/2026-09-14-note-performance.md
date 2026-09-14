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

These are deterministic happy-dom operation-count checks, not browser paint or
device latency measurements. Confirm sustained writing in real Obsidian on the
affected device, including Galaxy/S Pen if applicable, before closing FER-80.
History snapshots, serialization, and stroke-end bounds/layout still scale with
document size; broader long-document budgets remain in FER-59.

No beta version was bumped or published by this change.
