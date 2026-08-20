# 0009 — Real time, and how determinism survives it

**Status:** accepted (day 7), at the project owner's direction

## Decision

The games are real time. Two engines, both on the 24×14 grid:

- **Roam** — from above, the way Zelda works. Enemies patrol, notice you and
  chase; you walk in any direction and swing a sword. Shipped.
- **Dash** — from the side, the way the original Donkey Kong works: ladders,
  platforms, jumping. Next.

The turn-based builds `delve/1`…`delve/5` still ship and always will.

## Real time does not mean undetermined

This is the whole trick, and it is why the pivot cost days rather than weeks.

The simulation still advances in **whole numbered ticks**, thirty a second. What
changed is where a tick comes from: a clock instead of a thumb. The page owns
the clock, turns elapsed milliseconds into whole ticks, and calls the engine
that many times. **Wall-clock time never crosses into the engine.**

Positions are fixed-point integers — 256 subcells to a cell, a shift rather than
a divide — because floating point is banned in the determinism zone and would
have made two phones disagree in the third decimal place.

So a log is still a list of inputs against tick numbers, just held-button bytes
instead of discrete moves. **Replay, share links and win proofs all work
unchanged**, and there are tests saying so: the same held-button log hashes
identically three times over, and a level that has been through the codec plays
identically to the one it was encoded from. A real-time level still encodes to
76 characters.

## Why single-screen for the side game

The owner asked whether Donkey Kong was where Mario first appeared. It was —
1981 — and the question settled a design problem I had got wrong.

I had planned to stitch several 24×14 rooms together so a side-on level could
scroll. Donkey Kong does not scroll: each stage is one screen. That keeps the
grid, the codec, the ~80-character link and the phone level editor all exactly
as they are. The rooms plan was dropped.

## Things the browser found that the engine tests could not

Three, all with the suite green:

- **The loop never started.** It was created in `reset()`, which a first page
  load never calls, so the world sat still. A real-time game that does not start
  is indistinguishable from a turn-based one.
- **Five hearts in five seconds.** The start sat two cells from a guard whose
  sight was four, so a player was hunted from the first tick with nowhere to
  learn the controls. Sight is now three cells with hysteresis, mercy is longer,
  and a hit throws you two cells clear instead of nudging you.
- **Quick taps were dropped.** A tick is 33ms and a fast press can begin and end
  between two of them, so the sword sometimes did nothing at all. Presses are
  now latched until exactly one tick has seen them.

## Consequences

- `EngineID` gains `roam` and `dash`; the codec's engine table is append-only,
  so old links are unaffected.
- The play page supports both input models and picks by what the level pins, so
  a turn-based link opened today still plays turn-based.
- The turn-based game is no longer what a new visitor sees. Every old link keeps
  working; the front door changed.
