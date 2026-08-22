# 0053 — Sending a level you have not played

**Day 21. Accepted.**

## What was asked

> We need to add share level to the level editor even if the match is unplayed
> by the user, but it needs to have been autoplayed.

and, an hour later:

> You need to change the share wording in unplayed levels, to something like
> "Try playing this level I designed"

## Where this leaves the gate

Spec S12's share gate came down on day 20 (adr/0046): the play page will send
any level, beaten or not, because refusing was costing a six-year-old the
ability to send a friend a room they had just drawn.

This is the other end of the same problem. To send a level from the editor you
had to leave the editor, play the level, and share from there — which is the
gate again, wearing a different hat: it is a trip through the thing you cannot
do. So the editor gets its own send button.

But not unconditionally. The editor is the one place left that can honestly say
"this room is possible" before the link goes, because it already has a bot that
will play the room on demand — and a bot getting out is exactly the evidence
the old gate wanted, gathered without asking a child to produce it.

So:

| where | who has to have beaten it |
| --- | --- |
| play page | nobody |
| level editor | a bot, on this exact room |

## "This exact room"

A flag set when the bot wins and cleared by hand wherever the draft changes is
a flag that will one day be missed at a new place the draft changes — and the
failure is silent and bad: a link goes out for a room nothing has ever been
through, with the button implying otherwise.

So the proof carries the room it is a proof of. `BotRun` is
`{ code, won, place }` where `code` is the level text the bot actually played,
and the gate is a string comparison against the level text on the paper now.
Paint one cell and it closes itself. Nobody has to remember anything.

`place` is there because a garden has no exit: `won` is never true, and
demanding it would shut the button permanently on exactly the rooms the
youngest children draw. Being wandered through is what proof means there.

## The wording

The unbeaten message used to be:

> Play my level: the deep — I have not done it yet!

That was written when an unbeaten link was unusual and the sentence was a
disclaimer. Now most links are unbeaten — the gate is open at one end and the
editor sends at the other — and read in WhatsApp it is a warning that the room
might be broken rather than an invitation to play it. It says:

> Try playing this level I designed: the deep

and, for a room somebody is passing on rather than one they made,
`Try playing this level: the deep`. The one word that must not leak across is
"designed".

## What moved

Two decisions came out of the play page so both ends could share them:

- `src/web/send.ts` — the four ways to get a link off a phone (share sheet,
  clipboard, `execCommand`, the link on screen) in that order. Two copies of a
  fallback chain is one copy that stops matching, and the one that drifts is
  the one nobody tested.
- `src/web/invite.ts` — what the message says. It used to be a nested ternary
  inside the play page, checkable only by grepping the source for its own
  sentences: that catches a deletion and nothing else. It runs in a test now.

The editor's gate is `src/web/level/sendable.ts`, for the same reason.

## What is given up

A room the bot can finish and no child can. That was true of the old gate too —
it wanted *a* win, not a child's — and the honest mitigation is unchanged: the
message says nobody at this end has done it.
