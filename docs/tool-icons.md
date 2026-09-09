# Tool icon family

FER-49 provides the user-approved upright icon family with ink-colored, elongated bodies and open tips. Real Obsidian and Galaxy Tab/S Pen validation remain pending.

Pen and highlighter barrels end at y=22.5 and contain the ink color. Their tips remain open and neutral. The extra 1.5 units use the space freed by the removed underline swatch. Text uses a colored T with a neutral outline; erasers and selection remain neutral. Color is inherited through `--canvas-scribe-tool-color` and accessible names retain the ink value. Palette actions retain their existing indicator because they have no tool barrel.
## Inventory and meaning

| Identity | Recognition cue | Availability |
| --- | --- | --- |
| Ballpoint | Narrow cone and rounded point | Existing pen |
| Fountain | Broad nib, slit and breather hole | Existing pen |
| Brush | Curved bristle tip and ferrule | Existing pen |
| Pencil | Graphite point, exposed wood and barrel facets | Existing pen |
| Chisel highlighter | Wide sloping edge | Planned FER-42 variant |
| Round highlighter | Wide rounded tip | Existing highlighter representative; named variants pending FER-42 |
| Stroke eraser | Broad bevelled cap and continuous stroke mark | Existing whole-stroke eraser |
| Area eraser | Narrow rounded cap and open footprint brackets | Planned FER-23 variant |
| Lasso selection | Freeform loop and trailing cord | Existing selection; sole quick-selection slot |
| Rectangle selection | Broken rectangular boundary | Planned FER-22 settings choice |
| Text | Upright T with end bars | Planned text tool |

Highlighter-only erasing is a filter, not a third eraser. No tape, shape or other unplanned tools are introduced. Unsupported variants appear in the artwork gallery only. Existing ink geometry and input behavior are unchanged.

## Geometry and optical rules

Author in `src/tool-icons.ts` on a 24 × 24 grid. Tool artwork occupies x=6–18, y=3–22.5; selection boundaries may use x=3–21. Align tips upward and barrel bottoms to y=22.5, leaving 0.7 units below the 1.6-unit outline. Following visual review, compact artwork uses open currentColor contours with 1.6-unit round strokes. Keep interiors spacious and use solid fill for the ink-bearing body and the small ballpoint and graphite points. Do not stroke compound cutouts or stack outlines: these made the first pass look smudged at 24 CSS pixels. Expanded tips reuse the clean geometry with only 6% neutral material shading. Do not bake in a theme or selected ink color.

The geometry is scaled into Obsidian's 100-unit custom-icon viewport at registration. Compact artwork is 24 CSS px; expanded review artwork is 48 px. Existing compact toolbar geometry remains host-owned. Gallery controls use 36 px desktop and 44 px tablet minimum targets. Settings adapt tips and the existing live stroke sample to each pen choice.

## Single source and registration

`registerToolIcons(addIcon)` runs before plugin controls are created. `toolIconId(tool, style)` returns a namespaced ID, with a `-tip` suffix for illustrated variants. Production renders through Obsidian `setIcon`. Storybook registers exactly the same SVG bodies in its small icon adapter; it does not run the Obsidian desktop JavaScript. Unrelated host action icons keep their existing Storybook fixtures.

Keep the icon registration and rendering adapters separate from the artwork. Do not paste paths into stories, CSS, toolbar code or radial code. The existing toolbar, radial tool actions and pen settings consume this source. Broader control adoption and new radial navigation remain FER-51.

## State and accessibility

The parent button owns the accessible tool name and `aria-pressed`. Artwork and its ink-colored body are decorative. Include the ink value in the accessible name when it is shown. Selection adds a check mark in quick controls; the gallery additionally uses an inset border. Settings retain their persistent selected border. Keyboard focus is an offset outline, distinct from selection. Disabled specimens use native `disabled` and retain their shape. Black and white bodies retain a neutral outer contour. Tips remain neutral so selected ink does not obscure tool identity.

## Adding a tool

1. Add a typed entry with its name, color-indicator eligibility, silhouette, filled tip and structural details. Start with a distinct outer profile; do not depend on tiny interior marks alone.
2. Add the interior fill geometry to `TOOL_BODIES` for ink-bearing tools and inherit `--canvas-scribe-tool-color` from the control. Use `toolIconId` at the production call site. Registration and the gallery discover the entry automatically.
3. Keep unsupported tools out of live controls. Connect modes and filters only in their implementation issue.
4. Inspect the Tool Icons stories at 100% browser zoom in both Obsidian themes, with desktop/tablet targets. Check default, selected, focused, disabled and black/white ink samples. Compare against the production toolbar and representative pen menu below the gallery.
5. Run `pnpm check` and `pnpm build:storybook`, then review in real Obsidian and on Galaxy Tab/S Pen. Verify native mouse/touch navigation and absence of stray ink separately from artwork approval.

The preview uses locally extracted Obsidian CSS. Its adapter verifies shared SVG content, not compatibility with a live host's icon registry; real-host/device acceptance is still required.
