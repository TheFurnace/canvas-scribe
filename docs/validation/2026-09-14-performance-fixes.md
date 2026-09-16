# FER-81–83: history, PDF input, and note edit performance

Base: `787287b` (FER-80 / PR #28). The three linked issues address the four measured findings from the performance review. No version bump or release is included.

## Changes

- **FER-81:** Canvas and handwritten-note history share completed ink values. Every completed ink edit replaces its value. Text boxes still receive independent snapshots because their fields are mutable; a live stroke receives a deep copy if a checkpoint occurs during drawing. Undo storage remains bounded to 100 snapshots.
- **FER-82:** PDF gestures preserve unchanged stroke identities, clip only changed/new ink, and compare identities instead of serializing the document twice. Completed SVG paths survive redraws. Pen-move frames update only the live path; full reconciliation remains for content/selection/viewport changes. Full renders group strokes by page once, and unmounting removes cached paths for that page.
- **FER-83:** Note edit callbacks invalidate the serialization cache and request a save. Serialization occurs when Obsidian asks for data, with explicit viewport/live-gesture handling. Erasing, selection changes and movement retain unaffected ink and text DOM; input listeners are installed once. Undo resets the text editing checkpoint boundary even if the textarea stays focused.

No persistence schema changed. Malformed/future files retain their existing preservation behavior. PDF source verification and conflict recovery remain intact.

## Automated verification

`pnpm check` passed: synchronized version metadata, production build, **36 test files / 243 tests**. `git diff --check` passed.

New coverage includes:

- Shared Canvas/note ink across snapshots; independent mutable text/live-ink copies; Canvas undo/redo geometry.
- PDF live-frame operation counts with 0/100/500 existing strokes: exactly one path generation, no page-rectangle reads in the frame, one clipped new stroke at pen-up, unchanged object and DOM identities.
- Empty eraser/stationary selection no-ops; PDF rotation cancellation and offscreen remounting.
- Deferred note serialization for text bursts, cached repeat reads, viewport changes, close, and save during active ink.
- Focused text editing after undo; remote ink retention during stroke/area erasing; original geometry restored by undo.

## Node measurements

Windows x64, Node v24.19.0. Same deterministic 80-point fountain-stroke geometry as the review. Two warmups, seven timed samples; medians below. Retained memory uses 100 checkpoints and explicit GC, one run per size.

| Operation | Review, 500 strokes | Revised, 500 strokes | Review, 3,000 strokes | Revised, 3,000 strokes |
| --- | ---: | ---: | ---: | ---: |
| Heap retained by 100 history snapshots | 435.8 MiB | 0.27 MiB | 2,615.2 MiB | 2.29 MiB |
| Geometry on a drawing frame | 15.66 ms (all completed ink) | 0.040 ms (one live path) | 91.82 ms | 0.033 ms |
| PDF pen-up geometry | 77.52 ms (clip page) | 0.37 ms (clip new ink plus identity comparison) | 458.15 ms | 0.51 ms |

The old PDF equality check also cost 16.57/101.79 ms for 500/3,000 strokes; it has been removed. This table compares the work chosen by each implementation, not equal-sized function calls or end-to-end browser latency. The revised benchmark reproduces the layer's changed-only clipping loop; DOM regression tests independently verify the real layer calls it for only new ink. GC deltas are runtime-dependent. The memory fixture represents repeated edits to an already populated document, not gradual growth from zero.

Run:

```powershell
node_modules/.bin/esbuild scripts/measure-performance.ts --bundle --platform=node --format=esm --outfile=dist/measure-performance.mjs
node --expose-gc dist/measure-performance.mjs
```

Raw results are in `performance-fixes/` beside this document, along with the review baseline and host observations.

## Real Obsidian checks

Named disposable vault: `fer-81-performance`, in this worktree. Obsidian **1.12.7**, Windows, viewport **1024 × 800**. Trust prompt accepted for this generated vault. Trusted CDP pen input used 61 samples per stroke, pressure 0.2–0.8, tilt X=25/Y=-15, and an 8 ms requested interval. This is simulated pen input, not physical S Pen testing.

### Handwritten note

- Seeded 500 strokes / 40,000 points plus one text box, then drew one 61-sample stroke.
- All completed paths remained connected. Undo/redo changed object counts **502 → 501 → 502**. The same textarea remained mounted, and a subsequent text edit persisted.
- Instrumented pointerMove mean **0.040 ms**, max **0.30 ms**; active-path update mean **0.079 ms**, max **0.20 ms**.
- Stroke-end work is still material: instrumented pointerUp max **144 ms**, primarily the existing full-document bounds/text layout work. This change does not establish a long-note latency pass.
- Final save and restart retained **502 objects**, edited text, the **61 samples** of the new stroke, and tilt X=25.

The first host run caught an implementation bug: the initial cache used the name `dirty`, which collided with TextFileView runtime state. The corrected code uses `serializationPending`; a regression explicitly clears the host-owned `dirty` field before reading save data. After correction, model, cache and disk contents matched. Earlier stale-save observations are excluded from final success evidence.

### PDF

- Generated a four-page native PDF fixture and seeded 500 strokes on page 1. Drew one 61-sample stroke.
- All 500 completed path elements and stroke identities remained unchanged. Undo/redo and disk counts were **501 → 500 → 501**, without session errors.
- Instrumented pointerMove mean **0.055 ms**, max **0.30 ms**; pointerUp max **0.70 ms**, excluding asynchronous save completion. Full reconciliation max **2.0 ms** across the measured drawing/undo/redo run. The move-only animation frames do not call that full renderer.
- Restart reopened **501 annotation paths/strokes** with no session error. Screenshot inspection confirmed visible annotations over the native PDF.

### Canvas

- On the final build, drew two 61-sample strokes in the fixture Canvas, which already contained one stroke. History shared the prior completed stroke. Undo/redo yielded **3 → 2 → 3**, and the saved Canvas contained all three strokes.

The final built and sandbox-installed `main.js` SHA-256 matched:
`243db6da6b39f5437e491b25a78082d8967120f9fa686274a2db44a3664f29ce`.
The detailed timing run preceded the final small note area-eraser identity/text-DOM refinements; final-build restart and Canvas checks passed after those refinements. Those note cases also pass automated coverage. Generated screenshots and connection records remain under `.canvas-scribe-sandbox/artifacts/fer-81-performance/`.

## Remaining acceptance

FER-81–83 are ready for review; FER-59 remains the broader acceptance gate. Physical Galaxy/S Pen, Android sync, multiple-view stress, representative scanned PDFs, and product-approved budgets are not certified here. The review's additional unmeasured candidates—embed discovery scans, companion indexing, note viewport culling and stroke-end bounds/layout—remain follow-up profiling work. No raster-cache architecture was introduced.
