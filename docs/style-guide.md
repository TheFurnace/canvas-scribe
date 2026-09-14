# Canvas Scribe style guide

FER-77 · 2026-09-13 · production baseline: [v2 colors PR #24](https://github.com/TheFurnace/canvas-scribe/pull/24), `3fc6dc7`.

This is the intended design system, organized from basic ingredients to complete components. The user confirmed this structure and the division of responsibility: **Obsidian supplies theme colors, interface typography and accent; Scribe owns control shapes, spacing and tool artwork.** The complete guide and targets P1–P4 were approved by the user on 2026-09-13 ("it all looks good, approved"). Production examples describe the named baseline, not proof of device acceptance.

The visual companion is **Canvas Scribe / Style Guide** in Storybook. Start with **01 Foundations**, then continue through **02 Basic elements**, **03 Controls**, **04 Components**, and **05 Surface layouts**. The original Foundations URLs now open the new foundations chapter. Use the Light/Dark links or Storybook toolbar; examples use extracted Obsidian CSS and production builders. Guide samples are labelled where they illustrate an approved target.

## How to read and maintain the guide

Three labels separate decisions from evidence:

- **Agreed direction / behavior:** the confirmed product contract, including the revised colors behavior.
- **Current production:** what the cited implementation actually renders or does.
- **Approved standard:** an accepted consistency target; production adoption is tracked separately. This guide does not silently apply it to production.

Build upward: **foundation → element → control → component → surface**. For example, ink color + circular shape + border become a chip; adding a target, name and selection mark creates a color control; grouping those controls with a header, recents and actions creates a drawer. A radial uses the same color meaning in a different arrangement and with a different commitment point.

Update this guide and its examples when a shared component changes. Use production builders and collections, not parallel copies of component markup or palette values. Record deliberate exceptions beside the common rule. Keep historical implementation logs as evidence; this guide and the [current inventory](component-inventory.md) are the design entry points.

## 1. Foundations

### Interface colors

Resolve UI roles from the active Obsidian theme. Never persist resolved interface colors as document preferences merely to style a control. Stored explicit ink remains document content.

| Role | Host source | Use |
| --- | --- | --- |
| Surface | `--background-primary` | Menus, drawers, dialogs |
| Secondary surface | `--background-secondary` | Grouped controls and resting round actions |
| Primary text | `--text-normal` | Labels and neutral icon details |
| Supporting text | `--text-muted` | Descriptions, captions and values |
| Border | `--background-modifier-border` | Edges and meaningful group divisions |
| Hover | `--background-modifier-hover` | Layer over the resting surface; do not replace its base |
| Accent | `--interactive-accent` | Selection and focus, with separate geometry |
| On accent | `--text-on-accent` | Foreground on an accent fill |
| Error | `--text-error` | Invalid input and destructive labels |
| Interface font | `--font-interface` | All plugin controls |

The `--canvas-scribe-ui-*` aliases currently cover only part of this vocabulary. The table defines roles; it does not claim a completed global token migration. Use the host source directly or a clearly scoped semantic alias. Never invent a fixed light/dark UI palette.

### Ink colors and defaults

`toolSwatches(tool)` in `src/colors.ts` is the canonical palette: 24 pen colors and 16 highlighter colors. All menus use these collections or documented subsets. The guide reads the same collections and previews ink on light and dark backgrounds. Highlighter samples use 38% default opacity; stored opacity remains independent of color.

| Choice | Meaning |
| --- | --- |
| Pen **Theme** | Semantic default. New Canvas/note ink follows theme text; PDF resolves dark ink on white paper. |
| Highlighter **Default** | Semantic tool default with its fixed yellow fallback. |
| Explicit hex | Fixed ink, even when it currently looks the same as Theme/Default. |
| Recent color | A confirmed explicit choice for that tool. Shared across Canvas, notes and PDFs. |

Do not infer semantic default from hex equality. A default and matching explicit swatch may coexist; mark only the selected identity. Theme changes do not recolor existing stored marks. New histories do not seed the resolved default; retain older explicit histories because their provenance is ambiguous.

### Typography

Use `--font-ui-medium` and `--font-medium` for menu headings, `--font-ui-small` for controls, and `--font-ui-smaller` for supporting captions. The guide's document heading may use `--font-ui-large`. Do not introduce a separate Scribe font family. Keep labels and values visible, allow wrapping, and use tabular numerals for changing numeric readouts. Thickness labels use document **units**, not screen pixels.

### Spacing, targets and shapes

These are approved targets anchored in the revised UI; existing exceptions are listed in the adoption register.

| Ingredient | Approved role/value | Composition rule |
| --- | --- | --- |
| Spacing rhythm | 4 / 8 / 12 / 16 / 24 px | Compact collection / related elements / groups / dialog padding / sections |
| Compact target | At least 36 px | Desktop control target; icon can be smaller |
| Touch/radial target | At least 44 px | Never shrink targets to fit more choices |
| Ink chip | 24 px settings; 28 px drawer/radial | Separate visible chip from hit area |
| Control radius | 8 px target | Rounded rectangular actions/fields |
| Menu radius | 20 px target | Based on revised tool-menu shell |
| Round form | 50% | Ink chips and round actions |
| Border | 1 px theme border | Survive light/dark and black/white ink |
| Focus | 2 px accent outline outside selection | Keep focus and selected state simultaneously readable |
| Elevation | `--shadow-s` | Floating shell; avoid shadows on every nested control |

Scribe controls stay in screen space while documents zoom. Allow optical exceptions for radial sweeps and artwork. Visible hit regions must not overlap. Adapt layout or scroll rather than compressing targets.

## 2. Basic elements

### Tool artwork

Use the original family in `src/tool-icons.ts` through the shared icon registration/rendering path. Ink-bearing bodies reflect the chosen color; neutral tips/details retain recognition. Compact controls use recognizable tool silhouettes; expanded settings use the richer/full artwork. Inspect at the actual display size before enlarging. Decorative artwork is hidden from assistive technology; the enclosing control carries the name. See [tool icon guidance](tool-icons.md) for provenance and source geometry.

### Labels, chips and dividers

A chip represents ink, not an accent role or action. Its edge must remain visible for black/white ink. A label explains meaning that the chip cannot: Theme, Default, a tool name or a numeric value. Use verbs for actions, nouns for settings, and an ellipsis when an action leads to further choices. Provide accessible names even where visible labels are omitted.

Use spacing to group related content. Add a divider when the source or meaning changes, such as pinned colors versus recents. Avoid boxing every item as if it were a separate panel.

### State vocabulary

| State | Visual and semantic contract |
| --- | --- |
| Rest | Stable surface, readable content and boundary |
| Hover | Theme modifier over the existing base; ink itself stays unchanged |
| Selected | Persistent visible mark plus pressed/checked semantics |
| Focus | Keyboard outline independent of selection; never color alone |
| Expanded | Open settings state is separate from selected-tool state |
| Disabled | Recognizable unavailable action; cannot activate; exposes disabled semantics |

The Basic elements chapter shows live production state controls and a separate **P3 target specimen**. It does not change the production swatch to make the current state look compliant.

## 3. Controls

| Control | Ingredients | Interaction rule |
| --- | --- | --- |
| Tool button | Artwork + ink + target + state | Select an inactive tool; repeat tap toggles its settings where available |
| Color choice | Chip + border + name + selection mark | Preserve semantic identity; parent component owns confirmation |
| Numeric adjustment | Label + value + slider + decrement/increment | Enforce tool bounds/step; keyboard access; immediate subsequent-stroke setting |
| Stroke preview | Production stroke geometry + current width/color/opacity | Show the property being adjusted; width-only samples are opaque, combined opacity samples represent transparency |
| Close/Back | Action artwork/text + target + accessible verb | Close exits the component; Back navigates within it |

Tool settings affect subsequent strokes and never mutate an in-progress gesture snapshot or recolor existing strokes implicitly. Existing-stroke edits are explicit selection actions.

## 4. Components

### Shared shell and tool settings

Compose a shell from surface, border, radius, shadow, padding, heading and close action. Then insert tool choices, preview, numeric controls and color choices. Anchor near the right-side controls and flip/clamp at viewport edges. Maintain reachable actions at large text and narrow widths. Prevent control gestures from leaking ink or native Canvas actions. Starting a drawing gesture outside dismisses the popover and preserves the intended stroke.

Pen and highlighter menus share the construction but retain their supported properties. Eraser mode and highlighter-only filter remain separate concepts. Selection settings distinguish mode, enclosure rule and explicit transforms. Unsupported actions must not appear as working features.

### Color drawer

The revised drawer contains a heading/close row, ten pinned colors in two rows of five, a third row for Theme/Default and up to three recent explicit colors, and More colors. The semantic choice spans two columns in the final row. Group positions remain stable. A selection applies, commits history and closes the drawer. More colors opens the transactional picker.

### Full color picker

Compose Swatches/Spectrum, grouped choices, current/pending preview, color fields and Cancel/Done. Edits stay local until Done. Cancel, Escape and outside dismissal discard pending changes. When opened inside the radial, Cancel restores the entry selection and returns to the radial; Done applies the selection but history waits for full radial dismissal.

### Radial

Quick tools, Settings/actions and Favorites are top-level pages. Variant/favorite selection applies and closes. Remember only the last top-level page for the application session; reopening after a submenu returns to its parent. Page navigation and circular adjustment gestures must not compete.

Color composition: fixed semantic default, up to three current/recent explicit choices, scrollable swatch arc and a fixed More colors action. Keep positions frozen for the radial lifetime. Only this surface deduplicates explicit colors across recents and swatches, by exact normalized hex equality. Default identity is never deduplicated by appearance. Wheel, drag and keyboard navigate the arc; dragging must not accidentally select a color.

Color taps apply immediately and **keep the radial open**. Record only the final explicit selection on full dismissal; Back is not dismissal. This supersedes the older FER-46 rule that quick-color selection closed the radial, and FER-64's historical default-history seeding rule.

Circular thickness/opacity controls show a live bounded value and preview, remain open after release, and terminate capture on cancellation. Preserve theme-aware opacity checkerboards and a stable hover base.

### Favorites and dialogs

A favorite composes tool identity, ink selection (including semantic default), size and opacity. Selecting one applies and closes; managing presets uses labelled fields and clear Save/Cancel semantics. Empty collections need an actionable empty state. Modal dialogs contain keyboard focus and restore it on exit; destructive actions name the affected content and explain undo when available.

## 5. Surface layouts

| Surface | Shared composition | Surface-owned behavior |
| --- | --- | --- |
| Canvas | Native control rail + shared tools/menus | Native card selection and mouse/touch pan/zoom |
| Handwritten note | Transparent page, outline/shadow, document-anchored dot grid, right-floating toolbar | Plain text/page actions, mixed-object editing, note scrolling |
| PDF | Native PDF page, ink overlay and shared tools | Native page navigation/text/links, dark default pen on white page |

Keep global tool preferences and separate per-tool color histories shared. Document operations belong to the adapter. Note text/page actions do not leak into PDF/Canvas. Stored ink appearance is independent of the host theme; UI and new semantic defaults resolve in their current surface.

The guide includes production Canvas controls and the existing shared note/PDF fixture. The PDF example is a tool adapter demonstration, not a replacement viewer or proof of native PDF behavior.

## Approved targets and adoption register

The user approved all four targets on 2026-09-13. Approval establishes the design standard; the production migrations remain separate implementation work.

| ID | Observed inconsistency | Approved correction | Visual review |
| --- | --- | --- | --- |
| P1 | Common gaps mix the main rhythm with 6/10/14 px literals | Use shared 4/8/12/16/24 roles; retain justified optical exceptions | Foundations: spacing |
| P2 | Tool menu uses 20 px radius; drawer inherits host radius; favorites uses 14 px and a custom shadow | Use one floating-shell vocabulary based on the revised menu, with documented compact exceptions | Foundations: shape; Components: actual shells |
| P3 | Generic pressed/focus swatch states use similar accent outlines | Inner persistent selection boundary and outer accent keyboard focus ring | Basic elements: production and target specimens |
| P4 | Focus restoration is handled differently by adapters | Explicit close/Escape restores opener; pointer dismissal preserves intent | Components: dismissal; host adoption still required |

Implement these approved corrections as tracked changes, with actual-size checks in both themes. Keep their implementation separate from the source colors PR.

## Acceptance and evidence

For each adopted component, inspect light/dark, hover, selected/disabled/focus, black/white ink, long labels, large text, narrow layouts and viewport edges. Exercise keyboard, cancellation, nested Done/Cancel, and pen/touch ownership. Use locally extracted Obsidian CSS; fallback CSS only establishes build availability. Browser checks do not establish physical Galaxy/S Pen behavior or native host integration.

Run `pnpm check` and `pnpm build:storybook` before review. Validation of this guide is recorded in [the guide validation report](validation/2026-09-13-style-guide.md).

## Reference basis

- [FER-77](https://linear.app/fdqr/issue/FER-77) tracks this guide; [FER-76](https://linear.app/fdqr/issue/FER-76) owns the revised color contract.
- [Color behavior and palette provenance](color-coherence.md); [shared UI](shared-ui-tools.md); [host environment](storybook-obsidian-environment.md).
- Local, ignored gallery: `dist/ui-references/index.html` in the primary checkout; `references.json` preserves original paths and provenance. From a prescribed linked worktree, the gallery is `../../ui-references/index.html` relative to the worktree root.
- User-supplied Samsung pen/highlighter screenshots `samsung-tools-123607.jpg` and `samsung-tools-123614.jpg` support round chips, illustrated tools, grouping and slider hierarchy. They do not supply Scribe's hex values or establish gesture behavior. Keep third-party reference imagery in the local gallery, not production artwork.
