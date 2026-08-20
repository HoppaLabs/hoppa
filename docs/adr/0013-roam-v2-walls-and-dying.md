# 0013 — Roam v2: enemies stay out of walls, and they can die

**Status:** accepted (day 10)

## The bug

Reported from a real game, with a screenshot: *"after fighting an enemy, the
enemy started moving through walls."*

It reproduces every time. In `roam/1`:

1. An enemy that gives chase steps toward the player on both axes, leaving the
   corridor it was drawn in. Nothing brings it back.
2. When it loses interest, `moveEnemies()` resumes patrolling — using the
   corridor's `lo` and `length`, which were derived from its **home** cell, but
   applied at whatever column the chase left it in. It then paces that extent
   through solid rock, forever.
3. The patrol branch did no wall check at all, so nothing caught it.

A separate, milder defect made it visible even without a chase: the player's
clearance test (`fits`) checks every cell the **body** covers, while the
enemy's (`clearFor`) checked the single cell under its **centre**. A body is
0.75 of a cell wide, so an enemy could stand three-quarters inside a wall and
the check was happy. That is the frame in the screenshot.

Measured on the shipped level, with no chase involved: `roam/1` puts an enemy
body inside a wall within a few hundred ticks of ordinary play.

## Decision

**A new behaviour version, `roam/2`. `roam/1` is untouched.**

Hard rule 3: shipped links are permanent, and every link pinning `roam/1` still
replays exactly as it did. `test/roam-v2.test.ts` pins `roam/1`'s hash after a
fixed log (`e6aa9458`) so that can never quietly stop being true.

`roam/2` changes three things about enemies:

- **Body-aware clearance.** Enemies use the same `fits()` test as the player.
- **They walk home.** An enemy that strayed from its corridor heads back to the
  cell it was drawn in, then paces. The corridor's extent is only ever applied
  *on* the corridor.
- **The patrol step is wall-checked.** It should never fail now that the first
  two hold; it is there so no future change to how a patrol is derived can put
  an enemy inside a wall again.

## Enemies can die

Asked in the same breath: *"btw can they die?"* In `roam/1` they could not — a
sword hit only stunned, and they always got back up.

In `roam/2` a hit takes a life off; enough hits and the enemy is gone for the
rest of the attempt. Strength decides how many: 1 swing at full strength, 4 at
none. Start the level again and the room is full again.

The first choice was a timed respawn, then: *"go for the conventional approach
in games, the most recognisable by a user."* That is Zelda's and Mario's rule —
you clear a room and it stays clear until you leave and come back — so a killed
enemy stays dead for the attempt and returns on restart. It is one less rule to
explain and the one every player already knows.

This makes strength worth spending on in a way it was not: a strong creature
clears a path, a fast one goes round. That is the trade the whole budget exists
to create.

## Dash was checked and is fine

`dash/1`'s walkers use the same point-only clearance, but they never chase and
never leave their platform — they turn at a wall or a ledge before a body can
overlap. Measured over 2000 ticks with all three presets: zero overlapping
ticks. No `dash/2`.

## What this does not change

`roam/1` is byte-identical and still routed. No golden vector moved. The level
format, the codec and the share link are untouched — a `roam/2` level differs
from a `roam/1` level by one number in its header.
