# 0064 — Feedback you can actually see

**Day 22. Accepted.** Presentation only: no engine behaviour touched, no build
moved, nothing on the wire. Hard rule 4 holds throughout.

Four small things, all the same complaint in different clothes — *the game did
something and did not tell me*.

## 1. The water tool

> "The water tool doesn't seem to work very well as it's not clear what it's
> doing, there are no graphics or animations appearing."

Correct, and the code agreed. The **only** thing pouring did to the screen was
add a CSS class to the *button*. Nothing was ever drawn on the board. If a fire
happened to be in the cell you faced it went out sixteen ticks later; if not, the
press was indistinguishable from a broken button.

This is the second act of `0055`, *"the bucket nobody could see"*. That one was
about not being able to **find** the button. Finding it and then being shown
nothing is the worse version, because now the child knows it exists and has
concluded it does not work.

The sword has had a sweep since the day it was drawn, and the note on it says
why:

> a bar that blinks on and off reads as a bug; an arc reads as a swing, and it
> is the only feedback saying "that press did something".

The bucket needed its own version of that sentence and never got one. It now
throws a stream of drops in the direction you are facing, falling as they go, for
the whole sixteen ticks — because the pour is a *commitment*, and the animation
running for all of it is what says the price is being paid rather than that the
game has hung.

Measured on the real canvas: **0 → 153 device pixels** of water through the pour,
back to 0 after.

`pourLength()` was added to the four newest builds as a presentation accessor, so
the page reads the price of water off the engine instead of writing `16` down a
second time and hoping the two stay equal.

## 2. Landing dust

The squash says what happened to the **creature**. Nothing said what happened to
the **floor**, and a landing that leaves the ground undisturbed is half a
landing. Two puffs, one each side of the feet, gone in a tenth of a second.

**This was tuned twice, and the first time was wrong in an instructive way.**
Rendered ten times life size next to a mocked-up pair of feet, it looked fine.
The mock was the bug: a creature's sprite is **sixteen** art pixels across and
the mock feet I judged it against were **two**. Redrawn against a true-size
silhouette, frames 0–3 were entirely inside the creature — and dust is drawn
*underneath*, so none of it was ever going to be seen. A probe counting transient
pixels on the real canvas had already said as much and I had read it as "subtle".

Judging a size against a drawing of the wrong size is the same mistake as
trusting a metric without a control. Measured after the fix: **16 → 64 device
pixels**.

There is now a test for *"some of every puff is outside the creature"*, which is
the property my eye was supposed to be checking.

## 3. Enemies stand up straight

The enemies got their stride first and never got the settle, so one that stopped
at the end of its patrol stood there with a leg out. That was written down as
acceptable on the grounds that nobody watches a guard at the end of its patrol —
true right up until `0061` stopped the *player* doing it, at which point the
guard is the only thing on screen still frozen mid-step.

`Strides` is `Stride` keyed by seat, exactly as `facing.ts` is, and for the same
reason: an enemy has no identity from one frame to the next, only a place in the
list. The cadence is unchanged — still a swap every half cell — and what is new
is that stopping brings the feet together.

## 4. Which number a world is about

The strength/speed axis **inverts underwater** and the game had never said so:

```
the long way (caves)   Nim 14s   Bash 26s      speed wins
the reef               Nim 44s   Bash 17s      STRENGTH wins, 2.6x
the tall rocks         Nim 54s   Bash 33s
the wreck              Nim 46s   Bash 21s
```

Currents push you and strength resists them. It is exactly the promise the game
is built on — *your friend plays your level with a creature who is good at
different things* — and a child picks Nim because fast sounds better, drowns in
the reef, and has no way to learn why.

**No new words.** `traitLine()` has been through three versions and the note on
the current one says the second was removed because it "was accurate and was too
much to read while a guard was walking towards you." So the pips already on
screen simply say which row the world is about: in the caves neither is marked;
open a reef level and the highlight moves to strength. That *is* the discovery,
made without anybody having to read a sentence.

Only the reef claims anything, and the restraint is the point — a highlight on
five worlds out of six is wallpaper. The **city was the near miss**: only a
strong creature brings a building down (`FORCE` pip ≥ 4), which sounds like a
strength world, and then the measurement says Nim still beats Bash there, 15s to
26s, by going round. Smashing is a route, not a requirement, so the city keeps
its mouth shut.

## Proof

- `test/pour.test.ts` (9), `test/dust.test.ts` (8), `test/rewards.test.ts` (5),
  plus `Strides` in `test/stride.test.ts`.
- Mutations for each, including one that draws the dust back inside the creature
  and one that stops the bucket drawing anything.
- One source-grep test in `test/enemies.test.ts` was replaced: it pinned an exact
  line of renderer arithmetic, so it would break when the line was *improved* and
  pass whenever it was broken in a way that kept the characters.
