# Stylus handwriting-to-text investigation

Research date: 2026-09-03

Completion update: 2026-09-05

## Finding

Canvas Scribe should not implement handwriting recognition. Device testing showed that Android's handwriting mode intercepts the stylus before the input reaches the WebView. Canvas Scribe therefore sees either a web-delivered pen pointer stream that it can draw, or the text/composition result of upstream handwriting recognition—not the same stylus input offered to two competing handlers.

Device testing confirmed the platform boundary: handwriting recognition is handled by the operating system and selected input method, similarly to an Android software keyboard. While handwriting mode is active, the originating stylus events do not reach the WebView; Obsidian receives recognized text rather than the handwriting strokes. The editable surface supplies the location, bounds, selection, and caret context that the platform needs to choose the target and position handwriting operations.

Android 14 and later enable stylus handwriting for standard text fields, including WebView text widgets, when the selected input method supports the platform handwriting APIs. Android also warns that apps combining text fields with a drawing surface need explicit input routing. See [Android's stylus input in text fields guide](https://developer.android.com/develop/ui/views/touch-and-input/stylus-input/stylus-input-in-text-fields).

Chrome's Android team documented HTML handwriting support in Chrome and WebView on Android 14, plus earlier Samsung support beginning with One UI 5.1. See [What's new for web on Android 2023](https://developer.chrome.com/blog/whats-new-in-web-on-android-io2023#large_screen_device_support).

Samsung describes **S Pen to text** as a system setting that converts handwriting in search fields, address bars, and other text areas. Availability varies by model and software version. See [Samsung's S Pen settings guide](https://www.samsung.com/us/support/answer/ANS10003217/).

There is no browser JavaScript API in those platform guides for starting an Android stylus-handwriting session. Native delegation APIs such as `InputMethodManager.startStylusHandwriting()` belong to the host Android app, not an Obsidian community plugin. Canvas Scribe therefore cannot force the feature on or detect definitive availability from JavaScript.

## Obsidian and Chromium findings

Obsidian's own support discussion describes handwriting-to-text as an operating-system or community-plugin feature rather than an Obsidian feature. See [Handwriting status on the Obsidian forum](https://forum.obsidian.md/t/handwriting-status/77780) and the [earlier cross-platform handwriting discussion](https://forum.obsidian.md/t/built-in-support-for-handwritten-notes-mainly-for-mobile-apps-e-g-apple-pencil/28460).

Obsidian Mobile runs its plugin UI in a WebView that can be inspected with Chromium developer tools on Android. See [Obsidian's mobile plugin development guide](https://docs.obsidian.md/Plugins/Getting%20started/Mobile%20development).

Chromium documents the complete boundary for HTML handwriting input:

- Chromium detects writable HTML fields and initiates the Android handwriting-recognition session.
- Android commits recognized text through the `InputConnection` associated with the HTML field.
- Samsung Direct Writing expects Chromium to provide the field bounds, position on screen, and caret position; Chromium commits the recognized result through its IME adapter.
- The web page or Obsidian plugin does not receive a browser API for recognition or the raw handwriting strokes.

See Chromium's [Stylus Handwriting to HTML text input](https://chromium.googlesource.com/chromium/src/+/refs/heads/main/components/stylus_handwriting/README.md).

Obsidian's CodeMirror editor already handles browser composition and `beforeinput` events, including Android-specific behavior. The committed result may arrive as final text or through intermediate composition updates, but it remains text input rather than ink data. See [CodeMirror's input implementation](https://github.com/codemirror/view/blob/main/src/input.ts).

Other Obsidian drawing plugins use the same event-ownership model. The [Handwriting plugin](https://github.com/ellimist-afk/handwriting#how-it-works) describes an overlay that claims pen input while allowing typing, text selection, caret placement, and ordinary touch to pass through to Obsidian.

### `touch-action` risk

Chromium marks regions that are not eligible for stylus writing internally. Its source states that handwriting does not start when the `kInternalNotWritable` bit is set; a writable non-password edit field must permit panning. See Chromium's [`TouchAction` definition](https://chromium.googlesource.com/chromium/src/+/121.0.6167.85/cc/input/touch_action.h) and [stylus-writing input routing](https://chromium.googlesource.com/chromium/src/+/refs/tags/133.0.6925.1/components/input/input_router_impl.cc).

An [Obsidian HandTranscriptMd report](https://github.com/gabriele-cusato/HandTranscriptMd/issues/1) attributes a persistent handwriting-to-text failure to `touch-action: none` in a drawing view. The regional `touch-action` conflict is consistent with Chromium source, but the report's stronger claim that it poisons the entire shared WebView has not been independently corroborated. Its cited Ink issue concerns interrupted pen drawing rather than handwriting-to-text, so the persistent-state explanation remains a regression hypothesis rather than an established platform fact.

Canvas Scribe's render SVG uses `pointer-events: none`, so it does not change hit testing by itself. When the WebView receives pen pointer events and stylus input is enabled, the plugin's capture listeners handle those events throughout the Canvas, including over `input`, `textarea`, enabled `contenteditable`, and CodeMirror content. When Android handwriting mode intercepts the stylus upstream, those listeners are never invoked and cannot claim, cancel, or pass through the missing pointer stream. The full-screen radial menu temporarily uses `touch-action: none`; regression testing should verify handwriting before and after opening that menu.

## Integration in Canvas Scribe

Canvas Scribe captures web-delivered contacting pen input across the Canvas so a stroke remains continuous when it begins on, crosses, or ends over a card. This ownership applies only after the browser produces a pen pointer stream; it says nothing about stylus input already diverted into the platform handwriting pipeline.

The observable input paths are:

- If the WebView emits pen pointer events while Canvas Scribe stylus input is enabled, those events create ink over both the Canvas background and cards.
- If Android handwriting mode intercepts the stylus, Canvas Scribe receives no corresponding pointer events; recognized text may later arrive through the editor's normal input/composition path.
- Finger and mouse input retain Obsidian's native Canvas behavior.
- **Canvas Scribe: Toggle stylus input** controls only the plugin's handling of pointer events that reach the WebView. It does not enable, disable, or initiate the operating system's handwriting mode.
- Canvas Scribe does not synthesize text, inspect recognized content, or change keyboard settings.

Obsidian's Canvas DOM is not a public API, so this routing must be checked after Obsidian updates.

## Galaxy device matrix

Record every version; a result without the full version set is not conclusive.

| Field | Value |
| --- | --- |
| Galaxy model | |
| Android version | |
| One UI version | |
| Obsidian version | |
| Android System WebView version | |
| Samsung Keyboard or other IME and version | |
| Canvas Scribe version / build | |
| Stylus model | |
| **S Pen to text** enabled | yes / no |

For each device combination, test these cases in order:

1. In another WebView-based app or browser page, verify handwriting-to-text in a plain HTML text field. If this fails, the device or keyboard configuration is the blocker.
2. In Obsidian, create a Canvas text card, enter edit mode, focus its editor, and write inside it. Record whether a handwriting toolbar or hover indicator appears and whether recognized text is committed.
3. Enable Canvas Scribe and repeat while its pen tool is selected. If handwriting mode intercepts the stylus, expect text and no corresponding pen events in diagnostics. If the WebView emits pen pointer events instead, expect one continuous ink stroke and no card selection. Absence of ink alone is not evidence that Canvas Scribe passed the gesture through.
4. Start just outside the active editor. Canvas Scribe should create ink and no text should be committed.
5. Repeat with Canvas Scribe stylus input disabled. This distinguishes plugin handling of web-delivered pointer events from input intercepted upstream by Android, the IME, or WebView.
6. Repeat after changing Canvas zoom and after closing and reopening the text card.

Record one of these outcomes for each case: **works**, **not offered**, **gesture became ink**, **gesture was ignored**, or **text committed to the wrong editor**. Attach an exported Canvas Scribe debug report, but do not include private note text.

## Decision gate

Progress and ownership are tracked in [FER-9: Validate Samsung handwriting-to-text on Galaxy hardware](https://linear.app/fdqr/issue/FER-9/validate-samsung-handwriting-to-text-on-galaxy-hardware).

FER-9 is complete. Device testing and the platform documentation agree that recognition is owned by Android/Samsung and Chromium. The originating stylus input is intercepted before it becomes a WebView pointer stream, so Canvas Scribe cannot claim or pass through it and does not integrate with that recognition path. No broader handwriting-recognition integration should be added.

For future regressions, record the full device matrix above. Use input diagnostics to separate the two paths: no corresponding pen pointer events means the stylus was intercepted upstream; logged pen pointer events mean the WebView received the stream and Canvas Scribe's routing can affect it. Also compare behavior before and after opening any drawing surface or overlay that uses `touch-action: none`.
