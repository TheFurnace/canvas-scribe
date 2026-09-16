# Spatial lookup comparison

Generated 2026-09-16T02:32:00.748Z. v24.19.0, win32/x64, 13th Gen Intel(R) Core(TM) i9-13900K. RBush 4.0.1, default node size 9. FULL run.

All timings are milliseconds. Candidate-query cells show **median / p95**, including exact bounding-box filtering, highlighter filtering, deduplication and original stroke ordering. These are Node CPU measurements, not Obsidian presentation or Galaxy/S Pen latency.

## Candidate queries at 10,000 strokes

| Fixture / query | Cached scan | RBush | Grid 64 | Grid 256 | Grid 1024 |
| --- | --- | --- | --- | --- | --- |
| canvas: eraser | 1.9050 / 2.1933 | 0.0008 / 0.0019 | 0.0010 / 0.0022 | 0.0008 / 0.0017 | 0.0027 / 0.0052 |
| canvas: empty | 1.9736 / 2.2979 | 0.0001 / 0.0002 | 0.0004 / 0.0009 | 0.0002 / 0.0004 | 0.0002 / 0.0003 |
| canvas: lasso | 2.0223 / 2.3415 | 0.0016 / 0.0034 | 0.0072 / 0.0112 | 0.0026 / 0.0044 | 0.0042 / 0.0082 |
| canvas: viewport | 2.0252 / 2.3132 | 0.0088 / 0.0183 | 0.0579 / 0.0891 | 0.0152 / 0.0187 | 0.0122 / 0.0186 |
| clusters: eraser | 1.8463 / 2.1114 | 0.0153 / 0.0306 | 0.0203 / 0.0479 | 0.0313 / 0.0530 | 0.0353 / 0.0702 |
| clusters: empty | 1.8975 / 2.1497 | 0.0001 / 0.0003 | 0.0005 / 0.0010 | 0.0003 / 0.0006 | 0.0004 / 0.0011 |
| clusters: lasso | 1.9587 / 2.2262 | 0.0850 / 0.1002 | 0.1332 / 0.1758 | 0.0577 / 0.0725 | 0.0396 / 0.0871 |
| clusters: viewport | 1.9564 / 2.2331 | 0.0863 / 0.1067 | 0.1685 / 0.2059 | 0.0644 / 0.0779 | 0.0468 / 0.1005 |
| note: eraser | 2.0263 / 2.4117 | 0.0015 / 0.0025 | 0.0015 / 0.0038 | 0.0016 / 0.0033 | 0.0059 / 0.0088 |
| note: empty | 2.0970 / 2.4212 | 0.0001 / 0.0001 | 0.0004 / 0.0010 | 0.0002 / 0.0003 | 0.0002 / 0.0003 |
| note: lasso | 2.1526 / 2.5084 | 0.0048 / 0.0065 | 0.0105 / 0.0219 | 0.0047 / 0.0080 | 0.0067 / 0.0126 |
| note: viewport | 2.1210 / 2.4625 | 0.0199 / 0.0266 | 0.0660 / 0.1378 | 0.0212 / 0.0271 | 0.0161 / 0.0218 |
| crossing: eraser | 2.0191 / 2.4393 | 0.2733 / 0.3316 | 0.0610 / 0.0765 | 0.0564 / 0.0682 | 0.0625 / 0.0772 |
| crossing: empty | 2.0709 / 2.3681 | 0.0003 / 0.0009 | 0.0281 / 0.0339 | 0.0262 / 0.0329 | 0.0275 / 0.0354 |
| crossing: lasso | 2.1595 / 2.5043 | 0.2949 / 0.3761 | 0.0733 / 0.0861 | 0.0625 / 0.0753 | 0.0661 / 0.0818 |
| crossing: viewport | 2.1751 / 2.4771 | 0.3042 / 0.3824 | 0.1785 / 0.2165 | 0.0887 / 0.1061 | 0.0825 / 0.1081 |

## Canvas eraser-query scaling

