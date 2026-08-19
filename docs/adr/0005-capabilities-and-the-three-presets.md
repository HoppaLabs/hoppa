# 0005 — Capabilities: what eight numbers actually do

**Status:** accepted (day 4)

## Decision

Day 4 ships as `src/engines/delve/v4.ts`, behaviour version 4, plus
`src/core/creature.ts` with the three presets. v1–v3 are untouched.

A creature is now an **input**, alongside the level and the log — spec §15 keys
golden vectors on `(level, creature, log)`, and from day 4 that is literal:
`test/golden/day4-{bruk,nim,pell}.json` are the same level and the same rules
producing three different hashes.

The four capabilities Delve consumes, and the thresholds that give them meaning.
These are pinned to behaviour version 4 forever:

| Cap | What it does in Delve | Threshold |
|---|---|---|
| `MASS` | How far guards hear you — **you're loud** (spec §6) | `>= 128` → radius 2, else 1 |
| `GUARD` | How many spottings you survive | `>= 128` → alert ceiling 3, else 2 |
| `HASTE` | An occasional free step: you move, the world does not | accumulator, see below |
| `REACH` | Lift a gem from the next cell without stepping into the open | `>= 128` → radius 1, else 0 |

The thresholds are **coarse on purpose**. A kid has to feel the difference in a
single run, and an axis that moved a radius by a fraction of a cell would be
invisible. Alert stays inside 0..3 whatever `GUARD` says, because spec §8 budgets
exactly four values for it in the solver state.

## HASTE nearly broke termination

`HASTE` accumulates by the creature's own number each step; when it passes 256,
that step costs no turn. Integer arithmetic on a fixed number, so "occasional" is
exact and replayable — a PRNG here would be both banned and unnecessary.

The first version was wrong. At `HASTE` near 255 the accumulator banks faster
than it spends: every step becomes free, the turn counter stops advancing, and
the game never ends. Spec §13's **E4** says it must terminate and **E2** says an
all-255 creature must be playable, so this was not hypothetical.

Two guards fix it: the accumulator is capped, and **you never get two free steps
in a row**. That bounds the clock to advancing at least every other step. There
is a test that runs an all-255 creature specifically to prove it.

Because the accumulator decides future free steps, it is authoritative state and
is hashed. `stateHash()` for v4 is position, turn, collected mask, status,
alert, **haste, and whether the last step was free** — in that order.

## The level had to be rebuilt around the loudest creature

`levels/day4.lvl` is day 3's shape with the guards spread out, because the first
attempt was **unwinnable for Bruk** while being fine for Nim and Pell.

Two separate causes, both found by search rather than by playing:

1. A creature with `MASS` over the line hears-radius 2, so a "clear" connector
   two columns from a guarded one is not clear for Bruk at all. Guarded and
   clear routes are now at least four columns apart.
2. Every wall stub splits a band into two islands, and as soon as the only
   connector joining two islands has a guard on it, the level is unwinnable for
   *everyone* — while L1–L5 all pass, because static reachability cannot see the
   guard. The stubs are gone; full-width bands make every connector
   interchangeable, so a guard is always a toll and never a wall.

This is the second time (see ADR 0004) that a level passed every committed check
and was still unplayable. **The gap is real and it is not closing on its own:**
L1–L5 cannot answer "is this beatable with guards moving". Spec §16 argues the
BFS solver is off the critical path because the share gate uses the player's own
win log — true for shared levels, but it says nothing about the levels *we*
ship. A guard-aware solvability check is worth its own day. Flagged, not built.

## Consequences

- `message()` now reads the creature: the same event says something different
  depending on who you brought. Spec §15's *"Something this heavy was never
  meant to sneak"* is in there, as Bruk's line for losing to the alarm.
- `engineFor(level, creature?)` takes a creature. Builds older than v4 ignore
  it: their rules were fixed before creatures existed and must stay that way.
- No sprite, no marks, no history yet — a creature is a name and eight numbers.
  Sprites are day 6, and `.chr` codes are day 8.
