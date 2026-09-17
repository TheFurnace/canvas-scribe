# Anchored prediction — beta.19

Physical beta.18 feedback: cyan and yellow are visible; at 32 ms yellow reaches about halfway from normal ink to the stylus. No magenta was visible. This confirms prediction visibility, not a latency measurement; delegated API acceptance still does not prove rendering.

Beta.19 passes `last: true` to perfect-freehand only for a fresh temporary predicted preview. This anchors its endpoint instead of streamlining it behind the prediction. Canvas and handwritten notes share the behavior. Prediction horizons, 24 CSS-pixel cap, stop/corner guards and 40 ms expiry are unchanged. OFF/delegated rendering and final saved ink are unchanged. Tail taper/pressure can look different during the prediction, and retraction can remain visible.

## Device procedure

1. Update to 2.0.0-beta.19 and enable ink latency recording.
2. Cycle predicted ink to 32 ms. With bright diagnostics ON, check that normal ink reaches the yellow marker while moving.
3. Turn bright diagnostics OFF and compare prediction OFF against 32 ms using the same pen, speed and zoom. Try straight strokes, handwriting, corners, stops and lift.
4. Repeat on Canvas and handwritten notes, then export a debug report. Reports identify `predictionRendering: anchored-endpoint`.

All experiment switches reset OFF on restart. The physical test remains open; no measured latency reduction is claimed.

## Local validation

- `pnpm check`: 359 tests / 47 files passed, production build and versions passed. Storybook build passed.
- Real Obsidian 1.13.7, disposable `fer-93-latency`, trusted CDP pen input: OFF / 32 ms / delegated strokes on both surfaces. Fresh predicted filled-path bounds reach past the yellow center by the round nib radius; Canvas yellow x=-171.467, ink right=-169.740; note yellow x=148.314, ink right=150.040. These are disposable document coordinates, not timings.
- After 100 ms stationary contact, yellow hides and ink retracts to baseline actual geometry. All markers removed on lift. Six 41-sample strokes saved with original colors; undo/redo passed; no runtime errors.
- Screenshot with diagnostic markers hidden confirms normal ink is visible at the predicted tip. Generated artifacts are local under `dist/latency-host/anchored-*`; aggregate host evidence is adjacent in `ink-latency/host-anchored-beta19.json`.
- Desktop simulation does not establish Android display latency or physical S Pen quality.
