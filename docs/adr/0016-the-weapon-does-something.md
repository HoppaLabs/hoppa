# 0016 — The weapon does something: roam v3

**Status:** accepted (day 10). Supersedes the "cosmetic" half of `docs/adr/0015`.

## The question

Asked directly, and worth quoting because the reasoning matters more than the
answer:

> Could the wand reset an enemy's position? Would that work as a game dynamic?
> I'm an enterprise coder not a natural game designer, so I need to cross check
> my ideas.

Then, after a first pass:

> maybe a user can choose which to use, a sword or a wand? Sword kills, wands
> transport, or freeze an enemy? Could that work, it's an open question?

## Decision

Yes, with one change and one condition.

**Freeze, not transport.** Sending an enemy back to where it started is
invisible when the enemy is already near where it started: you swing, and
nothing appears to happen. Feedback proportional to how far you dragged it is
not feedback a six-year-old will connect to the button they pressed. A freeze
is legible instantly — it stops dead, you walk past.

**The condition: neither weapon may be strictly better.**

| | Sword | Wand |
|---|---|---|
| Kills | yes, for the attempt | never |
| Swings needed | 1–4, by strength | always 1 |
| Effect per hit | short stun (14–48 ticks) | long freeze (90–190 ticks) |

The sword is an *investment*: land the hits and the problem is gone. The wand is
*instant relief*: it never solves anything and it always works right now. So a
weak creature is better off waving and a strong one is better off swinging —
which makes the weapon **interact with the points budget instead of going round
it**. That was the whole objection to letting it matter, and this is what
answers it.

Strength buys something either way: fewer swings with a sword, a longer freeze
with a wand. Nothing else changes — same reach, same speed, same hearts, same
caps, and there is a test saying so.

## Why the earlier "cosmetic" ruling changed

ADR 0015 made the weapon cosmetic on the grounds that a look must not silently
become a power — a child picks the wand because they like wands, and should not
find out later that they picked a different game.

That objection is answered by **saying what each one does on the picker**:

> sword — gone for good, if you can land the hits
> wand — frozen on the spot, every time
>
> both reach just as far and you move just as fast. pick the one you like —
> neither is the wrong answer.

An informed choice between two good answers is not a trap. A hidden one would
have been.

## What this does not promise

Not "every level is winnable with both weapons". Nothing promises that, and
nothing ever did — a strength-5 creature and a strength-0 creature already
differ more than a sword and a wand do. **The share gate is the guarantee**: you
cannot send a level you have not beaten, so every level that travels was beaten
by somebody. The test suite makes the weaker claim that actually matters — that
neither weapon stalls, crashes or is dead on arrival at any strength.

## Versioning

`roam/3`. `roam/1` and `roam/2` are untouched and still routed, and
`test/roam-v3.test.ts` checks that in v2 a wand is still exactly a sword — the
promise ADR 0015 made to anything already shipped.

The weapon now reaches `stateHash()` through the enemy state it changes. That is
correct and not a breach of hard rule 4: from v3 the weapon is a capability, not
a cosmetic. The cosmetics — sprite, palette, tileset — are untouched and still
tested.
