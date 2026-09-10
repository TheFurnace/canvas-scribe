# PR #17 desktop pen validation — 2026-09-10

Rebased onto `d77c13d` (main, including the FER-63 pen sandbox guide). Experiments used the feature worktree build in the isolated `pr17-pen-validation` vault, with Chromium-injected pen input through `scripts/sandbox-agent.mjs`. The first run used Obsidian 1.12.7; after the isolated profile downloaded its update, the final host runs used 1.13.7. Viewport: 1024 × 800, Windows desktop.

These are exploratory host observations, not physical S Pen certification. The installed version label remains 2.0.0-beta.3, but the sandbox contains unpublished branch corrections. The published beta.3 asset has not changed.

## Observed results

| Check | Result |
| --- | --- |
| Trusted pen path | 61 saved samples, `isTrusted: true` observed, pressure 0.15–0.95, tiltX 20 and tiltY -15. The viewport stayed at scrollTop/scrollLeft 0. |
| Save/reopen | Original 61-point stroke survived app restart and reopening. |
| Pen versus touch | Native CDP touch drag scrolled 100 CSS pixels without creating ink. Touch during a pen stroke left scrollTop at 0 and produced only the pen stroke. |
| History and tools | Toolbar Undo removed the latest stroke; Redo restored its ID. Highlighter created a separate stroke; erasing removed ink while retaining text; one Undo restored the erased ink. |
| Text box | Pen created a text box; Chromium text insertion preserved ordinary Unicode text. After the capture correction, a 100-pixel pen resize changed width 305 → 405; a move changed x/y by exactly 50/60. |
| Mixed selection | Pen lasso selected ink and text; drag moved the selection by 20/20. Undo restored the original text position and object ordering. |
| Two live views | Both initially showed five objects. Drawing in one showed six locally, then both showed six after normal save debounce. An external vault modification updated the text in both views. Deferred tabs were explicitly loaded before the two-live-view check. |
| Invalid/future files | Malformed JSON and version 99 displayed the appropriate error; `getViewData()` preserved the original bytes. Switching away did not require converting the files. |
| Reading / Live Preview | Two actual embeds rendered in each mode, with no textareas, and each measured 360 CSS pixels high. Both refreshed after modifying source text. Reading-view Open note opened the source editor. |
| Canvas embed | Real file node rendered the same source through the shared read-only renderer. Width correction filled the card. Drawing over the card saved a separate 61-point Canvas stroke and left the source note bytes unchanged. |
| Rename / delete | Existing preview changed to the renamed filename. Deleting the disposable source displayed “Handwritten note unavailable”. Obsidian's link-update confirmation caused the awaited rename API experiment to time out; subsequent inspection confirmed the rename and preview state. |
| Long-note exploration | Generated fixture: 500 strokes, 30,500 samples, 51,000 logical units high. One measured open took about 220 ms; all 500 paths were rendered. A confirmed subsequent 61-event pen sequence added a stroke without scrolling and took about 3.0 seconds including driver pacing, protocol round trips, and rendering. This is not a pen-latency measurement or an approved performance pass. Earlier attempts with the rename prompt present are excluded. |

## Corrections found through host testing

- Kept text move/resize pointer capture on the persistent viewport; replacing a handle during rendering previously stopped the drag after its first move.
- Restricted embed discovery so file-explorer entries are never treated as rendering hosts.
- Avoided deleting/reinserting entries during live embed-map traversal, which caused an unbounded refresh loop when saving.
- Recovered when Obsidian's generic Reading-view renderer replaced an already mounted preview.
- Used the bounded private Canvas node adapter for file paths/content elements; real Canvas nodes do not carry the assumed `data-path` attribute.
- Filled Canvas card width and prevented stale asynchronous reads from overriding a newer refresh/deletion state.

Regression coverage exercises continuous resize with whole-gesture Undo, legitimate embed discovery, repeated source updates, host replacement, rename, deletion, and stale-read protection. `pnpm check`: 27 files / 123 tests pass. `pnpm build:storybook` passes.

## Remaining acceptance limits

- Galaxy/S Pen: Android interception, palm rejection, hardware latency, pressure/tilt fidelity, barrel/contextmenu behavior, mobile keyboard and IME composition.
- Full keyboard/IME composition and accessibility navigation matrix; inserting Unicode through Chromium is not IME certification.
- Exhaustive mouse/touch navigation and Open note interaction inside Canvas cards at different zoom levels, plus pen-cancellation stress under external concurrent edits.
- Full sync-conflict/recovery matrix, rename link-rewrite confirmation flow, and multiple-window/popout behavior.
- Approved long-document performance budgets, mobile measurements, and offscreen rendering costs. The editor still rebuilds all strokes during pen moves; this remains relevant to FER-59.

Raw generated paths, scripts, screenshots, and selected JSON results remain ignored under `.canvas-scribe-sandbox/artifacts/pr17-pen-validation/`. Relevant files include `first-stroke.json`, `embed-modes.json`, `long-result.json`, `editor-validation.png`, and `canvas-embed-final.png`. The initial `long-pen-result.json` includes an attempt obstructed by the rename prompt and must not be used as a successful pen result.
