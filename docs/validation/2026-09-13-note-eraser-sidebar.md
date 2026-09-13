# FER-70: Handwritten-note eraser opens the sidebar

The user reported that stylus movement with Eraser selected opens an Obsidian
sidebar in the latest beta (published release verified as 2.0.0-beta.6).

## Cause and change

Local Obsidian 1.13.7 code inspection shows that the mobile sidebar swipe
recognizer listens to `touchstart` independently of PointerEvents. It walks the
target's ancestors for a truthy `data-ignore-swipe` before recognizing a swipe.
Native Canvas supplies this marker; the handwritten-note viewport did not.
Preventing the editor's PointerEvents alone therefore does not protect against
the separate TouchEvent sequence when the host does not identify it as a stylus.
The user's physical event stream has not been recorded.

The handwritten-note viewport now uses the native Canvas opt-out. This protects
all note tools, including erasing empty space, which does not replace the page.
The existing pointer-based finger pan remains available. The marker is scoped
to the viewport, leaving other Obsidian surfaces unchanged.

## Validation

- `pnpm check`: 32 test files, 184 tests passed; TypeScript and production build passed.
- New regression covers erasing empty space, crossing into ink, page replacement,
  pointer cancellation, undo, and finger scrolling with Eraser selected.
- Executed the actual mobile swipe-recognition function extracted at runtime
  from the locally installed `obsidian-1.13.7.asar` in happy-dom, with mobile mode
  enabled and equivalent DOM/event shims. A horizontal TouchEvent sequence with
  no stylus classification reached the swipe callback without the marker. The
  same sequence did not reach it with the marker. A sequence on a sibling outside
  the protected viewport still reached the callback.
- No Obsidian source was copied into the repository. This harness result is not
  a physical Galaxy/S Pen test or a live mobile sidebar animation test.

## Device acceptance still required

In a new beta containing this fix, select Eraser and swipe the stylus horizontally
across blank note space and existing ink. Verify neither sidebar opens, ink erases
and can be restored with Undo, and finger scrolling still works. Repeat near both
screen edges and with a palm resting on the screen. Check sidebar access outside
the note viewport. Record the device, Obsidian version, and beta version.

No version bump or release is included in this change.
