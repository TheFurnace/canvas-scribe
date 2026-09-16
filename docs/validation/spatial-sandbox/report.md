# Real Obsidian spatial comparison

Canvas Scribe Smoke Test - spatial-ab - Obsidian 1.12.7. Viewport 1024 × 800. Recorded 2026-09-16T03:00:56.130Z.

Three measured gestures per case after one labelled warmup; algorithm order rotates.
Each gesture has 13 trusted CDP contact samples plus release, at a requested 8 ms interval.
The Canvas interpolates these into 25 eraser operations. Fixtures have two visible
1,000-point highlighters and remaining remote 80-point fountain strokes. Every run
uses fresh stroke objects. Index preparation happens before input and is reported
separately. Bounds and geometry caches may warm during preparation/rendering.

All times below are **milliseconds**, and each cell is the median across gestures.
Handler total sums only eraseSamples calls (including synchronous DOM updates),
not nested beginGesture/renderAll timings. Peak is the median of each gesture's
slowest eraseSamples call. First hit is the first geometry-changing erase operation.
These are CPU costs, not hardware-to-display latency, frame presentation or p95.

| Strokes | Scenario | Algorithm | Gestures | Handler total | Peak handler | First hit operation | Prepare index |
| --- | --- | --- | ---: | ---: | ---: | ---: | ---: |
| 3000 | empty | scan | 3 | 16.40 | 5.40 | — | 0.00 |
| 3000 | empty | rbush | 3 | 0.60 | 0.10 | — | 5.90 |
| 3000 | empty | grid-256 | 3 | 0.60 | 0.10 | — | 5.80 |
| 3000 | stroke-round | scan | 3 | 31.70 | 18.70 | 17.10 | 0.00 |
| 3000 | stroke-round | rbush | 3 | 8.50 | 8.00 | 6.60 | 5.40 |
| 3000 | stroke-round | grid-256 | 3 | 9.70 | 8.80 | 6.40 | 5.50 |
| 3000 | area-round | scan | 3 | 436.50 | 187.20 | 183.20 | 0.00 |
| 3000 | area-round | rbush | 3 | 412.40 | 183.40 | 178.90 | 5.60 |
| 3000 | area-round | grid-256 | 3 | 409.40 | 181.60 | 178.70 | 5.40 |
| 10000 | empty | scan | 3 | 54.80 | 16.50 | — | 0.00 |
| 10000 | empty | rbush | 3 | 0.90 | 0.20 | — | 19.00 |
| 10000 | empty | grid-256 | 3 | 0.80 | 0.10 | — | 19.70 |
| 10000 | stroke-round | scan | 3 | 69.30 | 33.80 | 26.00 | 0.00 |
| 10000 | stroke-round | rbush | 3 | 19.70 | 18.70 | 9.90 | 20.00 |
| 10000 | stroke-round | grid-256 | 3 | 19.20 | 18.00 | 10.30 | 17.90 |
| 10000 | area-round | scan | 3 | 540.40 | 215.30 | 200.30 | 0.00 |
| 10000 | area-round | rbush | 3 | 499.50 | 199.40 | 186.10 | 43.10 |
| 10000 | area-round | grid-256 | 3 | 475.40 | 193.10 | 182.00 | 18.00 |

## Correctness

72 gestures including warmups completed. Every eraser operation
was checked against production eraseInk after timing, ignoring only newly generated
fragment IDs. Changed gestures checked undo and redo object identity. Every run
compared the complete saved geometry with the live result. Untouched chisel SVG
path retained in all runs: true.

The adapter changes only candidate lookup in an explicit sandbox build. Indexed
edits still reconcile the document array, restore integer ordering and update the
index. Array replacements trigger a conservative rebuild on next use. This is an
experimental Canvas adapter, not production integration across all document edits
or surfaces. No physical Galaxy/S Pen acceptance is implied.
