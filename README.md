# hoppa

Levels that live in a link. See [`docs/spec.md`](docs/spec.md) for the design and
[`CLAUDE.md`](CLAUDE.md) for how we work. Both are binding.

**Day 1 of 14.** A coloured square you move around a 24×14 grid. Walls stop you.
That is the whole game so far, and that is deliberate — one playable increment
per day.

## Commands

| Command | What it does |
|---|---|
| `bun test` | Full suite. Must be green. |
| `bun run check:determinism` | Greps `src/core` + `src/engines` for anything non-deterministic |
| `bun run check` | Determinism check then tests — what CI runs |
| `bun run dev` | Local dev server on :3000 |
| `bun run build` | Static output into `dist/` |
| `bun run deploy` | Check, build, and report what CI still has to do |
| `bun run cli verify levels/day1.lvl` | Parse a level and print its facts |
| `bun run cli play levels/day1.lvl --moves RRDD` | Apply a move string, print the grid |

No runtime dependencies, and none in the toolchain either — Bun runs the
TypeScript, bundles the browser build and runs the tests.

## Layout

```
src/core/      grid, level parser, FNV-1a hash    DETERMINISM ZONE
src/engines/   Engine interface, delve/v1.ts      DETERMINISM ZONE
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

Live at **https://iainashmore.github.io/hoppa/**. Pushes to `main` build and
publish `dist/` to GitHub Pages.

Pages has to be switched on by hand once, at `Settings → Pages → Source: GitHub
Actions` — a workflow cannot do it for you. See
[`docs/adr/0001-hosting.md`](docs/adr/0001-hosting.md) for why, and for why the
repo is public.
