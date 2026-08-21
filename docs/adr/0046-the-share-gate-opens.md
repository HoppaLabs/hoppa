# 0046 — The share gate opens

**Status:** accepted (day 18). **Supersedes spec S12.**

You can share a level you have not beaten.

## What was asked for

> More user feedback, the kids want to share a level even if they haven't
> played it.

## What the gate was

Spec S12, in bold, and it called itself "the most valuable mechanic here":

> **You cannot share a level you haven't beaten.** … Beat your own level →
> input log verified locally → only then does the site produce a link … Quality
> filter, difficulty signal and trash talk in one mechanic. And nobody receives
> an impossible level, which is the fastest way to kill this kind of game.

Every word of that is a real benefit. It is being given up anyway, because the
thing it was blocking turns out to be the thing the children most want to do.

## It was already half-open

`calm/1` was let through on this reasoning, written into `hasBeatenThis()`:

> the gate is the biggest wall in front of the youngest player, who can paint
> long before they can finish a room

That argument was never about gardens. A six-year-old can paint a room in two
minutes and cannot finish one, and the gate told them the thing they had just
made was not worth sending. The exception should have been the rule.

## What is kept

**A level that is actually broken is still refused**, and that never depended
on the gate. `L2` and `L4` are flood fills over the level itself — no way out,
or treasure walled off from the start — and they run in the editor as you draw.
The play button was unlocked earlier today, but those notes still show.

**The editor can still show a bot playing the room**, on demand. It stops being
a gate and becomes an answer to "is this even possible?" for a child who wants
to know before they send. All three creatures over the slowest shipped room:
**80ms**.

**The proof machinery is untouched.** Beating a level still records and
re-replays the log, still stores it, and still puts your time in the message.
What changed is only that the button no longer waits for it.

## What is genuinely given up

A level that passes every check and is still too hard for anybody. Nothing now
stops that reaching a friend.

The honest answer is to say so, so the message carries what is known:

| | |
| --- | --- |
| beaten by the sender | `I did it in 22s. Beat that.` |
| your own, unbeaten | `Play my level: … -- I have not done it yet!` |
| somebody else's, unbeaten | `Play this level: … -- nobody has done it yet!` |

The gate used to make "you got a link" mean "somebody has done this". With it
open, the words have to carry that instead — and *"I have not done it yet"* is
the better dare anyway.

## Why not have the bot prove it instead

It was the obvious middle: run the bot when a child taps share, and let the
level through only if the bot wins. It keeps the guarantee exactly, and 80ms
is nothing.

Rejected, because the bot is deliberately naive — it walks straight at
everything and never dodges. A room it cannot finish is very often a room a
person finishes easily, and refusing THOSE would be a worse gate than the one
being removed: it would block the child who drew something clever, with no way
to argue.
