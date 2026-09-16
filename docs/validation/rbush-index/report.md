# Production RBush sandbox

Canvas Scribe Smoke Test - rbush-adoption - Obsidian 1.12.7. 2026-09-16T03:25:33.279Z.

10,000 strokes; same sparse-visible-ink fixture and 13-point trusted pen gestures as the comparison. Medians in milliseconds; total is cumulative CPU time over the gesture, peak is its slowest eraser handler. Index preparation occurs during normal document rendering. Raw sample timings cover index searches only.

| Scenario | Gestures | Handler total | Peak handler |
| --- | ---: | ---: | ---: |
| empty | 3 | 0.80 | 0.20 |
| stroke-round | 3 | 16.40 | 15.40 |
| area-round | 3 | 486.60 | 198.00 |

12 gestures, 300 ordered-candidate comparisons against the bounds scan; undo/redo and complete saved data checked. Untouched chisel path retained: true. These are desktop handler measurements, not hardware latency.
