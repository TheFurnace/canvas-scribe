# FER-47 / FER-52 / FER-53 / FER-54: PDF evidence

Date: 2026-09-12. One worktree/PR based on `69936ca` (merged handwritten-note workflow). The approved contract lives in the [v2 decision register](https://linear.app/fdqr/document/v2-decision-register-adde45104230).

## Feasibility choice

Use the native viewer adapter. In the disposable `pdf-lab` vault, Obsidian 1.12.7 exposes the PDF.js 5.3.34 viewer through `view.viewer.child.pdfViewer`, with `pdfViewer.getPageView`, page viewport matrices, and lifecycle events. The adapter isolates this access in `pdf-native.ts` and checks capabilities before mounting. Page recycling, scroll, zoom, rotation, split views, source-folder moves, and reload were exercised. There was no observed host failure justifying a dedicated PDF.js viewer. This evidence covers the recorded host, not every Obsidian version.

Storage uses `Scribe PDF annotations/<uuid>.json`, format `canvas-scribe-pdf`, version 1. JSON was chosen for version validation, editable structured geometry, and recoverable conflict versions. The root remains independent of PDF paths. Annotation saves never invoke a source-PDF write. Source SHA-256 and crop/media intersection metadata guard association/export.

`pdf-lib` 1.17.1 is the exporter. A PDF-space SVG outline is emitted with an explicit transform canceling the library's SVG y inversion. The original content streams, annotation dictionaries, page rotation, and crop dictionaries remain intact. No whole-page rasterization and no `ignoreEncryption` fallback.

## Desktop experiments

The repository's named real-Obsidian sandbox and pen driver were used for exploratory checks, not a new integration-test harness. Generated PDFs, screenshots, scripts, and third-party plugin assets remain ignored in `.canvas-scribe-sandbox/`.

* `node scripts/pdf-fixture.mjs` generates a 12-page document with selectable text and URI links, mixed page dimensions, a rotated/cropped second page, and a 180-degree third page.
* Trusted Chromium pen input saved page-space strokes with pressure. Toolbar undo/redo restored saved marks. Reload retained them.
* A pen stroke on the 90-degree cropped page aligned with the source in the host and exported output.
* PDF++ 0.40.31 was installed only in the disposable sandbox. Its release `main.js` SHA-256 matched `3fd395ca015ff812df8a48e75da0ec7a7ab5a6f59406d375470898b1f72aac93`. With both plugins enabled, Scribe drew/saved ink and both split views updated. PDF++ controls and native text/link layers remained present. This is bounded coexistence coverage, not PDF++ feature parity.
* Moving `PDF fixture.pdf` to `Moved/PDF fixture.pdf` retained the same companion UUID/path and updated the source reference. Both views and a subsequent reload retained four marks at that checkpoint.
* Shared highlighter settings opened and rendered in the host. Read mode leaves text/link hit testing native; input ownership tests verify Scribe does not consume mouse or reading-mode pen events.
* A simulated companion conflict disabled editing. Explicit selection through Review / relink restored the chosen five-stroke version and moved the unselected copy into `Scribe PDF recovery/` without changing its bytes.
* A one-page raster/scanned fixture accepted trusted pen ink and exported visibly in PDFium. The embedded source image bytes remained identical in the export. This establishes basic scanned-page handling, not large scanned-document performance.
* A generated password-protected fixture opened in the native viewer after entering its fixture password. Scribe displayed its explicit annotation/export exclusion while all 12 pages remained readable.
* Poppler and PDFium rendered exported pages 1 and 2 independently. The rotated/cropped ink placement matched the host. `pypdf` confirmed identical extracted text on all 12 pages and equal resolved link dictionaries. Comparing indirect-reference string representations is not a valid link comparison because they contain reader identity.

## Automated coverage

The PDF tests cover crop/rotation/CSS-scale inversion; strict/future schema validation; rendered boundary clipping; preservation of original PDF streams, links, geometry, source bytes, and companion JSON; cancellation and replaced-source rejection; multi-view save ownership; offline moves and ambiguous copies; same-basename sources; queued edits/undo; external conflict preservation; explicit version selection/archiving; immutable history; and pen/mouse/touch/cancel routing. Existing Canvas and handwritten-note tests remain part of `pnpm check`.

The Storybook PDF stories compose the production tool panel at desktop/narrow sizes and with a source-error state. Host/device acceptance is separate.

The beta candidate passed `pnpm check` and `pnpm build:storybook`. The latter reported its existing bundle-size warning, with a successful build. The PR records the final test count; a stale-review regression also checks that queued edits are saved before an association can be changed.

## Long-document baseline and proposals

Fixture: `node scripts/pdf-fixture.mjs 120 "Long PDF fixture.pdf"`, populated in the disposable host with 3,000 synthetic strokes / 90,000 points across 120 pages. These are synthetic model data for performance measurement, not trusted pen-input evidence. The JSON companion was 13,187,143 bytes. Only two nearby pages (50 paths) were attached in the measured viewport.

| Measurement | Observed desktop result |
| --- | --- |
| Whole-model save after immutable-history change | 75.9 ms |
| Visible-overlay render, 20 direct calls | median 2.9 ms; maximum 3.6 ms |
| Single added stroke, including save | 59.9 ms |
| Undo including save | 88.4–90.6 ms |
| Redo including save | 101.8 ms |
| Export 120 pages / 3,000 strokes | 4,087 ms; 2,461,128 bytes |

An earlier whole-document deep-copy history path measured 118 ms save, 131 ms undo, and 140 ms redo. This motivated a bounded change: clone edited-page strokes, share immutable unchanged strokes in `DocumentHistory`, and snapshot order/source metadata for queued saves. No raster-cache infrastructure was introduced. Heap-delta samples (50–65 MiB) were affected by allocation and garbage collection; they do not establish retained memory or a memory acceptance limit.

Proposed **desktop-only** budgets for this fixture, pending product approval: visible-overlay render <= 8 ms, completed edit/save <= 250 ms, export <= 10 seconds. These leave margin above observed samples and are not approved release gates. Direct render timing is not end-to-end pen latency. Physical Galaxy measurements must establish device-specific latency, navigation, history, and memory budgets; no Galaxy numbers are inferred from desktop runs.

## Human/device gate

Still required: physical Galaxy/S Pen pressure/tilt feel, palm rejection, barrel behavior, pen/touch/pinch interaction, actual latency; Android sync configuration and conflict recovery; representative large scanned/image-heavy PDFs; controlled retained-memory and extended-history measurements; approved performance budgets; and final v2 release acceptance. Deliver as a beta/PR for that review, not a stable release or completed FER-59/60.
