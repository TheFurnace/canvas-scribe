# FER-84: Canvas highlighter stroke eraser

## Cause and change

Stroke erasing converted the complete highlighter into a polygon union before
testing a hit. Round highlighters contain a circle for every sample plus connecting
quads, making long strokes expensive to union. Canvas also regenerated all remaining
paths after each changed sample.

Stroke erasing now checks nearby swept nib segments and stops at the first hit.
It uses the existing renderer and flattening tolerance for each segment. Frozen
outlines and area erasing retain the general geometry path, preserving erased gaps.
Canvas removes only deleted paths, once per input event, retaining survivor nodes.

## Repeatable geometry benchmark

Run `pnpm exec esbuild scripts/measure-highlighter-eraser.ts --bundle --platform=node --format=esm --outfile=dist/measure-eraser.mjs`,
then `node dist/measure-eraser.mjs`. Windows, Node 24.19.0; one warmup and four
measured runs, median. Baseline is commit 91ff35b; this is a synthetic single-hit
geometry measurement, not total gesture or physical device latency.

| Shape | Samples | Before (ms) | After (ms) |
| --- | ---: | ---: | ---: |
| Round | 200 | 375.264 | 1.109 |
| Round | 1000 | 2976.531 | 0.631 |
| Chisel | 200 | 26.490 | 0.358 |
| Chisel | 1000 | 131.870 | 0.264 |

## Verification

- `pnpm check`: metadata, production build, 37 files / 250 tests pass.
- Geometry oracle comparisons cover dots, repeated points, self-crossing paths,
  and both nibs; tests also cover area-erased gaps and bounded union work.
- Canvas DOM regression checks surviving path identity, undo and redo.
- Real Obsidian 1.12.7, isolated `fer-84-highlighter` sandbox: seeded three
  1000-point highlighters, then sent a trusted seven-sample pen eraser gesture
  across one round and one chisel stroke. Both deleted; third stroke retained
  the same SVG path node. Zero full redraws during erasing.
- Instrumented eraseSamples calls: 1.0, 12.9, 0.3, 1.0, 3.3, 0.2, 0.2 ms.
  These include interpolation, hit geometry, and DOM removal, but not presentation.
- Undo restored all three; redo left the third; save and app reload retained
  exactly the third stroke and one rendered path. Screenshot inspected.
- Physical Galaxy/S Pen acceptance remains pending. Complex frozen outlines
  and area-erasing performance are outside this targeted optimization.

Local raw results and screenshot are in ignored `dist/eraser-{before,after}.jsonl`,
`dist/host-result.json`, and `.canvas-scribe-sandbox/artifacts/fer-84-highlighter/erased.png`.
