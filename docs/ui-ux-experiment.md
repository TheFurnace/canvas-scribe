# V2 UI/UX experiment — FER-64

Experimental branch: `codex/FER-64/ui-ux-experiment`, based on `origin/main` at `3250a40`. No version bump or release tag. This is a design candidate for review, not stable-release acceptance.

## Design

The September 12 Samsung Notes captures in the local UI reference collection informed the central-tool radial, integrated lower navigation, tool shelves and quieter control grouping. Goodnotes informed the prominent stroke preview; Noteshelf informed illustrated favorite tools. The SVG artwork is original. Third-party images are not shipped with the plugin.

- Six ink tools have independently authored expanded geometry on a 100-unit grid: ballpoint, fountain, brush, pencil, round and chisel highlighters. `toolIconId(tool, "full")` selects it. Existing `tip` IDs use the expanded family for compatibility; compact silhouettes retain their established identities.
- Pen and highlighter menus use full-size shelves, consistent spacing, previews and immediate quick colors. Canvas and PDF callbacks preserve tool-local colors. More colors retains the existing picker transaction. Eraser and selection modes gain their existing shared symbols.
- The v2 radial uses a 320 px surface, a central current-tool illustration, upper action arc and integrated Quick tools / Settings / Favorites navigation. Settings shows actual ink color and numeric thickness. Favorites pair tool illustrations with stroke samples. Color pages hold up to eight stable swatches including the opening color, plus More colors. Selection stays open and the original swatch restores the original default/custom selection. Legacy six-slot menus keep their original color capacity.
- Radial action targets are 44 px. At widths below 344 px or heights below 400 px, a wrapping tray keeps those targets usable. A custom mount converts viewport coordinates to its containing block, avoiding clipped tablet previews.
- Pen capture now dismisses an open tool popover before consuming an outside stroke. The later document listener could previously be bypassed by immediate event propagation stopping. Keyboard close and focus behavior stay separate.

These shared menu changes reach Canvas and PDF. The handwritten-note editor currently has no corresponding expanded settings or radial integration; this experiment does not add that separate interaction flow.

## Validation — 2026-09-12

- `pnpm check`: 148 tests across 31 files pass, including new quick-color, picker cancellation, page-focus and first-point dismissal coverage.
- `pnpm build:storybook`: passes. Existing large-chunk advisory remains non-blocking.
- Browser review: pen shelf in light mode, highlighter controls in dark mode, radial quick/settings pages, and the 320 × 640 tablet tray. Tray action/back targets measured 44 × 44 px; navigation targets retain 44 px height.
- Real Obsidian, disposable `ui-ux` sandbox at 1024 × 800: plugin loaded, full-size pen menu rendered, quick red color selected, subsequent four-point pressure stroke persisted as `#dc2626`, and menu dismissed on that stroke. Fixture plus two deliberate driver strokes were present; clicks did not add ink. Screenshot: `.canvas-scribe-sandbox/artifacts/ui-ux/pen-menu-final.png`.
- Physical Galaxy/S Pen, broad native mouse/touch navigation, full host radial/size gesture coverage, all viewport edges and large-text acceptance remain for release validation. Browser and desktop-driver checks do not establish those results.

## Review locally

Build Storybook and serve `storybook-static` using a local static server. Open the Radial Menu, Pen Menu, Highlighter Menu, Expanded Tools and Tool Icons stories. A static preview is useful alongside the sandbox: the development watcher encountered an `EBUSY` error on the sandbox profile's locked Cookies file during this run.

The named Obsidian sandbox remains available for hands-on review. Its generated assets and source reference collection are local, ignored files.

## Review refinements

- Centered radial color circles and removed the Colors opener underline. Swatch order is captured on submenu entry and remains stable across choices; selecting the opening color preserves its original default/custom semantics. More colors confirmation returns to the color submenu.
- Large ink heroes now use a clipped circular container, with the barrel entering from below and no text label. Non-ink symbols retain their full silhouette.
- Removed the close X and redundant Tool settings action. Outside pointer input and Escape dismiss; submenu Back and page navigation remain available.
- Thickness and opacity use an inline circular slider in the same radial, with live values, keyboard focus, arrow/Home/End support and continuous pointer capture. No separate thickness/opacity popup.
- Final checks: 148 tests across 31 files pass; Storybook builds. Browser review covered light colors, dark opacity and 320 x 640 layout (304 px palette, 196 px slider, no horizontal overflow).
- Refreshed real Obsidian disposable ui-ux sandbox: color selection stayed open, swatch order stayed fixed, original default color restored, and inline opacity changed to 95% with matching toolbar state and slider focus. Screenshot: `.canvas-scribe-sandbox/artifacts/ui-ux/radial-opacity-review.png`. This is desktop DOM-driven host evidence; physical S Pen gesture acceptance remains pending.

## Compact radial navigation

Top-level Quick tools, Settings and Favorites navigation now uses icon buttons with accessible names and tooltips in a 144 px pill. Submenus omit this navigation. The selected-tool circle is centered on the radial; in submenus it is the Back action, including thickness and opacity (a separate sibling of the slider so center input cannot drag the ring). Narrow trays retain the center-tool Back target.

Validated with 148 passing tests, a successful Storybook build, browser center-coordinate measurement (zero horizontal/vertical offset), center-click return from color and thickness submenus, and narrow-layout back access. The named ui-ux sandbox was refreshed for review.

## Combined width and opacity

The radial diameter is now 280 px (previously 320 px), with matching viewport clamping. The context menu action occupies the top slot. The left settings action is a color/width/opacity preview circle without a numerical label. Its size scales across the selected tool's width range.

Highlighter variants share one submenu with independent left width and right opacity semicircles. Pen variants expose width only. The center tool remains the Back target, and submenu page navigation remains hidden. Half-ring input uses a 180-degree value range while retaining capture and keyboard adjustment.

Validation: 150 tests pass across 31 files, including independent controls for both highlighter variants; Storybook builds. Browser dragging changed opacity from 38% to 60% with width fixed at 17 px, then width from 17 to 31 px with opacity fixed at 60%. The ui-ux sandbox build was refreshed. Physical stylus acceptance remains pending.
