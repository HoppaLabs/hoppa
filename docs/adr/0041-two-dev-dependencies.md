# 0041 — Two dev dependencies, so the typecheck can join the gate

**Status:** accepted (day 18)

`typescript` and `@types/bun`, both **devDependencies**. `bun run check` now runs
`tsc --noEmit` between the determinism check and the tests.

Hard rule 2 says zero runtime dependencies, ask first, always. Asked, and
granted. **The rule is intact:** the build bundles `src/`, nothing from
`node_modules` reaches `dist/`, and a shipped page still carries no third-party
code.

## Why it was worth asking for

The level editor shipped **completely dead** — `ReferenceError: sideOn is not
defined`, thrown on load, nothing rendered — while `bun run check` reported
**683 pass, 0 fail**. A one-line missing import.

Nothing in a test suite loads the pages a child actually opens. `tsc --noEmit`
catches that exact error in one line, and it was already being run by hand,
irregularly, against a wall of noise from the missing Bun and DOM types.

## What it found on the first clean run

Forty-three errors. The interesting ones were not type noise:

- **`reachFor` and `private readonly reach` were declared twice in every one of
  `dash/v3` through `v7`.** Both copies of the function returned the same value
  — `REACH` and its inlined expression — so the later one silently shadowing the
  earlier changed nothing, and the golden vectors confirm it. Dead duplicates in
  the determinism zone that five engine versions carried forward.

- **`test/roam.test.ts` had a vacuous test.** "reach lifts a gem from further
  away" built a long arm and a short arm, walked them the same path and checked
  the long one collected no later. `REACH` stopped being a spendable
  characteristic in `0012` (day 9), so `Build` has no such key and `buildToCaps`
  never read the one the test was setting: **the two creatures were identical
  and it was comparing a number to itself.** Passing, every run, for nine days.
  Deleted rather than repaired — there is no characteristic left to test.

- **`Engine` never declared `currentStatus()`.** The play page asks every engine
  for it on every frame. Twenty-two of the twenty-three builds answered; the
  interface never said they had to, so `delve/1` — which did not — was
  invisible. Declared on the interface, and `delve/1` given the accessor. Day 1
  had no win and no loss, so there is nothing to return but `STATUS_PLAYING`;
  what was missing was saying so. Not a behaviour change, and the golden vectors
  prove it: it reads the status and cannot alter it.

- **`draftFromLevel()` declared a shape it did not accept.** Its parameter type
  omitted `guardArt` while the body read `level.guardArt[i]`. Anything passing
  exactly what was declared would have thrown. Every real caller passes a whole
  `Level`, which is the only reason it never did.

- **`Replayable` was imported from `src/engines/types.ts`, which does not export
  it.** Two test files, eleven casts of the form `as unknown as Replayable` — all
  of them checking nothing at all. It lives in `src/core/proof.ts`.

- **`test/result-link.test.ts` read `back!.creature.weapon` without checking the
  creature decoded.** `SharedResult.creature` is deliberately nullable: a damaged
  creature costs the boast, not the game. A round-trip test has to say it arrived
  before reading anything off it.

## The cost

`bun install --frozen-lockfile` is now the first step of both workflows, and
`bun.lock` is committed. Six packages, none of them shipped.
