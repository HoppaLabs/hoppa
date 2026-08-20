# 0018 — Everybody can climb: dash v2

**Status:** accepted (day 11)

## The trap

In `dash/1`, a creature with **no strength could not climb a single step**.

The weakest jump rises 0.98 of a cell and needs 1.0. Two subcells of velocity.
The consequence was out of all proportion: spend the whole budget on speed —
a perfectly sensible thing for a child to do, and one the character editor
actively encourages by showing speed as an equal choice — and the side-on game
silently becomes ladders and flat ground only. Half the levels a friend sent
would be unfinishable, with nothing on screen to say why.

Found by the playability check (`docs/adr/0017`), which had to measure the real
jump heights to do its job and turned this up as the first entry in the table.

Raised rather than quietly fixed, because it changes how the game plays. The
answer was: *"if with no strength a creature should be able to climb."*

## Decision

**`dash/2`.** `dash/1` is untouched — hard rule 3, and every link that pinned it
still replays exactly as it did. `test/dash-v2.test.ts` pins `dash/1`'s hash
after a fixed log (`716211eb`) so that cannot quietly stop being true.

The jump curve goes from `[58, 64, 70, 76, 82, 88]` to
`[64, 72, 80, 88, 96, 104]`, which measures as:

| strength | dash/1 | dash/2 |
|---|---|---|
| 0 | **nothing** | 1 cell |
| 1 | 1 | 1 |
| 2 | 1 | 1 |
| 3 | 1 | **2** |
| 4 | 2 | 2 |
| 5 | 2 | **3** |

Everybody can climb, and strength now buys a second cell at three pips and a
third at five. That is **three tiers instead of one boundary** — under `dash/1`
strength only changed anything between three pips and four, which is a poor
return on a characteristic the whole budget is built around.

These numbers were not chosen and then hoped for. Three candidate curves were
driven through the engine at every strength and every step height, and the one
with the best spread was kept. The test re-measures on every run.

## The check follows the level, not the newest rules

A level pins the behaviour version it was drawn under, so the playability check
now keeps **one step table per version** and judges a level by the jump it
actually has. Open a `dash/1` link through "change this level" and it is
measured with `dash/1`'s weaker jump, because that is what whoever plays the
link will get.

## What this does not change

`dash/1` and both `roam` builds are byte-identical and still routed. No golden
vector moved. The level format, the codec and the share link are untouched — a
`dash/2` level differs from a `dash/1` level by one number in its header.
