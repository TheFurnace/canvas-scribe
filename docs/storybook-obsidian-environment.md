# Authentic Obsidian environment for Storybook

## Decision

Storybook uses the `app.css` shipped with each developer's local Obsidian installation instead of maintaining a second approximation of Obsidian's tokens and Canvas controls. The stylesheet and its referenced fonts/images are extracted into `.storybook/generated/`, which is git-ignored because these are proprietary Obsidian assets.

This matches Obsidian's own guidance that plugins should build against host CSS variables, and follows the licensing-safe local extraction approach demonstrated by Obsidian Arrow Sandbox:

- [Obsidian: About styling](https://docs.obsidian.md/Reference/CSS%20variables/About%20styling)
- [Obsidian CSS variables reference](https://docs.obsidian.md/Reference/CSS%20variables/CSS%20variables)
- [Obsidian Arrow Sandbox](https://github.com/kylebrodeur/obsidian-arrow-sandbox)

## How it works

1. `prestorybook` and `prebuild:storybook` run `scripts/sync-obsidian-css.mjs` in optional mode.
2. The sync script discovers the newest versioned ASAR in Obsidian's application-data directory, then falls back to common Windows, macOS, and Linux install paths.
3. It extracts `app.css` plus local `public/fonts` and `public/images` references into `.storybook/generated/`.
4. `.storybook/main.ts` aliases `virtual:obsidian-app.css` to the generated stylesheet. If none is available, it aliases to the deliberately small `stories/obsidian-fallback.css` so CI can still build.
5. The global decorator builds the host class structure used by a Canvas leaf: workspace, leaf, `view-content`, `canvas-wrapper`, SVG dot background, Canvas mover, and Canvas element.
6. The Storybook toolbar switches the real `theme-light`/`theme-dark` and `is-desktop`/`is-mobile` host classes.

The toolbar and radial-menu stories also import the same DOM builders used by production. Story controls only supply state; they no longer duplicate production markup.

## Commands

```sh
# Automatic discovery; fails with actionable setup text if Obsidian is absent.
pnpm sync:obsidian-css

# Explicit ASAR or app.css location.
pnpm sync:obsidian-css -- --path "/path/to/obsidian.asar"

# Automatic sync, then Storybook.
pnpm storybook

# Automatic sync, typecheck, and static build.
pnpm build:storybook
```

For a persistent nonstandard location, set `CANVAS_SCRIBE_OBSIDIAN_STYLES` to an `obsidian.asar` or `app.css` path.

## Adding a story

All stories receive the Canvas host automatically. Set the mount point with the `obsidian` parameter:

```ts
const meta = {
  parameters: {
    obsidian: { placement: "controls" },
  },
} satisfies Meta;
```

Available placements are:

- `canvas`: centers component content over the authentic Canvas surface.
- `controls`: mounts a control group inside the native `.canvas-controls` slot.
- `overlay`: mounts a full-canvas component such as the radial menu or diagnostics overlay.

Prefer a renderer exported from `src/` over recreating production HTML in a story. Keep Storybook-only CSS limited to fixture sizing and positioning; Obsidian owns host component appearance.

## Boundaries

- The environment reproduces the host CSS and the relevant Canvas DOM contract, but it does not execute Obsidian's proprietary Canvas JavaScript.
- Canvas DOM is not a public API. When Obsidian changes its required structure, update the single `stories/obsidian-environment.ts` adapter rather than every story.
- The committed fallback is for typechecking and CI availability, not visual approval. Do visual review with a local Obsidian stylesheet present.
- Icons in stories use small local SVG fixtures because the npm `obsidian` package exposes types, not the desktop runtime. Production still uses Obsidian's `setIcon`; the story renderer applies the same `.svg-icon` contract.
