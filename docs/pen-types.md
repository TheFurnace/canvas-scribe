# Pen types (FER-41)

Tap the active Pen control to open the pen menu. Choose Ballpoint, Fountain,
Brush, or Pencil, adjust thickness with the slider or half-unit minus/plus
steps. Use the toolbar's palette control to change color. Escape, Close, another
tool, or contact outside the menu closes it. Type and thickness are remembered
per Canvas. Changing them leaves existing strokes and the chosen color intact.

## Rendering and compatibility

Each new pen stroke stores a stable `penType`. The profile in `src/pen-types.ts`
defines pressure response, thinning, smoothing, streamline, taper, and opacity.
Ballpoint ignores pressure. Fountain has a moderate response and Brush has a
stronger response with finer light-pressure strokes. New types use a constant
midpoint when pressure is unavailable. Pencil uses seven deterministic SVG
strands for texture, with wider spread as stylus tilt increases. Missing or
invalid tilt gives an upright pencil. Pencil opacity is stored on the stroke.

Strokes without a recognized type keep the exact original renderer, including
its simulated-pressure behavior. The optional `penSettings` field stores the
Canvas's last-used type and thickness. These additive fields keep the existing
version 1 data format. Highlighter remains a separate, unchanged tool.

The first set stays at four types. A calligraphy nib would add directional
width variation, unlike Brush's pressure variation. It needs its own agreed
nib-angle behavior and visual/device evaluation; merely renaming Brush would
not provide that distinction. Favorites and straightening remain FER-26 and
FER-25 work.

## Previews and exports

Storybook → Canvas Scribe → Pen Menu shows the production toolbar with the
pen menu anchored beside it. Use Storybook's light/dark switch to change the
Obsidian theme. Type and thickness controls update the in-menu stroke previews,
which call the production renderer.

Ink is an SVG overlay. Its paths, fill, and opacity describe the visible result;
pencil texture requires no external assets or SVG filters. Canvas Scribe does
not currently supply an ink export command. Obsidian's native Canvas export
may omit plugin overlays, so native image/PDF export is not guaranteed to
include these strokes. An exporter must include the rendered SVG paths or
rasterize the overlay.

## Device validation still required

Use a newly numbered beta for Galaxy Tab/S Pen validation. Compare pressure
and tilt response, long-stroke latency, taps and slider drags without stray ink,
light/dark themes, menu placement at several Canvas zoom levels, and save/reload.
The Storybook mouse pad can verify geometry and controls but cannot validate
physical stylus feel.
