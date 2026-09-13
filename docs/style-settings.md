# Style Settings and theme color schemes

FER-78 · 2026-09-13

Scribe follows Obsidian's interface colors, accent and typography automatically. It can also offer the active theme's extended colors as **fixed ink choices** across Canvas, handwritten notes and PDFs.

## Enable theme ink colors

With the optional **Style Settings** community plugin enabled, open **Style Settings → Canvas Scribe → Include theme ink colors**. This is off by default. Scribe also works without Style Settings, using its curated palettes. A theme's own settings plugin can opt in by applying the `canvas-scribe-theme-palette` class to the body.

When enabled, the available theme colors appear before Scribe's curated swatches. Quick controls show their usual subset; **More colors…** includes the entire combined collection. Exact duplicate hex values appear once in that collection. Missing or invalid theme roles are skipped, so the curated pen and highlighter colors remain available. Turning the option off restores the original collections.

Selecting a theme swatch stores its resolved `#rrggbb` value. It stays fixed in selection, history, favorites and newly drawn ink when the scheme changes. Ink opacity remains a separate tool setting. The **Theme** pen choice and highlighter **Default** retain their existing semantic meaning; PDF's default remains dark on white paper. This integration does not migrate or rewrite existing documents.

## What themes expose

[Style Settings](https://github.com/community-archive/obsidian-style-settings/blob/main/README.md) reads `/* @settings */` YAML in theme, snippet and plugin CSS. It applies body classes and CSS variables, including separate light/dark colors. It does not define a universal scheme catalog or extended palette format.

For example, [Minimal offers preset and custom schemes](https://github.com/kepano/obsidian-minimal/blob/master/docs/Features/Color%20schemes.md). Its [Nord mapping](https://github.com/kepano/obsidian-minimal/blob/master/src/scss/color-schemes/nord.scss) sets the standard `--color-*` roles. Preset selection belongs to Minimal Theme Settings; custom overrides can come from Style Settings. Scribe consumes the resulting CSS cascade, regardless of which mechanism selected the scheme.

| Role order | Standard variable | Optional Scribe override |
| --- | --- | --- |
| Red | `--color-red` | `--canvas-scribe-color-red` |
| Orange | `--color-orange` | `--canvas-scribe-color-orange` |
| Yellow | `--color-yellow` | `--canvas-scribe-color-yellow` |
| Green | `--color-green` | `--canvas-scribe-color-green` |
| Cyan | `--color-cyan` | `--canvas-scribe-color-cyan` |
| Blue | `--color-blue` | `--canvas-scribe-color-blue` |
| Purple | `--color-purple` | `--canvas-scribe-color-purple` |
| Pink | `--color-pink` | `--canvas-scribe-color-pink` |

These are host roles, not eight colors bundled by Style Settings. Obsidian also uses the extended roles for [Canvas card colors](https://github.com/obsidianmd/obsidian-developer-docs/blob/c56c7e770ba25dd0ea392aacf4588f9425970d36/en/Reference/CSS%20variables/Plugins/Canvas.md). Theme-specific names, gradients and arbitrary settings exports are not automatically treated as ink palettes: their meaning and order vary between themes.

## Theme author contract

Scribe reads computed variables on each control's owning document body. Full opaque CSS colors such as hex, `rgb()`, `hsl()` and resolved `var()` aliases are supported. A missing/invalid Scribe override falls back to the standard role. Translucent colors are skipped because ink opacity is independently controlled. Raw RGB/HSL tuples must be wrapped as a CSS color.

A theme or snippet can map private extended colors without changing global interface colors:

```css
body {
  --canvas-scribe-color-red: var(--my-theme-red);
  --canvas-scribe-color-blue: rgb(var(--my-theme-blue-rgb));
}
```

The optional aliases customize colors while the body class chooses whether to include them. A CSS snippet alone cannot add a body class; use Scribe's Style Settings toggle or a theme's own settings plugin. Avoid assigning the same toggle to multiple settings owners.

## Live changes and implementation

Scribe advertises its CSS settings with the documented `parse-style-settings` workspace event and listens to Obsidian's public `css-change` event. [Style Settings emits that event after replacing its generated stylesheet](https://github.com/community-archive/obsidian-style-settings/blob/main/src/SettingsManager.ts). The shared theme observer also watches body/root attributes and stylesheet changes in each document, including later style mirroring into popout windows. It coalesces refreshes per animation frame and releases observation when the last view closes.

Theme changes dismiss transient controls so reopened menus read a fresh palette. An unconfirmed full-picker edit is discarded; already applied radial choices retain the existing dismissal/history behavior. Scribe neither reads Style Settings' private saved data nor imports its parser or dependencies.

`toolSwatches(tool, document)` is the shared entry point. Calling it without a document returns the curated baseline, useful for documentation and fallback tests. The **Canvas Scribe / Style Settings** Storybook preview exercises Nord's color mapping, mixed CSS formats, opt-out and live scheme changes using production menus. It is a CSS-contract fixture, not an installed full theme or Style Settings runtime.

See the [validation record](validation/2026-09-13-style-settings.md) for the checked behavior and remaining host review.
