# Local Obsidian sandbox

The sandbox is a real Obsidian desktop instance for interactive feature exploration. It is deliberately not an integration-test runner: an agent opens the fixture Canvas, uses the plugin through Obsidian's UI, inspects the DOM or console when useful, and records what it observed.

[Obsidian recommends a separate development vault](https://docs.obsidian.md/Plugins/Getting+started/Build+a+plugin) because plugin mistakes can damage notes. This setup goes one step further by also giving the sandbox its own Obsidian profile, so it does not reuse the normal vault list, workspace state, or plugin configuration.

## Start a sandbox

From the feature worktree:

```powershell
pnpm sandbox -Name agent-fer-34
```

The command builds Canvas Scribe, creates a disposable vault under `.canvas-scribe-sandbox/vaults/agent-fer-34`, installs and enables the build, creates an isolated profile, and launches Obsidian with `Canvas Scribe Smoke Test.canvas` open.

Every name has its own vault, profile, artifact directory, and stable debugging port. Agents working in separate worktrees are isolated even when they use the default name; agents sharing one worktree should use different names.

Rerunning the command refreshes the plugin build but preserves notes and Canvas changes. Add `-Reset` when you intentionally want to recreate the named vault from the committed fixture.

Useful variants:

```powershell
# Prepare the real vault and profile without opening a window.
pnpm sandbox -Name agent-fer-34 -NoLaunch

# Discard this named sandbox's contents and restore the fixture.
pnpm sandbox -Name agent-fer-34 -Reset

# Refresh only the vault after an existing build.
pnpm sandbox:prepare --name agent-fer-34

# Confirm the installed files still match the current build.
pnpm sandbox:verify --name agent-fer-34

# Use a nonstandard Obsidian installation or a chosen debugging port.
pnpm sandbox -Name agent-fer-34 -ObsidianPath "D:\Apps\Obsidian\Obsidian.exe" -Port 9460
```

## Agent interaction

The launcher prints a local Chromium debugging endpoint and writes the same information to `.canvas-scribe-sandbox/artifacts/<name>/connection.json`. An agent with Chrome DevTools Protocol support can attach to that endpoint to inspect and interact with the real Obsidian window. Direct UI interaction is also fine.

Use `Agent Playground.md` for suggested interactions, not as a pass/fail test specification. Put screenshots, exported Canvas Scribe debug reports, and brief notes beside `connection.json`. These generated artifacts are ignored by Git.

## Drive pen strokes from an agent

Use Node 22 or newer. The dependency-free driver connects only to the named
sandbox's loopback debugger and verifies Obsidian's actual vault path before acting.
It works with the current build in any feature worktree: copy these tooling files
to that worktree if the feature branch does not yet contain them.

```powershell
pnpm sandbox -Name pen-lab
pnpm sandbox:agent inspect --name pen-lab
pnpm sandbox:agent screenshot --name pen-lab --out before.png
```

On a fresh profile, Obsidian asks whether to trust the generated vault. Choose
**Trust author and enable plugins**, then close the settings dialog. `inspect`
reports dialog text, plugin readiness, viewport size, Canvas bounds, and toolbar
states/coordinates. Inspect before drawing: pen input intentionally follows hit
testing and can land on dialogs, cards, or controls. Screenshots are saved under
`.canvas-scribe-sandbox/artifacts/pen-lab/`.

```powershell
# Choose the pen through its real toolbar control.
pnpm sandbox:agent click --name pen-lab --selector '.canvas-scribe-controls [data-action=pen]'

# Example wave for the initial 1024 x 800 desktop window.
pnpm sandbox:agent stroke --name pen-lab --file sandbox/agent/wave.json
pnpm sandbox:agent screenshot --name pen-lab --out after.png

# Read saved ink. Allow the normal Obsidian save debounce to finish first.
pnpm sandbox:agent eval --name pen-lab --file sandbox/agent/inspect-ink.js

# Experiment with history, highlighter, eraser, or lasso using the same path.
pnpm sandbox:agent click --name pen-lab --selector '.canvas-scribe-controls [data-action=undo]'
pnpm sandbox:agent click --name pen-lab --selector '.canvas-scribe-controls [data-action=redo]'
```

Paths are JSON objects with `points` and optional `intervalMs` (default 16).
Each point has viewport CSS-pixel `x` and `y`, optional `pressure` from 0 to 1
(default 0.5), and optional `tiltX`/`tiltY` from -90 to 90 (default 0).
Adjust the sample to the live viewport and target surface. Coordinates are not
Canvas document coordinates; pan/zoom changes where they land. The interval is a
minimum delay between acknowledged events, not a guaranteed hardware sampling rate.
The driver validates the entire path before pressing, then sends a pen press,
moves, and release through Chromium's `Input.dispatchMouseEvent` with
`pointerType: 'pen'`. It does not insert strokes into the plugin model or dispatch
untrusted DOM PointerEvents. Zero-pressure contact follows the plugin's own
fallback behavior; use positive pressure when comparing brush response.

`eval --file` evaluates a JavaScript expression or async IIFE inside the real app,
printing its result as JSON. Use it to inspect DOM, run Obsidian commands, or build
ad hoc experiments. Ordinary event listeners added after the plugin may not see
consumed pen events because the plugin stops immediate propagation. Prefer the
plugin's input diagnostics and saved ink inspection for those gestures.

Input commands bring the page forward. The launcher disables Chromium background
throttling because occluded Windows windows can otherwise stall input playback.
Close the named sandbox before relaunching to apply launcher flags or refreshed
builds. Avoid concurrent input drivers against the same named sandbox. A failed
stroke attempts to release the pen; force-killing a driver can leave contact active,
so reload that sandbox before continuing. Connection errors usually mean the
named app is closed, still starting, or its connection record is stale.

This enables exploratory desktop end-to-end validation, not physical S Pen
certification. It does not reproduce Android handwriting interception, palm
rejection, device latency, or Samsung barrel-button/contextmenu behavior. No
test suite, production plugin hooks, or additional runtime dependencies are added.

### Verified experiment (2026-09-10)

On real Obsidian 1.12.7 and 1.13.7 with the main-based 2.0.0-beta.2 build, the driver produced
a saved 81-point pen stroke with `hasPressure: true` and pressure range 0.15–0.95.
Chromium delivered trusted pen events with the requested tilt on the first-run dialog.
The Canvas stroke was verified in saved data and after app reload; toolbar Undo and
Redo were also exercised. Generated screenshots and paths stay in the ignored named artifact
directory. This main-based sandbox does not include the separate handwritten-note
feature branch; use that branch's build when exploring `.scribe` behavior.

## Iterate on a feature

Run the normal watcher in another terminal:

```powershell
pnpm dev
```

The watcher rebuilds `main.js` in the worktree. Refresh the installed copy with `pnpm sandbox:prepare --name <name>`, then use Obsidian's **Reload app without saving** command. Manifest changes always require an Obsidian restart.

The sandbox uses the actual desktop application and Canvas implementation. Storybook remains the faster component workshop, unit tests remain the deterministic logic layer, and Galaxy testing remains necessary for real stylus and mobile WebView behavior.
