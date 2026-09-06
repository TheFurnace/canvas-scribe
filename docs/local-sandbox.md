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

## Iterate on a feature

Run the normal watcher in another terminal:

```powershell
pnpm dev
```

The watcher rebuilds `main.js` in the worktree. Refresh the installed copy with `pnpm sandbox:prepare --name <name>`, then use Obsidian's **Reload app without saving** command. Manifest changes always require an Obsidian restart.

The sandbox uses the actual desktop application and Canvas implementation. Storybook remains the faster component workshop, unit tests remain the deterministic logic layer, and Galaxy testing remains necessary for real stylus and mobile WebView behavior.
