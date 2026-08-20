# 0019 — The weapon works from the side: dash v3

**Status:** accepted (day 11)

## The gap

> There's no swords or spells in the side levels?

Correct, and it had stopped making sense. In `dash/1` and `dash/2` the only
answer to an enemy was landing on it — the Mario move, asked for deliberately
and still the right verb for a side-on game. But since `roam/3` the weapon is a
**real choice**: a sword kills, a wand freezes. A child who picked a wand and
played a side-on level saw no wand and no effect at all.

That cuts against the premise the whole budget rests on. Strength carries
between engines. Speed carries between engines. The weapon is the one thing you
choose that stopped at the edge of one game.

## Decision

**`dash/3`: swing *and* stomp.** Both are answers to an enemy and they cost
different things — landing on one needs you above it, swinging needs you beside
it. Neither replaces the other.

The weapon behaves exactly as it does from above:

| | Sword | Wand |
|---|---|---|
| Kills | yes, for the attempt | never |
| Swings needed | 1–4, by strength | always 1 |
| Effect per hit | short stun | long freeze |
| Reach | same constant as `roam` | same |

Reach is deliberately the same number as roam's. A child who has learned how
close they have to be from above should not have to learn it again from the
side.

The port also carried roam/3's fix with it: the strike is measured **from you**,
not from the blade's tip, so an enemy pressed against you is hit rather than
falling through the hole in the middle of the arc.

## A new input bit

From above, `HELD_ACT` already means "swing". From the side it means "jump", so
the weapon needed its own bit: **`HELD_SWING = 32`**, appended and never
renumbered — a log is held-button bytes, and moving a bit would change what
every shipped log means.

On the pad, the top row had an empty slot next to jump, and the weapon goes
there. It is shown **only on `dash/3`**: on `dash/1` and `dash/2` it would be a
button that does nothing, and from above it would be the same button twice.
There is a test that pressing `HELD_SWING` in `dash/2` changes the state hash by
exactly nothing.

## What this does not change

`dash/1`, `dash/2` and all three `roam` builds are byte-identical and still
routed. No golden vector moved. The level format, the codec and the share link
are untouched — a `dash/3` level differs from a `dash/2` level by one number in
its header.

The jump is identical to `dash/2`'s, so the playability check's step table for
v3 is v2's table unchanged.
