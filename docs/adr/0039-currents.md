# 0039 — Currents, and what strength is for underwater

**Status:** accepted (day 17)

`swim/2`. Water that goes somewhere, painted by dragging.

## The problem it fixes

`swim/1` could swim and could drown, and **a strong creature had no reason to
exist in it.** That is not a matter of taste.

The premise of the whole game is that your friend plays your level with *their*
creature, who is good at different things. In `dash`, `FORCE` buys jump height —
so a strong creature reaches a ledge a fast one cannot, and the two builds take
different routes through the same room. Underwater, with free movement, nothing
is out of reach. `FORCE` bought hearts and sword hits and **nothing about route
at all**, which left half the character system dead in water.

## What currents do about it

They invert the obvious. Ten seconds swimming into a flow, measured:

| creature | strength | speed | upstream |
| --- | --- | --- | --- |
| Bash | 5 | 1 | **+14.71 cells** |
| Pell | 3 | 3 | +10.38 |
| Nim | 1 | 5 | **+5.90** |

The slowest creature in the game is two and a half times the most effective
through a current, and in open water Nim is nearly twice Bash's speed. So Nim
goes the long way round and still gets there first; Bash goes straight through.
One room, two real routes.

Nobody is stopped dead — `+5.90` is slow, not impossible. A current you cannot
beat is a wall, and a wall with no answer is exactly what `0037` argued against.

## The constants were measured, not picked

`SPEED_BY_PIP` tops out at 50 subcells a tick, so a push that is going to matter
to a fast creature has to survive their resistance being taken off it. Hence
`FLOW_PUSH = 54` and a resistance ramp `[0, 8, 16, 24, 32, 40]` that never
reaches it. A current a strong creature simply ignored would stop being part of
the level's shape for them, which is the opposite of the point.

It is a **drift, not a shove**: applied to position, never to velocity. Momentum
that accumulated would let a current fling you across the room at a speed the
level could not have anticipated, into whatever is on the far side.

## On the wire it cost nothing

A current needs a direction, and the entity-kind field is **3 bits with 7 of its
8 values already spent** — so four directions could never have been four kinds.
Carried instead as a swim-only field behind the engine id, exactly as ladders
are carried for `dash` and for the reason the codec already states, it costs
every level that is not underwater precisely zero bits.

| | |
| --- | --- |
| a top-down level | 42 chars, unchanged |
| a reef with 24 cells of current | 106 chars |
| worst level link today | 126 chars |
| the result-link ceiling | 350 |

**One tile index for all four directions.** Which way it flows is in the level,
and the renderer reads `level.currentDirs` the way it already reads
`level.guardArt` to tell a goblin from a bat. Four indices would have spent a
quarter of the 16-tile budget saying something the level already knows.

**Refused loudly at 24, never trimmed.** Writing the first 24 and dropping the
rest would hand somebody a link that plays differently from the level they drew,
with nothing saying so — and a current that vanished is a route that vanished.
`MAX_FLOW` and `MAX_CURRENTS` are the same number so the editor stops you while
you are drawing rather than at save time.

## One tool, not four

The direction is **the direction you drag**. Four buttons would be four more
things in a palette already holding eleven, and a child would have to decide
which arrow they wanted *before* drawing anything. Dragging says it while you
draw: you pull a line across the room and the water goes that way.

A single tap has no direction to read, so it flows right — the way reading goes,
and the way the drawing points before it is turned. And the first cell of a
stroke is re-pointed once there *is* a direction, or every leftward current
would start with one chevron facing the wrong way.

The art is drawn once, pointing right, and **turned** for the other three. Four
drawings drift; one drawing and `turnPattern()` cannot.

## Two bugs found while building it

- `LEGAL_GLYPHS` in the draft store had fallen three entities behind, so a saved
  level containing a **bat, a lizard or a flame** failed its load and was thrown
  away as corrupt — silently, with no way for the child who drew it to know why.
  Now built from the entity lists rather than typed out.
- `draftFromLevel()` would have dropped every current when a water level was
  reopened in the editor, the same class of bug as the enemies losing their kind.
