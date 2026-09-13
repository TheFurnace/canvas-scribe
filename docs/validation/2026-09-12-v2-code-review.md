# V2 code-review fixes: FER-66 through FER-69

Validated against main at `855bf0c`, using a dedicated `v2-review` worktree and disposable Obsidian vault on Windows. Obsidian desktop reports 1.12.7. No stable version or beta tag is introduced.

## PDF save measurements (FER-66 / FER-59)

The original `PdfStore` from `855bf0c` and the revised store ran sequentially inside the same real Obsidian renderer, using the real vault read/create/process APIs. Instrumentation counted source `readBinary`, SHA-256 digest calls, and companion writes, with wrappers restored after each run. Stores had no attached drawing views: these are persistence measurements, not pen latency or rendering budgets.

Each run started with 3,000 synthetic strokes / 90,000 points, submitted 20 additional edits without awaiting intermediate saves, awaited the queue, then performed five individually awaited undos and one redo. Every final companion contained the expected last stroke (`burst-15`), with no session errors. Timings below are individual samples, sensitive to disk cache, scheduling and GC; they do not establish release budgets.

| Fixture | Original 20-edit burst | Revised burst | Source reads / hashes / writes, original -> revised | Five serial undos, original -> revised |
| --- | ---: | ---: | --- | ---: |
| Existing 120-page long PDF, 76,925 bytes | 1,042.2 ms | 63.9 ms | 20 / 20 / 20 -> 1 / 1 / 1 | 262.8 -> 253.4 ms |
| 16-page image-only scan surrogate, 46,305,710 bytes | 4,554.5 ms | 241.6 ms | 20 / 20 / 20 -> 1 / 1 / 1 | 1,142.4 -> 255.0 ms |

The five serial undos retained five ordered companion writes, while source reads/hashes fell from five to zero for both fixtures. Companions were approximately 11.7 MB. The long PDF uses `node scripts/pdf-fixture.mjs 120 "Long PDF fixture.pdf"`; the synthetic scan contains 16 distinct 1,400 x 2,000 raster pages with text over seeded paper noise (LCG seed 66), embedded as PNG images with pdf-lib. It is a repeatable large image-only workload, not a representative sample of all physical scanners.

Ad hoc generator, baseline bundle, measurement scripts, raw JSON results and PDFs remain in `.canvas-scribe-sandbox/artifacts/v2-review/` and the named disposable vault. They contain only generated data. Original and revised stores share the current unchanged PDF geometry/fingerprint helpers.

Regression tests cover burst coalescing, edits arriving during source reads and companion writes, invalidation during verification, metadata changes before vault notification, external conflict recovery, two-view session ownership, rename, and ordered undo/redo. Open/relink fingerprint verification and immediate pre-export verification remain in place.

## Embeds (FER-67)

Created `folder-a/drawing.scribe` with “Original A” and `folder-b/drawing.scribe` with “Wrong B”. Embedded the basename from `folder-a/owner.md`, with another split active in folder B. After replacing the native embed contents:

- Reading view retained `folder-a/drawing.scribe`, rendered “Original A”, and Open note opened that exact source.
- Live Preview retained the same canonical path and content while its owner was inactive.
- Canvas file nodes rendered both distinct canonical paths and corresponding content. Canvas intentionally detaches node content at low zoom; checked after zooming into its rendering range.

The DOM regression additionally replaces the entire native embed host and checks source rename followed by remount. Markdown fallback uses the owning postprocessor context or owning Markdown leaf, never the globally active file.

## Invalid files (FER-68)

Malformed required root, text and ink fields now reject editing instead of substituting defaults. Explicit optional ink styles remain compatible when absent. Real epoch timestamps and long-running pointer timestamps round-trip without clamping. Tests cover the required fields, invalid numeric/style values, unsupported versions, duplicate IDs and the view's stale-control/close boundary.

In Obsidian, opened a deliberately malformed `objects` value with leading/trailing whitespace. The error state appeared; `getViewData()` returned the exact original bytes, and an explicit view save preserved the source unchanged. Reopening a valid mixed-language note retained its content.

## Text reflow (FER-69)

Interactive height uses rendered scroll height in logical CSS pixels. Transient measured bounds feed selection geometry and document extent; no height field is persisted. A new TextReflow Storybook fixture ends with a conspicuous final line.

Real Obsidian measurements for the same long text at font size 22:

| Box width | Rendered outer height | Font size |
| ---: | ---: | ---: |
| 300 | 964 | 22 |
| 150 | 2,359 | 22 |
| 500 | 578 | 22 |

At each width, textarea client height equaled scroll height. Zoom preserved logical height. Width measurements used the editor reload path; DOM tests additionally exercise continuous resize handles, font-size changes, selection bounds and multiline input.

Chromium input commands inserted keyboard text and an IME composition (`漢字入力`) into the focused textarea in real Obsidian. Focus remained on the textarea; visible content and the stored model agreed after commit and reopen, with no overflow clipping. This exercises Chromium composition delivery, not a physical keyboard/OS IME or Galaxy S Pen certification. Screenshots were inspected locally.

## Verification and remaining release work

`pnpm check` passed: 32 test files / 183 tests, version validation and production build. `pnpm build:storybook` passed, including the new TextReflow fixture. Physical Galaxy/S Pen acceptance, Android sync, controlled retained-memory measurements and product-approved performance budgets remain with FER-59/FER-60; this PR does not close those broader release gates.
