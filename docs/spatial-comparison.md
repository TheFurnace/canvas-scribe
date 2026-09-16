# Spatial lookup experiment

FER-91 compares the original cached-bounds scan with two index prototypes. All use
the production conservative stroke bounds and must return identical stroke
references in the original document order. FER-92 now adopts RBush 4.0.1 as a
runtime dependency for erasing and selection across all three drawing surfaces.
See the [production validation](validation/2026-09-15-rbush-index.md).

## Run

From this worktree, with Node 22 or newer:

```powershell
pnpm bench:spatial
```

This type-checks the benchmark, bundles it, runs timing/correctness comparisons,
then runs retained-memory cases in separate Node processes with explicit GC.
Outputs go to `dist/spatial-comparison/`:

- `report.md`: generated comparison tables and methodology.
- `results.json`: query distributions, build/edit/undo costs, candidate counts and
  production eraser-pipeline timings.
- `memory.json`: incremental retained heap measurements and grid occupancy.

For a shorter development pass:

```powershell
pnpm bench:spatial --quick
pnpm bench:spatial --sizes=1000,3000 --skip-memory
pnpm exec vitest run tests/spatial-comparison.test.ts
```

The quick pass uses fewer document sizes/query samples; the eraser pipeline still
checks 1,000 and 10,000 strokes. The memory pass measures 10,000 strokes by default
and 3,000 in quick mode. Use `--skip-memory` when only checking timing changes.

## Implementations

- **Current scan:** scans the ordered array and calls the production cached
  `strokeCandidateBounds` before the intersection check. It lazily computes bounds
  on first query. Warm query measurements isolate this lookup kernel; the eraser
  pipeline separately runs the unchanged production `eraseInk` implementation.
- **RBush:** bulk-loads bounds into a dynamic R-tree with the default node size 9.
  A stroke-reference map supports removal of old entries and insertion of new
  immutable values. Query results are filtered and sorted back into document order.
- **Uniform grid:** three document-space cell sizes, 64/256/1024. A stroke can
  occupy up to 64 cells; larger extents use an overflow set scanned on each query.
  Queries exceeding 4,096 cells scan all entries. Results are deduplicated, checked
  against exact bounding boxes, filtered and sorted. The overflow policy is shared
  across all grid configurations; it bounds memory for enormous Canvas strokes.

The grid policy was tightened after the pilot showed that a 4,096-cell-per-stroke
limit allowed substantial reference duplication. Committed results use the final
64-cell cap. It remains one implementation/design choice, not a universal grid result.

## Fairness and correctness

- Four deterministic scenes and 100/1,000/3,000/10,000 strokes. Each stroke has 80
  samples. Scenes cover spread Canvas ink, clustered handwriting, long notes and
  intentionally adversarial crossing strokes with huge overlapping bounds.
- Include eraser hits, empty space, larger lasso and viewport queries. Include
  highlighter-only filtering, negative coordinates and frozen cut outlines.
- Include result ordering and deduplication costs. Rotate implementation order
  across cases and eraser-pipeline rounds. Warm up shared geometry before measuring.
- Include a 5% edit batch (moves, deletions and synthetic split replacements),
  immutable array work, incremental updates, undo and reload. Report edit plus next
  query so the scan's deferred bounds calculation is not hidden.
- Cold timings include bounds generation and index loading, but exclude parsing
  files and creating the input fixture. Memory excludes the shared document and
  common bounds cache; forced-GC heap deltas are approximate.
- The eraser pipeline compares resulting geometry against production `eraseInk`;
  generated fragment IDs are ignored for equality. It includes candidate lookup,
  geometry, immutable array reconciliation and index updates, but excludes DOM,
  save/history, pointer dispatch and the separate long-highlighter first-cut cost.

The ten regression tests compare candidate identity/order before and after edits,
undo and reload, plus boundaries, empty ink, overflow, and live-append refresh.
The benchmark aborts on candidate or erased-geometry differences.

## Interpreting the result

Use the generated report alongside the checked-in
[recorded experiment](validation/2026-09-15-spatial-comparison.md).
Compare the complete eraser pipeline and memory/edit tradeoffs as well as raw
lookup speed. A faster query is not the same as a faster presented frame.

The production integration maintains the index through edits, undo/redo, external
replacement and live input, preserving ordered arrays, precise hit tests and the
document schema. PDF queries use separate page partitions. Physical Galaxy/S Pen
acceptance remains separate from desktop measurements.

## Production sandbox validation

Use a disposable named sandbox; the runner replaces its Canvas fixture:

```powershell
pnpm sandbox -Name rbush-adoption
# Inspect the named vault and accept its trust dialog before input.
node scripts/run-spatial-sandbox.mjs rbush-adoption --production
node scripts/report-spatial-sandbox.mjs .canvas-scribe-sandbox/artifacts/rbush-adoption/spatial
```

This measures the installed production index without the experimental adapter.

## Real Obsidian sandbox experiment

See the [recorded real-host results](validation/2026-09-15-spatial-sandbox.md).

The following three-way adapter instructions apply to historical commit `206f1c8`,
before production adoption. Its build guard intentionally rejects the changed
production eraser call; use that revision to reproduce the original comparison.
Use a disposable named sandbox. The explicit experimental build
replaces only the Canvas eraser call at build time, importing the adapter from
`scripts/spatial/sandbox-adapter.ts`. It writes directly to that generated vault;
the normal production build and `src/` files remain unchanged.

```powershell
pnpm sandbox -Name spatial-ab
# Inspect; accept the fresh vault's trust dialog if present.
pnpm sandbox:agent inspect --name spatial-ab
node scripts/build-spatial-sandbox.mjs spatial-ab
# Reload only that sandbox using Obsidian's Reload app command.
node scripts/run-spatial-sandbox.mjs spatial-ab --quick
node scripts/run-spatial-sandbox.mjs spatial-ab
node scripts/run-spatial-sandbox.mjs spatial-ab --lifecycle
node scripts/report-spatial-sandbox.mjs .canvas-scribe-sandbox/artifacts/spatial-ab/spatial
```

The runner replaces ink and removes cards in the named fixture Canvas. It injects
deterministic document fixtures outside timing, then erases through trusted CDP pen
input. It requires an idle Canvas with the experiment build loaded, no dialogs, and
the default 1024 × 800 sandbox window; gestures target fixed viewport coordinates.
Do not draw or pan while a run is active. Results remain in the named artifact
folder; the quick and full runs use the same output filename, while lifecycle
checks have a separate file. Full runs record one warmup and three measured
gestures per combination, rotating the algorithm order.

The adapter exposes `globalThis.__scribeSpatial` only in the experiment build. It
uses the original `eraseInk` for the scan and precise candidate geometry, maintains
document ordering across repeated cuts, and rebuilds on array replacement. Warm
runs report index preparation separately; lifecycle probes include cold first use
and a new erase after undo. This is not complete production invalidation for live
in-place stroke mutation or other tools/surfaces.

Timing covers eraser work and synchronous Canvas SVG updates. Input latency,
compositor presentation, Android and physical S Pen performance are not measured.
Post-timing checks compare geometry with production, history and persisted data.
Restore the standard sandbox build with `pnpm sandbox:prepare --name spatial-ab`
after `pnpm build`, then reload the sandbox.