| Strokes | Cached scan | RBush | Grid 64 | Grid 256 | Grid 1024 |
| --- | --- | --- | --- | --- | --- |
| 100 | 0.0151 / 0.0164 | 0.0003 / 0.0005 | 0.0004 / 0.0007 | 0.0006 / 0.0009 | 0.0005 / 0.0006 |
| 1000 | 0.1669 / 0.1858 | 0.0005 / 0.0009 | 0.0006 / 0.0012 | 0.0005 / 0.0010 | 0.0004 / 0.0009 |
| 3000 | 0.5451 / 0.6344 | 0.0006 / 0.0008 | 0.0006 / 0.0013 | 0.0004 / 0.0008 | 0.0011 / 0.0017 |
| 10000 | 1.9050 / 2.1933 | 0.0008 / 0.0019 | 0.0010 / 0.0022 | 0.0008 / 0.0017 | 0.0027 / 0.0052 |

## Build and edit costs at 10,000 strokes

Medians. Warm build uses already cached bounds. Cold load + first query includes computing fresh bounds, but excludes creating/deserializing the input objects. The 5% edit includes immutable transforms, synthetic split replacements and ordered-array reconciliation shared by all approaches; index-only time is a subset. Undo assumes the previous document array is available from history.

Edit + next query also includes the scan's deferred bounds calculation for changed strokes.

| Fixture | Algorithm | Warm build | Cold load + query | 5% edit | Edit + next query | Index update only | Undo index only |
| --- | --- | --- | --- | --- | --- | --- | --- |
| canvas | grid-256 | 7.2439 | 16.4346 | 2.6411 | 2.6467 | 1.2749 | 0.7966 |
| canvas | grid-1024 | 7.1714 | 22.7511 | 2.4174 | 2.4281 | 1.0700 | 0.5588 |
| canvas | scan | 0.0001 | 9.9119 | 1.2527 | 4.1801 | 0.0030 | 0.0023 |
| canvas | rbush | 7.6082 | 14.5708 | 2.8906 | 2.8941 | 1.5788 | 0.9365 |
| canvas | grid-64 | 13.5147 | 33.0020 | 3.3251 | 3.3307 | 2.0835 | 1.7709 |
| clusters | grid-64 | 10.8051 | 23.2010 | 2.7921 | 2.8234 | 1.5660 | 1.2377 |
| clusters | grid-256 | 7.6161 | 23.4037 | 2.5545 | 2.6033 | 1.2015 | 0.5145 |
| clusters | grid-1024 | 6.0044 | 17.2673 | 3.0484 | 3.1421 | 1.0803 | 0.4521 |
| clusters | scan | 0.0001 | 9.8969 | 1.0885 | 3.6714 | 0.0029 | 0.0020 |
| clusters | rbush | 7.5976 | 21.0983 | 3.5164 | 3.5501 | 2.1907 | 1.1635 |
| note | rbush | 7.1845 | 14.4435 | 2.9400 | 2.9469 | 1.7249 | 1.0024 |
| note | grid-64 | 13.3990 | 26.4217 | 3.6246 | 3.6335 | 2.1733 | 1.3376 |
| note | grid-256 | 6.7207 | 15.0555 | 3.8220 | 3.8326 | 1.0667 | 0.6584 |
| note | grid-1024 | 10.5316 | 13.6626 | 3.4657 | 3.4814 | 1.1109 | 0.4578 |
| note | scan | 0.0001 | 10.9224 | 1.4111 | 4.6740 | 0.0028 | 0.0015 |
| crossing | scan | 0.0001 | 16.4395 | 1.3398 | 4.5824 | 0.0028 | 0.0017 |
| crossing | rbush | 14.0034 | 21.8908 | 6.0148 | 6.5780 | 3.2010 | 2.1972 |
| crossing | grid-64 | 12.8329 | 32.4847 | 4.0961 | 4.3813 | 2.7135 | 1.4951 |
| crossing | grid-256 | 7.1065 | 22.8290 | 3.0558 | 3.2167 | 1.4978 | 0.7855 |
| crossing | grid-1024 | 5.8489 | 14.8577 | 2.8070 | 3.0295 | 1.2947 | 0.4868 |

## Eraser pipeline

Candidate lookup + production eraseInk geometry + ordered-array reconciliation + index maintenance. Excludes rendering, history checkpoints, saving and pointer-event dispatch. Ten warmup rounds, fifteen measured rounds, rotating algorithm order each round. IDs generated for equivalent fragments are excluded from geometry equality checks. Cells show median / p95.

