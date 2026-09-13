# Canvas Scribe component inventory

FER-77 · baseline `3fc6dc7` from colors PR #24. Read alongside the [style guide](style-guide.md). This replaces the historical FER-46 inventory; Git history retains that audit.

The visual guide progresses from foundations to surface layouts. Production examples retain their real styling; labelled target samples show proposed corrections separately.

| Level | Ingredient/component | Production source | Guide location / further story |
| --- | --- | --- | --- |
| Foundation | Theme roles, typography, dimensions | `styles.css`; host Obsidian CSS | 01 Foundations |
| Foundation | Pen/highlighter ink palettes and semantic defaults | `src/colors.ts`; surface default resolvers | 01 Foundations / Color Curation |
| Element | Original tool artwork | `src/tool-icons.ts` | 02 Basic elements / Tool Icons |
| Element | Ink indicators | `src/tool-indicator.ts` | 02 Basic elements / Toolbar |
| Element | Labels, values, boundaries and state marks | `src/ui-controls.ts`; `styles.css` | 02 Basic elements |
| Control | Tool icon button | `src/tool-icon-button.ts` | 03 Controls |
| Control | Toolbar actions and synchronization | `src/canvas-controls.ts` | 05 Surface layouts / Toolbar |
| Control | Swatches, actions and numeric controls | `src/ui-controls.ts` | 02 Basic elements / 03 Controls |
| Control | Pen/highlighter previews | `src/pen-menu.ts`; `src/highlighter-menu.ts`; `src/geometry.ts` | 03 Controls / Pen Menu / Highlighter Menu |
| Control | Circular width/opacity | `src/circular-size.ts` | 04 Components / Radial Menu |
| Component | Shared tool-menu shell and composition | `src/ui-controls.ts`; `src/tool-suite.ts` | 04 Components |
| Component | Pen/highlighter settings | `src/pen-menu.ts`; `src/highlighter-menu.ts`; `src/tool-menu-colors.ts` | 04 Components |
| Component | Eraser/selection settings | `src/eraser-menu.ts`; `src/selection-menu.ts` | Expanded Tools |
| Component | Color drawer | `src/quick-colors.ts`; `src/tool-suite.ts` | 04 Components / Quick Colors |
| Component | Full picker | `src/color-picker.ts` | 04 Components / Color Picker |
| Component | Radial shell, pages and color arc | `src/radial-menu-view.ts`; `src/radial-session.ts`; `src/radial-pages.ts`; `src/radial-colors.ts` | 04 Components / Radial Menu |
| Component | Favorites | `src/favorite-manager.ts`; `src/favorite-pens.ts` | 04 Components radial / Favorite Manager |
| Composition | Popup placement and lifecycle | `src/popover.ts`; view adapters | Host integration review |
| Surface | Global tool preference state | `src/ink-tool-state.ts`; `src/tool-suite.ts` | 05 Surface layouts / Shared Tools |
| Surface | Canvas | `src/canvas-ink-layer.ts`; `src/canvas-controls.ts` | 05 Surface layouts / Toolbar; real host for native behavior |
| Surface | Handwritten note | `src/handwritten-note-editor.ts`; renderer and embeds | 05 Surface layouts / Handwritten Note |
| Surface | PDF annotation | `src/pdf-tools.ts`; PDF adapter | 05 Surface layouts / PDF Tools; real native viewer review |

## Proposed consistency work

P1 spacing roles, P2 floating-shell geometry/elevation, P3 independent selected/focus treatments, and P4 focus restoration are described in the guide's review register. They are not hidden CSS overrides on production samples. The guide does not claim those migrations are complete.

## Coverage boundaries

The guide's interactive examples use temporary local state. Component builders own their rendered behavior; the fixture supplies document-independent callbacks, disabled history where there is no document, and cleanup. Light/dark links work in a standalone preview as well as Storybook. The narrow fixture constrains the guide to 390 px; a mobile story is not physical Galaxy validation.

Dedicated stories remain appropriate for long documents, selection transforms, favorites error/empty states and radial edge cases. The guide explains how their parts compose; it does not replace full interaction, accessibility, real-host or physical-device acceptance.
