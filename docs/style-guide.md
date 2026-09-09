# Canvas Scribe style guide

Approved design baseline for FER-46 · 2026-09-08 · audited main at 7222be4.

The user approved the guide, inventory, and foundations preview on 2026-09-08. Approval establishes the shared direction and interaction contract. Detailed radial layouts, final artwork, and device validation remain delivery work as identified below.

Product choices below were confirmed in the FER-46 interview. Token values and detailed layouts are draft recommendations for visual and Galaxy Tab/S Pen review. This document does not claim that the proposed radial navigation or icon family is implemented.

## Direction and scope

Use Obsidian surfaces, typography, and accent colors with Samsung Notes-inspired tool silhouettes and menu organization. Desktop controls are compact; tablet controls have larger targets and more spacing. Ordering and meaning stay consistent.

The guide covers Canvas, PDF annotation, and handwritten notes. Preserve native Canvas mouse/touch navigation, pen activation, existing ink appearance, and persistence. PDF and note adapters inherit shared controls, while retaining their own navigation and document behavior. A Canvas fixture is not evidence of PDF or note integration.

FER-46 delivers the audit, rules, and foundations review. FER-49 owns the complete original icon family; FER-51 owns shared-component adoption and interaction implementation. Expanded highlighter, eraser, and selection features remain in FER-42, FER-23, and FER-22. Unsupported controls must not appear as working options.

## Semantic tokens — proposed contract

Use the prefix `--canvas-scribe-ui-` for shared UI aliases. Resolve them within the host theme; do not persist resolved UI colors as document ink. These aliases are a proposed contract, not yet a global CSS migration.

| Token suffix | Obsidian source / proposed value | Use |
| --- | --- | --- |
| surface | `--background-primary` | Menus and dialogs |
| surface-secondary | `--background-secondary` | Grouped controls |
| text | `--text-normal` | Primary labels and icons |
| text-muted | `--text-muted` | Supporting labels |
| border-color | `--background-modifier-border` | Control and surface boundaries |
| hover | `--background-modifier-hover` | Hover feedback |
| selected | `--interactive-accent` | Selected control surface |
| on-selected | `--text-on-accent` | Text/icon on selected surface |
| focus-color | `--interactive-accent` | Keyboard focus outline |
| destructive | `--text-error` | Destructive labels and validation |
| space-1 / 2 / 3 / 4 / 6 | `--size-4-1 / 2 / 3 / 4 / 6` (4/8/12/16/24 px fallbacks) | Spacing rhythm |
| font | `--font-interface` | Interface font |
| text-size / caption-size | `--font-ui-small` / `--font-ui-smaller` | Labels / secondary text |
| heading-size / weight | `--font-ui-medium` / `--font-medium` | Menu headings |
| radius-control / surface | `--radius-s` / `--radius-m` | Buttons / popovers |
| border-width | 1 px | Surface boundaries |
| elevation | `--shadow-s` | Raised popovers and dialogs |
| focus-width / offset | 2 px / 2 px | Visible focus, distinct from selection |
| target-desktop / tablet | 36 px / 44 px minimum proposal | Primary square controls |
| icon-size | 24 px proposal | Shared tool artwork grid |

Prefer host values over hardcoded light/dark palettes. Exact spacing, radii, optical weight, and target sizes need actual-size review. Touch hit regions may exceed visible artwork but must not overlap. Do not scale the whole UI with document zoom. Keep radial geometry large enough for its targets; never compress targets to fit more options.

## Tool identity and state

Confirmed: toolbar and radial quick-tool slots use simple silhouettes. Expanded settings use illustrated tips and live stroke previews. Both representations share recognizable tip shapes and a consistent, separate ink-color indicator. The approved direction is not approval of final artwork.

Draft artwork constraints: start on a 24-unit grid, retain approximately 2 units of optical padding, and compare at 24 CSS px before enlarging. Use original artwork through one source shared by production and Storybook via Obsidian icon registration. Illustrations may use neutral material shading; avoid extra colors that could be mistaken for selected ink.

Selected state uses a persistent surface/border treatment and programmatic pressed/checked state; color alone is insufficient. Open settings use expanded state separately from selected-tool state. Disabled actions remain recognizable, cannot activate, and expose disabled semantics. Preserve a visible keyboard focus outline in every state. Tool names and values must be accessible without hover; decorative artwork is hidden from assistive technology.

## Toolbar and expanded settings

Confirmed: tap an inactive tool to select it; tap the active tool to toggle its settings. Apply this consistently to tools with settings. Type/thickness changes apply immediately to subsequent strokes. Existing strokes are unchanged.

