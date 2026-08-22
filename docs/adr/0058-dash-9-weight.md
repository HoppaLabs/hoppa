# 0058 — dash/9: weight

**Day 22. Accepted and shipped.** `NEWEST_BUILD.dash = 9`; dash/8 stays exactly
as it is and every link ever sent still replays.

## What was asked

> Overall the playing the games doesn't feel as natural as Mario or Zelda why?

and then, having read the answer:

> Overnight I need you to work on proving the gameplay, let's try and get close
> to Zelda and Mario as you explained, but without copyright infringement
> obviously

and:

> For the gameplay and character control all the side and above games need work,
> use your judgment, don't just do cheap easy changes, make the expensive
> changes as poor gameplay means poorer engagement and today it feels like
> moving a cursor as you say.

"It feels like moving a cursor" is the finding, in the user's words. This file
is the side-on half of the fix. The top-down engines are the other half.

## The copyright position, since it was raised

What is being copied here is **technique**, not expression. Acceleration,
friction, a variable-height jump, a few frames of grace after a ledge, a press
remembered for a few frames — these are how a platformer has worked since the
mid eighties, described in public in a hundred talks and textbooks, and they are
nobody's property. They are the equivalent of a novel using paragraphs.

What would not be all right is taking somebody's **art**: their characters,
their names, the noises they make, their level designs, their palettes. None of
that is here. Bash, Nim, Pell, Vance and Bruk are ours; every tile in the game
is drawn in this repo; the rooms are ours.

So: the same physics vocabulary, none of the expression. That is the line and
this change stays well inside it.

## What dash/8 did

```
if (buttons & HELD_LEFT)  x -= run;
if (buttons & HELD_RIGHT) x += run;
```

Full speed on the tick the button goes down, zero on the tick it comes up. There
is no state between "still" and "running", which is precisely what "moving a
cursor" means: the creature is not an object being pushed, it is a value being
assigned. Everything else about the game can be right and it will still feel
like a spreadsheet.

## What dash/9 does

Four changes, all in integers, all inside the determinism zone — and a fifth,
found while testing them, below.

| | dash/8 | dash/9 |
|---|---|---|
| Sideways | `x += run * dir` | velocity, accelerated toward `run * dir` |
| Letting go | stops on the tick | drags to a stop |
| Turning round | instant | double acceleration |
| Jump height | fixed | cut when the button is released on the way up |
| Walking off a ledge | jump lost immediately | `COYOTE_TICKS = 5` of grace |
| Pressing jump early | press lost | `BUFFER_TICKS = 6`, fires on landing |

**Acceleration and drag scale with the creature's `run`**, so a fast creature
still feels fast and does not merely take longer to get going:

```ts
groundAccelFor(run) = max(run / 4, 3)     airAccelFor(run) = max(run / 8, 2)
groundDragFor(run)  = max(run / 3, 4)     airDragFor(run)  = max(run / 16, 1)
```

Air acceleration is deliberately about half of ground acceleration and air drag
is nearly nothing. That combination is what makes a jump read as committed: you
can steer in the air, you cannot restart in it.

**The jump cut is `jump / 3`.** Tapping gives about a third of the rise, holding
gives all of it. It applies only to a jump the player asked for (`this.jumping`)
— a bounce off an enemy's head is the game's push, not theirs, and clipping it
would take the reward away from the risk.

**The buffer is armed on the EDGE of the press**, not on the button being down.
Otherwise holding jump re-arms it every tick and you bounce for ever.

All five new fields — `vx`, `coyote`, `buffered`, `jumpWasDown`, `jumping` — are
in `stateHash()`. They are authoritative state, not presentation, so hard rule 4
does not apply to them: they must be hashed or two clients could disagree.

## A fifth thing, found by accident

Writing the test for the jump buffer turned up a defect that has been in every
side-on build since the slicing was added.

A fall is stepped in slices no wider than a body, so nothing tunnels through a
one-cell floor at speed. A slice that did not fit was **thrown away whole** — so
landing at terminal velocity stopped you up to 96 subcells (a third of a cell)
**above** the floor, standing on nothing. Gravity then rebuilt a speed small
enough to fit, six subcells at a time, and you sank into place over the next ten
ticks. `grounded` flickered on and off the whole way down.

```
tick 33  y=3146  grounded   <- "landed", 86 subcells above the floor
tick 34  y=3152  falling
tick 35  y=3164  falling
...
tick 44  y=3230  grounded   <- actually landed, eleven ticks later
```

That is a jump pressed just after landing working or not working for no reason
the player can see, and it is a visible sink on every single landing. dash/9
closes the gap by halving: seven halvings settle a body-sized slice to the exact
subcell, the same seven every time on every machine.

```
tick 33  y=3232  grounded
tick 34  y=3232  grounded
```

Nobody reported this. It was found by printing the numbers rather than by
reading the code, which is the third time this week that has been the difference.

## Three wrong guesses, and the measurement that ended them

The bot's clear times got worse under dash/9 and I explained it three times
before measuring it once.

1. **"The jump fires on the edge and the bot only presses for one tick."**
   Plausible; fixed the bot to hold for nine ticks; no change.
2. **"Air control is too weak."** Raised it to full ground acceleration. Times
   got *worse*, and the jump arcs went silly. Reverted.
3. Finally measured the two things I had been asserting:

   | | dash/8 | dash/9 | |
   |---|---|---|---|
   | Walk, 30 ticks | 3.28 cells | 3.12 cells | −5% |
   | Jump height | 3.32 cells | 3.09 cells | −7% |

   Both within a rounding error of the same game. Neither could explain the
   times.

The actual cause was in the bot, not the engine: **the bot taps jump, and under
dash/9 a tap is a hop.** The jump cut was working exactly as designed on a
player that had never needed to hold a button before. Holding for nine ticks
(`JUMP_HOLD`) put every room back within a tick or two of dash/8.

The lesson is the one this project keeps relearning: *measure before explaining.*
Three explanations cost more than the measurement would have.

## Proof

- `test/dash-v9.test.ts` — 12 tests: acceleration ramps rather than snapping,
  drag coasts, turning is faster than starting, the tap/hold jump differ by
  roughly the cut, coyote grace works and then expires, the buffer fires on
  landing and cannot be re-armed by holding.
- Six new mutations in `tools/mutate.ts`, one per feature, all caught
  (`bun run check:mutants`: all 61 caught).
- The bot beats all three shipped dash rooms with all four creatures:

  ```
  4-up-and-over      Bash  9s  Nim  6s  Pell  7s  Vance  9s
  5-the-tall-room    Bash 25s  Nim 17s  Pell 19s  Vance 25s
  9-mind-the-spikes  Bash 11s  Nim  8s  Pell  9s  Vance 11s
  ```

  The pack rooms are re-pinned to `behaviour=9` via `tools/pack.ts`.

## Two test bugs this found in the existing suite

Worth recording because both were tests that could not fail.

- **`test/dash-v8.test.ts` defaulted to `newestBuild("dash")`** — so it silently
  started testing dash/9 the moment dash/9 existed. Same trap already caught in
  `test/swim-v3.test.ts` on day 18. Now pinned to `const V8 = 8`.
- **`test/exit-opens.test.ts` put the actor and the gem in the top border row**,
  which is meaningless in a side-on room. It passed under dash/8 only because
  instant full speed crossed the cell before gravity could act. Moved to the
  floor.

## What is not done

The top-down engines — roam, calm, swim, raze — still move at constant velocity.
The same brief covers them and they are next.
