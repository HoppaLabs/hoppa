# 0040 — The garden: a place, not a level

**Status:** accepted (day 18)

`calm/1`. Somewhere to be, seen from above. You pick flowers, you play with the
bunnies, you keep out of the ponds. **Nothing ends.**

Referred to as `adr/0040` from `src/engines/registry.ts` and `src/core/tileset.ts`
since the engine shipped; written down here late.

## What was asked for

> Then work another editor aimed at girl like animal crossing

and, when the first pass came back as a level with softer colours:

> No need for persistence, it should be like look at the cost place as designed,
> let your character explore it

> Collect flowers, play with bunnies avoid water/ponds

> Great you understand the remit, build a cosy place to hangout for your
> friends creatures

The word that mattered was **hangout**. Every other engine in the project is a
room you are trying to get out of. This one is a room you are trying to be in.

## What that cost, mechanically

Almost nothing, and that is the argument for having built it. The entities keep
their behaviour and change what they *are* — the trick the hazard has played
since `roam/6`:

| the engine's word | what the garden draws |
| --- | --- |
| treasure | a flower you pick |
| guard | a bunny you play with |
| hazard | a pond you walk round |
| ladder | a plank bridge across one |

What genuinely had to go:

- **No exit.** `blankDraft` lays a garden out without one, and the editor does
  not offer the tool. A door in a garden is a button that does nothing: `calm/1`
  would draw it and never open it, because there is no win to gate.
- **No loss, no clock, no hearts, no `TICK_CAP`.** Every other engine turns a
  two-minute visit into a LOSS when the cap runs out, which is the exact feeling
  this exists to avoid. The play page hides the HUD and the share gate lets a
  garden through unproven — there is no proof to give.
- **No weapon.** Touching a bunny sets `chasing = FOLLOW_TICKS` and it trots
  after you for three seconds. It does not hurt you and you cannot hurt it.

## The sword that shipped in it

`calm/1` inherited `strike()` from `roam` and **had a working sword for its
first day.** Five swings cleared every bunny in the garden. 683 tests passed the
whole time it was true, because no test asked whether the cosy engine was cosy.

Removed entirely — the swing block as well as the method, so there is nothing
left to inherit next time.

## The reef next door shipped with nothing living in it

Found in the same audit. Three sea creatures drawn and no room to put them in.
Three attempts to add one to `the reef` all failed the bot check: in open water
everything drowned; off-route at `(4,10)` Nim lost every heart, because `SIGHT`
is three cells and a shark that notices you underwater does not stop; boxed in
behind a ledge, the ledge blocked the exit.

**It ships with none, and that is a decision.** Pinned in the room's own comment
so nobody later reads it as an oversight.

## Clustered, not scattered

The first garden spaced everything evenly across the room — which is how you lay
out a *level*, each obstacle its own problem, nothing near anything else — and
it is exactly why a room a third full still read as empty.

> I'm imagined the garden top down, warmer colours, ponds, plants, trees,
> bunnies flying, squirrels

> Cluster the garden layout, add some trees

A place is the other way round: things gather, and the gaps between the
gatherings are what make it somewhere. Orchard to the north-east, pond and
bridge to the west, thickets in both southern corners.
