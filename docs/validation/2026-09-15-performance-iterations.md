# FER-86–90: five performance iterations

Base: `f437d59` (FER-84 highlighter stroke eraser), on top of performance PR #29.
Worktree: `dist/worktrees/performance-iterations`, branch
`codex/FER-86/performance-iterations`. These are local development changes; the
unchanged beta.13 metadata does not mean the published beta contains them.

## Changes, in measurement order

1. **FER-86 — note layout and selection bounds.** Flatten rendered components
   without unioning overlapping nibs just to find their extrema. Retain bounds
   in a WeakMap for immutable completed ink. Keys also check point-array identity,
   length, outline identity, brush size/type and pressure mode so live append and
   style changes invalidate the entry. Completed coordinate edits replace objects,
   matching the existing document-history contract. Only small bounds records are
   cached; full flattened polygons are not retained.
2. **FER-87 — distant eraser/lasso candidates.** Retain conservative sample bounds
   rather than allocating/traversing all coordinates on every eraser sample.
   Reject remote lasso candidates before generating geometry. Keep exact near-hit
   checks and the closed-boundary epsilon.
3. **FER-88 — overlapping lasso candidates.** A union is fully inside a lasso iff
   every component is inside; partial selection needs one intersecting component.
   Check components directly, skipping remote ones. Preserve frozen polygons and
   their holes, plus boundary-only touches.
4. **FER-89 — Canvas reconciliation.** Reuse completed SVG paths by immutable
   stroke identity; rebuild changed/live paths only. Preserve paint order,
   selection styling and overlays. Handle host DOM remounts and active-path
   reconciliation. This also makes Canvas undo/redo and area erasing retain
   unrelated ink paths.
5. **FER-90 — highlighter area clipping.** Merge adjacent nib components in groups
   of four before merging their boundaries, avoiding a single enormous overlap
   sweep. Use batching for long round highlighters and predominantly overlapping
   chisel nibs; sparse chisel strokes keep the cheaper one-shot union. Frozen
   outlines and other brushes keep the original path.

No document schema, release metadata or PDF persistence/recovery behavior changed.

## Source-operation measurements

Windows x64, Node 24.19.0. One warmup, three timed samples; medians. The first
benchmark has 500/3,000 fountain strokes with 80 points each and a separate
1,000-point round highlighter. Bounds/candidate results are repeated reads after
the warmup; they do not measure opening a cold document or browser presentation.

| Operation | Before (ms) | After (ms) |
| --- | ---: | ---: |
| Repeated content sizing, 3,000 strokes | 434.318 | 0.664 |
| Selected ink bounds, 3,000 strokes | 542.094 | 0.626 |
| 20 remote eraser samples, 3,000 strokes | 166.461 | 11.670 |
| Remote lasso, 1,000-point round highlighter | 4,628.093 | 0.003 |
| Partial lasso intersecting that highlighter | 4,092.440 | 5.946 |
| Full enclosing lasso around that highlighter | 4,114.970 | 39.151 |

The area benchmark separately compares original union-plus-cut against current
union-plus-cut on identical 1,000-point inputs, including component generation:

| Nib / sample spacing | Original (ms) | Current (ms) |
| --- | ---: | ---: |
| Round / 0.7 | 4,509.489 | 213.818 |
| Round / 20 | 214.144 | 137.859 |
| Chisel / 0.7 | 146.293 | 28.106 |
| Chisel / 20 | 15.338 | 15.051 |

The final full `eraseInk` medians were 214.892, 145.633, 29.493 and 17.332 ms
respectively. These include the intersection test and fragment construction;
the comparison columns above measure the same union-plus-cut work on both sides.
Earlier exploratory timings excluded component generation and used a smaller
eraser; the final measurements above supersede those estimates.

Reproduce by bundling `scripts/measure-performance-iterations.ts` or
`scripts/measure-highlighter-union.ts` with esbuild using
`--bundle --platform=node --format=esm --outfile=dist/measure.mjs`, then run
`node dist/measure.mjs`. The latter contains the original union reference.
Raw staged measurements are in [performance-iterations](performance-iterations/).

## Real Obsidian validation

Obsidian 1.12.7, Windows, 1024 × 800 viewport, disposable `fer-86-iterations`
vault. Trusted CDP pen input; requested interval 8 ms. These are instrumented
handler timings, not hardware-to-display latency or approved release budgets.

### Handwritten note

Reused the earlier 500-stroke / 40,000-point fountain fixture plus one text box
and the same 61-sample pen path. Earlier stroke-end maximum was 144 ms; this
run was **2.6 ms**. This comparison is across separate host runs, not a controlled
same-process A/B. Completed paths/text retained their DOM identity. Undo/redo/save
counts were 502 → 501 → 502. Subsequent text editing persisted.

At 3,000 existing strokes / 240,000 points, the same pen path measured pointerMove
max 0.2 ms, active-path update max 0.2 ms, and pointerUp max **9.3 ms**.
Undo/redo/save counts were 3,002 → 3,001 → 3,002. Reload retained 3,002 objects,
the edited text and 61-point new stroke. An initial run accidentally nested
timing wrappers; it was discarded and replaced by a fresh-reload single-wrapper run.

### Canvas

Seeded 3,000 strokes: two visible 1,000-point round/chisel highlighters and 2,998
remote 80-point fountain strokes. Repeated redraw before FER-89 measured
256.0 / 209.5 / 225.1 ms; after, **1.7 / 2.0 / 1.7 ms**. A trusted lasso around
part of the round stroke selected exactly that stroke. Completion went from
184.7 to **58.5 ms**, retaining all 3,000 path elements instead of zero.

Moving that selection retained the other 2,999 paths; undo restored the original
coordinate and redo/save restored the moved coordinate. Stroke erasing removed
only the target, preserved the chisel path and passed undo/redo/save checks.

Area erasing a round highlighter in the same 3,000-stroke fixture took
**5,001.1 → 209.7 ms** for the first hit; the next sample took 28.2 → 17.8 ms.
Both builds produced three fragments and 3,002 total strokes. The chisel path
was retained. Undo restored 3,000; redo and save restored 3,002. The final
screenshot visibly preserved the cut and remaining ink. Reload was also checked.

The final installed and built `main.js` SHA-256 matched:
`048f63c2cf4956ea7ccd923026b471e621007ca92fbeebd9fa73f9b297c6cc9f`.
Screenshots remain in the ignored named sandbox artifact directory.

## Verification and remaining limits

- `pnpm check`: version validation, production build, **40 test files / 273 tests**.
- Bounds oracle coverage includes every brush, empty/live/replaced geometry,
  transformed ink and frozen area fragments. Pen-up operation counts stay
  independent of completed ink count.
- Lasso oracle coverage includes concave regions, every brush, holes, partial/full
  inclusion and touching edges. Remote candidates do not render or rescan points.
- Batched-union tests compare symmetric-difference area for dense, sparse,
  self-crossing and repeated-dot paths plus area cuts. Comparison coordinates
  alone are rounded to 1e-7 to avoid near-coincident-edge instability in the
  oracle's XOR; allowed area difference is below 0.001 document square units.
- Canvas tests cover retained paths, paint order, selection styling, changed ink,
  DOM remount, active reconciliation, cancellation and history behavior.

The first large area cut still costs about 210 ms on this desktop fixture; full
long-highlighter selection and initial geometry generation also remain material.
This batch improves measured hotspots without claiming all plugin performance
issues are solved. Physical Galaxy/S Pen, controlled retained-memory stress,
large scanned-PDF/device coverage and product-approved budgets remain under FER-59.
