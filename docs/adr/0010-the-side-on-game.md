# 0010 — Dash: the side-on game, and ladders that cost nothing

**Status:** accepted (day 8)

## Decision

`src/engines/dash/v1.ts` is the side-on engine: one screen, platforms, ladders,
and enemies you beat by landing on them. Same ticks, same fixed point, same
links as Roam. The only real difference underneath is that here everything
falls.

The four characteristics carry over, but the **verb** does not:

| | From above (Roam) | From the side (Dash) |
|---|---|---|
| strength | how hard you hit | **how high you jump** |
| speed | how fast you walk | how fast you run |
| toughness | hits you can take | hits you can take |
| reach | how far the sword lands | how far you can grab |

Strength meaning "jump" is the whole argument for dropping `MASS` made concrete:
one number, two games, and a kid can predict both. The UI says so — the trait
line reads "hits hard" from above and "jumps miles" from the side, because
telling a child their creature hits hard in a game with no hitting is a small
lie that costs trust.

## Ladders, added without invalidating a single existing code

A platformer needs a third terrain state, and the level format had two: wall or
open. The obvious fix — a second bitmap on every level — would have changed
**every code ever made**, which is exactly what a permanent link format must
never do.

Instead the ladder map is written **only for engines that can climb**. The
engine id sits in the header, before the field, so a decoder always knows
whether to expect it. Adding ladders cost nothing for every level and every link
that already exists: `test/golden/codes.json` did not move a byte.

A side-on level with ladders still encodes to 96 characters, inside spec §10's
150 budget.

## L5 was wrong for a platformer

`verify` failed the first Dash level with "guard corridors longer than 5 cells:
run of 22". That check derives a patrol from the corridor a guard stands in — a
top-down idea. Dash's enemies walk the floor they are on and turn at a wall or a
ledge, so measuring them as corridors reports a 22-cell patrol across a platform
and rejects a perfectly good level.

The cap exists to bound a turn-based solver's state space (spec §8), and there
is no such solver down here. L5's second half now applies only to engines whose
enemies patrol corridors.

**Still approximate:** L3 and L4 use a flood fill through open cells, which for
a side-on level ignores gravity — it will call a ledge reachable that you cannot
actually jump to. A platformer reachability check needs to know jump height, and
jump height comes from the creature. That is a real gap, and it is the third
time level validation has been unable to answer "is this actually beatable".
Flagged, not built. The share gate covers it in practice: you cannot send a
level you have not finished.

## The first level was unplayable, and the tests said it was fine

Floors three rows apart leave one clear row above each. A weak creature jumps
about one cell and a strong one about two and a half, so **there was nowhere any
creature could jump**, and the level verified clean.

Found by asserting that pressing jump makes the vertical speed negative — it was
zero, because the ceiling was immediately overhead. The level now gives three
clear rows per storey.

That is the same failure as day 3's guard-in-a-corridor and day 4's Bruk: the
checks describe the level's shape, never whether it can be played. The pattern
is consistent enough now to be worth its own day.
