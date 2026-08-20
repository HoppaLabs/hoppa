# 0017 — The playability check

**Status:** accepted (day 11)

## What was wrong

Every check up to now answered *"is this cell connected to the start through
open space"*. From above that is the whole question. From the side it is barely
half of one: **you cannot walk upwards.** An open cell one row above your head
is connected, and unreachable, and a flood fill will cheerfully promise a child
a ledge nothing in the game can jump to.

This has now been wanted four times — a guard in a one-wide corridor (day 3), a
level nobody loud could win (day 4), floors too far apart to jump (day 8) — and
the jumping one is the one that reproduces, so it is the one this answers.

## The numbers are measured, not derived

`STEP_UP_BY_PIP` is the tallest step each strength can climb:

| strength | highest step |
|---|---|
| 0 | **none at all** |
| 1–3 | 1 cell |
| 4–5 | 2 cells |

Nobody, at any strength, can climb 3.

These come from **driving `dash/1` itself** — every strength, every step height,
every jump timing — not from arithmetic on the jump velocity.
`test/playable.test.ts` re-measures them on every run and fails if the table
drifts from what the game does. A jump arc is initial velocity, gravity, body
size and landing checks together; a closed-form guess at it would have been
wrong in exactly the cases that matter.

## The fill is deliberately generous

Where the real physics is hard to model, `reachableWithGravity` assumes you
**can** do it: air control is unlimited and a run-up is never required. So a
cell it calls unreachable is unreachable *for certain*, while a cell it calls
reachable might still be hard.

That asymmetry is the point. Telling a child their good level is broken is
expensive and they cannot argue with it; missing a problem only costs them the
attempt the share gate was going to make them play anyway. It is also why this
does not try to catch horizontal gaps: unlimited air drift means a chasm always
looks crossable. Worth knowing, not worth a false alarm.

## What it says

- **Fatal** — the door or a treasure is out of reach at the *best* jump in the
  game: *"nothing can jump up to the door — add a ladder, or a step to climb on"*.
  Nobody can finish this level, including whoever drew it.
- **Warning** — reachable at the best jump but not a middling one: *"only a
  strong character will get up there — a fast one will not make the jump"*.
  That is a level with an opinion, not a broken one, and it is exactly what
  makes sending it to a differently-built friend mean something.

Top-down levels are not judged on jumping at all. There is no gravity there and
the existing fill is already the correct movement model, so inventing a check
for it would only add noise. Guards are not treated as blockers either: since
`roam/3` you can kill one or freeze it, and a stunned enemy is walked straight
through, so a guard makes a route hard rather than impossible.

## A trap this uncovered, NOT fixed here

**A creature with no strength cannot climb a single step.** Spend all six
points on speed and the side-on game becomes ladders-and-flat-ground only.

That is a design bug, not a checking one: the weakest jump rises 0.98 cells and
needs 1.0. It is two subcells of velocity away from working. Fixing it means
changing how high a creature jumps, which is `dash/2` under hard rule 3, so it
is flagged rather than quietly done. The check reports against a *middling*
creature meanwhile, which is what pips 1–3 give.

## Also in this change

Side-on levels stopped looking like top-down ones, which was the other half of
"a child cannot tell the rules changed":

- **Sky.** Open space is light blue and the ground is green. Only the three
  terrain colours move; treasure, enemies, the exit and the ladder keep their
  meaning across both games. The speckle on open ground is dropped against sky —
  telling a player that air is walkable is the opposite of useful.
- **No border.** A side-on level is ground along the bottom and sky everywhere
  else. A box in the air says nothing (the engine already stops you leaving the
  grid) and hides the thing that matters.
- **Bottom left.** A side-on level starts on the ground with the level ahead of
  it. Switching a top-down level to side-on moves a start left floating in the
  sky; one already standing on something was put there on purpose and is left.
- **A padlock on the door.** It was a square with two bars, which read as a
  grating. It is now a door standing on the floor of its tile with a brass
  padlock hung on it, and an open doorway once every treasure is in.
- **Squash and stretch.** The jump stretches thin on the way up and flattens on
  landing, driven by the engine's own `vy` so it tracks the real arc. Anchored
  at the feet, or a stretched sprite sinks into the floor it stands on.
