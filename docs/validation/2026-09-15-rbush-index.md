# FER-92: Production RBush adoption

RBush now supplies conservative candidates for erasing and lasso/rectangle
selection in Canvas, handwritten notes and PDF annotations. Existing precise
geometry predicates remain authoritative. Saved data and history contain only
the original ordered objects; the index is a derived, view-owned cache.

## Implementation

- Reconcile immutable replacements once, refreshing live ink and measured text
  explicitly. Same-array drawing appends insert only the new objects.
- Update after eraser fragments, movement, history and external replacements.
- Sort candidates into document order; partition PDF queries by page.
- Keep the existing note stroke eraser's centerline behavior for cut outlines.
- Bundle RBush's ESM entry in production and Storybook.

## Checks

`pnpm check` passed: 299 tests across 43 files, TypeScript, production build and
release metadata. Storybook also built successfully. Regression coverage includes
scan equivalence, geometry boundaries, mutations, live endpoints, text reflow,
repeated cuts, history, external replacements and page isolation.

Real Obsidian 1.12.7 (Electron 39.8.3, Chromium 142), 1024 x 800 desktop viewport,
disposable vault `rbush-adoption`, trusted CDP pen events:

- Canvas: 10,000-stroke erasing benchmark; 300 ordered candidate comparisons;
  untouched chisel path identity, complete saved geometry and undo/redo checked.
  Lasso selected two cut fragments; move, erase at the moved location and history
  all passed.
- Notes: 1,001 objects; erasing, lasso, movement and history passed. Real textarea
  input expanded indexed text bounds from maxY 298 to 1,503. After app reload,
  newly drawn ink was immediately indexed at its final endpoint and erased there.
- Native PDF: two pages with overlapping stroke coordinates; erasing, selection,
  movement and history affected only the active page and retained document order.
- Reload: Canvas/note saved-data SHA-256 and reloaded PDF session SHA-256 matched
  before/after reload. The first note probe ran before the lazy view had loaded;
  rerunning after activation passed without a source change.

Final installed production bundle SHA-256:
`A21B04C28692901A90F7384EE5F9B4C105DE5D73E36910F6202678B6F8D1AF0C`.

## Measurements

Same sparse-visible-ink fixture as FER-91: two visible 1,000-point highlighters
and 9,998 remote 80-point strokes. Median of three measured 13-point gestures
after one warmup per scenario. Total is cumulative handler CPU time, not frame
latency; peak is the slowest handler in each gesture.

| Scenario | Production total (ms) | Production peak (ms) | Earlier scan total (ms) |
| --- | ---: | ---: | ---: |
| Empty space | 0.80 | 0.20 | 54.8 |
| Whole round highlighter | 16.40 | 15.40 | 69.3 |
| Area round highlighter | 486.60 | 198.00 | 540.4 |

Baseline and production were separate runs. Measurements preceded the final
append fast path and invalid-bounds guards; those changes do not alter these
queries over valid, already indexed fixtures. The complete check and live-input
probe ran against the final build.

Area erasing a long highlighter still spends substantial time in exact geometry;
RBush removes broad lookup work but does not resolve that remaining pause.
Physical Galaxy/S Pen latency and Android behavior remain unverified.

## Evidence

See [raw benchmark](rbush-index/results.json), [generated report](rbush-index/report.md),
[Canvas](rbush-index/host-results.json), [note](rbush-index/note-results.json),
[PDF](rbush-index/pdf-results.json), [live endpoint](rbush-index/live-results.json),
and reload digests [before](rbush-index/before-reload.json) /
[after](rbush-index/after-reload.json).

Run the production benchmark with the commands in
[spatial comparison](../spatial-comparison.md#production-sandbox-validation).
