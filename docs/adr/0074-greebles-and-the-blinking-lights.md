# 0074 — Greebles, and a test that could not see a stripe

**Accepted, day 23.** After the hull stopped looking like brick:

> "I was thinking more 'GREEBLIES' like in Star Wars and blinking lights"

## What greebling is

A real technique with a real name, and the point of it is counter-intuitive: a
big smooth surface reads as a **toy**, and the fix is to cover it in small
mechanical junk that has no function and no explanation. The station's
corridors are the one surface in this game large enough and plain enough to
need it.

So none of it means anything. A vent, a junction box, a coil of cable, an
inspection hatch, a bank of little screens, and a pipe going somewhere else —
scattered over about half the wall cells, each with a status lamp blinking on
its own clock.

## What it cost

Nothing that travels. Which greeble a cell gets, what colour its lamp is and
how fast it blinks all come out of the cell's own coordinates — the same trick
the city's cars and the station's viewports already use — so it costs the wire
format not one bit, two children opening the same link see the same wall, and
hard rule 4 holds: a run replays identically whether the lamps were lit or not.

**Painted over the wall, not baked into it.** Baking would have meant a stamp
per wall shape × per greeble × per blink state — sixteen by six by two, nearly
two hundred canvases — for something that is one `drawImage` and one `fillRect`
per cell.

**The lamp needed a housing.** Drawn as a bare socket it was invisible when off
and a floating coloured dot when on: a stray pixel rather than a light fitted
to a wall. Four pixels by four of hull with the socket sunk into it.

## The part worth keeping

The decision — *does this cell carry something, which one, is the lamp lit* —
started inside a canvas call, where no test can reach it. The house rule since
the editor shipped completely dead is to **lift the decision out of the DOM
module**, so it moved to `src/web/play/greeble.ts` and the renderer now only
paints what it is told.

Then `check:mutants` earned its keep twice over.

The first version of the scatter test counted **bare rows and bare columns**.
That sounds like a scatter check and is not. Replace the hash with `x + y` and
every anti-diagonal collapses to one value, so whole diagonals match — but a
row crosses many diagonals, so no row comes out bare and the test passes with
the wall visibly striped. The mutation striped it and the suite stayed green.

What a stripe *is*, is neighbours agreeing. So it measures that now: how often
does a cell carry the same thing as the cell one step away, in each of four
directions. Chance is about 29% — both bare a quarter of the time, plus both
carrying the same one of six — and a stripe sends its own direction to 100%.

|  | measured |
|---|---|
| right | 24% |
| down | 33% |
| up-right | 28% |
| down-right | 29% |

Three mutations guard the three rules that a green suite would otherwise never
have noticed: a vent bolted to an alien egg, every lamp blinking on one clock,
and the stripe.
