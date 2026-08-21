# 0049 — The beach is a skin, not a game

Day 19. Accepted.

## What was asked for

"We have a request for beach levels."

## The decision

A beach is not a new GAME. It is somewhere else to put one — and the garden's
rules already fit a beach exactly: one thing that chases you, two that do not,
water you walk round, a plank across it, and something to collect. So the
beach is `calm/2` with a different tileset, a different cast and a different
set of words, and no new engine at all.

That makes it the first level in the game whose `tiles=` field says anything.

## Why the numbering starts at five

The wire format has carried a four-bit tileset id since day one, and nothing
has ever read it. That is exactly what makes turning it on dangerous: every
level ever encoded carries a value in that field, and the value they carry is
**1**. Tileset 1 is the DUNGEON. Start reading the field at 1 and every reef
link and every garden link ever sent renders as a cave.

So `FIRST_SKIN = 5`. Everything below it means what it has always meant in
practice — "whatever this game looks like" — and the field begins saying
something at the first number no shipped level has ever used. `test/beach.test.ts`
walks 0..4 across all four engines and asserts each one still gets its own
world, and a mutation that moves the floor to 1 is caught.

An unknown number falls back the same way, so a link from a future build
asking for a skin this build has never heard of still plays.

## What is on the beach

Sand you can see ripples in, dunes drawn DARKER than the sand (the first two
drafts were a dither, which read as static, and then pale bands, which read as
a lighter floor — a wall a child cannot see is not a cosmetic problem), palms
where a lone wall cell would be a tree in the garden, a jetty where the garden
has a bridge, and the sea.

The sea is a **bay**, not a shoreline, and that is arithmetic rather than
taste: water is an entity and the wire format holds ten of them. A strip along
the whole bottom edge came to forty-four cells and would not encode. Ten cells
as a bay works better anyway.

The cast is a crab, a gull and a jellyfish. The crab is the one that hunts, and
it is RED rather than the sandy brown it wore on the reef — a brown crab on
brown sand is a crab nobody sees coming. The treasure is a scallop that nods
rather than spins: a shell lying on sand is a thing at rest, and a spinning one
read as a coin.

## Two things the change touched that were not obvious

**The palette's words moved from being keyed by engine to being keyed by
world.** They had to: the beach and the garden share an engine and differ in
every single word. Keying by world also makes the invariant the palette test
already checks — the word and the picture are the same creature — true by
construction, because the picture already came from the world.

**The tab strip wraps now instead of fitting.** Five tabs do not fit across a
360-pixel phone. It wraps to two rows rather than scrolling sideways, because a
strip that scrolls hides whatever is past the edge, and the fifth tab — the
newest one, the one nobody knows is there — is exactly what ends up past it.

## Hard rule 4

A skin reaches no engine. `test/beach.test.ts` builds the same room twice,
differing only in that one number, runs the same log through both and requires
the same hash — which is the general rule in `test/hard-rule-4.test.ts` aimed
at the one feature that could actually break it. Three mutations cover the
three ways this could silently stop working.
