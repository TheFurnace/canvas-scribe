# FER-71 / FER-72: Note tools and tablet radial controls

## Changes

- Handwritten notes open the shared settings menu when the active toolbar tool
  is tapped again. Pen/highlighter type, size and color controls now affect new
  strokes; the color toolbar action opens the full transactional picker.
- Stylus barrel-button input and context-menu input open the shared radial.
  The paired contextmenu event is suppressed after barrel activation, and no
  stroke is created by the opening action. The note radial omits the host-menu
  shortcut; settings remain available by tapping the active toolbar tool again.
- Stroke/area erasing, highlighter-only filtering and screen-space eraser size
  use the selected settings. Clear ink preserves text and is undoable. Selection
  supports rectangle/lasso, partial ink selection, ink scaling and recoloring.
- Note views receive the plugin's shared, persisted favorite collection.
  Menus and radial overlays close on document replacement and view destruction.
- Radial page selector artwork increased from 20 px to 28 px in mobile/coarse
  pointer layouts and 24 px on desktop. Buttons remain 44 by 44 px and icons
  cannot shrink inside them.
- This branch includes the prior FER-70 sidebar swipe opt-out.

## Validation

- `pnpm check`: 33 test files, 190 tests passed; TypeScript and production build passed.
- `pnpm build:storybook`: passed (existing bundle-size advisory).
- Six new note interaction tests cover menu changes in serialized strokes,
  barrel/contextmenu deduplication without ink, radial highlighter selection,
  area/highlighter-only erasing with text preservation and undo, rectangle
  selection with scaling and undo, shared favorite application, overlay cleanup,
  color confirmation, radial undo/redo, and omission of the host-menu shortcut.
- Browser verification on the production handwritten-note Tablet story:
  settings opened from the active Pen button; Pencil selection updated the
  toolbar; the full color picker opened; right-click opened the radial.
  All three page icons measured 28 px within 44 by 44 px buttons. Inspected
  the settings and radial screenshots in the light tablet theme.
- Browser verification on the production Dark desktop story: radial opened,
  all three page icons measured 24 px within 44 by 44 px buttons, and the dark
  radial screenshot retained readable icons and controls.
- Browser validation used the story's mouse-as-stylus preview, not physical
  Galaxy input. DOM tests exercise synthetic pen events.

## Remaining acceptance

Beta 2.0.0-beta.7 was published for tablet validation. The final removal of the
note radial's Tool settings shortcut was committed afterward and requires a
new beta for device testing. Verify the
three radial page icons at normal device scaling, active-tool second tap,
S Pen barrel-button opening and dismissal, tool setting effects on new strokes,
favorites, erasing, undo, finger scrolling, and the FER-70 sidebar fix.
Tool settings remain editor-local; favorites use plugin persistence.
The branch includes the beta.7 version metadata; its published tag is unchanged.
