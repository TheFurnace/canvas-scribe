# Contributing to Canvas Scribe

## Branches and linked worktrees

Use a dedicated branch and linked Git worktree for each substantive change. This is the default because it keeps the primary checkout free for integration and lets several changes build, test, and wait for review independently on the same machine.

From the primary checkout, create a worktree with a short, unique topic name:

```powershell
git worktree add "dist/worktrees/<topic>" -b "codex/FER-123/<topic>" <start-point>
```

Use `main` or the agreed integration branch as `<start-point>`. Codex-created branches use the `codex/` prefix; human contributors may follow the repository's normal branch naming conventions.

Before creating or reusing a worktree:

1. Run `git status --short` and `git worktree list`.
2. Do not disturb uncommitted changes or reuse a branch owned by another active task.
3. Keep commits scoped to the worktree's topic. Use separate worktrees for unrelated changes.
4. Give long-running development processes unique ports when multiple worktrees are active.

Read-only investigation, emergency fixes, and genuinely trivial edits do not require another worktree. If a task is already on a dedicated branch and worktree, do not create an extra one.

## Linear tracking and Git links

Linear is the source of truth for planned work, status, priority, ownership, and acceptance criteria. Create or identify the Linear issue before beginning a substantive change.

Include the issue identifier in Git metadata so Linear and GitHub can associate future work automatically:

- Codex branches use `codex/<issue-id>/<topic>`, such as `codex/FER-13/brush-width`.
- Put the issue identifier in the pull request title or description.
- When a commit maps cleanly to one issue, start its subject with the identifier, such as `FER-13: Keep brush widths constant across zoom`.

Move an issue to **In Progress** when implementation begins, **In Review** when the change is ready for review or device validation, and **Done** only after the change is merged and its acceptance criteria are satisfied. If a commit or pull request predates its issue, add the canonical GitHub URL to the Linear issue manually.

## Verification

Run the complete local check before requesting review or publishing a test build:

```powershell
pnpm check
```

## Version and release policy

Routine commits and merges do not receive their own stable version. Publish branch builds as beta releases when a change needs BRAT, device, or stakeholder testing. Prepare a stable release only occasionally, when a coherent set of completed changes has passed its intended testing.

All release versions must be either:

- Stable: `MAJOR.MINOR.PATCH`, such as `0.2.0`.
- Beta: `MAJOR.MINOR.PATCH-beta.N`, such as `0.2.0-beta.3`.

The three version files must agree for every release:

- `package.json`
- `manifest.json`
- `versions.json`, mapping that exact version to the minimum supported Obsidian version

Tags omit a `v` prefix and are immutable. The release workflow rejects other version forms, publishes beta tags as GitHub prereleases, and rejects a stable tag unless its commit is contained in `main`.

### Publishing a beta from a branch

1. Choose the next intended stable version and the next unused beta number for that version across all branches. For example, after `0.1.2`, use `0.1.3-beta.1`; later test builds use `0.1.3-beta.2`, and so on. Check local and remote tags before choosing.
2. Update all three version files on the feature branch.
3. Run `pnpm check`, then commit and push the branch.
4. Tag the tested commit with the exact beta version and push the tag:

   ```powershell
   git tag 0.1.3-beta.1
   git push origin HEAD
   git push origin 0.1.3-beta.1
   ```

5. Wait for the **Publish plugin release** workflow and test the GitHub prerelease through BRAT.

Never replace a beta tag. Publish a new `-beta.N` version for every changed test artifact so reports always identify one exact build.

### Publishing a stable release

1. Merge the completed and accepted changes into `main`.
2. Deliberately choose the next patch, minor, or major version. Do not bump the stable version merely because a branch was merged or a beta was tested.
3. On `main`, update all three version files to the stable version, run `pnpm check`, and commit the release preparation.
4. Tag that `main` commit with the exact stable version and push the commit and tag.
5. Verify the **Publish plugin release** workflow and its GitHub release assets.

Promoting `0.1.3-beta.N` to `0.1.3` is a new release, not a retag. BRAT testers may need to run BRAT's update command manually when moving from a prerelease to the corresponding stable version because Obsidian does not implement every SemVer prerelease transition.
