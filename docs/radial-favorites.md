# Favorite pens and radial navigation (FER-26 / FER-40)

Accepted home ring: Pen, Highlighter, Eraser, Colors, Favorites, More. Undo and
Redo remain available in the existing controls/commands, but have no radial entry.

Each opening starts at home. Categories replace the ring around its original
center, with six fixed slots. The center closes at home and returns home from a
category; Escape or an outside tap dismisses the entire flow. Collections longer
than six entries have explicit Previous/Next controls and a page count. More
contains the native Canvas context-menu escape hatch.

Colors is disabled for Eraser and Lasso. For Pen and Highlighter, quick choices
combine recent and pinned colors, with a tool-default action and the existing
full picker. Picker edits remain pending until Done; Cancel discards them.

Favorites stores named tool, pen type, color (including theme-following default),
thickness, and opacity presets in plugin data, shared across Canvas views. The
Favorites ring begins with Save / manage favorites, followed by stroke previews.
Its separate management dialog supports saving the current drawing tool,
renaming, editing, reordering, and removing presets. Editor changes require Save
changes; Cancel preserves the preset. Applying a favorite changes subsequent
strokes only. Existing Canvas strokes retain their stored appearance.

Implementation: `pen-actions.ts` builds the shared production/Storybook actions;
`radial-session.ts` owns navigation and dismissal; `favorite-pens.ts` validates and
stores presets. Plugin writes are serialized to preserve the latest ordering.

Validation: `pnpm check` and `pnpm build:storybook`; interactive Radial Menu
stories cover empty/paged favorites, Eraser, Highlighter, light/dark and mobile.

Remaining device validation: use Galaxy Tab/S Pen in light/dark themes, open near
viewport edges, page favorites, save/edit/apply presets, cancel/confirm colors,
and dismiss onto Canvas. Verify no stray ink/native action and that favorites
survive plugin reload and are available on another Canvas. No beta published yet.
