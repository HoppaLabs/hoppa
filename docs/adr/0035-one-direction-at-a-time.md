# 0035 — One direction at a time

**Status:** accepted (day 17)

## What was reported

> The enemy character should only move the way the player character can move,
> one direction at a time.

## What was happening

A chasing enemy applied both axes in the same tick:

```ts
if (stepX !== 0 && this.enemyFits(enemy.x + stepX, enemy.y)) enemy.x += stepX;
if (stepY !== 0 && this.enemyFits(enemy.x, enemy.y + stepY)) enemy.y += stepY;
```

Two consequences, and the second is the one that matters.

**It moved diagonally**, which nothing else in the game does in practice. The
player *can* hold two directions at once, but the pad is five separate buttons
on a phone, so it means two thumbs, so it never happens.

**It moved faster.** A diagonal step covers √2 ≈ 1.41 times the ground of an
axis step, at no cost. An enemy closing on a player who was off both axes was
simply 41% quicker than one closing along a corridor — and quicker than the
player could ever be. Nobody designed that; it fell out of writing two `if`s.

`walkEnemyHome` had the same shape, under a comment that already said *"one
axis at a time"*. The comment was right about the intent and the code had never
matched it.

## roam/7

Hard rule 3, so this is a new behaviour version. Every link that pinned
`roam/6` still runs `RoamV6` and replays exactly as it did; there is a test
that runs one and compares the hash, and another that shows v6 really does cut
diagonals so the change is measured rather than asserted.

The rule: **the axis with further to go moves.** If that step is blocked, the
other axis is tried instead.

That fallback is not a detail. The obvious version — move the dominant axis,
full stop — leaves an enemy pressed into a wall while you stroll round it,
which is a worse game than the diagonal it replaces.

**A tie goes to the horizontal.** Arbitrary, but it has to be something fixed:
every replay of a run, on any phone, a week later, has to break the tie the
same way or the proof does not verify.

## What it costs

Chasing enemies are slower to close when you are off both axes, which makes
open rooms slightly kinder and corridors unchanged. All nine shipped rooms are
still beaten by all three ready-made creatures with the winning runs replayed
cold; the times moved by at most a second.

## The part worth remembering

This bug was invisible in every test and every check. L5 measures patrol
length, the bot only asks whether a room can be finished, and both were
perfectly happy. It took somebody watching an enemy move and saying "that isn't
how I move".
