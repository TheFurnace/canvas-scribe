# Bright ink visibility test — beta.18

This FER-94 diagnostic separates a working app preview from a browser-delegated
trail. It is deliberately conspicuous and is not a latency benchmark.

## Device steps

1. Update to **2.0.0-beta.18** and restart. Select **Ballpoint at 100% opacity**.
2. Enable **Toggle ink latency recording**, then **Toggle bright ink diagnostics
   (cyan / yellow / magenta)**. The notice confirms the visual mode.
3. Draw a baseline with prediction and delegation OFF. A **cyan dot** follows the
   latest actual point accepted into the stroke. It is not the physical pen tip.
4. Use **Cycle predicted ink tip: OFF / 16 / 24 / 32 ms (experimental)** to reach
   **32 ms**, then draw fast straight lines. A **yellow extension and dot** show
   the calculated unsmoothed predicted endpoint. Corners/stops can suppress it;
   the cyan dot remains until pen lift. This confirms the diagnostic prediction
   overlay is visible, not that the normal smoothed ink has equal lead.
5. Run **Toggle delegated ink trail (experimental)**. Prediction becomes OFF.
   Draw again and look for a **thick magenta trail** near the tip. Only the native
   Ink API receives magenta (16 CSS-pixel diameter); the app never draws a magenta
   SVG fallback. Cyan alone does not establish delegated rendering.
6. Repeat on Canvas and handwritten notes, then **Export debug report**. Record
   whether cyan, yellow, and magenta were visible. Observe the screen directly:
   a screenshot/screen recording may not capture every compositor overlay.

All experiment switches reset OFF on restart and apply to new strokes. The
normal stored color, width, actual points and history remain unchanged. Pencil,
highlighter and translucent pens retain the delegated experiment's ordinary-ink
fallback; use the opaque ballpoint for this test.

## Implementation

- Visual mode is a separate session-only switch, snapshotted at stroke start.
  It works for the OFF baseline too. Prediction and delegation remain exclusive.
- Cyan radius 5 CSS pixels; yellow radius 6 and extension width 8 CSS pixels.
  SVG elements share the ink's coordinate transform; their dimensions divide by
  gesture scale. They ignore pointer events and are hidden from accessibility.
- The yellow marker uses the same fresh, bounded predicted endpoint passed to
  the temporary stroke renderer. It disappears on the existing 40 ms expiry.
  Markers are removed on gesture termination, capture loss, undo and disposal;
  detached original paths cannot revive them.
- Delegated visual mode overrides only API color/diameter, not saved style or
  geometry. Normal delegated mode still uses resolved ink color and scaled width.
- Stroke timing records identify `visualDiagnostics`. Delegated entries additionally
  record `diagnosticColor: #ff00ff` and `diagnosticDiameterCssPx: 16`. These log
  requested behavior, not a measurement of pixels appearing on the display.

## Validation

- `pnpm check`: **358 tests / 47 files**, version validation and production build.
  Added zoom/color/cleanup tests, both-surface prediction expiry and save isolation,
  capture-loss cleanup, and a native API style assertion with no magenta DOM ink.
- Real Obsidian **1.13.7**, disposable `fer-93-latency` sandbox, trusted 41-sample
  pen strokes for baseline/prediction/delegation on both surfaces. Screenshots
  during movement visibly show cyan and yellow on Canvas and notes.
- Two delegated strokes accepted **82 native API updates**, requesting magenta
  at 16 CSS pixels, no stale/untrusted skips or API errors. No synthetic magenta
  elements exist. Screenshot evidence does not establish native trail visibility.
- Cyan remained and yellow hid at a 100 ms stationary hold. All six strokes had
  zero marker groups after lift; saves retained 41 actual points and original
  colors. Canvas undo/redo counts 14→13→14; new note 3→2→3. No captured window errors.
- Export contains visual-mode/color/diameter fields. Reload resets all experiment
  switches OFF, shows no diagnostic markers, and reopens the three saved strokes.
- Compact generated host evidence: `ink-latency/host-bright-beta18.json`. No
  private device report/recording is included. Galaxy display behavior remains
  the acceptance gate.
