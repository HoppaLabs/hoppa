# 0056 — A wand freezes water

**Day 21. Accepted.** calm/3, swim/4.

## What was asked

> Use the wand to freeze water. No need for bucket in the platformer as the
> user can step over it. My only problem is that it's weird for a jaeger to
> have a wand, so maybe we have a blue laser instead of a wand?

Three answers to the two questions adr/0055 left open, and one new one.

## The gap this fills

Every top-down engine has carried a bucket since roam/8, and adr/0055 made the
button visible. But only two of the six worlds draw an actual flame. A bucket
over a pond drains the lawn; a bucket over a bank of urchins is a joke. So the
garden, the beach and the reef had **no answer at all** to their own hazard —
you walked round a pond or paid a heart to cross a bank of urchins.

The wand is the answer, and it was in the question. It already freezes enemies,
and its whole character is making a dangerous thing safe **for a while** rather
than removing it. A pond is a dangerous thing. So the wave does not get a second
meaning: it gets a second target.

Nothing new to press and no new held bit. One wave, one verb.

## The two worlds want opposite things from it

This is the part that had to be found by playing rather than by reading:

| world | what water does | so ice is |
| --- | --- | --- |
| garden, beach | a pond is **solid** — you walk round it or over a plank | a **bridge** |
| reef | you swim over urchins and it costs a heart | a **helmet** |

calm's `fits()` had to learn about ice; swim's `alight()` had to. Freezing the
garden without the first would have looked right on screen and done nothing at
all — the pond would go pale and stay a wall.

## The whole pond, not the cell

Freezing a cell at a time means standing in the water to reach the next one,
paying a heart per square. That is not a way across, it is a slower way of
drowning. A wave flood-fills through touching water, so a pool is one thing to
look at and one thing to freeze — and two ponds either side of a path stay two
ponds, or the wand would be a bucket with extra steps.

Bounded by `MAX_FIRE`, so the fill is a handful of cells however it is written.

## Why a new build

`ice` decides which cells you can stand on, which decides the hearts, which
decides whether a log wins. It is in `stateHash()`. Hard rule 3: **calm/3 and
swim/4**, and calm/2 and swim/3 stay routed forever, so every garden and reef
link ever sent still plays the game it was beaten under.

The contrast with adr/0055 is worth keeping: the bucket needed no new build,
because the engines already doused and the bug was that nobody could see the
button. That was presentation. This is not.

A sword freezes nothing, and that is the trade rather than an omission — the
same shape as "a wand never kills".

## The duration

The same numbers as the enemy freeze: three seconds at no pips, longer with
strength. A wand does one thing, and a child who has learned how long a frozen
bear stays frozen has learned how long a frozen pond stays frozen.

## The ice is its own tile

`TILE_FROZEN`, not `TILE_FLOOR`. A doused fire is permanent and renders as
floor; ice is temporary and must not, because a child crossing one has to be
able to see the difference between ice and ground.

One shared ramp for every world, which is the only place in the tileset where
that is true. A pond, the sea and a bank of urchins look nothing alike; frozen
they are all ice, and "I can walk on that" has to read at a glance in a world
you may never have seen. The SHAPE still comes from the world — ice takes the
shape of what it froze — and only the colours are shared.

`openSides()` counts frozen water as water, or a half-frozen pool would grow a
shoreline down the middle of itself.

## The jaeger's wand

> it's weird for a jaeger to have a wand

It is. The city already turns a sword into a laser (adr/0050); it now turns a
wand into a **cold blue one**. Hot beam cuts, blue beam freezes, and the colour
is the signal.

That relaxes a rule, and the rule is worth restating precisely. It was written
as "a wand is always drawn as a wand", and what it was protecting is **"a wand
is never drawn as something that kills"** — a trident would be a lie, because a
child who picked freezing would be shown killing. A cold beam beside a hot one
tells the truth, and arguably tells it better than a stick did.

`test/weapon.test.ts` now asserts the rule rather than the shape, in both
directions: no wand may be drawn as a killing art, and no sword as a freezing
one.

## Not doing

**A bucket in the platformer.** "No need for bucket in the platformer as the
user can step over it" — and that is right: from the side the hazard is spikes
and jumping is the answer the game already has. So there is no `HELD_POUR`, no
third button and no dash/9. The open item from adr/0055 is closed by deciding
not to.
