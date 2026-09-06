# Galaxy device test

Track device-input results and follow-up work in [FER-11: Validate Galaxy stylus input mappings](https://linear.app/fdqr/issue/FER-11/validate-galaxy-stylus-input-mappings). Samsung handwriting-to-text validation is tracked separately in [FER-9](https://linear.app/fdqr/issue/FER-9/validate-samsung-handwriting-to-text-on-galaxy-hardware).

## Install

1. Follow the BRAT or synced-vault setup in [debug-workflow.md](debug-workflow.md).
2. Install the current build on the Galaxy tablet.
3. Reload Obsidian and enable **Canvas Scribe** under **Settings → Community plugins**.
4. Open or create a `.canvas` file.

## Core checks

1. Write slowly and quickly with the stylus. Ink should begin on contact and follow the nib.
2. Vary pressure. The pen width should respond without abrupt jumps.
3. Rest a palm after starting a stylus stroke. It should not pan the Canvas or create ink.
4. Pan with one finger and pinch with two fingers when the stylus is not touching. Native Canvas navigation should remain available.
5. With stylus input enabled, trigger the context menu with the S Pen button and with a mouse or touch long-press. The Canvas Scribe radial palette should replace each context menu, every radial action should respond, and **Open Canvas menu** should reveal Obsidian's original menu.
6. Switch among pen, highlighter, and eraser in the Canvas toolbar, then verify ink undo and redo.
7. Close and reopen the Canvas. All strokes should reload at the same positions.

## Capture device mappings

Run **Canvas Scribe: Clear debug history**, then **Canvas Scribe: Toggle stylus input diagnostics** from the command palette. Test these gestures:

- Hover without pressing a button.
- Write with light and heavy pressure.
- Hold the barrel button while hovering.
- Hold the barrel button and touch the screen.
- With stylus input disabled, hold the barrel button and drag across text in a Canvas card.
- With stylus input disabled, hold the barrel button and tap once to trigger the context menu.
- Repeat those text-drag and context-menu gestures with stylus input enabled to show whether Canvas Scribe's event cancellation suppresses either signal.
- Release the barrel button while the nib remains down.

The important fields are `button`, `buttons`, `pressure`, `selectstart`, `selectionchange`, and `contextmenu`. Note whether selection begins before the first contacting `pointermove`, and whether the context-menu event reports `pointerType=pen` or `button=2`. These mappings and event ordering can differ across Galaxy model, Android version, and Obsidian's bundled WebView.

When finished, run **Canvas Scribe: Export debug report**. Fill in the generated report and let the `Canvas Scribe Debug` folder sync back to the development computer. The paired Markdown log contains structured JSON with the exact button and pressure mappings.

## Validated mapping: Galaxy Tab S8+

FER-11 device validation passed on September 6, 2026, using Canvas Scribe `0.1.3-beta.11` (`2184081f4a7aed8a89ceecee548cfa24c86ffbe9`). The test device was a Galaxy Tab S8+ (`SM-X800`) running Android 16, One UI 8, Obsidian 1.13.8 (367), and Android System WebView/Chrome 151.0.7922.199. Testing used the built-in S Pen with **S Pen to text** enabled.

The source exports are:

- `canvas-scribe-2026-09-06T18-47-45-842Z.md` and its paired `-log.md` file for the core checks.
- `canvas-scribe-2026-09-06T18-52-51-253Z.md` and its paired `-log.md` file for the device mappings.

### Core results

All core checks passed:

- Slow and fast writing worked, and pressure changed ink width smoothly.
- Palm rejection worked while drawing.
- One-finger panning and two-finger zooming remained available when the pen was not touching.
- The S Pen button and a stationary stylus long-press opened the Canvas Scribe radial menu. Every radial action worked, including **Open Canvas menu** revealing Obsidian's original menu.
- Pen, highlighter, and eraser switching worked, as did undo and redo.
- Saved strokes reloaded in the same positions after closing and reopening the Canvas.

### S Pen event mapping

On this device and WebView combination:

- Hovering, with or without the barrel button held, produced no visible response and no captured hover mapping.
- Normal nib contact reported `pointerType=pen`, `button=0`, and `buttons=1`. Contacting `pointermove` events reported `button=-1` and `buttons=1`. The captured pen pressure range was 0 through 0.603.
- The barrel button was not exposed as `button=2` or `buttons=2` in the captured pointer events.
- A barrel-button tap or short stroke opened the context menu only after the nib lifted. Releasing the barrel button while keeping the nib down did nothing; lifting the nib still opened the menu.
- A stroke initiated with the barrel button held never produced ink. Longer barrel-button strokes generally produced no action, while taps and short strokes produced a context menu.
- With stylus input enabled, the resulting `contextmenu` was captured as a `PointerEvent` with `pointerId=0`, an empty `pointerType`, `button=-1`, and `buttons=0`; Canvas Scribe replaced it with the radial menu.
- With stylus input disabled, a barrel-button tap opened Obsidian's normal Canvas context menu. Captured normal-menu events could report `pointerType=mouse`, `pointerId=1`, `button=-1`, and `buttons=0`.
- Barrel-button dragging selected text when the Canvas card's text editor was already active, with stylus input either enabled or disabled. Dragging across an inactive card did not select text: short gestures could open the context menu, while longer gestures produced no action.

These results mean menu handling on this Galaxy stack must continue to recognize the synthetic `contextmenu` signal rather than depend on a pen `button=2` mapping. They also confirm that suppressing ink for barrel-initiated gestures does not prevent selection inside an already-active text editor.
