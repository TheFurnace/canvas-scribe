# FER-93: Prediction horizon comparison — beta.16

## Device test

Beta.16 adds OFF / 16 / 24 / 32 ms modes to the same Canvas and handwritten-note experiment. The options are session-only and apply to new strokes. Restart always returns prediction and recording to OFF.

1. Update to beta.16 and restart Obsidian. Open a test Canvas or handwritten note.
2. Run **Canvas Scribe: Toggle ink latency recording** once; confirm ON.
3. Draw a few short words, fast lines, circles and sharp corners with prediction OFF. Include stopping while keeping the pen in contact, then lifting.
4. Run **Canvas Scribe: Cycle predicted ink tip: OFF / 16 / 24 / 32 ms (experimental)** once and confirm **16 ms**. Repeat the same movements.
5. Run the cycle command again for **24 ms**, then again for **32 ms**, repeating the same movements at each mode. A fourth use returns OFF. Stop at OFF if prediction overshoots or feels worse.
6. Repeat on the other surface and compare with Samsung Notes at similar visible pen width and zoom. Avoid changing tools, zoom, refresh settings or battery mode between comparisons.
7. Lift the pen and run **Canvas Scribe: Export debug report**. The report has feedback fields for all four modes. Share both generated Markdown files and note which mode felt best and any corrections at corners, stopping or lift.

The command retains its existing ID (`toggle-ink-prediction`) so existing hotkeys continue working, but now cycles modes instead of toggling only OFF/16. The notice states the selected mode. Earlier test guides using “Toggle predicted ink tip” describe beta.15.

## What changed

Beta.15 device feedback did not establish a meaningful perceived improvement. This iteration tests whether a longer horizon helps and measures what the preview actually uses. It does not change the renderer, saved geometry, smoothing or the 24 CSS-pixel displacement cap.

The configured horizon is measured forward from the newest actual sample timestamp, not forward from the time a frame is displayed. At 16 ms, native selection and fallback behavior match beta.15. Native predictions within the selected horizon remain preferred. In the 24/32 ms modes, a native prediction that ends earlier is extended for the remaining time using recent actual velocity, subject to the existing stable-motion checks. This ensures a WebView that provides only a short native horizon does not silently make all modes identical. No native candidate means a velocity fallback for the selected horizon. The same 24 CSS-pixel cap is applied afterward; the report identifies when this limits the comparison.

Stops, reversals, sharp turns and abrupt speed changes suppress prediction. Inactivity expiry remains 40 ms from the newest sample, followed by an animation-frame retraction. Predictions are temporary and never enter saved ink, history or exported geometry. Mode changes during a stroke apply only to the next stroke. Longer prediction can increase visible overshoot; physical-device acceptance remains pending.

## New measurements

All endpoint measurements below are recorded only for frames with a prediction, before smoothing and browser paint. Timing summary fields now include observation counts and minima in addition to mean/max/recent-p95. Recent-p95 is over the latest 256 observations of that metric; storage remains bounded.

- `horizonMs`: configured OFF/16/24/32 mode (0 means OFF).
- `selectedNativeHorizon*Ms`: timestamp distance from the actual sample to the selected native endpoint, before any extension.
- `predictionHorizon*Ms`: selected native or extrapolated endpoint horizon before displacement limiting. It can be shorter than 16 in the legacy 16 ms mode.
- `predictionDistance*CssPx` and `uncappedPredictionDistance*CssPx`: applied and pre-cap screen displacement magnitudes. No coordinates are recorded.
- `nativeExtendedFrames`: subset of `nativeFrames` using the native endpoint plus velocity extension; `fallbackFrames` uses no native endpoint.
- `distanceCappedFrames`: predicted frames constrained by the 24 CSS-pixel cap. Compare against `nativeFrames + fallbackFrames`.
- `predictionLeadAtRender*Ms`: endpoint timestamp minus the beginning of the JavaScript render callback. Negative values are retained and mean the endpoint timestamp is already behind that callback.
- `effectiveHorizonEstimate*Ms` and `effectiveLeadAtRenderEstimate*Ms`: the endpoint horizon scaled by the applied/pre-cap distance ratio, and the remaining lead after sample age. These are linear estimates, not native timestamps or physical-latency measurements. Native trajectory curvature, smoothing, DOM paint, compositor and display behavior are outside that estimate.

The earlier input-age, render-age, wait and synchronous-render-work metrics remain. Native API presence does not imply a prediction was usable. OFF frames omit prediction-only metrics rather than inventing zero horizons/distances. These measurements cannot establish actual tip-to-display latency or a Samsung Notes comparison without device feedback.

## Validation

`pnpm check` passed: synchronized beta.16 metadata, production build and **334 tests / 45 files**. Fourteen additional regressions cover all horizon values, short-native extension, preserved 16 ms behavior, distance limiting, signed negative lead, stale and diagnostics-only frames, native-corner suppression, mode cycling/snapshots, and Canvas/note sample preservation and history at 24/32 ms.

Real Obsidian **1.13.7**, Windows, 1024 x 800, named disposable `fer-93-latency` vault. Trusted CDP pen input used 31 samples per stroke, pressure 0.6 and tilt 25/-15, with an 8 ms requested interval. Actual event acknowledgments and scheduling govern cadence. This is host integration evidence, not Galaxy latency evidence.

- Drew all four modes on Canvas and notes. Each stroke saved exactly 31 real samples; all eight survived reload.
- Used endpoint horizon means for Canvas: 15.683 / 24 / 32 ms; note: 15.789 / 24 / 32 ms. Corresponding mean displacements were approximately 2.93 / 4.51 / 6.01 CSS px and 3.02 / 4.54 / 5.83 CSS px. This slow deterministic fixture did not reach the distance cap; unit tests cover cap behavior.
- Native endpoints in the longer modes averaged about 15.6–15.8 ms and were actually extended. Native-only and fallback paths also occurred. Compact generated evidence: [host-horizons-beta16.json](ink-latency/host-horizons-beta16.json).
- For both surfaces at 32 ms, pausing 100 ms without lifting retracted the tip, changed preview geometry, and retained exactly 31 model samples.
- Canvas undo/redo: 7 -> 6 -> 7 total strokes; notes: 4 -> 3 -> 4. Debug export contained distance, lead and extension fields. Reload reset prediction to 0 and recording to OFF and reopened the saved samples.
- No captured window errors. Screenshots were visually inspected; generated scripts, raw observations and screenshots remain under ignored `dist/latency-host/horizons*`.
- Local main.js and sandbox-installed main.js matched SHA-256 `a9beced4ebdd457dcd8d0e5e23615683fa75049d9844b24b1dc8082d57d9f31a`. The release workflow embeds its own commit-based build ID, so its output hash will differ.

The original physical beta.15 report remains in the user's vault; it is not copied into these published artifacts. Physical beta.16 improvement, overshoot quality and accepted latency budgets remain unverified under FER-93 / FER-59.
