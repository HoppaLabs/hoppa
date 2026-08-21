# 0043 — An enemy in mid-air falls

**Status:** accepted (day 18)

`dash/8`. A walker with nothing under it drops to the ground, then paces like
any other. `dash/1`–`dash/7` are shipped forever and still hang it in the air.

## What was reported

> The enemies are not moving on the side app

They were not. And the cause is `dash/7`'s ledge test doing exactly what
`0036` built it to do.

A walker turns round rather than step off a platform, so each tick it asks
whether there is floor under the cell it is about to lead with. A walker with
nothing under it **anywhere** gets "no floor" for both directions — so it
reverses, every tick, thirty times a second, and never takes a step. On screen
that is not a creature deciding something. It is a creature that is broken.

Only the side-on game had it. Nothing falls underwater or from above, so `roam`
and `swim` were always fine:

| | on a ledge | in mid-air |
| --- | --- | --- |
| `dash/7` | 25.4 cells in 10s | **0.0 cells, 0.0 fallen** |
| `swim/3` | 25.8 | 25.8 |
| `roam/8` | 25.8 | 25.8 |
| `dash/8` | 25.4 | 23.5, after falling 6.6 |

All three enemy kinds, identically — they always did walk, chase and die alike.

## Why this is the fix and not "stop them being placed there"

A child draws a room and taps a goblin into the middle of the sky. In every
platformer ever made it drops. Refusing the placement, or snapping it to the
floor at load, both answer a question nobody asked: the level says there is a
goblin up there, and gravity is what the game already means by "up there".

## Two measurements that shaped it

**It has to land at the right height.** The first version stopped wherever the
last slice of the fall left it — measured at 90 subcells above the deck, a
third of a cell of daylight under its feet. Nobody can name that; everybody can
see it. It now snaps to `cellCentre(row) + REST`, which is exactly where a
walker *drawn* on that cell is spawned, so the two are indistinguishable
afterwards and neither reads the floor differently.

**It must not leave the world.** A room whose floor a child has scraped out is
already a level the advice refuses to call playable, but the enemy must not go
through the bottom of the grid on the way to being told so. Measured over 900
ticks with no floor at all: it comes to rest inside the grid and the hash stays
a safe integer.

## The one line that made it a new build

`Walker.vy` is new, and it is authoritative — two replays of the same log have
to agree about how fast a walker is falling. So it joins `stateHash()`, and
hard rule 3 says that is a new behaviour version and never an edit.

Everything else is reused: `GRAVITY`, `TERMINAL` and the body-sized slicing are
the player's own fall, unchanged, so nothing tunnels through a floor one cell
thick at speed.

## While it is in the air it does not walk

Deliberate. A walker that could steer mid-fall would drift out over a pit it
was never standing next to — which is the exact thing the ledge test exists to
prevent on the ground.
