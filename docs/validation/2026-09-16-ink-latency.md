# FER-93: Galaxy S Pen latency experiment

## Purpose and scope

User reports a roughly 1 cm tip-to-ink gap when moving fast on Galaxy Tab with S Pen in Canvas and handwritten notes, similar across tools, which catches up when stationary. Samsung Notes is the user's lower-latency comparison. The experiment is based on main d54ec3d, including the prior history, retained-rendering, bounds and spatial-index work. It does not claim to match Samsung Notes or reduce measured physical latency yet.

## Device A/B procedure

Install the test build, restart Obsidian and open a disposable Canvas or handwritten note. Both options start OFF and reset to OFF on reload. Commands apply to strokes started after the command.

1. Run **Canvas Scribe: Toggle ink latency recording**. Confirm the ON notice.
2. With prediction still OFF, draw several fast straight lines, small letters, circles and sharp corners. Stop while keeping the pen touching, then lift. Repeat on both surfaces.
3. Run **Canvas Scribe: Toggle predicted ink tip (experimental)**. Confirm ON and repeat the same strokes at the same zoom and pen size. Watch for a smaller trailing gap, overshoot at corners/stops, or a jump on lift. Compare with Samsung Notes at a similar visible stroke width and zoom.
4. Toggle prediction OFF and repeat to distinguish a consistent improvement from warmup or speed variation. Keep timing recording ON for both conditions. Also compare feel with recording OFF if its overhead is a concern.
5. Lift the pen, run **Canvas Scribe: Export debug report**, and share both generated Markdown files from `Canvas Scribe Debug`. Include Tab model, Android/One UI/WebView and Samsung Notes versions, refresh-rate setting, battery saver, surface, pen type and subjective A/B result. The report provides fields for this comparison.

No remote transmission is performed. Captured timing summaries exclude raw coordinates, pressure/tilt streams, document names and text. Existing debug events remain subject to the report's existing privacy statement. Only completed/canceled gesture summaries are exported; lift before export. Clear debug history before a fresh comparison if needed.

## Implementation

One session-only controller is passed to Canvas and note editors. With both toggles off, no diagnostic/prediction session is created. Diagnostics alone leaves path geometry identical. No tool preferences, document schemas, PDF drawing, final stroke renderer, or saved sample format are changed.

Prediction uses up to three actual screen-coordinate samples. It requires sane monotonic timestamps, short sampling intervals, motion over 0.08 CSS px/ms and reasonably consistent direction/speed. Stops, reversals, sharp turns and large speed changes suppress extrapolation. Browser-provided predictions within 16 ms of the newest sample are preferred; an unavailable/throwing method or unusable predictions uses the capped recent-velocity fallback. Displacement is capped at 24 CSS pixels before transformation to Canvas/note coordinates. These are conservative experimental controls, not measured optimal device settings or release budgets.

Only a temporary stroke/point array passed to SVG generation receives a predicted endpoint, with actual pressure and tilt retained. The document always holds actual input. A timer invalidates the preview after 40 ms without fresh samples and schedules its retraction on the next animation frame. The next actual event replaces the prediction; stop events immediately suppress it. Lift, cancellation, lost capture, undo/reset, document replacement and disposal clear the session/timer. Canvas now handles lost capture explicitly and finalizes before releasing capture to avoid reentrant finalization.

This remains the existing full-stroke SVG renderer. Long pencil strokes can still be expensive; no incremental geometry or raster architecture was introduced. Prediction may cause visual overshoot or finalization corrections, hence the opt-in A/B design.

## Meaning of recorded timings

Each `ink-latency/stroke` entry identifies surface, tool, A/B mode, event and frame counts, native/fallback frame counts, native API availability, invalid timestamp counts and termination reason. Each timing has a whole-gesture mean/max and p95 over its latest 256 observations:

- `inputAge`: newest actual sample timestamp to the observation hook inside the pointer handler; includes work before that hook. `oldestInputAge` shows the oldest sample in the delivered batch.
- `renderAge`: newest observed sample timestamp to the start of the active SVG update.
- `frameWait`: time since the first input observation pending that update. The initial immediate pen-down path is not separately timed.
- `renderWork`: synchronous temporary preview construction, geometry generation and SVG attribute update. Browser path parsing deferred beyond the update, layout, paint, compositing and display are excluded.
- `activeRenderInterval`: time between actual active-path updates, including expiry retraction. This is not continuous display cadence: sparse input and pauses also enlarge it, so it cannot alone establish dropped frames.

