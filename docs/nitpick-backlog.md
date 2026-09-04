# Nitpick backlog

Small interaction and quality improvements observed during Galaxy tablet testing. These are intentionally deferred for a focused nitpick pass.

## Absolute brush width

The Canvas-space width assigned to a new stroke currently changes with Canvas zoom, so ink drawn after zooming does not match existing ink. Keep the selected brush width absolute in Canvas coordinates regardless of the zoom at which a stroke is created. Completed strokes should continue to scale normally with the Canvas.

Acceptance check: draw comparable strokes before and after zooming, then view them at the same zoom level. Their thickness should match. Changing zoom while viewing completed strokes should scale all of them together with the Canvas.

## Quick color swapping

Add a low-friction way to switch among recently used or pinned pen and highlighter colors without opening a full settings interface.

The interaction should be comfortable with a stylus and should not obstruct native Canvas controls.

## Pen and stylus terminology

Use **pen** exclusively for the brush style and **stylus** exclusively for the input method throughout labels, tooltips, settings, and documentation.

Swap the brush and input-toggle icons so the pen brush uses the fountainhead icon and the stylus input toggle uses the stylus icon.

Acceptance check: the interface should never use “pen” to describe the input device, and each icon should consistently represent its corresponding brush style or input method.

## Eraser size and cursor

Give eraser mode a larger default brush size so strokes are easier to target and remove without excessive scrubbing.

While erasing, show a circular cursor that clearly represents the eraser's active footprint. The circle should track the pointer accurately and reflect the current eraser size at every Canvas zoom level.

Acceptance check: switching to the eraser should select its larger default size, and hovering or dragging over the Canvas should display a circle matching the area that will be erased.

## Lasso tool

Add stylus-friendly lasso selection for existing ink. The first pass should support selecting one or more strokes and moving them together; deletion and other transforms can be evaluated alongside it.

Selection should operate in Canvas coordinates and remain accurate at different pan and zoom levels.

Tablet follow-up: moving a selection currently requires the stylus. Decide whether lasso mode should also let one finger move selected ink or preserve the global interaction rule that a finger always pans the Canvas. Until that choice is tested, keep stylus-only movement.

## Samsung scribble-to-text integration

Investigate integration with Samsung's S Pen handwriting-to-text behavior, commonly exposed as “S Pen to text” or scribble-to-text. Determine which behavior is available to Obsidian's Android WebView and whether handwritten input can be directed into Canvas text cards without compromising normal drawing.

This item requires device-level capability testing before choosing an implementation. Record Android, One UI, Obsidian, and WebView versions during that investigation.

Investigation status: [platform findings, the non-invasive editor pass-through, and the device matrix](stylus-to-text.md) are documented. Real-device combinations remain intentionally unverified until the matrix is run on Galaxy hardware.
