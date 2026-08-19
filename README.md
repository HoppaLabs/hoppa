# hoppa

Levels that live in a link. See [`docs/spec.md`](docs/spec.md) for the design and
[`CLAUDE.md`](CLAUDE.md) for how we work. Both are binding.

**Day 3 of 14.** Collect four gems in a 24×14 dungeon while four guards patrol
it, which opens the exit, then get out. Get close and they hear you; get closer
and they have you. That is the whole game so far, and that is deliberate: one
playable increment per day.

## Commands

| Command | What it does |
|---|---|
| `bun test` | Full suite. Must be green. |
| `bun run check:determinism` | Greps `src/core` + `src/engines` for anything non-deterministic |
| `bun run check` | Determinism check then tests — what CI runs |
| `bun run dev` | Local dev server on :3000 |
| `bun run build` | Static output into `dist/` |
| `bun run deploy` | Check, build, and report what CI still has to do |
| `bun run cli verify levels/day3.lvl` | Run the spec §13 checks L1–L5 on a level |
| `bun run cli play levels/day3.lvl --moves RRDD` | Apply a move string, print the grid |

No runtime dependencies, and none in the toolchain either — Bun runs the
TypeScript, bundles the browser build and runs the tests.

## Layout

```
src/core/      grid, level parser, verify, reach, patrol, hash        DETERMINISM ZONE
src/engines/   Engine interface, registry, delve/v1..v3               DETERMINISM ZONE
src/cli/       util.parseArgs front end, ASCII debug view
src/web/play/  canvas renderer, play page
levels/        committed .lvl fixtures (canonical)
test/golden/   (level, log) → hash vectors — sacred, never regenerate to go green
tools/         determinism check, build, generators
docs/adr/      decisions
```

`src/core/fixtures.ts` is **generated** from `levels/*.lvl` by
`bun run tools/embed-levels.ts` so the web build needs no fetch. A test fails if
the two drift.

## Behaviour versions

A level pins the rules it is played under in its header (`behaviour=2`), and
`src/engines/registry.ts` routes it to that build. Old builds never leave the
bundle: `levels/day1.lvl` still says `behaviour=1` and still gets `DelveV1`,
whose day 1 golden vector replays byte-identically. An unknown version refuses
politely rather than guessing — spec §13's E11.

| Version | Rules |
|---|---|
| `delve/1` | Move one cell a turn; walls and the grid edge refuse. Never ends. |
| `delve/2` | v1's movement, plus turns, treasure, an exit that opens once every gem is collected, a 999-turn cap, and win/loss. |
| `delve/3` | v2's rules, plus guards that patrol geometry-derived corridors, a noise radius that raises the alarm, and capture. |

Adding a rule means adding the next version, never editing the last one — see
[`0003`](docs/adr/0003-delve-v2-and-the-day-2-rules.md) and
[`0004`](docs/adr/0004-guards-alert-and-capture.md).

## The determinism check

`tools/check-determinism.ts` reads every `.ts` under `src/core` and `src/engines`
and refuses `Math.random`, `Date`, `Intl`, `toLocale*`, `performance.now`,
`parseFloat`, float literals, `crypto` randomness and `Object.keys/values/entries`.
It skips comments and string literals, and a single line can be excused with a
trailing `// determinism-ok: <reason>`.

It runs first in CI, and `test/determinism-zone.test.ts` proves it still catches
planted violations — a check that has quietly stopped checking is worse than none.

**Do not weaken a rule to make a test pass.**

## Deploying

Pushes to `main` build and publish `dist/` to GitHub Pages:

**https://hoppalabs.github.io/hoppa/**

The workflow turns Pages on itself, so there is no settings page to find. See
[`docs/adr/0001-hosting.md`](docs/adr/0001-hosting.md).
