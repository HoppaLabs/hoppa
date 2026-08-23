# 0071 — A box is not a gem's caption

**Accepted, day 23.** Replaces the placement rule used in `adr/0068`.

## The report

> "In all the template games a gem is placed [next] to a surprise box, it
> looks very artificial"

It is, and it is precisely what the search was told to do.

## What the old rule was, and what it produced

Boxes were placed by a search over legal cells, ranked by **distance to the
nearest gem, smallest first**, on the reasoning that a box is a temptation so
it belongs where the player is already going. Measured afterwards:

    33 of 36 boxes within two cells of a gem
    26 of them touching one

A box beside a gem does not read as a surprise. It reads as a *label* — the
gem next to it tells you the room was arranged rather than built.

## Inverting it was worse

The obvious fix — maximise the distance instead — fixed the look and broke the
pacing, and the suite said so immediately. **A treasure box adds a REQUIRED
gem**, so a box eight cells off the gem line is eight cells of extra walking.
"first steps" went from the gentlest roam room to the third gentlest, and the
test that keeps the pack in order of difficulty failed.

Both artefacts are the same mistake: **optimising one number to its limit**.
Minimise and every box is a caption; maximise and every box is a detour.

## The rule now

Three things, none of them an extremum:

1. **On the route.** Not a proxy for it — the actual cells the bot's body
   passes through, replayed from its winning log for all four creatures. That
   is measurable, so it is measured.
2. **In a band, not at an edge.** Three to eight cells from any gem, exit or
   start, ranked by closeness to **four**. Far enough to be its own moment,
   near enough that reaching it is on the way to something.
3. **Not lined up.** The two boxes in a room may not share a row or a column.
   Distance alone left seven of fifteen rooms with both on the same open row,
   because the cells that satisfy the first two rules tend to be the same row
   and the ranking has no opinion about the second box once the first is
   placed. Two boxes in a line read as machine-placed, which is the whole
   complaint.

Afterwards:

    within two cells of a reward:        0  (was 33 of 36)
    pairs sharing a row or a column:     0  (was 7 of 15)
    distance to the nearest reward:      min 4, median 4, max 5

Both gates are unchanged: the spec verifier, then the bot with all four
ready-made creatures.

## The three rooms with one box

The reef, the tall rocks and the wreck take a gem box and no monster box. All
three are **swim**, and that is not a coincidence: underwater you drift, so a
released enemy in a confined room is more than any of the four creatures can
survive. Searched at every clearance down to two cells; there is nowhere. Said
here rather than fudged by loosening the gate.