Timestamp validation rejects non-finite, epoch-like, stale or incompatible time origins rather than reporting fabricated ages. Renderer timings do not measure physical tip-to-display latency. High-speed external camera evidence and device acceptance remain under FER-59.

## Automated validation

Full build/version/test checks pass (45 files / 320 tests). Nineteen new regressions cover preview/model separation, native/fallback selection, projection/distance cap, inactivity retraction, stop/corner/reversal suppression, invalid and duplicate timestamps, diagnostics-only identity, privacy, final geometry, serialization during active prediction, undo/redo, lost capture and undo mid-stroke across Canvas and notes. Existing note replacement/disposal and completed-path retention coverage also passes.

## Real Obsidian smoke evidence

Isolated generated vault `fer-93-latency`, Obsidian 1.12.7 on Windows, 1024 x 800. Trusted CDP pen input requested 8 ms spacing; actual acknowledgments and app scheduling govern delivery. This does not simulate Galaxy/S Pen timing.

- Canvas: baseline and predicted 61-sample fountain strokes persisted beside the four-sample fixture. Predicted stroke: 60 live frames, 48 native / 8 fallback predicted frames. Temporary inspection counted 56 extended previews and zero document sample-array mutations. Undo/redo gave 3 -> 2 -> 3 strokes; disk and reload retained sample counts [4,61,61].
- Note: predicted 61-sample stroke; 60 live frames, 48 native / 9 fallback predicted frames. Undo/redo gave 1 -> 0 -> 1; save/reload retained all 61 actual samples and tilt X=25.
- Across those predicted strokes, temporary instrumentation observed 113 extended previews and zero sample-count mutations. No captured window errors. Instrumentation was removed by reload.
- Stop without lift: a separate 12-sample trusted pen gesture had a predicted tip immediately after input; after 100 ms with no new input, the tip was absent, path geometry retracted, and actual samples stayed at 12. Then the pen was released normally.
- Exported debug report contained timing fields. Restart restored both experiment toggles to OFF. Before/after Canvas/note screenshots were visually inspected for visible strokes and placement.
- Example synchronous live render work means: Canvas baseline 0.108 ms, Canvas prediction 0.095 ms, note prediction 0.078 ms. These individual short-stroke observations do not establish a speedup, device latency, or a statistically controlled benchmark.

Committed compact evidence is in `ink-latency/` alongside this document. Input paths, inspection scripts and screenshots are in ignored `dist/latency-host/` and `.canvas-scribe-sandbox/artifacts/fer-93-latency/` in this worktree.

## Delivery and remaining acceptance

Version metadata is synchronized to locally prepared 2.0.0-beta.15, selected after querying remote tags (highest published beta.14 at preparation). The version is not reserved until publication; recheck tags before pushing. The local package contains main.js, manifest.json and styles.css. No branch/tag push or release publication is part of this local preparation.

Device A/B, native-prediction availability on the actual Android WebView, overshoot/handwriting quality, long pencil strokes, palm/button behavior, and Samsung Notes comparison remain unverified. The user can install the ZIP manually or approve publication for BRAT distribution.

### Final packaged artifact

`pnpm package` reran version validation, production compilation and all 320 tests successfully for beta.15. The ZIP entries were verified as main.js, manifest.json and styles.css. The final package build was reinstalled in the named sandbox and reloaded; the toggles reset OFF and saved Canvas counts [4,61,61] and note counts [61,12] reopened (the second note stroke is the stop test). This final recheck follows a packaging rebuild of the same source, so the detailed timing run above uses an earlier local build ID.

Final main.js and sandbox-installed main.js share SHA-256 `543859676f14d6131e6953065a34a57d22de3d0aaac78dd4fbfde23539670eb3`.
ZIP SHA-256: `ca2e453437165b7991036c85c3b607049f1cc58cd6bde2eabda894ba407982a3`.
