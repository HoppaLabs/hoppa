# 0028 — roam/5: treasure is picked up by hand, not by sword

**Status:** accepted (day 15)

## What was reported

From real play: *"the proximity to capture the treasure is too far, the player
needs to be closer."*

## What was actually wrong

The pickup test borrowed the **weapon's reach**:

```ts
if (chebyshev(tx, ty, this.x, this.y) <= this.reach) { ... }
```

`REACH` is 416 subcells — **over a cell and a half**. So a gem came off the
floor from a cell and a half away, and since nothing about a pickup checks for
walls, *through* them: walking down the corridor next to a treasure collected
it without ever seeing it.

That is not a difficulty setting. It removes the reason to go anywhere.

## Decision — a new build, `roam/5`

```ts
export const GRAB = (BODY + (ONE >> 2)) | 0;   // 160 subcells, 0.63 cells
```

Your own body, plus a quarter of a cell. A sword is meant to reach; a hand is
not.

`roam/4` is untouched and still routed. There is a test pinning its `REACH` at
416, and every link ever sent under it plays under it.

## Measured

Walking the length of a corridor with one gem placed a given number of rows
away, same creature, both builds:

| gem | roam/4 | roam/5 |
| --- | --- | --- |
| on the walking line | collected | collected |
| **1 cell away** | **collected** | **left it** |
| 2 cells away | left it | left it |

## Why 160 and not less

Two bounds, and they leave a narrow window:

- **Above half a cell (128).** The furthest corner of a cell is half a cell from
  its centre, so anything less would mean standing *inside* a gem's own cell and
  not getting it — which would read as broken rather than as strict.
- **Not much above.** At 160 the grace outside the cell is a fifth of a cell,
  which covers walking briskly past the edge and nothing more.

There is a test that walks every speed build over a gem, because the fastest
creature moves 50 subcells a tick and a pickup window can be stepped clean over
between ticks. All six collect it.

## A check that was already right

`levels/` are validated by L4, *"every treasure reachable"*, which asks whether
you can **walk to** a treasure. Under `roam/4` that was stricter than the engine
needed — you could collect what you could not reach. Under `roam/5` the check
and the engine finally mean the same thing.

The built-in level still verifies: 4 treasure, all reachable.

## Everything else is `roam/4` exactly

Enemy speed, hearts, weapon reach, stun and freeze are unchanged, and there is a
test asserting so. `roam/5` changes one number and nothing else.
