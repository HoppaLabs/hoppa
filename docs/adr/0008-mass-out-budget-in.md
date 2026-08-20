# 0008 — `MASS` out, a spending budget in

**Status:** accepted (day 7), at the project owner's direction

## Decision

`MASS` is no longer read by any engine from `delve/5` onwards. A creature is
built by spending a **budget**: four characteristics, five pips each, eight pips
to spend.

| Characteristic | Axis | What it means, in every engine |
|---|---|---|
| strength | `FORCE` | how hard you hit, and how long what you hit stays down |
| speed | `HASTE` | how fast you move |
| nerve | `GUARD` | how many hits you can take |
| reach | `REACH` | how far you swing, and how far you can grab |

## Why `MASS` had to go

Spec §6 called it "the point of the whole design": one number meaning opposite
things per engine — loud in Delve, unstoppable in Shove. It reads beautifully
and it did not survive contact.

Two problems, and the owner put the first one better than the spec did:

1. **Every sprite is the same 16×16.** Weight was a number with nothing behind
   it. A kid could not look at their creature and see why it was heavy, so the
   trade had no story.
2. **In Delve it only ever made you worse.** Being loud cost you and bought you
   nothing, so `MASS` was a penalty, not a trade. A trade needs both sides.

Speed and strength are things a child already understands and can feel within
seconds of playing. They also mean the same thing in any engine, which turns out
to be a better reason to carry a creature between games than a number that
reverses.

## Why a budget rather than free numbers

Eight pips across four characteristics means **you cannot have everything**.
Deciding what to give up is the design; it is also what makes one kid's creature
different from another's, and what makes swapping them worth doing.

All three presets were rebalanced onto the budget and each spends exactly 8, so
no preset can be better than something a kid is allowed to build.

## What this cost, and the bug it nearly caused

Rebalancing the presets **silently rewrote the day 4 golden vectors**. The
generator imported the live presets, so regenerating turned Bruk's hash from
`4ddfbdb6` to `c58151a8` and Pell's win into a loss. That is exactly what
CLAUDE.md hard rule 6 forbids, and it was caught by reading `git diff` rather
than by a test.

The fix is architectural: a golden vector is `(level, CREATURE, log) → hash`, so
the creature is part of the fixture. The generator and the tests now spell out
day 4's historical caps instead of reading whatever the presets happen to be
today. Vectors are immune to rebalancing from here on.

While fixing that, a second bug: a blind string replace hit every match, and day
7's Nim shares day 4's Nim log, so day 7 silently got v4's caps. Also caught in
the diff. Both corrected; days 1–4 are byte-identical.

## Consequences

- `MASS`, `MOVE_GROUND`, `MOVE_AIR` and `SPARK` stay in the vocabulary. Builds
  up to `delve/4` read `MASS`, and every link pinning one must keep playing
  identically. The axis is frozen, not deleted.
- Spec §6 has been rewritten to match. This is the first change made *to* the
  spec rather than recorded against it.
- Shove was to exist "primarily to invert `MASS`" (§7). That reason is gone. If
  a block-pushing engine ships it now needs a reason of its own.
