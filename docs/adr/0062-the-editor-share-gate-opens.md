# 0062 — The editor's share gate opens

**Day 22. Accepted.** Reverses one clause of `0053`, one day later, on request.

## What was asked

> A user should be able to share a level from the level editor even if it
> hasn't been autoplayed.

## What 0053 decided, and why it was reasonable

Day 21 gave the editor its own send button, gated on a bot having got through
**this exact room**:

| where | who has to have beaten it |
| --- | --- |
| play page | nobody |
| level editor | a bot, on this exact room |

The argument was good: the play page's gate came down on day 20 because refusing
was costing a six-year-old the ability to send a friend a room they had just
drawn, and the editor was "the only place left that can honestly say *this room
is possible* before the link goes."

## Why it comes down anyway

Because it was still a gate, and gates are what day 20 and day 21 were both
about removing.

A child who has drawn a room and wants to send it now has to find another
button, press it, wait, and be told **no** if the bot fluffs it. The bot is
good; it is not a player. It never presses the weapon button at all — measured
this morning while checking something else, it swings **zero** times in all
fifteen shipped rooms — so any room whose solution needs a fight is a room the
bot cannot prove and the button would not open for.

That is a gate that says no to the most interesting levels a child can draw.

## What replaces it

One question, and it is not about the child:

> Can this room become a link at all?

A level that will not encode has nothing to send. That is a fact about the wire
format, not a judgement about the drawing, and the click handler already says
exactly that — *"this level will not fit in a link"*.

**The bot's verdict goes back to being advice.** The editor already prints what
it thinks of a room — *"looks playable. try it and see."* — from a flood fill
that costs nothing and runs on every edit. A doubt belongs on that line, where a
child can read it and decide, rather than in a disabled button that explains
nothing.

## What is kept

`proved(run, code)` stays, and so does the trick that makes it trustworthy: the
proof **carries the room it is a proof of**, so painting one cell makes the codes
stop matching and the claim clears itself. Nobody has to remember to clear a
flag. It is a true and useful thing to know; it just no longer decides anything.

## The risk, stated plainly

A child can now send a friend a room nobody can finish.

That is the actual cost and it is worth writing down rather than glossing. The
judgement is that a link to an impossible room is a smaller harm than a button
that will not let you talk to your friend — and that a six-year-old who sends a
broken level and hears about it has learned something, where one who is silently
refused has only learned that the game said no.

## Proof

- `test/send-gate.test.ts` rewritten: a room that encodes can be sent, autoplayed
  or not; a room that cannot encode still cannot; `proved()` still clears itself
  when one cell changes.
- A mutation that closes the button again.
