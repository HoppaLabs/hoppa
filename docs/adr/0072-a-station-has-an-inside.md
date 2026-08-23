# 0072 — A station has an inside

**Accepted, day 23.** From a tester, about the sci-fi world:

> "the sci-level does not like a space station, they were expecting corridors
> and control rooms"

## What was wrong

The side-on background had always been AIR — nothing drawn, so the world's
`ground` colour shows through uninterrupted. `adr/0068` gave the station a
starfield to put on it: dim, unevenly scattered, five marks a tile, and by
itself a good drawing.

It was answering the wrong question. A starfield behind a platform says the
platform is **outside**, floating in space. Which is exactly what came back —
not "the stars are wrong" but "this is not a space station". A station is a
thing you are *in*. The inside of a station is a wall.

## What it is now

Three drawings, all of them background, none of them touching the wire format
or `stateHash()`:

| drawing | where | says |
|---|---|---|
| plating | every open cell | you are inside a corridor |
| viewport | one open cell in 13, in mid-air | ...in orbit |
| terminal | one open cell in 13, standing on a deck | ...in a control room |

The stars were not deleted, they were **moved**: a viewport's glass is
transparent, so what shows through it is the same deep navy `ground` the seams
show, with four stars on it. Being inside looking out is a stronger claim of
"space station" than being outside ever was, and it costs the same tile.

## Two things this cost, and one it did not

**The lone-block lever does not work side-on.** The obvious way to place a
console is `Tileset.tree` — a wall cell with nothing beside it, which is a
sarcophagus in the tomb and a tree in the garden. It cannot work here: a
terminal standing on a deck has the deck under it, so it is never alone, and a
wall cell that *is* alone in a side-on world is a block floating in mid-air. A
console you have to jump to reach is not a console.

So a terminal is not a wall at all. It is background, drawn on the open cell
whose southern neighbour is deck — which is what a bank of instruments along a
corridor wall actually is, and it means walking past one is walking past one
rather than climbing over it. `floorFor()` is already told which of the four
sides are wall, for the city's roads, so this asked the format for nothing.

**`wallKinds` is not available here.** It would have let one hull plate in four
carry a lit readout, the way one tomb block in four is carved. But the renderer
checks kinds *ahead of* the capped/uncapped split, so using it would have lost
`EARTH_TOP` — the strip of deck lighting along the top of every platform, which
is the line a child aims their feet at. Not worth a readout.

**One number was added:** `Tileset.floorOdd`. The rarity of the cell
`floorFor()` is told about from its own position was hard-coded at one in
seven, which is right for a car on a street and wrong for a viewport: a window
is a far bigger drawing, and twenty of them behind the action is a gallery
rather than a corridor. Thirteen for the station, seven everywhere else, so the
city is unchanged to the pixel.

## The bit that took two goes

The first plating read as **graph paper** — the same failure the starfield was
warned about from the other end. A seam on its own is a *line*; what says
"plate" is a plate having a lip that catches the light. Three lit pixels at the
top left of each plate fixed it. A full-width highlight was tried first and
turned the wall into stripes, so it is three pixels of eight, dashed: an edge,
not a rule.
