# Debug sidebar — beta.20 / FER-95

Open the bug ribbon icon or run **Open debug console in left sidebar** / **Open debug console in right sidebar**. The console provides prediction cycling, delegated ink, diagnostic colors, latency recording, input overlay, export and clear-history controls with visible current state and 44px minimum button heights. Move-side buttons relocate the console; the ribbon reopens the existing console.

Command palette shortcuts remain available and update console state. Console toggles update their labels without long notices covering the panel. Export saves the existing pair of reports without replacing the active drawing. Recent events show at most 40 text-only entries and refresh explicitly, avoiding background polling/redraw during measurements. Experiment modes remain session-only and OFF after restart.

Validation: `pnpm check` passed 361 tests / 48 files, production build and version checks. Storybook build passed. Real Obsidian 1.13.7 disposable `fer-93-latency` verified right/left placement, a single console after relocation, ribbon reuse of the left console, shared prediction/delegation exclusivity via command palette, colors/recording labels, report export creating two files with active document unchanged, and clear-history behavior. Restart preserves the console view with experiments OFF. Desktop sidebar checks do not establish physical tablet acceptance.

On Galaxy, open the console and verify touch scrolling, side selection, control states and export while testing Canvas and handwritten notes. Beta.19 anchored prediction remains included.
