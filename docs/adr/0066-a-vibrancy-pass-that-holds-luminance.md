# 0066 — A vibrancy pass that holds luminance, not value

## What was asked

> "The bolder colours look good, could we look at increasing the vibrancy on
>  all the sprites, see how that looks?"

and then, after the cast was done:

> "can we do the same for all assets?"
> "Sorry I meant all *other* assets like the walls, bushes etc?"

## What we did

Two lifts, same shape, different invariant.

**The cast** (`tools/enemies.ts`, fifteen creatures). Hue kept, saturation
pushed most of the way to the headroom, value nudged up. Inks 1–4 only: ink 5
is white and ink 6 is the outline, and `chaseInks()` swaps ink 6 for the
attack rim, so tinting it would make the rim mean less.

**The terrain** (`src/core/palette.ts`, indices 6–53). Same saturation rule,
but the value handled differently — see below.

## The gate, in both

A flat lift turns the gull's greys into a blue bird and the shark's slate into
cyan. Those two are neutral *by design*, and vibrancy is not a licence to
repaint a seagull. So the lift ramps in over the first third of the saturation
range: a true grey stays grey, a nearly-grey moves a little, anything that
already reads as a colour gets the full push.

    gull     0.16 -> 0.31    barely moves, still a white bird
    shark    0.25 -> 0.45    the dullest real colour, the biggest gain
    goblin   0.49 -> 0.69
    squirrel 0.75 -> 0.86    already punchy, barely moves
    crab     0.79 -> 0.89

The same gate is why the palette's greys row is frozen entirely. It is "greys
and the near-black void", it is the UI's background, and `#0d1014` is
hard-coded in three files so the canvas butts against the page without a seam.
It is also why the cave and the street barely changed: a cave is grey on
purpose, and the goblin now stands out against it rather than competing.

## Hold luminance, not HSV value

This is the part worth writing down.

Saturating a colour takes brightness out of the two channels that are *not* the
hue, and those channels are most of what the eye measures. So a lift at
constant HSV `v` comes out **darker**. The first cut of the palette lift did
exactly that, and the gallery's own contrast gate caught it inside a minute:
the wizard, the bat and the octopus fell from over 4:1 on their swatch to
3.5:1. Three casualties out of twenty-four is not three unlucky drawings, it is
the wrong invariant.

Every contrast check in this repo is measured on luminance. So that is what the
lift preserves, and all of them read exactly what they read before. The ramps
keep their depth for free: untouched luminances stay ordered, so no terrain
ramp can go flat.

Two details fall out of it:

- **Rounded up, not to the nearest.** Eight bits per channel cannot hit an
  arbitrary luminance, and landing a hair low is the whole failure — `#6b1fa8`
  sat at 4.02:1, so losing 0.05 to rounding put it under a 4.0 gate. "Never
  darker than it was" is an invariant a contrast check cannot trip over.
- **Saturation backs off when the value cannot pay for it.** `#c46ff0` is
  already at v 0.94; saturating it as far as the rule wants cannot be
  compensated even at v 1. So the bright end of each ramp moves least, which is
  also right by eye — those were the colours that were already vivid.

## Rules this respects

Cosmetic only, so hard rule 4 holds throughout: nothing here reaches
`stateHash()`, and a level plays identically whatever colour it is drawn in.
The palette's *order* is the compatibility surface, not its values — a creature
stores three 6-bit indices, and none of those indices moved. Saved creatures
are repainted slightly more vivid; none of them changes shape, and no shipped
link decodes differently.

`src/core/enemies.ts` is generated; the edit is in `tools/enemies.ts`.

## What we did not do

- **The master palette's order.** Append-only, and nothing was appended.
- **`SKY` and `GEM_INKS`.** Both carry documented contrast *measurements* —
  the side-on treasure is magenta because gold measured 1.01:1 against the sky,
  and the city's collectible is high-vis blue for the same kind of reason.
  Lifting them would invalidate the numbers written beside them for a change
  of two or three parts in 255. They are within a rounding error of the lifted
  palette already.
- **UI chrome, `CHASE_RIM`, the stun flash.** Those are signals, not
  decoration. A signal that gets more colourful competes with the thing it is
  meant to point at.

## How it was judged

Rendered, before and after, and looked at — all fifteen creatures at ×6 and at
×1, and every tileset's wall, floor, ladder, tree and hazard in all six worlds.
The last two colour jobs on this project were both judged at the wrong scale
and both were wrong.
