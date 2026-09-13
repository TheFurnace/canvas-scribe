# FER-73 / FER-75 coherence fixes

## Behavior and compatibility

Canvas, PDF annotations, and handwritten notes receive one observable tool preference store from the plugin. Menus, radial actions, favorites, and quick colors use shared composition; note text/page actions remain in the note editor. Existing command IDs dispatch to the active supported view. Gesture settings are snapshotted at pointer-down.

Plugin settings persist validated current tool settings, favorites, and recent colors through one serialized save path. A missing global preference starts with the suite defaults. Legacy Canvas pen/highlighter settings no longer replace global choices when opening a file or receive preference-only writes; existing stored ink and document fields retain their appearance and compatibility. No storage schema or version changes are introduced.

Default color remains semantic in preferences and favorites. Canvas/note toolbar previews follow the theme; PDF resolves to dark ink on white paper. Fixed colors remain fixed. Default is indicated in the menus and their large color controls, with accessible labels/selected states in radial colors and the full picker. The toolbar palette icon has no D badge; its accessible Default description is retained. A host theme class/style change dismisses transient menus (including unconfirmed picker edits); reopening resolves the new surface color. Existing stored document colors are preserved.

Handwritten-note group scaling and recoloring include ink and text, preserve IDs/order, leave unselected objects unchanged, and create one undo step. Scaling transforms positions, text width/font size, and ink together; text format limits constrain the whole group uniformly. The individual text width handle still reflows without scaling its font. Partial/full enclosure settings use rendered ink geometry and text bounds for lasso and rectangle selection.

PDF pointer cancellation keeps partial ink when the document is still current. Superseded documents and conflicts remain guarded. External-file recovery policy (FER-74), document-owned shared history, and other cancellation policies remain separate work.

## Verification

- `pnpm check`: production build, synchronized beta.7 version metadata, 202 passing tests across 34 files.
- `pnpm build:storybook`: passed with the existing Vite large-chunk advisory.
- New regression coverage: global restoration/validation, cross-view tool changes, gesture snapshots, note-only text mode, legacy Canvas preference isolation, favorites, PDF radial/context passthrough, Default versus identical fixed hex, theme cleanup, partial text selection, and mixed scaling/recolor with undo/redo.
- Existing note tests continue to cover text width reflow and input ownership. PDF cancellation regression now asserts partial-ink preservation and rejects superseded edits.
- Production-component browser checks in Shared Tools desktop/dark stories: cross-view pen/color propagation, Default menu indicators, quick colors, and PDF radial Default selection. PDF here is a tools preview, not the native Obsidian viewer.

## Remaining acceptance

Real Obsidian multi-pane/restart commands, native PDF context menus, light/dark transitions, and physical Galaxy Tab/S Pen/barrel/palm behavior need host/device review. Browser and DOM tests do not establish those checks. No release was published by this PR.