Use an anchored popover near the right-aligned Canvas controls, flipping/clamping at viewport edges. Provide an explicit close button and Escape. Starting a drawing gesture outside closes the popover and begins the intended stroke; interacting within controls never leaks ink or native Canvas actions. Switching tools closes incompatible settings. Full color picker edits remain pending until Done; Cancel, Escape, and outside dismissal discard them.

Draft focus rule: explicit close/Escape returns focus to the opener; pointer dismissal preserves the user's drawing/navigation intent. Modal dialogs contain keyboard focus, restore it on exit, and expose accessible titles. Use host dialogs where appropriate. Do not depend only on hover, long press, swipe, or color.

## Radial navigation — confirmed behavior

Three top-level pages, reachable by visible tabs and swipe:

| Page | Contents | Selection behavior |
| --- | --- | --- |
| Quick tools | Individual pen variants, highlighter variants, eraser variants, and one lasso slot | Select and close immediately, including reselecting the current variant |
| Settings/actions | Current-tool color and size access, undo/redo; other applicable settings as supported | Color and size open radial submenus |
| Favorites | Saved pen presets | Apply preset and close |

Lasso variants are not separate quick slots. Their settings belong in expanded selection settings. Do not turn the highlighter-only eraser filter into an invented eraser variant; its placement must follow FER-23's mode/filter distinction.

Remember only the last top-level page, device-local and across documents for the current application session. No restart persistence is required. Closing inside a submenu and reopening returns to its Settings parent, never to a submenu. Do not store this navigation state in synced documents. Draft first-open default: Quick tools.

Size submenu: a continuous circular slider with numeric value and live stroke preview. Apply size as it changes. Releasing the slider keeps the submenu open for inspection; starting to draw dismisses it. Provide keyboard adjustment, accessible minimum/maximum/current values, and tool-specific bounds. Avoid a jump when crossing the angular seam or leaving the ring. A canceled pointer gesture must terminate capture cleanly.

Color submenu: a radial palette for quick selection plus More colors leading to the full picker. A quick-color choice applies and closes the radial. The full picker preserves Done/Cancel. Reopening still lands on Settings. Tool colors, recent colors, and defaults remain tool-specific.

Draft undo/redo rule: keep the page open for repeated actions; disable unavailable history actions. Back returns to the parent page; explicit close or Escape closes the radial. Swipe recognition must not compete with circular-slider manipulation or activate a tool accidentally.

## Component composition

Use the same tool button, indicator, preview, numeric control, swatch, popover shell, and dialog conventions across surfaces. Keep document operations in each adapter, not in visual components. Treat stroke width as document-space data and target/icon size as screen-space UI. Labels should avoid calling all width values screen pixels.

Selection affordances use theme accent outlines with an additional visible shape/dash treatment. Handle targets stay comfortable at any zoom. Ink selection must remain distinct from native Canvas card selection. Future mixed-object width resize follows the confirmed text-reflow rule, not font scaling; detailed text styling remains FER-56/57 scope.

## Review and remaining design work

The Foundations story shows current production toolbar, pen menu, and picker as the audit baseline, alongside theme-token samples. It does not simulate unimplemented radial pages, circular controls, or final illustrations. Existing radial/favorites stories remain the source for current behavior.

Before broad adoption, review the Fountain silhouette at actual toolbar size and its matching illustrated tip in a representative pen menu. Check light/dark, compact desktop, tablet targets, long labels, large text, viewport edges, selected/disabled/focus states, black/white ink indicators, and reduced motion. Use locally extracted Obsidian CSS; fallback CSS is not visual approval. Then validate real Obsidian and Galaxy Tab/S Pen for stray ink and unchanged mouse/touch navigation.

Open layout work: fitting all quick variants without shrinking targets (the current renderer has six slots); radial palette composition; circular slider sweep, bounds, and edge positioning; final illustration assets; highlighter-only filter placement. These are explicit prototype questions, not permission to omit agreed variants. The page taxonomy and icon direction are settled.

Draft is ready for product review only after `pnpm check` and Storybook build pass. Final visual/device acceptance and adoption are still outstanding.

## References

- [FER-46](https://linear.app/fdqr/issue/FER-46/define-the-canvas-scribe-style-guide-and-component-inventory)
- [V2 decision register](https://linear.app/fdqr/document/v2-decision-register-adde45104230)
- [V2 research](https://linear.app/fdqr/document/v2-research-and-implementation-recommendations-2197a245ebdf)
- [Component inventory](component-inventory.md)
- [Storybook host and limitations](storybook-obsidian-environment.md)
- [Device validation](device-test.md)
