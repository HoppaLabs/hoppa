# 0037 — A bucket of water

**Status:** accepted (day 17)

`roam/8`. From above, you carry water, and fire goes out.

## Who asked

The nine-year-old this is built for, twice, unprompted:

> Need a water bucket to put out the fires.

and then, deciding where it goes:

> let add water control to put out fires, a child's request, you can put it
> where the jump command is for the side game, only add it to the above levels
> though

## Why it is a good idea and not just a nice one

Fire arrived in `0034` as *the hazard that does not move*, and that is exactly
what makes it valuable: a guard is a **timing** problem, fire is a **route**
problem, and a route problem is something a room's shape can pose.

But a route problem whose only answer is "go the long way" is a wall. A child
who cannot see the way round a wall does not go the long way; they stop playing.

Water turns the wall into a **price**. Every fire can be put out. Putting one
out costs `POUR_TICKS` — sixteen ticks, about half a second — of standing still,
and the clock is the score. So the player who finds the way round still wins,
the player who is stuck still finishes, and neither of them is reading a manual.

Two properties fall out of that and both matter more than the feature does:

- **It can never dead-end a level.** Nothing about a room can now be
  unbeatable-by-fire, which is a class of broken level a child could previously
  draw without meaning to.
- **It is never free.** An unlimited bucket with no cost would delete fire from
  the game. The cost is time, which is already the thing being measured.

## Why from above only

Not a restriction — an observation. The hazard is one entity with two faces
(hard rule 5): underground it is drawn as fire, outdoors as metal spikes coming
up out of the ground. Top-down levels are the underground ones. **Pouring water
on a spike does nothing to a spike**, so there was never anything to add to the
side-on game, and `dash/7` is untouched.

## It cost nothing to reach

Both halves were already sitting there.

`types.ts` has said since the bit was added:

> From above, `HELD_ACT` already means "swing" and this is unused. From the side
> `HELD_ACT` is jump, so the sword and the wand need their own bit.

So `HELD_SWING` was free from above. And so was the button: the pad is
`"wait up swing" / "left down right"`, and seen from above the **left** action
slot is empty, because that is where JUMP lives in the side-on game — which is
precisely where the child said to put it, without knowing any of this.

## The two cells

Water reaches the cell you are **facing** and the cell you are **standing in**.

Standing in, as well as facing, because the moment a child reaches for the
bucket is the moment they have just walked into a flame, and "turn round and
face the thing you are standing in" is not a rule anybody would guess. It costs
nothing: a fire you are standing in is already taking a heart off you.

Cells, not distances, and deliberately **not the sword's reach**. Reach is
bought with strength pips. A fire only a strong creature could put out would
make a room unbeatable for a fast one — and the fast, weak creature is the one
a child builds first. Water is the same for everybody, because it is a route,
and routes belong to the level.

## What is authoritative

Which fires are out is engine state, in `stateHash()`, one flag per entry in
`level.fireCells`. A `Uint8Array` and not a bitmask: treasure gets away with
`1 << i` because spec L4 caps it at eight, and nothing caps fire — a room could
be paved with it.

The pour countdown is in the hash too. Two runs of the same log agree; a run
that poured is a different state from one that did not. Both pinned in
`test/roam-v8.test.ts`.

## Hard rule 3

`roam/7` stays and stays exact. Pressing the bucket bit in an older build does
nothing at all — which is exactly what it did for the person who beat that link
and sent it to you. The shipped rooms are regenerated onto `roam/8`.

## Measured

| | |
| --- | --- |
| walked straight through a flame | 7/8 hearts |
| put it out first | 8/8 hearts |
| three flames, in a browser, with the button | 1152 → 369 → 0 flame pixels |
