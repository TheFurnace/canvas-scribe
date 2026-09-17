# Final prediction choice for PR #32

User Galaxy Tab/S Pen feedback: 16 ms is the sweet spot; 32 ms produces visually odd letter shapes. User approved 16 ms as the normal recommended setting with OFF available and longer horizons retained for debugging. This supersedes earlier experiment-default-OFF instructions in the beta validation history. No numerical physical latency improvement is claimed.

- New installations and existing settings without a prediction preference default to 16 ms.
- **Toggle ink prediction (recommended: 16 ms)** and the console's normal prediction button save ON (16 ms) or OFF across restart.
- **Debug: Cycle prediction horizon OFF / 16 / 24 / 32 ms** and the console's separate debug button change the current session only. They do not overwrite the saved preference.
- Restart restores the saved normal preference and turns delegated ink, colors, recording and the input overlay OFF.
- Delegated ink remains experimental; user reported no visible magenta trail. No device benefit is claimed.
- Saved ink, prediction geometry, expiry and corner guards are unchanged from the tested beta. Normal changes apply to new gestures.

PR-only follow-up to beta.20: the published immutable beta remains unchanged.

Validation: `pnpm check` passed 362 tests / 48 files; Storybook build passed. Real Obsidian 1.13.7 confirmed absent preference starts at 16 ms; saving OFF then selecting debug 24 ms restores OFF after reload; saving ON then selecting debug 32 ms restores 16 ms after reload. Console labels show the restored state, with diagnostic switches OFF. Sandbox installed build verified.
