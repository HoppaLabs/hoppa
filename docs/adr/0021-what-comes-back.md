# 0021 — What comes back is a time, not a replay

**Status:** accepted (day 12)

## The question

A link goes out; a friend beats the level. Then what? Spec S16 day 11 wanted
the answer to come back, and the appealing version is a watchable replay — you
see exactly how they did it.

## The measurement that decided it

Replays do not fit. A real run of the built-in level, run-length encoded, is
**1,700 to 3,000 characters** of log alone, before the level and the creature.
A level link is already ~180 characters, and the whole point of the format is
that it survives being pasted into a group chat.

So what comes back is the **outcome**:

```
<site>/#r/<slug>/<score>/<levelCode>/<characterCode>
```

Measured at **252 characters** for a real level and a real creature.

## What that buys, which is more than it sounds

The reply carries the level, so a reply link is a **playable link**. Tapping it
puts you on your own level with the challenge on screen — "Nim beat this in 41
seconds" — and their creature sitting in the character row, so you can try the
thing that beat you.

That is the loop the spec is actually after: not a leaderboard, an argument.

## Failure is graded, not all-or-nothing

The level is decoded **first and strictly**. The creature is decoded after, in
a `try`, because a damaged creature should cost the boast and not the level:

- level bad → the link is refused, with a plain-words reason
- creature bad → `creature` and `who` come back `null`; the level still plays
- score bad or absurd → clamped to a number, never believed

Tested by bending the last character of a real link, which is exactly what a
chat client that eats a character would do.

## The share button now says which act it is

A level you **made** is shared as a level: "share level". A level you were
**sent** goes back as a score: "send your score". It is not a setting, because a
kid should not have to know there is a choice.

Working out which one it is turned out to be the awkward part, and the first
version got it wrong. Both arrive at the play page as a hash — the editor sends
you to the very same `#p/<slug>/<code>` shape a friend's link has — so "there is
a hash, therefore somebody sent me this" is false for every level you make. Tap
**play it** in the editor and the button would have offered to send your friend
a score for a level they had never seen.

The honest question is not about the URL. It is *"is this the level that is in
my editor?"* — and the editor already keeps what you drew, so the page asks it
directly. A reply link always counts as sending back, even though the level is
yours: somebody put a time on it, and the answer to that is your time.

Verified by driving a phone-sized browser through both routes: draw, tap play,
button reads "share level"; open a link, button reads "send your score".

The share gate (ADR 0020) is unchanged and still applies to both: you replay
your own run before either link exists.

## Three things the reply page broke that had nothing to do with links

Building it put two extra rows on the play page — the challenge, and a fourth
creature — and that shook out bugs that were already there:

- **The creature row promised the wrong number of hearts.** It computed
  `2 + strength` itself, which was two lies at once: `roam/4` hands out
  `3 + strength`, so it said three while the HUD drew four — and a turn-based
  level has no hearts at all, so it was promising hearts that never existed. It
  asks the running engine now.
- **The level was sized by a magic constant.** `pad.offsetHeight + 110`, where
  110 stood in for the title, the picker and the HUD. Two more rows and it was
  wrong by exactly that much — and because the page centres its overflow, the
  title slid off the top of the screen rather than the level getting smaller.
  It measures the real rows now.
- **Two creatures called Nim.** If your friend beat your level on a preset, the
  row had their Nim and the built-in Nim side by side, and "their character"
  meant nothing. Theirs is outlined in a dashed gold border and says **beat your
  level** under the name.

Measured after: a reply page and a plain one now draw the level at exactly the
same size (360×210 CSS px on a 390pt phone). It costs nothing to be sent one.

## Not done

Watchable replays. If the budget ever moves — a shorter log encoding, or a
willingness to spend a second link — this is the thing to revisit. Nothing in
the format forbids it; `#r/` is a distinct prefix and a `#w/` could sit beside it.
