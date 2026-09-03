# Nitpick backlog

Small interaction and quality improvements observed during Galaxy tablet testing. These are intentionally deferred for a focused nitpick pass.

## Absolute brush width

The apparent brush width currently changes with Canvas zoom and grows when zooming out. Make brush width screen-space absolute so a selected width has a consistent physical appearance at every Canvas zoom level.

Acceptance check: draw comparable strokes before and after zooming, then change zoom while viewing them. Stroke thickness should remain visually consistent rather than scaling with the Canvas.

## Quick color swapping

Add a low-friction way to switch among recently used or pinned pen and highlighter colors without opening a full settings interface.

The interaction should be comfortable with the S Pen and should not obstruct native Canvas controls.

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

## Samsung scribble-to-text integration

Investigate integration with Samsung's S Pen handwriting-to-text behavior, commonly exposed as “S Pen to text” or scribble-to-text. Determine which behavior is available to Obsidian's Android WebView and whether handwritten input can be directed into Canvas text cards without compromising normal drawing.

This item requires device-level capability testing before choosing an implementation. Record Android, One UI, Obsidian, and WebView versions during that investigation.
