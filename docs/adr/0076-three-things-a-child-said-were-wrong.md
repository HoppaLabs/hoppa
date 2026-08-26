# 0076 — Two worlds that were one world painted twice, and a button on top of another

**Accepted, day 23.** Three reports in one line:

> "jungle and garden are too similar, beach and Egypt are too similar, the
> controls are too fiddly"

All three were measurable, and none of them had been measured.

## The two pairs had different causes

The first instinct — "they are both green / both sandy, shift a hue" — was
wrong for both, and the measurements said so.

**Garden and jungle were the same drawing.** Not similar: identical. The jungle
used `BUSH` for its walls and `TREE` for a lone cell, pixel for pixel, and
changed only the ramp underneath. Two worlds that share a shape *and* a hue are
one world painted twice, however far apart their floors are — and the frame
round the room is the biggest thing on screen, so the frame is what gets
compared.

The jungle has its own `CANOPY` now: three big leaves per tile, wrapping across
the edges, each with a lit rib and a dark crevice where one lies over the next.
A hedge is high-frequency speckle; a canopy is the opposite of that.

**Beach and Egypt were the same colours.** Different drawings — a dune is not a
tomb block — but **four of the tomb's five palette steps were the beach's**.
The beach's ramp was the pyramid's ramp plus two paler steps. The tomb is
orange sandstone by torchlight now and shares not one step with the sand.

## The controls were overlapping

`#keys` positioned its two round buttons absolutely, with hand-picked offsets.
In the one-action-button layout — every top-down game, so most of them — the
centred action button and the cornered bucket **overlapped by 24 pixels square,
27 on a small screen.** A tap in that corner went to whichever was on top.

The comment above the rule said the two "do not reach each other." The test
below it said *"or the fix is two buttons on top of each other"* and then
checked only that the bucket had **a** rule — not that the rule put it
anywhere free. Both were written by somebody who had not done the arithmetic,
and the arithmetic was four numbers.

It is a two-by-two grid now. Cells cannot overlap, so there is nothing left to
get wrong. And it finally does what the handset always claimed: **the weapon is
the top-right circle in every game** — from the side the jump takes the other
cell, from above the bucket does. The old rules centred it from above, which
was the opposite of the "same place whichever game this is" they were written
to serve.

## What is guarded

One general rule, because one is all that is true:

> A world that borrows another world's wall drawing must not borrow its
> colours too.

Borrowing is deliberate here — the tomb is the cave's stonework, the reef is
the outdoor ground "lit in teal" — and what makes those work is that they share
no palette step at all. The garden and the jungle shared four.

No threshold on ramp overlap alone would work: **the cave and the city share
their entire ramp** and read as different places, because a street is not a
cavern. So the two reported pairs are pinned as decisions rather than derived
from a number, and said so in the test.

Four mutations, all caught: the jungle going back to the garden's hedge, the
tomb going back to beach sand, the bucket taking the action button's cell, and
the weapon moving between games.
