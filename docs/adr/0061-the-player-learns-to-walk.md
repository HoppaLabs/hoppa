# 0061 — The player learns to walk

**Day 22. Accepted and shipped.** Presentation only: no engine touched, no build
moved, nothing on the wire. Hard rule 4 holds — `stateHash()` does not know any
of this happened.

## What was asked

The same brief as `0058`–`0060`:

> today it feels like moving a cursor as you say

Those three ADRs fixed the **physics**. This is the other half, and it is the
half no engine change can reach: a creature that accelerates beautifully, drags
to a stop, rounds corners and gets thrown by a hit — and never moves a leg —
is still a picture being slid across a screen.

## Two faults, both found by reading the renderer rather than by playing it

### 1. The player was being drawn worse than the enemies

```ts
const size = Math.max(4, Math.floor(t * 0.8));
```

On a fifteen-pixel tile that draws a sixteen-pixel sprite at **twelve**: a 0.75
downscale which, with smoothing off, throws away every fourth row and column.
Not a blur — **deletion**.

That exact fault was found and fixed for the *enemies* weeks ago. The comment
explaining it is thirty lines long and sits about two hundred lines above this
one in the same file:

> Integer scale factors only is the era's rule and the reason its art still
> looks like itself. A 16px sprite slightly overhangs a 15px tile, which is what
> sprites have always done.

The player — the one sprite a child draws themselves, the thing they look at
most — went on being quietly wrecked every frame. It is now `SPRITE_W *
artUnit(t)`, the same grid as everything it stands next to.

### 2. The player had no walk cycle, and the enemies did

Every enemy has two hand-drawn frames in `src/core/enemies.ts` — legs together,
legs apart — stepped by **distance** rather than by a clock, plus a one-pixel
bob. That is most of why a goblin reads as a thing that is alive and coming for
you.

The player has one frame, for ever, because **it is the child's drawing**. There
is no second frame and there never will be one.

## Deriving a walk from a single drawing

Shove the bottom few rows sideways by one pixel and the creature is mid-step.
Whatever those rows happen to be — feet, wheels, tentacles, the bottom of a blob
— moving them *relative to the body* is what the eye reads as walking.

Four decisions, each with a test:

| | Why |
|---|---|
| **One pixel** | Two is a stagger. |
| **Three rows**, not five | Five moves the bottom third of the body with the feet, and the creature does not step, it **waddles**. Very funny, completely wrong. |
| Measured from the drawing's **lowest inked row**, not the bottom of the box | A child who draws a small creature in the middle of the square, or a floating one, still gets a walk. Otherwise that creature alone never moves and nobody could say why. |
| **Four beats**, not two | Forward, together, back, together. Two poses read as a twitch; four read as a gait, and derived legs get four for the price of one more offscreen canvas. The shifts sum to zero, so it cannot drift. |

Plus the enemies' one-pixel bob, on the beats where the legs are out — which is
where a walking body actually is.

## The feet come together when you stop

Stepping by distance means a creature that stops mid-stride *stays* mid-stride,
standing there with one leg out. The enemies do exactly that and have got away
with it because nobody watches a guard at the end of its patrol. The player is
watched constantly.

**This is why `Stride` is a class and not a function.** The screen draws at sixty
frames a second and the engine ticks at thirty, so at a dead run every other
frame has the creature in exactly the same place — and while the world is held
for a hit (`hitstop.ts`) *no* frame moves it. Without five frames of memory the
creature snaps to attention every other frame, which is a twitch, not a walk.

There is a test for precisely that: drive it at one tick per two frames for a
hundred and twenty frames and assert it passes through all four poses and never
once stands to attention in the middle.

## Where it lives

`src/web/play/stride.ts`, out of the renderer so the numbers can be argued about
in a test rather than squinted at in a browser — the same move as `facing.ts`
and `hitstop.ts` before it.

## Proof

- `test/stride.test.ts` — 13 tests.
- Five new mutations in `tools/mutate.ts`, including one that makes legs wrap
  round to the other side of the creature and one that removes the settle grace.
- Looked at, magnified five times, four frames of a walk side by side: the body
  is identical across all four and only the feet move.

## Not done, deliberately

The **enemies** still stop mid-stride, and they could now use the same settle.
Left alone: their walk is hand-drawn art rather than a derivation, changing it
touches the cast rather than one file, and a guard frozen mid-step at the end of
its patrol has never been reported by anybody. Worth doing on a day when the
enemies are being looked at anyway.
