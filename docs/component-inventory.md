# Canvas Scribe component inventory

FER-46 draft · audited against main 7222be4 on 2026-09-08. “Current” describes code, not device validation. Desired rules are in [the style guide](style-guide.md).

| Area | Current production source | Current stories | Gap / next owner |
| --- | --- | --- | --- |
| Toolbar | `src/canvas-controls.ts`; integration in `canvas-ink-layer.ts` | Toolbar; Pen Menu | Native Canvas control classes; only pen repeat-tap opens settings. Shared sizing, states, and activation: FER-51 |
| Tool identity | `src/tool-indicator.ts` | Toolbar variants | Generic host IDs and separate story SVG fixtures. Shared original silhouettes + matching settings illustrations: FER-49 |
| Pen settings | `src/pen-menu.ts`, `src/pen-types.ts` | Pen Menu | Four pen types, stroke previews, linear thickness slider. No illustrated tips; fixed sizes/radii mixed with host tokens. FER-49/51 |
| Highlighter settings | State and actions in `canvas-ink-layer.ts`, `pen-actions.ts` | Ink; Color Picker | Dedicated type/width/opacity menu and over-text preview: FER-42 |
| Eraser settings | Gesture/render orchestration in `canvas-ink-layer.ts` | Toolbar; Radial Menu | Whole-stroke baseline; area mode and highlighter-only filter: FER-23 |
| Selection | `src/selection.ts`, SVG affordances in `canvas-ink-layer.ts` | Toolbar lasso state | Lasso path/bounds and selected glow; reusable resize handles and isolated selection-state stories absent. FER-22/51; mixed objects FER-57 |
| Radial shell | `src/radial-menu-view.ts`, `radial-menu.ts`, `radial-session.ts` | Radial Menu | Six fixed positions, nested actions, collection paging. Three top-level tabs/swipes and session memory are not implemented. FER-51 |
| Radial actions | `src/pen-actions.ts` | Radial Menu | Existing Pen/Highlighter/Eraser, Colors, Favorites, More hierarchy. Variant slots, circular size selector and palette redesign: FER-51 with tool issues |
| Quick-color drawer | `canvas-ink-layer.ts` | Toolbar palette state | Inline builder; extract/shared controls and stronger current/default/recent hierarchy: FER-39/51 |
| Full picker | `src/color-picker.ts`, `colors.ts` | Color Picker | Production Swatches/Spectrum, pending edits, Done/Cancel, defaults/recent colors. Preserve transactional behavior; unify shell/focus: FER-51 |
| Favorites | `src/favorite-manager.ts`, `favorite-pens.ts` | Radial Menu empty/paged favorites | Production preset rows/editor; no dedicated manager state story. Preserve save/cancel semantics; shared fields/dialog and new top-level page: FER-51 |
| Popup positioning | `src/popover.ts`; lifecycle in `canvas-ink-layer.ts` | Pen Menu | Reusable placement math, separate dismissal/focus handling. Standardize shell and gesture dismissal: FER-51 |
| Dialogs/destructive actions | Picker/favorite backdrops; host UI in `src/main.ts` | Picker; Diagnostics | Audit keyboard focus/restore, validation, destructive labels and empty states before shared adoption. FER-51 |
| Handwriting hint | `src/handwriting-affordance.ts` | Handwriting Affordance | Existing theme-based outline/hint; preserve native text and pen routing |
| Diagnostics | `src/input-diagnostics.ts`, `debug-report.ts` | Diagnostics | Secondary support UI should inherit typography/focus tokens |
| PDF / handwritten-note controls | No production adapters in this baseline | None | Apply same component vocabulary when FER-53/55 adapters exist; do not claim host integration from Canvas stories |

## Audit findings

- Styles already use Obsidian colors, but spacing, typography, radii, and shadows mix literals with tokens. Pen menu has 44 px minimum buttons, radial buttons use 50 px, toolbar inherits host sizing, and radial paging has 40 px minimum height.
- Selected toolbar/radial buttons use accent fill; pen choices use a border/tinted background. Disabled opacity varies. Define semantics first, then harmonize treatments without obscuring ink color.
- Current production pen types exist in this baseline; older rollback notes do not describe current main.
- Storybook imports production DOM builders, but icons use local fixtures and host JavaScript is not running. The mobile fixture is capped at 430 px: it is a narrow-layout example, not a Galaxy tablet viewport or device validation.
- No production circular slider, three-page radial navigation, or complete original icon family exists yet. The draft records their contract; implementation belongs to linked delivery work.

## Coverage to add during adoption

Every interactive component: light/dark, desktop/tablet, keyboard focus, selected, disabled, large text, long labels, and viewport edges. Add dedicated favorites edit/error/empty cases, selection handles at different document zooms, radial overflow and page-memory cases, circular-slider seam/cancel/keyboard cases, and picker cancel/confirm return paths. Keep stories tied to production builders; do not duplicate implementation markup to make a preview look complete.
