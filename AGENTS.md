# Project working agreement

Follow [CONTRIBUTING.md](CONTRIBUTING.md) for the complete development and release policy.

## Isolate changes by default

- Before making a substantive change, create a dedicated branch and linked worktree from the appropriate integration point. If the current checkout is already a dedicated worktree for that change, keep using it.
- Use `dist/worktrees/<topic>` for local linked worktrees. Use `codex/<topic>` for branches created by Codex.
- Keep `main` available for integration and release work. Do not mix unrelated tasks in one worktree or reuse a worktree that has uncommitted changes belonging to someone else.
- Read-only investigation and genuinely trivial edits may stay in the current checkout. Explicit user instructions override this default.

## Release deliberately

- Use versions shaped like `<next-version>-beta.<N>` for branch builds that need device or stakeholder testing. Each beta tag is immutable and must use the next unused beta number for that intended stable version across all branches.
- A beta build may be tagged from its feature branch after `pnpm check` passes. Keep `package.json`, `manifest.json`, and `versions.json` synchronized.
- Do not make a stable version bump for routine development, every merge, or every test build. Stable `MAJOR.MINOR.PATCH` versions are release-preparation changes made on `main` only after the selected work is complete and tested.
- Never move or reuse a published tag. Fixes require a new beta or stable version.
