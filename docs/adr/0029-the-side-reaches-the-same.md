# 0029 — dash/4: the side reaches the same as the top

**Status:** accepted (day 15). Companion to `docs/adr/0028`.

## What was missed

`roam/5` stopped treasure being picked up at the weapon's reach. **The side-on
engine still did it**, because the fix was applied where the complaint was
rather than everywhere the code was.

Reported again after that deploy — *"it's still acquiring the crystals from too
far away"* — which is exactly what a player would say having gone to a side
level next.

## From the side it was worse

Both engines shared the same line:

```ts
if (chebyshev(tx, ty, this.x, this.y) <= this.reach) { ... }
```

`REACH` is 416 subcells, over a cell and a half, and a pickup checks for
nothing in the way. From above that collects through a wall. **From the side it
collects a gem off the platform above you** — so the one thing a side-on level
is about, working out how to get up there, could be skipped by standing
underneath.

## Decision — `dash/4`

```ts
export const GRAB = (BODY + (ONE >> 2)) | 0;   // 160, the same as roam/5
```

The same number, deliberately. A creature carries between the two games
(spec §7), and *how close do I have to be* should not change when the camera
moves. There is a test asserting the two constants are equal.

`dash/3` is untouched and still routed, with a test pinning its `REACH` at 416.

## Measured

Walking the floor from end to end, with a gem placed above it:

| gem | dash/3 | dash/4 |
| --- | --- | --- |
| on the floor with you | collected | collected |
| **one cell up** | **collected** | **left it** |
| two cells up | left it | left it |

The built-in side level still verifies: 4 treasure, all reachable.

## The lesson

Two engines, one shared line of arithmetic, and a fix that landed in one of
them. Nothing in the tests would have caught it — `roam/5` was tested
thoroughly, and dash was not tested for this at all, because nobody had thought
to look there.

When a rule turns out to be wrong, the question is not "where was it reported"
but **"where else is this written down"**. `GRAB` now exists in both engines and
a test asserts they agree.