| Strokes / mode | Cached scan | RBush | Grid 64 | Grid 256 | Grid 1024 |
| --- | --- | --- | --- | --- | --- |
| 1000 / stroke | 0.5902 / 2.6339 | 0.3890 / 1.9424 | 0.3991 / 0.5036 | 0.3732 / 0.4489 | 0.3928 / 0.5516 |
| 1000 / area | 0.7633 / 2.1723 | 0.5751 / 0.6995 | 0.5848 / 2.5272 | 0.5571 / 0.6378 | 0.5428 / 1.9518 |
| 10000 / stroke | 3.7170 / 13.6695 | 0.8955 / 47.8028 | 0.9242 / 9.2695 | 0.8357 / 0.9953 | 0.8143 / 0.8981 |
| 10000 / area | 3.6855 / 13.1022 | 1.1455 / 7.6516 | 1.1611 / 8.8612 | 1.0679 / 9.5799 | 1.0295 / 9.3816 |

## Incremental retained index memory

One isolated process per case; median of three forced-GC heap deltas; excludes document and shared bounds. MiB are approximate; tiny or negative deltas are GC noise, not meaningful savings. Input strokes, sample points and the common bounds cache are excluded.

| Fixture | Strokes | Algorithm | Extra heap MiB | Cell references | Oversized fallback entries |
| --- | --- | --- | --- | --- | --- |
| canvas | 10000 | scan | 0.000 | — | — |
| canvas | 10000 | rbush | 2.368 | — | — |
| canvas | 10000 | grid-64 | 12.551 | 55456 | 0 |
| canvas | 10000 | grid-256 | 5.377 | 18100 | 0 |
| canvas | 10000 | grid-1024 | 4.698 | 11655 | 0 |
| crossing | 10000 | scan | 0.000 | — | — |
| crossing | 10000 | rbush | 2.368 | — | — |
| crossing | 10000 | grid-64 | 10.382 | 44736 | 2000 |
| crossing | 10000 | grid-256 | 4.903 | 14513 | 2000 |
| crossing | 10000 | grid-1024 | 4.288 | 9359 | 2000 |

## Method and limitations

- Deterministic seed 91; 80 samples per stroke, variable widths, 1/7 highlighters and periodic frozen fragments. Sizes: 100, 1000, 3000, 10000.
- Canvas distributes ink over a 16,000-unit square; clusters packs it into 16 handwriting regions; note uses five columns and increasing vertical extent; crossing gives 20% of strokes 24,000-unit diagonal extents. Crossing is intentionally adversarial for bounding-box lookup.
- 5 measured query passes after two warmup passes; 256 queries/pass, evenly split between hit-oriented eraser boxes, remote empty space, lasso boxes and viewport boxes. Half the hit-oriented eraser queries filter highlighters. Candidate-count summaries are in results.json.
- Grids use document-space cell sizes 64/256/1024. Each stroke occupies at most 64 cells; oversized entries are checked linearly. Queries covering over 4096 cells fall back to all stored entries. This bounded hybrid avoids allocating thousands of cells for one long stroke.
- The scan uses the production strokeCandidateBounds cache as its broad-phase kernel. RBush/grid entries snapshot those same conservative bounds and receive explicit edit deltas. Query results must be identical and in document order. Precise ink geometry remains the final authority.
- Query, replacement/split/deletion, undo and reload candidate equivalence is checked outside timing. Correctness tests also cover negative coordinates, touching boundaries, empty strokes, oversized queries and live-append refresh. A missed index update remains an integration risk.
- The synthetic 5% batch does not include finding changes from arbitrary snapshots. Production integration must supply edit deltas or pay for reconciliation/rebuild, including redo, external edits and multiple views.
- No spatial index has been installed in the plugin. This benchmark compares prototypes using current stroke geometry. No PDF page partitioning, browser DOM cost or physical device acceptance is inferred. The one-hit eraser pipeline uses ordinary ink; it does not measure the separate expensive long-highlighter outline construction.
- Different JavaScript runtimes, stroke distributions, overlap and GC affect results. Microsecond differences should be interpreted as tradeoffs, not universal rankings. Run again before making a deployment decision.
