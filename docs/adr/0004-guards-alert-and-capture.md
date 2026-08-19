# 0004 — Guards: patrols from geometry, noise, and the alarm

**Status:** accepted (day 3)

## Decision

Day 3 ships as `src/engines/delve/v3.ts`, behaviour version 3. v1 and v2 are
untouched and still routed by the registry.

Guards store no movement data (spec §8). `src/core/patrol.ts` derives a patrol
from the level's geometry alone, and a guard's position is a **pure function of
the turn counter** — nothing accumulates, so a replay cannot drift, and guard
positions are deliberately absent from `stateHash()` because `turn` already
pins them.

| | Rule | Why |
|---|---|---|
| 1 | A guard patrols the **longer** of the two open runs through its cell, horizontal on a tie, ping-ponging end to end and heading for the high end first | Spec §8: "patrols the corridor it stands in, ping-ponging at walls". The tie-break has to be written down somewhere or it is a coin toss. |
| 2 | A run of `L` cells has period `2(L-1)`, so spec §8's **8-turn cap means a 5-cell run** | The cap is stated; the arithmetic that follows from it is not. `verify` now enforces it as the second half of L5. |
| 3 | **Noise, not sight**: a guard hears you within Chebyshev radius 1, through walls | Spec §5/§6 call this a *noise radius* and say the delver is "loud". Sound through walls is both the honest reading and far easier for a kid to predict than a sight cone. |
| 4 | Being heard raises **alert**, which runs 0..3 and does not decay; reaching 3 loses | Spec §8 budgets four values for `alertLevel`. Three strikes is easy to feel; a cooldown is another number nobody asked for. Day 4 wires `GUARD` — "how many spottings you survive" — to this ceiling. |
| 5 | Walking into a guard, or a guard walking into you, is a **catch**: an immediate loss | "Guards that patrol and **catch you**". A swap counts as walking into it: you cannot trade places with a guard to slip past in a one-wide corridor. |
| 6 | Reaching the exit **beats both the alarm and the clock** on the same turn | Same rule v2 already applies to the turn cap: winning on the last turn counts. |

## What the level design had to learn

The first day 3 level passed L1–L5 and was **unwinnable**. Every route into one
band ran through a single one-wide connector with a guard patrolling it.

A guard in a one-wide corridor is not a threat, it is a wall. The corridor is
five cells; the guard sweeps all five; you cannot cross without being adjacent,
and if you walk toward it you simply meet it. The search proved no win existed
even spending every point of alert.

**So: a guard must never be the only way through.** Every guarded connector in
`levels/day3.lvl` is paired with a clear one in the same stretch of band, which
turns each guard into a toll on the *short* route rather than a locked door.

This is not something L1–L5 can catch — static reachability says the level is
fine, because reachability does not know the guard is there. It wants a check of
its own (a guard-aware solver, spec §16's "design tool"), and until that exists
it is a rule for whoever draws the level. Flagged for the morning.

## The wait button was not optional

Day 3 is the first day where standing still is a move you need: dodging a patrol
means letting it walk past. The play page had no way to pass a turn, which made
the shipped level unbeatable on a phone — the engine was fine, the controls were
not. `WAIT` now sits in the D-pad, with space, `.` and `x` on a keyboard.

Found by replaying the committed clean run through the actual page rather than
through the engine. The engine had been green the whole time.

## Consequences

- `TILE_COUNT` is 8. Cosmetics still never reach `stateHash()` (E10 covers v3).
- `stateHash()` for v3 is position, turn, collected mask, status, **alert** — in
  that order. Append new state at the end, never in the middle.
- The day 3 golden vector is a *clean* run: 83 turns, four gems, four patrols,
  never once heard. It exists to prove the guards are dodgeable, so if a change
  ever makes dodging impossible it fails loudly rather than quietly.
