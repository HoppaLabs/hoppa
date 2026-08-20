# hoppa

Levels that live in a link. See [`docs/spec.md`](docs/spec.md) for the design and
[`CLAUDE.md`](CLAUDE.md) for how we work. Both are binding.

**Real time now.** Draw a creature, spend eight points across **strength, speed,
nerve and reach**, then take it into a 24×14 dungeon where guards patrol on
their own clock, notice you, and chase. Swing a sword, grab the treasure, get
out — then send the level to a friend, who plays it with *their* creature.

Two shapes of game, both on the same grid and both in the same link: **from
above** (Zelda-shaped — walk anywhere, swing a sword) and **from the side**
(Donkey Kong-shaped — platforms, ladders, jump on things). The same character
plays both, and its strength means "hit harder" in one and "jump higher" in the
other.

## Commands

| Command | What it does |
|---|---|
| `bun test` | Full suite. Must be green. |
| `bun run check:determinism` | Greps `src/core` + `src/engines` for anything non-deterministic |
| `bun run check` | Determinism check then tests — what CI runs |
| `bun run dev` | Local dev server on :3000 |
| `bun run build` | Static output into `dist/` |
| `bun run deploy` | Check, build, and report what CI still has to do |
| `bun run cli verify levels/day4.lvl` | Run the spec §13 checks L1–L5 on a level |
| `bun run cli play levels/day4.lvl --moves RRDD --creature Nim` | Apply a move string as a creature, print the grid |
| `bun run cli link levels/day4.lvl` | Print a share link, with its size against the budget |
| `bun run cli open '<url-or-code>'` | Decode a link back to `.lvl` on stdout |

No runtime dependencies, and none in the toolchain either — Bun runs the
TypeScript, bundles the browser build and runs the tests.

## Layout

```
src/core/      grid, level, verify, reach, patrol, creature, sprite,
               palette, codec, hash                                  DETERMINISM ZONE
src/engines/   Engine interface, registry, delve/v1..v4               DETERMINISM ZONE
src/cli/       util.parseArgs front end, ASCII debug view
src/web/play/  canvas renderer, play page
src/web/make/  sprite editor
src/web/       stash.ts — browser storage, outside the determinism zone
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
| `delve/4` | v3's rules, with MASS, GUARD, HASTE and REACH read from a creature instead of fixed. |
| `delve/5` | v4's rules, minus MASS, plus barging a guard with strength. |
| `roam/1` | **Real time, from above.** Enemies patrol and chase on a clock; you walk and swing a sword. |
| `dash/1` | **Real time, from the side.** One screen: platforms, ladders, gravity, and enemies you beat by landing on them. |

Adding a rule means adding the next version, never editing the last one — see
[`0003`](docs/adr/0003-delve-v2-and-the-day-2-rules.md),
[`0004`](docs/adr/0004-guards-alert-and-capture.md),
[`0005`](docs/adr/0005-capabilities-and-the-three-presets.md),
[`0006`](docs/adr/0006-share-links-and-the-wire-format.md),
[`0007`](docs/adr/0007-drawing-your-own-creature.md),
[`0008`](docs/adr/0008-mass-out-budget-in.md),
[`0009`](docs/adr/0009-real-time.md),
[`0010`](docs/adr/0010-the-side-on-game.md) and
[`0011`](docs/adr/0011-the-character-code.md).

## Real time, still deterministic

The world advances in whole ticks, thirty a second, driven by a clock rather
than by your thumb. Positions are fixed-point integers (256 subcells to a cell),
never floats, and wall-clock time never reaches the engine. So a replay is still
exact, and a share link still proves a win — see
[`docs/adr/0009`](docs/adr/0009-real-time.md).

## It works with the radio off

A level lives in the URL *fragment*, and a fragment is never sent to a server. So
the service worker does not cache "the app minus the levels" — it caches
**every level anybody will ever send**, including ones that do not exist yet.
Open the game once and a friend's link works in a car with no signal.

The cache is named after a hash of the six files in it, so an unchanged build
produces a byte-identical worker and a changed one can never be served from a
stale cache. If a new build lands while you are looking at the page and have not
touched it, the page quietly reloads into it; the moment you start playing, it
does not. See [`docs/adr/0023`](docs/adr/0023-offline.md).

## The last few levels you played

A level is only ever a link, which is the whole design — and the cost is that
closing the tab used to be the end of it. The last six levels you played are
kept as the codes that were in their links, so **played before** under the game
is somewhere to go back to. Tapping one is the same act as tapping it in a
message. See [`docs/adr/0026`](docs/adr/0026-levels-you-played.md).

## Nothing asks you to install it

You can add it to a home screen if you want one — there is a manifest, and the
icon is the creature itself, drawn at build time from the real sprite through a
PNG encoder written for the purpose ([`tools/png.ts`](tools/png.ts), no
dependencies, indexed 2bpp so a 512px icon costs 66 KB rather than 786).

But nothing prompts you to. That was built and then taken out
([`docs/adr/0025`](docs/adr/0025-no-home-screen-prompt.md)): a prompt is an
interruption between a child finishing a drawing and seeing it run about.

## Your character is a code

Browsers throw storage away — Safari after 7 days without a visit. So a
character has a code that rebuilds it exactly, shown in the editor with a QR
beside it:

```
HOPPA-BASH-38CCY-PJ9GM-W6A88-...-3
```

Crockford base32, because these get *typed*: no `I`, `L`, `O` or `U`, case
insensitive, chunked in fives, with a check symbol that catches every single
mistyped character and every adjacent swap. See
[`docs/adr/0011`](docs/adr/0011-the-character-code.md).

## Looks and capabilities are separate

A creature is a 16×16 sprite at 2bpp plus eight capability numbers, and the two
never meet. Drawing something enormous does not make it heavy. This is spec §5's
rule and CLAUDE.md hard rule 4, and it is the thing most likely to get broken by
accident, so `test/sprite.test.ts` points several tests straight at it.

## Links

A level travels in the URL fragment: `<site>/#p/<slug>/<code>`. The code is
70–88 characters for the levels shipped so far, against spec §10's budget of
150, and carries the engine behaviour version so a link always plays by the
rules it was made with. `test/golden/codes.json` pins the wire format — if it
changes, every link ever sent breaks.

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
