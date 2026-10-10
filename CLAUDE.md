# clawd-minecraft

A Claude Code mod (a plugin of function hooks, no package.json, no build). It draws a block-game
usage HUD in the band above the prompt, with Clawd beside it. Desktop Code tab only.
Load the `plugin-authoring` skill before writing or debugging hooks.

## Code map

- `hooks/register.tsx` is the whole mod (`hooks/hooks.json` only names it). The top builds SVG
  strings: `hud()` on a 182x25 grid shown at 364x50, `figure()` and `clawd()` for his strip.
  The bottom is `register`, six hooks:
  - `session.start`, `turn.start`, `turn.complete`, `tool.call{AskUserQuestion}` set the mood.
  - `session.measure` asks for a redraw unless only `cost` changed.
  - `ui.render{AbovePrompt}` draws the HUD, with whatever `next(e)` returned under it.
- `types/index.d.ts` is the `$.state` contract (`clawd-minecraft.mood`), named by `types` in
  `plugin.json`. `claude plugin validate` holds the module's state keys to it.

## Behaviour and state

- Armor and hearts: 7-day limit left. XP bar and number: 5-hour limit left. Hunger: context left.
  A bar with no reading is left out, a limit past its `resetsAt` shows 100, all clamp to 0..100.
- Mood is `ask` while an `AskUserQuestion` is open, `done` after the main thread's turn ends
  with `reason: 'answer'` until the next `turn.start`, else `walk`. Subagent turns are ignored.
- `mood` lives in `$.state` (per session, survives a reload). Nothing is kept across sessions.
  `asking`, `isAnswered` and `strip` are module variables: a reload zeroes them, so he walks.

## Checks

`claude plugin validate .` and `claude plugin test .` (runs `tests/hud.test.ts`, 19 tests on
`claude-code/testing`). There is no other runner. `tsc -p .` only works once the engine has
laid `.claude-plugin/types/` (gitignored, absent in a fresh clone or worktree).

## Trying a change live

The owner's install is a directory marketplace on the main checkout (`claude plugin list` shows
`Read from:`), so sessions run that working tree, not a worktree and not the cache. Check the
branch out there, run `/reload-plugins`, look in the desktop app. A terminal session draws
nothing, and the desktop draws nothing before Claude's first reply.

## Release

1. Both checks pass.
2. Bump `version` in `.claude-plugin/plugin.json`, the only place it lives (no tags, no
   changelog, none in `marketplace.json`). The README's `2.1.287` is the minimum Claude Code.
3. Commit that one line alone as `bump to X.Y.Z`.
4. GitHub installs run a copy cached per version, so nothing reaches them until this lands.

## Constraints

- The README promises no network, file or shell access, and nothing changed or blocked. Every
  hook calls `next(e)`. `validate` lists the module's `$` calls: a new kind breaks the promise.
- Clawd's Svg `source` must stay byte-identical between draws, or the desktop reloads the frame
  (a blink, and the walk restarts). So motion is CSS and SMIL inside the SVG, never a timer or
  a redraw, and `strip` only moves on a change of 32px or more.
- Each strip carries a moving figure (`.m`) and a still one (`.s`) for reduced motion. Anything
  animated added to `figure()` has to go through `anim`/`shift` so `isStill` drops it.
- Tests pin exact strings: `alt` text, path data, the CSS in `clawd()`, the heart, armor and
  food colors. Change art or copy and the tests change with it.
- `validate` prints `gating hook without .catch` for the `AskUserQuestion` hook. Leave it: the
  hook only watches, so if it fails the question should still go through.
