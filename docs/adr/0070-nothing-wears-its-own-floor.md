# 0070 — Nothing wears the colour of the floor it stands on

**Accepted, day 23.** Generalises the fixes in `adr/0067` after being asked
whether the other worlds had the same problem.

## Two that shipped

> "The flag is hard to see in the Egypt levels"

The flag's **pole** was `#4e2e0f`. That is exactly the jungle's ground, and
near enough the pyramid's floor to disappear into it. Measured against the six
worlds that fly a flag it scored **1.00 twice** — identical to its background.

And, found while auditing for more of the same: the jungle frog's **outline**
was `#082b11`, which *became* exactly the jungle's ground on the day that floor
went green (this same day). An outline the colour of the floor is a creature
with no edge. Three of that frog's six inks were literally jungle terrain
colours.

## Why the earlier checks missed both

Both drawings had been measured, and both passed, for the same reason: the
measurement asked for the **best contrast any of the drawing's inks reached**.
The flag's cloth is white; the frog's body is bright green. The part that had
gone invisible was never the part being looked at.

The fix to the method is to ask **per ink, weighted by how much of the drawing
it covers**. The pole was 30% of the flag. The frog's outline was 30% of the
frog. Neither is a highlight you can afford to lose.

## The rule

> Nothing that stands on a world may be painted in that world's **ground** —
> the single colour drawn behind everything — for any ink covering a fifth or
> more of the drawing.

Deliberately narrower than "must not share any terrain colour", which fires on
things that are correct:

- a **tree** IS foliage, and draws from the terrain ramp on purpose;
- the gap between a **ladder's** rungs is *meant* to be the ground showing
  through;
- the **beach's** open flag is gold on gold sand, because the beach's ramp
  covers the whole gold range and there is no gold that is not sand. It reads
  by its rim and by being a different shape, and it is 13% of the drawing.

The scope is things that were given their **own** inks — an exit, a gem, a
creature. If a drawing was handed its own colours, it has to use them.

## The other half of it

The same audit checks that every world actually *has* an exit, a treasure and a
cast drawn for it. That is how the oak door ended up in orbit: space was absent
from the door tables and silently inherited the shared drawing. A missing entry
is not an error anywhere, which is exactly why it needs asserting.

## What the audit found everywhere else

Nine worlds, six drawings apiece with colours of their own, rendered on their
own floor and wall and looked at. The frog was the only real failure. The
reef's shut chest and the beach's shell are the two softest things left; both
read, and both are noted here rather than changed, because a change with no
report behind it is a change made on a hunch.
