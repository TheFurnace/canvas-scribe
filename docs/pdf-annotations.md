# PDF annotations (v2 beta)

Open a PDF normally in Obsidian. Scribe starts in **Reading** mode, showing saved marks while retaining native text selection, links, and existing PDF annotations. Toggle stylus input in the floating Scribe toolbar to annotate: the pen draws and fingers pan/pinch. Mouse input remains native.

The PDF toolbar reuses the shared pen, Pencil, highlighter, eraser, selection, color picker, and favorite controls. Tap the active tool or **Tool settings** to configure it. Erasers can remove whole strokes or areas, with an optional highlighter-only filter. Lasso/rectangle selection can move, scale, recolor, or delete Scribe ink. Every gesture and transform stays within its page. Clear affects the current page's Scribe marks and is undoable. Drawing canceled by the host or a changing viewport is discarded rather than saved at uncertain coordinates.

## Storage and recovery

The first annotation creates `Scribe PDF annotations/<document-id>.json` inside the vault. This dedicated, non-hidden root does not mirror PDF folders. Renaming or moving a PDF updates its association while its companion path stays unchanged. The versioned JSON stores stable document/object IDs, a SHA-256 source fingerprint, page boxes/rotation, and unrotated PDF-coordinate ink.

Keep the PDF and annotation root in sync on every device. For Obsidian Sync, enable **Sync all other types** and include the root folder. The plugin does not provide cross-device concurrent editing or automatic merge. Two views inside one Obsidian instance share a save owner and document history.

An offline move is reconciled only when the companion and unchanged source are uniquely identifiable. Source replacements, duplicate fingerprints, missing files, and conflict copies require **Review / relink**. Choosing a version explicitly preserves the other conflicting versions in `Scribe PDF recovery/`. A changed PDF with identical page geometry requires confirmation that marks should remain at the same page numbers/coordinates. Different page geometry requires manual recovery; automatic page remapping is unsupported.

External changes never silently overwrite local ink. A failed save attempts a separate recovery JSON; if the vault cannot be written, keep the view open and use **Download recovery**. Unsupported/future or damaged companion formats are preserved, with a clear error. A damaged JSON in the annotation root must be repaired or moved out of that root before annotation loading can continue. Recovery files may be inspected or restored manually; they are never silently discarded.

## Export

**Export annotated PDF** exports all pages to a new `<name> annotated.pdf` beside the source, adding a numeric suffix on name collisions. It preserves source text, links, page rotation, and crop settings. Shared vector outlines reproduce pen/Pencil/highlighter marks and area-erased fragments in page content. The source PDF and editable companion stay unchanged. Cancel before writing to stop an export; once the final new-file write begins, it may complete.

Encrypted/password-protected PDFs are outside initial annotation/export support. Native reading remains available where Obsidian supports it. PDF text boxes, text-aware highlighting, modification of existing PDF annotations, native editable annotation export, and round-trip import are outside this delivery. The built-in PDF viewer adapter uses isolated, capability-checked private APIs; unsupported hosts retain reading with a recoverable annotation status.

## Validation and remaining acceptance

See [PDF feasibility and validation](pdf-validation.md) for exact host versions, fixtures, measurements, and limits. Desktop driver input and automated tests do not establish physical Galaxy/S Pen acceptance. Performance budgets require product approval before becoming release gates in FER-59.
