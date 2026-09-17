# Delegated ink device experiment — beta.17

FER-94 extends the FER-93 experiment in PR #32. This is a test of the browser's
Ink API on Canvas and handwritten notes, not a claim of improved Galaxy latency.

## On-device comparison

1. Update to **2.0.0-beta.17**, then restart Obsidian. Prediction, delegation and
   latency recording start OFF.
2. Select **Ballpoint**, 100% opacity. Keep pen width, zoom and drawing speed the
   same for the comparison. Fountain and brush are also supported, with an
   approximate round delegated tip; begin with ballpoint to assess joins clearly.
3. Run **Toggle ink latency recording**. Draw fast lines, loops, corners, and
   stop while keeping the pen on the screen. This is the OFF baseline.
4. Run **Toggle delegated ink trail (experimental)**, confirm the ON notice,
   and repeat. Run the command again for an OFF recheck.
5. Repeat on the other surface. Look for a smaller tip-to-ink gap, disconnected
   joins, a different tip width, overshoot, and trails that linger at stops/lifts.
6. **Export debug report** and note your subjective comparison or recording.

Enabling delegation disables application prediction; cycling prediction disables
delegation. Changes apply to new strokes so a gesture never changes renderer mode
halfway through. Pencil, highlighter and pen opacity below 100% retain ordinary
SVG rendering. A report records `unsupported-style` for those strokes.

## Implementation and limits

- Request a presenter scoped to the surface's HTML viewport in its own document.
  Theme color resolves from the live SVG path. Diameter is converted from stroke
  width to CSS pixels using the surface's gesture scale; pressure follows the pen
  profile. Do not multiply this by device pixel ratio.
- Retain the original trusted pen event only when its sample enters the model.
  Submit it after the corresponding SVG update. Canvas distance filtering must
  not advance the delegated anchor to a discarded sample. Saved Canvas sample
  timestamps are rounded; matching uses the accepted point identity rather than
  equality with the browser event's fractional timestamp.
- SVG geometry/smoothing, input samples, pressure, tilt, storage and history are
  unchanged in both OFF and ON modes. The browser's round tip approximates the
  renderer's taper and smoothing, so a visible join may still differ. No app
  prediction runs in delegated mode, including when the presenter is unavailable.
- Missing APIs, synchronous/asynchronous request errors, invalid presenters and
  update errors fall back to ordinary ink. No flags or browser configuration are
  changed. A late request cannot revive an ended/detached gesture.
- Do not submit mouse/hover, untrusted, stale (40 ms), or already-submitted input.
  Inactivity clears our retained event and requests an ordinary-ink repaint.
  End/cancel/capture loss/undo/disposal release our references and timers. The API
  has no clear/dispose operation; removal of its trail belongs to the browser.
  Visible stop/termination behavior must therefore be assessed on the device.

`ink-latency / delegated_stroke` reports status, successful update count,
request duration, skipped untrusted/stale counts, and error name. It intentionally
does not log event coordinates, note text or arbitrary browser error messages.
The normal timing entry also identifies delegated mode and a zero prediction
horizon. `ready` and nonzero updates establish successful API calls, not visible
compositor output or physical pen-to-display latency. These are separate gates.

The current API form is `navigator.ink.requestPresenter({presentationArea})`, then
`presenter.updateInkTrailStartPoint(trustedEvent, {color, diameter})`. Do not use
the older README positional signature or removed `expectedImprovement` property.

## Validation

- `pnpm check`: **351 tests / 46 files**, version validation and production build.
- Unit/DOM checks cover mutual exclusion, zoomed width, pressure, theme color,
  request/update failures, unavailable API, untrusted/stale events, asynchronous
  teardown, inactivity, Canvas filtering, both surfaces' saves/history and capture
  loss. Trusted-event doubles are unit fixtures, not browser acceptance evidence.
- Actual Obsidian **1.13.7**, named disposable `fer-93-latency` sandbox, beta.17:
  trusted Chromium pen input (31 samples/stroke, pressure .6, tilt 25/-15).
  Ballpoint OFF/ON, fountain ON and pencil fallback exercised on both surfaces.
  Four supported ON strokes made **124 successful native presenter updates**,
  no API or captured window errors. Theme color resolved to `rgb(218, 218, 218)`;
  Canvas scale .813397 and note scale 1 were used.
- Both idle-stop checks stopped submitting after 31 calls and cleared the held
  event without changing 31 saved samples. All eight strokes saved their actual
  pressure/tilt. Canvas count 7→11, undo 10, redo 11; new note 0→4, undo 3, redo 4.
  Screenshots inspected; debug export contains six delegated summaries (four
  supported strokes and two pencil fallbacks).
- Reload preserves all saved sample counts and resets experiment modes OFF.
  This desktop smoke test cannot establish Android WebView rendering or S Pen
  latency benefit. No user-vault report or recording is included in this PR.

## Sources

- [WICG current Ink API draft](https://wicg.github.io/ink-enhancement/)
- [WICG explainer and prediction interaction](https://github.com/WICG/ink-enhancement)
- [Chromium presenter implementation](https://github.com/chromium/chromium/blob/main/third_party/blink/renderer/modules/delegated_ink/delegated_ink_trail_presenter.cc)
- [Chromium platform/Skia selection](https://github.com/chromium/chromium/blob/main/components/viz/service/display/delegated_ink_handler.cc)
- [MDN compatibility source](https://github.com/mdn/browser-compat-data/blob/main/api/DelegatedInkTrailPresenter.json)
- [Can I WebView support entry](https://caniwebview.com/features/mdn-delegatedinktrailpresenter/)
