# 0048 — Two more rooms in the water

Day 19. Accepted.

## What was asked for

"The users are asking for more underwater templates."

The level editor's shelf IS the pack: the eleven shipped rooms are offered as
levels to start FROM, so "more templates" and "more rooms" are the same job.
There was exactly one room in the water, which is an example rather than a
shelf.

## What shipped

**The tall rocks** — four stacks up off the seabed, none reaching the surface,
and two currents running ACROSS the open water above them. The reef teaches
the rising current; this teaches the other thing a current can be, which is a
thing that pushes you off your line while you are trying to thread a gap.

**The wreck** — a hull on the seabed with two openings in its deck, a down
current in the hold, and the way out above the wreck rather than inside it, so
the room ends by asking you to climb back out of the thing you climbed into.

Neither has a creature in it, for the reason the reef has none: a room that
ships has to be beaten by a bot that never dodges, and that is the same bar as
a child on their first go. The sharks and the kraken turn up the moment
anybody paints one, which is where a hunting thing belongs — in a room
somebody chose to make hard.

## Three things the bot found that no eye would have

Every one of these was a room that looked fine and was not.

**A current across the only way out is a door, not a challenge.** The wreck's
down current started directly under its only hatch. The strong creature
punched through and the fast one went round the outside; the middling one met
it head on in the only opening it knew and spent the whole two minutes being
pushed back down, with every gem already picked up. Moved beside the hatch, it
is what it was meant to be — a ride down to the gem in the bilge, with clear
water either side to come back up through.

**A one-cell gap in a wall is something you walk into rather than through.**
With the current moved, the fast creature then spent two minutes oscillating
underneath a single-cell hatch. Both openings are two cells wide now. The reef
has a three-cell gap in its shelf and has never caught on it — that was the
measurement, not a guess.

**A one-cell-wide wall standing in open water is the same bug rotated.** The
wreck's mast was four cells tall and the fast creature bounced off the side of
it for the entire run. Snapped off at the deck it reads as a wreck and gets in
nobody's way.

What a router does at a shape is a fair proxy for what a child does at it.
None of these three would have been caught by looking at a screenshot, and all
three were caught by `test/pack.test.ts` before the rooms ever shipped.

## And a name that did not survive being looked at

The first room was drafted as "the kelp forest". A wall in the reef is drawn
as rock with a green top, so the kelp came out as a row of stone stacks.
Naming a room after something it does not look like is the same class of
mistake as a palette that said *goblin* over a picture of a shark, so it is
named after what is on the screen.
