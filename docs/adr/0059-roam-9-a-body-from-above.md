# 0059 — roam/9: a body, seen from above

**Day 22. Accepted and shipped.** `NEWEST_BUILD.roam = 9`; roam/8 stays exactly
as it is and every link ever sent still replays.

## What was asked

The same brief as `0058`:

> For the gameplay and character control all the side and above games need work,
> use your judgment, don't just do cheap easy changes, make the expensive
> changes as poor gameplay means poorer engagement and today it feels like
> moving a cursor as you say.

`0058` did the side-on game. This is the "above" half, and it needed two things
the platformer did not.

## The copyright position

Unchanged from `0058` and worth restating because this build leans harder on it.
Acceleration, friction, corner assist, input buffering, knockback and
invulnerability frames are **technique** — how a game of this shape has worked
since the mid eighties, written up in public a hundred times over. None of it is
anybody's art. The creatures, their names, the tiles, the rooms and every noise
in this game are ours.

## Five changes

| | roam/8 | roam/9 |
|---|---|---|
| Walking | `x += speed * dir` | velocity, four ticks to full speed |
| Letting go | stops on the tick | drags to a stop in three |
| Diagonals | **41% faster** than straight | normalised (181/256 ≈ 1/√2) |
| Nearly lined up with a door | stops dead | walks itself into line |
| Swing during a swing | dropped | remembered for 6 ticks |
| Being hit | **teleported 2 cells** | thrown, over about 8 ticks |

Enemies are **not** changed. A guard is a hazard with a pattern you learn, and
giving it momentum makes the pattern harder to read for no gain.

### The one that matters most is the corner

A body is 192 subcells across in a 256-subcell cell, so it clears a one-cell
doorway with **32 subcells to spare either side** — and nothing on screen tells
the player whether they are inside that window. Walk at a door slightly high and
you stop, with the gap visibly right there. Nobody reads that as missing. They
read it as the game refusing to move.

Measured, by walking at a door from every misalignment between 0 and half a
cell:

```
worst near miss that still gets through:   roam/8   26 subcells
                                           roam/9  116 subcells
```

Four and a half times the window, and a wall with **no** door in it still stops
you dead at every one of those offsets — because the test the assist applies is
"would being properly lined up open the way", not "are you pressed against
something".

**The first version of this was nearly worthless and the measurement is what
said so.** It asked whether *one* nudge cleared the gap, which widened the
window from 26 to 48: a near miss of 84 needs four nudges, and the first three
each looked like a failure, so it gave up. Asking about the middle of the row
instead means leaning on the button walks you into line over a few ticks. Before
measuring it, the assist read as obviously working — it got through more doors
than roam/8 did.

### Being hit

roam/8 moved you two whole cells on the tick you were hit. Same destination,
completely different reading:

```
biggest single tick:   roam/8  1.90 cells      roam/9  0.34 cells
total distance:        roam/8  0.88 cells      roam/9  1.70 cells
```

You do not see yourself thrown, you see yourself somewhere else, and a child
watching that cannot tell being hit from the game glitching. Now it is a
velocity and the ordinary friction eats it, with five ticks where the player has
no say — short enough that it can never cascade, and short enough that you get
the wheel back while still sliding, so the hit ends with you steering out of it
rather than waiting for a turn.

## Where the code lives

The arithmetic is in **`src/core/steer.ts`**, a new file, so the numbers can be
argued about in a test rather than felt for in a browser — the same move as
`palette.ts`, `weapon.ts`, `facing.ts` and `hitstop.ts` before it.

**Nothing existing imports it.** Hard rule 3 says a shipped build's behaviour
never changes, and the cheapest way to keep that promise is for the new builds to
be its only readers: a later tweak in there can never reach roam/8 or calm/3 by
accident.

Five new fields — `vx`, `vy`, `stun`, `swingBuffer`, `actWasDown` — are all in
`stateHash()`. They are authoritative: two clients replaying the same log have to
agree how fast the creature was already going, or they part company at the next
wall.

## Proof

- `test/roam-v9.test.ts` — 14 tests, each measuring against roam/8 rather than
  asserting a constant.
- Eight new mutations in `tools/mutate.ts`, one per feature.
- The bot beats all fifteen pack rooms with all four creatures; the top-down
  rooms cost about a second each, which is the acceleration and is the point.

## What is not done yet

calm, raze and swim. Same brief, same file, next.
