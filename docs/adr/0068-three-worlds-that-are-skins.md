# 0068 — Three more worlds, and all three are skins

## What was asked

> "Can we also add jungle, ancient Egypt and sci-fi/space levels?"

and, separately, a reminder that these were meant to be *level kinds*:

> "remember I asked to look at 3 other level kinds/templates"

## What we did

Three new worlds, each a **skin over rules that already worked**, plus one
shipped room in each so the world is somewhere you can go rather than an
option in a menu.

| world    | engine | tiles | what it is                          |
|----------|--------|-------|-------------------------------------|
| jungle   | calm   | 7     | the garden's game under a canopy    |
| pyramid  | roam   | 8     | the adventure game inside a tomb    |
| space    | dash   | 9     | the platformer, in orbit            |

Three different engines on purpose. Three reskins of one game would have been
three of the same level, and the point of a new world is somewhere different to
*be*, which is only worth having if it is also something different to *do*.

`tilesetId` is four bits and had five values spare, so the wire cost of all
three is zero and no shipped link changed meaning.

## Borrowed, and not borrowed

The reef established the rule and wrote it down: *"EARTH lit in teal is a reef,
and nobody had to draw a second set of rocks."* All three of these lean on it.

- The **pyramid** is the cave's own stone on a sand ramp. A tomb is blocks by
  torchlight, and blocks are the one thing this project has had since day one.
- The **space station** is the outdoor world's soil-with-a-grass-cap, which is
  shape for shape a hull plate with a strip of deck lighting along the top. Not
  a pixel moved; only the ramp under it.
- The **jungle** is the garden's bush and tree, but with the light *inverted*.
  A garden is a lawn in the sun — bright floor, darker things standing on it.
  Under a canopy it is the other way round, and that one change is most of why
  the two do not read alike even where they share a drawing.

What is *not* borrowed, in every case, is the hazard, the one signature object,
and the cast — because those are the three things a child looks straight at. A
cave says danger with a flame; a tomb says it with a spike trap and a space
station with a plasma vent. A lone wall cell is a tree in the garden, a canopy
in the jungle and a **pillar** in the tomb.

## Nine new creatures, and what drawing them taught

Two of the nine were something else first, and in both cases the render said so
and no amount of reasoning would have:

- the jungle's chaser was a **snake** — the obvious jungle predator, and
  completely illegible front-on at sixteen pixels, because a coil is a shape
  you can only read from the side. It became a jaguar.
- its second creature was a **parrot** and kept coming out a frog: a
  front-facing bird points its beak at you, so the one line of the silhouette
  that says "bird" is the one line you cannot draw. It became the thing it
  already looked like.

`check()` in `tools/enemies.ts` caught four more before they shipped, and every
one of them was the same family of mistake — **a two-pixel feature is all rim**,
because `outline()` claims every pixel that touches empty:

- the jaguar's rosettes as single pixels (ten orphans), then as pairs sitting on
  the silhouette, where the outline ate half of each pair and orphaned the rest;
- the jackal's ears, two wide, so it had ears made of nothing but edge;
- the drone's rotor, two deep, which came out as a black bar across the sky.

The mummy's bandages failed differently and more obviously: painted as plain
rows they ran the full width of the tile, so it had bars of gold floating in the
air beside it. A band is a marking *on* a body, not a line across a room.

## Three rooms, and what the verifier designed

Every shipped room must pass the spec checks and then be beaten by the bot with
all four ready-made creatures. That is not a formality; it wrote two of these
rooms.

**The pyramid was designed by L5.** A guard in a long corridor paces it end to
end, and the first version was a hall with three guards on twelve-cell runs.
Cutting it into chambers fixed the runs and made it look like a *cage* — a
lattice of one-cell bars. The room it is now uses the idiom `fourCorners`
already had: thick bands of masonry with doorways through them, and the guards
standing *in* the doorways, where a run is three across and five up and down.
It reads as a tomb because the walls are three cells thick, and the walls are
three cells thick because of L5.

**Two rooms were nearly unwinnable for the slow creatures.** The pyramid's
scarab started beside the start square, and later its mummy stood in the middle
doorway; both times Bash and Vance lost the room and Nim and Pell won it
comfortably. A room only the fast creatures can beat is not a hard room, it is a
broken one.

**The station's cores had to sit where the route already goes.** One on the
short ledge at the far left of the middle deck failed for all four creatures —
not because the ledge is unreachable, but because fetching it turns a
three-floor route into a four-leg one and the clock runs out.

And one that was purely about the editor: a vent placed on a deck is *refused*,
because the editor builds a room top to bottom and the vent is painted before
the deck under it exists. A room a child is shown and then stopped from copying
is worse than no room, so both vents sit on the ground floor.

## Two things the render caught that nothing else would

- **Clouds in orbit.** The station came up with two of them drifting past,
  because `sideOn` had been standing in for "does this place have weather" and
  until that day those were the same question. Tilesets say now, and absent
  means nothing drifts — the right default for a cave, a tomb or a vacuum.
- **A starfield that read as static.** Nine stars a tile in the brightest cyan
  on the ramp; a tile repeats 336 times across a screen, so that is three
  thousand marks at full contrast. Five a tile, four of them in the hull greys,
  and it reads as depth. The jungle's leaf litter had already taught the same
  lesson from the other end, where four evenly spaced marks made the floor a
  visible lattice.

## Cost

Cosmetic and additive throughout: hard rule 4 holds, no engine was told anything
new, no behaviour version moved, and nothing here can reach `stateHash()`.
