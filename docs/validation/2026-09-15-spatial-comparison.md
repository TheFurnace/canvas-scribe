# Spatial lookup comparison — FER-91

Recorded September 15, 2026 (America/New_York), from baseline `5ef5044`, on
`codex/FER-91/spatial-comparison`. This is a development-only experiment; production
stroke storage and lookup are unchanged.

## Results

On the synthetic 10,000-stroke Canvas fixture, both index prototypes reduce the
median CPU time of the measured eraser pipeline. RBush uses less retained index
memory than the tested grids. Neither index wins every workload.

| Measurement | Current cached scan | RBush | Grid, 256-unit cells |
| --- | ---: | ---: | ---: |
| Stroke eraser pipeline, median ms | 3.7170 | 0.8955 | 0.8357 |
| Area eraser pipeline, median ms | 3.6855 | 1.1455 | 1.0679 |
| Canvas eraser candidate lookup, median ms | 1.9050 | 0.0008 | 0.0008 |
| Cold load and first query, median ms | 9.9119 | 14.5708 | 16.4346 |
| 5% edit and next query, median ms | 4.1801 | 2.8941 | 2.6467 |
| Additional retained index heap, MiB | approximately 0 | 2.37 | 5.38 |

The same 256-unit grid is shown throughout this summary; it is not selected anew
for each row. The [full report](spatial-comparison/report.md) includes all three
grid sizes (64, 256, 1024), four scenes, and all document sizes.

RBush performs well on ordinary Canvas and note queries. In clustered handwriting,
RBush wins the small eraser query while Grid 256 wins the larger lasso query. The
grid also wins queries across the deliberately adversarial crossing-stroke scene,
where 2,000 giant bounding boxes overlap. Its overflow set prevents excessive
cell duplication. These are results for the implementations and fixtures tested,
not universal properties of trees or grids.

## Confidence and limitations

- Runtime: Node 24.19.0, Windows x64, Intel Core i9-13900K; RBush 4.0.1.
- Four deterministic scenes at 100, 1,000, 3,000 and 10,000 strokes; 80 points per
  stroke. Candidate identity and document order must match the current scan.
- Builds, first query, edits, synthetic fragments, undo, result sorting and memory
  are measured. The eraser pipeline includes production geometry and ordered-array
  reconciliation; it excludes rendering, persistence, history and input dispatch.
- Pipeline timing has only 15 measured samples per case. Its reported p95 is
  effectively the maximum and is sensitive to runtime/GC/scheduling outliers.
  In this run RBush's 10,000-stroke stroke-eraser maximum was 47.8 ms despite its
  0.90 ms median. Do not infer a frame-latency guarantee or a stable tail ranking.
- Memory is an approximate forced-GC heap delta from isolated processes. It
  excludes stroke objects and the bounds cache shared by all implementations.
- The pipeline fixture erases ordinary fountain ink. It does not establish the
  first-cut cost of a complex highlighter or physical Galaxy/S Pen responsiveness.

The evidence supports testing RBush and Grid 256 in a real-host A/B prototype.
RBush remains a reasonable memory-conscious candidate; the grid is a credible
alternative, particularly for heavily overlapping extents. Production adoption
needs correct invalidation across all edits, undo/redo, external replacements and
multi-view document lifecycles, plus real Obsidian and device measurements.

## Reproduce and verify

```powershell
pnpm bench:spatial
pnpm check
```

The complete benchmark passed candidate and erased-geometry equivalence checks.
`pnpm check` passed metadata validation, production build, and 283 tests across
41 files, including 10 new index correctness tests. Benchmark TypeScript checks
also passed. There are no production `src/` changes.

See [methodology and options](../spatial-comparison.md),
[timing data](spatial-comparison/results.json), and
[memory data](spatial-comparison/memory.json). Generated data uses UTC timestamps;
the final run was recorded at `2026-09-16T02:32:00.748Z`.
