# 0073 — The station turned the camera

**Accepted, day 23.** One day after `adr/0072` gave the station an inside:

> "I think Maybe the space station should be top down with a maze of corridors,
> alien inspired"

## Why this is not a repaint

`adr/0072` was the last thing that could be done to the sci-fi world without
touching how it is played. It fixed the background and the walls and it was
still a platformer, because a platformer is what tileset 9 had always been
attached to.

**You cannot see the shape of a maze from the side.** A maze is a plan, and a
plan needs the camera above it. So the world moved engine — `dash` to `roam`,
the rules the cave and the tomb already run on — which is a bigger change than
anything a skin has done before and a smaller one than it sounds:

| | before | now |
|---|---|---|
| engine | dash (platformer) | roam (adventure) |
| shape | three decks, two ladders | a maze of corridors |
| wall | soil-and-grass, recoloured | pipe runs, lying along the corridor, greebled |
| background | plating | deck, quiet, grid on dark |
| hazard | plasma vent (a flame) | acid, pooled |
| a lone block | — | an egg |

No engine was written and no rule was invented. Nine worlds, still six sets of
rules between them.

## Shipped links

A level carries its own engine, so **every space link ever sent still plays
exactly as it did** — hard rule 3 is untouched, and the golden vectors did not
move. What changes for those links is the paint, which hard rule 4 has always
allowed.

They were checked rather than assumed: the old side-on station was loaded
against the new tileset, and it still reads as a station — hull under each
deck, the cyan strip along the top of it, plating behind. That is not luck.
`HULL_TOP` is drawn to do two jobs, because the same "wall with something open
above it" is the near face of a corridor seen from above and the lit edge of a
platform seen from the side. One drawing, both cameras, and that is why there
is no second tileset.

## Three things the maze taught

**A hull is not a wall you build.** The first one was STONE's geometry in hull
colours — panels in a running bond — on the argument that what STONE does is
legible. It is legible, and it came straight back:

> "The hull just looks like bricks, what about using cabling and pipes instead"

What says *brick* is not the colour, it is the **staggered vertical seam**;
nothing else in the built world has one. So the walls are pipe runs now, of
three bores, with no verticals at all, and the deck's plate grid went from
offset to square. A bracketed version was drawn and went straight back to
reading as brick — a bracket is a vertical seam drawn thicker.

The pipes run **along** the corridor rather than always across it, which is
what makes them plumbing rather than rungs. A tile cannot know which way it
lies, but it is told which of its sides are wall — the mask the ponds and the
castles are already keyed on — and a wall whose neighbours are east and west
runs east to west. That one function also draws the egg and the strip light,
because `wallFor` outranks the renderer's own lone-wall and capped rules, and
deciding all three off one mask beats fighting the order.

**In a maze the corridor is the subject.** So the wall is the lit thing and the
floor is the dark thing — the cave's polarity, arrived at again the hard way.
The more obviously alien option was drawn first: a dark ribbed hull with a lit
grating underfoot. It came out as mush. Wall and floor within a step of each
other and the lanes stopped reading as lanes.

**A pond is the wrong shape for a spill.** Acid started as the garden's POND
recoloured green, and a pond fills its cell corner to corner. That made a green
SQUARE — and this game already has a square you are meant to run at. A hazard
that reads like a surprise box is the worst possible way round. `acidFor()`
draws a rounded blob that reaches the edge only on sides where there is more
acid to reach, so four cells are one spill and one cell is a puddle. Integer
arithmetic: this is the determinism zone and an ellipse does not get an
exemption.

**The two rows a maze leaves over are not spare, they are the main corridor.**
A two-cell pitch on a 24×14 grid leaves a double-thick wall at the far edge. A
first version drew it as wall, and every creature but the quickest ran the
two-minute clock out, because then the maze was the only route through the
room. Opened up it is the gangway a station has, and the slowest creature is
out in twenty-six seconds with the maze still there to get lost in.

## And "alien inspired"

In the props, not in the architecture. The hull is a clean industrial ship —
which is what the film is — and what is wrong with it is organic: eggs where a
wall cell stands on its own, acid pooling in the corridors, and a cast that was
already a robot, a drone and a blob. Nothing in this world is green except the
things that are alive, so green means exactly one thing here.

The egg is GREY, and that took a second go. Drawn in the teal end of the ramp
it was a small teal object in a world where small teal objects are the
treasure. And its crack ran the full height at first, which at sixteen pixels
is not a crack, it is a ladder.
