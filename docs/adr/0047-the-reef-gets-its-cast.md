# 0047 — The reef gets its cast, and the weapon fits the room

Day 19. Accepted.

## What was asked for

Four reports, all about the same thing — the underwater world was drawn by
somebody who had never been underwater.

- "You can't place octopus or crab in underwater world, but in any case we
  want a kraken and squid instead."
- "The sharks look like fish."
- "The weapon in the underwater levels should be a spear trident."

And one from the garden: "I think the bunny icons could be improved a lot."

## What changed

**The cast.** `octopus` and `crab` are gone; `kraken` and `squid` take their
glyphs. The three reef slots are still B, G and D in that order, because a
level stores an enemy as an INDEX and the worlds are alternative art for the
same three slots — `test/palette.test.ts` holds that order down, and a
mutation proves it can fail.

**The shark.** It was a bream: round body, blunt nose, a bump for a fin. A
shark is a silhouette before it is a colour — a big raked dorsal, a pointed
snout with the mouth slung underneath it, a long torpedo body and a forked
tail on a thin peduncle. Those are drawn first now, and the countershading
only follows the shape it finds.

**The weapon.** A sword still kills and a wand still freezes, and a child's
choice between them is theirs. Underwater the SWORD is drawn as a trident,
because nobody swings a broadsword through water. See `src/web/play/weapon.ts`
— the decision is three lines, and it lives outside the renderer so a test
can run it without a browser.

**The bunny.** It was a rounded rectangle with two stubs on top and two dots
in it, and at a glance it read as a gamepad. It is ears now: tall, upright,
lined with pink, over a round head with a pale muzzle, and a body narrower
than the head so there is a neck rather than a box.

## What this cost the wire format

Nothing. Every one of these is cosmetic — hard rule 4 — so no `stateHash()`
moved, no golden vector changed, and every link ever sent still plays exactly
as it did. A run recorded against an octopus replays against a kraken and
lands on the same hash, because the engine was never told which it was.

## Two things learned about drawing at this size

**Look at the render.** Every sprite here went through five or six passes of
draw-it, look-at-it, fix-it. The first shark was a bream and the ASCII did
not say so; the picture did. There is a throwaway harness for this — write
the rows, write a PNG, open it — and it is worth the twenty lines.

**Detail smaller than a pixel is not detail.** The trident's first head was
prongs as thick as the shaft, and at a phone's tile size the gaps between
them closed and the whole thing read as one white paddle. The prongs are
thinner than the shaft now and set wider than they are thick. The same rule
caught the kraken: single lit pixels with no neighbour of their colour read
as dirt, and `tools/enemies.ts` counts them and says so.
