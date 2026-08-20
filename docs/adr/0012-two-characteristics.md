# 0012 — Two characteristics, not four

**Status:** accepted (day 9)

## Decision

A character spends its points on **two** things, not four:

| Button says | Axis | What it always means |
|---|---|---|
| Stronger | `FORCE` | hit harder, jump higher, take more hits |
| Faster | `HASTE` | move quicker, jump further |

Five pips each, **six to spend** (was eight across four). You still cannot max
both, which is the only property the budget has to have.

Gone from the editor: **nerve** (`GUARD`) and **reach** (`REACH`).

## Why

The user, reading the editor:

> there is no difference really I mean to stronger and tougher, I think I'd
> prefer if we just have stronger and faster

That is the whole case. "Stronger" and "tougher" pick out the same creature in
ordinary English, so two of the four buttons were asking a kid to split a
distinction that only exists inside the code. Reach was worse: a one-cell grab
radius is invisible on a phone screen, so a kid spent a point and saw nothing
happen.

Four axes also made the trade illegible. Eight points across four things has
lots of shapes, most of them mush. Six across two has a readable line from
"all strength" to "all speed", and a kid can predict the result before pressing
play — which is what makes sending a level to a differently-built friend mean
something.

Toughness did not disappear; it moved. Hearts now come from `FORCE`
(`heartsFor()` in both engines), so "stronger" honestly means "harder to kill"
as well as "hits harder". Reach is now the same for everyone
(`reachFor()` returns a constant).

## What this does NOT change

`GUARD` and `REACH` stay in the capability vocabulary, and `delve/1`…`delve/5`
still read them exactly as they did. A build can no longer *spend* on them; the
axes are still there, so every shipped link replays byte-identically. Hard rule 3
and hard rule 6 are both intact: no engine behaviour changed, and no golden
vector moved.

The presets were rebalanced (Bash `5/1`, Nim `1/5`, Pell `3/3`), which *would*
have silently rewritten the day-4 and day-7 golden vectors, because the generator
read the live presets. Fixed by pinning the historical caps in
`tools/make-golden.ts` and in `test/delve-v5.test.ts` before touching the
presets. A frozen engine must be tested against frozen inputs — that is the
general lesson, and it caught a real hash move (`4ddfbdb6` → `c58151a8`, Pell's
day-4 win turning into a loss) before it was committed.

## Rejected

**Keep four, rename them.** "Tougher" → something else. There is no better word:
the concept genuinely overlaps with strength for a seven-year-old.

**Keep reach, make it visible.** A longer sword arc is drawable, but it is a
third trade to explain, and the swing already reads as strength.
