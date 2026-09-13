# FER-76 color coherence

Implementation on `codex/FER-76/color-coherence`, based on `e789d5e` (merged global tools suite). No version bump or release.

## Agreed behavior

Pen **Theme** and highlighter **Default** are semantic selections (`null`), never inferred from matching hex values. A matching explicit swatch may coexist with the default, but only the selected choice has a selection mark. PDF retains its dark page default, explicitly confirmed during this pass; other pen surfaces follow their theme. Highlighter retains its constant fallback. Existing strokes and file formats are unchanged.

The existing plugin-wide `InkToolState` owns selections and separate pen/highlighter histories for Canvas, handwritten notes and PDFs. The radial applies selections immediately but records only its final explicit selection when the whole radial closes, including Escape/outside dismissal. Returning to Settings or opening/canceling the nested picker does not commit history. The drawer closes on selection; its confirmation records history. Picker edits remain local until Done.

The color ring has ten 44-pixel targets around a 92-pixel radius. Default occupies a fixed slot, followed by up to three recent explicit choices (the opening explicit selection comes first). Swatches occupy the remaining five to eight slots, with More colors in the last fixed slot. Recents use an inset arc track and the default has a dashed surround, without visible section labels. The swatch segment clips overflow and supports wheel, pointer drag and arrow/Home/End keys. Dragging suppresses its resulting pointer click; keyboard selection remains available. Positions and scroll offset persist throughout the radial lifetime.

The first view centers on the nearest remaining swatch to the selected color, or starts at the beginning for Theme/Default. Deduplication is exact normalized hex equality, never visual similarity. Color distance is used only for navigation. Old stored histories are retained: historical default seeding has no provenance, so removing matching hex values would erase legitimate explicit selections. New histories no longer seed a resolved default.

## Approved shared collections

`TOOL_SWATCHES` / `toolSwatches(tool)` provide one collection for each tool, consumed by radial, drawer, picker and tool-menu quick choices. Collections are keyed by tool and separate from selection/history, ready for a future configuration provider. The user approved the proposed 24 pen and 16 highlighter colors. These exact collections replace the temporary legacy palettes.

The **Canvas Scribe / Color Curation / Proposed Sets** story now reads the approved production collections directly (the existing URL is retained). It previews selected colors on light/dark backgrounds, with highlighter at 38% opacity. All color menus consume these same approved collections or subsets.

## Visual references

Reviewed the existing local gallery and the following user-provided Samsung Notes images. The references inform hue/tone ordering, distinct recents, round swatches and compact tool-centered controls. Proposed hex values are original curation, not sampled claims about Samsung's exact palette.

- [Pen menu, September 12](../../../ui-references/images/samsung-tools-123607.jpg)
- [Highlighter menu, September 12](../../../ui-references/images/samsung-tools-123614.jpg)
- [Swatches picker, September 6](../../../ui-references/images/samsung-palette-175930.png)
- [Source-linked local gallery](../../../ui-references/index.html)

Paths resolve in the prescribed `dist/worktrees/color-coherence` checkout. Original image provenance and dates remain in the gallery's `references.json`; screenshots do not establish a current app build or physical-device acceptance.

## Validation and review gate

- `pnpm check`: 210 tests pass, including close-only history, matching semantic/fixed choices, nested picker Done/Cancel, global persistence, keyboard collection access and drag without selection.
- `pnpm build:storybook`: passes.
- Browser review: radial selection stays open; wheel and drag scroll without reordering fixed choices; picker Cancel returns to the radial with the prior selection and offset; Theme updates the tool; drawer selection closes. Light layout and dark 320 × 640 radial reviewed with the installed Obsidian 1.13.7 stylesheet.
- Interactive curation sample verified for pen and highlighter.

Palette contents and order approved and integrated. Real Obsidian runtime and physical Galaxy/S Pen acceptance have not been established by this pass.
