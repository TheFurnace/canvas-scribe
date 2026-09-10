# Handwritten notes

Canvas Scribe handwritten notes are authoritative, versioned `.scribe` files. They are JSON so vault sync, backup, rename, conflict copies, and version control can preserve the complete document without a hidden database. Obsidian links and backlinks can target the file itself. Text-box content is ordinary text and is never parsed as Markdown or `[[links]]`.

## Format decision

The chosen single-file format keeps ink, text, geometry, layer order, content extent, and viewport state atomic. A Markdown-plus-companion design was rejected for v2 because it would create two writers and ambiguous rename/conflict recovery without providing a required fallback editor. Without Canvas Scribe, the `.scribe` file remains readable JSON and is preserved; meaningful editing is not promised.

The root schema is:

```json
{
  "kind": "canvas-scribe-handwritten-note",
  "version": 1,
  "logicalWidth": 960,
  "contentHeight": 1200,
  "viewport": { "scrollTop": 0, "zoom": 1 },
  "objects": []
}
```

Objects are ordered back-to-front and have stable IDs. Ink objects preserve stroke samples, frozen cutout outlines, tool style, pressure, and timestamps. Text objects preserve position, width, plain text, font size, color, and whole-box alignment. Future migrations must be explicit by root version. Unknown versions and invalid files display a non-editing error state and the custom view returns the original bytes, preventing an incidental close/save from overwriting them.

`contentHeight` records meaningful document extent. The editor adds temporary spare space below it without serializing that spare height. This makes the page grow naturally while keeping stored geometry and embed height deterministic. The 960-unit logical width never changes when the viewport fits or zooms.

## Editing and input ownership

The dedicated view uses the shared pen, highlighter, eraser, lasso, undo/redo, tool state, stroke geometry, and icon components. Coordinates, scroll, zoom, extent, and file lifecycle remain note-specific.

- Pen contact draws; finger and wheel input retain native viewport scrolling.
- Text boxes can be created, edited with keyboard/IME composition, moved, width-resized, and deleted. Editing consumes the textarea gesture so it cannot leak ink.
- Width resize reflows plain text without scaling its font. V2 whole-box styles are font size, text color, and alignment using the Obsidian text font.
- Lasso can select mixed ink and text. Selected objects move together in layer order. Erasing affects ink only; text deletion is explicit.
- Each completed draw, text edit, move, resize, style change, and deletion is one document-history action. Undo/redo snapshots retain stable IDs and full geometry.

Obsidian's `TextFileView` lifecycle coordinates save/reload and multiple views of the same source file. External modifications are reparsed through `setViewData`; valid changes replace the view snapshot, while invalid or future versions remain untouched. A sync conflict copy is an independent `.scribe` file and can be opened or linked like the original.

## Read-only embeds

The same renderer is used by the editor and embeds. Markdown Reading view, rendered Live Preview embeds, and Canvas file-card candidates are upgraded from the source `.scribe` file. Each embed is a fixed 360px-high, vertically scrollable viewport with an **Open note** action. It has no editing controls and does not copy source data. Source modification refreshes every mounted instance; rename updates tracked instances; missing and unsupported files show explicit states.

Within Canvas, a surrounding Canvas Scribe ink layer remains owned by the Canvas: drawing over the card creates Canvas ink and never edits the embedded note. The preview consumes touch scrolling only inside its scrollable viewport and leaves mouse/stylus behavior to the host outside it. Canvas DOM discovery is a private-host seam and must be checked after Obsidian updates.

## Verification fixtures and review gate

Automated coverage includes format round-trip, invalid/future versions, unique IDs, mixed movement, text reflow invariants, stored-versus-spare extent, read-only rendering, and the complete existing Canvas regression suite. Storybook includes the editable short note, a 5,200-unit long note, read-only scrolling embed, themes, and tablet controls.

Final human review should use those stories and the real-Obsidian sandbox, then record:

1. Two open views editing and reopening the same file; an external valid edit; an invalid edit; a future-version copy; rename/move; deletion; and a sync-conflict copy.
2. Markdown Reading and Live Preview plus Canvas cards, including multiple embeds, source refresh, open-source action, fixed-height scrolling, keyboard focus, wheel/touch routing, and surrounding Canvas navigation/ink.
3. Desktop and Galaxy Tab/S Pen versions; long-note load/redraw/navigation/history observations; memory evidence; pen latency; touch scrolling; IME/keyboard editing; viewport resize and fit/zoom.

The long-note performance numbers remain proposals until measured on desktop and Galaxy hardware and approved as FER-59 release gates. No arbitrary latency or memory threshold is claimed by this implementation.
