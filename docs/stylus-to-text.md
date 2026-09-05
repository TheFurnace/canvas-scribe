# Stylus handwriting-to-text investigation

Research date: 2026-09-03

## Finding

Canvas Scribe should not implement handwriting recognition. The compatible path is to let Android's input method receive stylus gestures that begin in a real, focused HTML editor while Canvas Scribe continues handling gestures everywhere else on the Canvas.

Android 14 and later enable stylus handwriting for standard text fields, including WebView text widgets, when the selected input method supports the platform handwriting APIs. Android also warns that apps combining text fields with a drawing surface need explicit input routing. See [Android's stylus input in text fields guide](https://developer.android.com/develop/ui/views/touch-and-input/stylus-input/stylus-input-in-text-fields).

Chrome's Android team documented HTML handwriting support in Chrome and WebView on Android 14, plus earlier Samsung support beginning with One UI 5.1. See [What's new for web on Android 2023](https://developer.chrome.com/blog/whats-new-in-web-on-android-io2023#large_screen_device_support).

Samsung describes **S Pen to text** as a system setting that converts handwriting in search fields, address bars, and other text areas. Availability varies by model and software version. See [Samsung's S Pen settings guide](https://www.samsung.com/us/support/answer/ANS10003217/).

There is no browser JavaScript API in those platform guides for starting an Android stylus-handwriting session. Native delegation APIs such as `InputMethodManager.startStylusHandwriting()` belong to the host Android app, not an Obsidian community plugin. Canvas Scribe therefore cannot force the feature on or detect definitive availability from JavaScript.

## Integration in Canvas Scribe

Canvas Scribe previously captured every contacting stylus `pointerdown` in the Canvas wrapper. That prevented Obsidian's WebView editor and the active keyboard from seeing the gesture.

The input router now leaves events alone when they begin in an `input`, `textarea`, enabled `contenteditable` element, or CodeMirror editor content. This is deliberately narrow:

- An open Canvas text editor can receive Android or Samsung handwriting behavior.
- A gesture elsewhere still draws with the selected Canvas Scribe tool.
- Canvas Scribe does not synthesize text, inspect recognized content, or change keyboard settings.
- **Toggle stylus input** remains the fallback when a particular Obsidian version uses an editor DOM that is not recognized.

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
3. Enable Canvas Scribe and repeat while its pen tool is selected. The editor should receive text and no ink stroke should be created.
4. Start just outside the active editor. Canvas Scribe should create ink and no text should be committed.
5. Repeat with Canvas Scribe stylus input disabled. This distinguishes plugin routing from Obsidian/WebView behavior.
6. Repeat after changing Canvas zoom and after closing and reopening the text card.

Record one of these outcomes for each case: **works**, **not offered**, **gesture became ink**, **gesture was ignored**, or **text committed to the wrong editor**. Attach an exported Canvas Scribe debug report, but do not include private note text.

## Decision gate

Progress and ownership are tracked in [FER-9: Validate Samsung handwriting-to-text on Galaxy hardware](https://linear.app/fdqr/issue/FER-9/validate-samsung-handwriting-to-text-on-galaxy-hardware).

No broader integration should be added until the matrix confirms behavior on at least one Android 14+ device and one Samsung One UI 5.1+ device. If focused editors still cannot receive handwriting with Canvas Scribe disabled, the limitation is outside the plugin. If disabled works but the narrow pass-through does not, update only the editable-target detection for the observed Obsidian DOM.
