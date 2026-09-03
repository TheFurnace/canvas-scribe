# Galaxy tablet debug workflow

The recommended loop is **GitHub release → BRAT update on the Galaxy tablet → test → export report into the vault → sync the report back**. It avoids Android file management after the one-time setup.

## One-time Galaxy setup

1. Make sure the test vault is available in Obsidian on the Galaxy tablet. Obsidian Sync is the simplest option; reports and structured logs are both stored as Markdown files for sync compatibility.
2. In **Settings → Community plugins**, install and enable **Obsidian42 - BRAT**.
3. Run **BRAT: Add a beta plugin for testing** and enter `https://github.com/TheFurnace/canvas-scribe`.
4. Track the latest release, then enable **Canvas Scribe** under **Community plugins**.

BRAT 1.1 or newer installs from GitHub Releases. Each release must use the same version as `manifest.json` and contain `main.js`, `manifest.json`, and `styles.css`. This repository's release workflow creates those assets automatically when a matching version tag is pushed.

## Publish a tablet build

1. Update the version in `package.json` and `manifest.json`, and add that version to `versions.json`.
2. Run `pnpm check`.
3. Commit and push the change.
4. Tag the commit with the exact version, without a `v` prefix—for example, `git tag 0.1.1`—and push the tag.
5. Wait for **Publish beta release** in GitHub Actions. It creates the release BRAT consumes.
6. On the Galaxy tablet, run **BRAT: Check for updates to all beta plugins and UPDATE**, then confirm Canvas Scribe is enabled.

Use a new semantic version for every tablet build. This makes every report identify the precise code that produced it.

## Run a focused stylus test

1. Open the test Canvas.
2. Run **Canvas Scribe: Clear debug history**.
3. For button, hover, palm-rejection, or pressure problems, run **Canvas Scribe: Toggle stylus input diagnostics**. Leave it off for normal endurance testing.
4. Reproduce the issue with as few extra actions as practical.
5. If diagnostics are visible, toggle them off.
6. Run **Canvas Scribe: Export debug report**.
7. Complete the Markdown report that opens. Add screenshots or screen recordings to the note if useful.

Canvas Scribe writes two Markdown files under `Canvas Scribe Debug/`: a human-editable report and a diagnostic log containing structured JSON in a fenced code block. The log is capped at 1,200 events. It includes build/device information, lifecycle and storage outcomes, gesture summaries, and—while the diagnostic overlay is enabled—pointer, secondary-click, and context-menu fields. The recorder does not intentionally collect note text, canvas or vault names, or raw coordinates.

## Return feedback

Let the `Canvas Scribe Debug` folder sync to this development computer, then provide both Markdown file paths. Alternatively, attach both files to a GitHub issue created with the Galaxy test template. Review them before attaching them to a public issue; the browser user-agent string may identify the tablet model and OS build.

## Fast desktop or synced-vault deployment

To build, test, and copy directly into a vault on Windows:

```powershell
pnpm deploy:vault -VaultPath "C:\path\to\vault"
```

For continuous compilation and copying:

```powershell
pnpm deploy:vault -VaultPath "C:\path\to\vault" -Watch
```

After each JavaScript rebuild, reload Canvas Scribe in Obsidian. If the test vault syncs its `.obsidian` configuration to the tablet, wait for sync to finish and restart or reload the plugin on the tablet. BRAT releases are more deterministic for regular Galaxy testing because the release version and embedded build ID travel together.

## Manual fallback

Run `pnpm package`, then copy or download `dist/canvas-scribe-<version>.zip`. Extract `main.js`, `manifest.json`, and `styles.css` into:

```text
<vault>/.obsidian/plugins/canvas-scribe/
```

Android file managers may hide `.obsidian`, so use BRAT whenever possible.
