# 0022 — roam/4: you can get away

**Status:** accepted (day 12)

## What was reported

From real play: *"the player seems to die too quickly and the enemies are
moving too quickly."*

## What was actually wrong

Two things, and neither is "the numbers feel high".

**1. The strongest creature could not outrun an enemy.** In `roam/3` enemies
walked at 30 and the slowest build moved at 26. Strength bought hearts and took
away every way of using them: once a guard had you, the only exits were killing
it or dying.

**2. Knockback bought nothing.** A hit throws you two cells. At 30 an enemy
crosses two cells in about **0.6 s**, well inside the **1.7 s** mercy window —
so it was already on you the instant mercy ended, and hearts came off in a
chain rather than one at a time.

Together those are not a difficulty setting, they are a trap: the moment you
are touched, the outcome is mostly decided.

## Decision — a new build, `roam/4`

```
ENEMY_SPEED   30  ->  22
hearts        2 + FORCE  ->  3 + FORCE
```

`roam/3` is untouched and still routed; every link ever sent under it plays
under it. There is a test pinning `V3_ENEMY_SPEED === 30`.

## Measured, not guessed

Walk into a guard until it lands a hit, then run, and count what the chain
costs. Same corridor, same builds, both engines:

| build | roam/3 (enemy 30, 2–7 hearts) | roam/4 (enemy 22, 3–8 hearts) |
| --- | --- | --- |
| F0/H5 | 1 more hit, 0/2 left — **dead** | 1 more hit, 1/3 left |
| F1/H5 | 2 more hits, 0/3 left — **dead** | 1 more hit, 2/4 left |
| F2/H4 | 3 more hits, 0/4 left — **dead** | 0 more hits, 4/5 left |
| F3/H3 | 3 more hits, 1/5 left | 2 more hits, 3/6 left |
| F4/H2 | 4 more hits, 1/6 left | 2 more hits, 4/7 left |
| F5/H1 | 4 more hits, 2/7 left | 2 more hits, 5/8 left |

Three of six builds died to a single mistake in `roam/3`. In `roam/4` none do —
and getting clear still costs 0–2 hits, so it is not free either.

The first measurement I ran was worthless and I want that recorded: a blind
wandering player showed almost no difference between the two, because a
wanderer never tries to break away. The defect was in a thing the test was not
doing.

## Speed still means something

Every build is now faster than a guard, but not equally:

- slowest build: **1.2×** enemy speed — you get away, barely, and it is tense
- fastest build: **2×+** enemy speed — you leave it standing

Speed decides *how easily* you escape, not *whether* you can. That is the
characteristic doing its job instead of gating survival.

## Why not just add hearts

Tried on paper first: more hearts with a 30-speed enemy makes the chain longer,
not survivable — you still cannot break the loop, you just lose more slowly,
which is worse. The speed is the defect; the extra heart is for the first
mistake you make while still learning the room.
