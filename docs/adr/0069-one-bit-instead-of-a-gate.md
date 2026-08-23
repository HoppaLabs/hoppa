# 0069 — One bit on the link, instead of a gate

**Accepted, day 23, on request.**

## What was asked

> "let the link carry one bit saying whether the sender beat it"

Following a review that flagged the share gate as the one real gap against the
spec.

## What the spec wanted, and why it went

> "You cannot share a level you haven't beaten. […] Quality filter, difficulty
> signal and trash talk in one mechanic. And nobody receives an impossible
> level, which is the fastest way to kill this kind of game." — spec §12

Both halves of that gate came down on request: the play page's on day 20
(`adr/0046`), the editor's on day 22 (`adr/0062`). Both removals were right. A
six-year-old who has drawn a room and wants to send it to a friend, being told
no by a bot that fluffed it, is a worse outcome than the friend receiving a
room nobody can finish.

But the *information* was thrown out with the refusal, and it was the valuable
half. So: keep the claim, drop the enforcement.

## The shape

A fourth link kind. `#b/<slug>/<code>` asserts that somebody has got out of
this room; `#p/<slug>/<code>` says nothing at all.

Not a fourth segment on `#p/`, for exactly the reason the challenge link is its
own kind: a level code is base64url, so there is no way to look at the last
piece of a `#p/` link and know whether it is a flag or part of the level.

And **`#p/` had to keep meaning nothing**. Every `#p/` link that exists was made
before today. Reading them as "beaten" would invent a fact about somebody
else's level; reading them as "not beaten" would slander a great many perfectly
good rooms. False means *no claim*, and the test that matters most in
`test/beaten-link.test.ts` is the one asserting that `linkFor()` with no flag
still produces the byte-identical string it always did.

`#c/` and `#r/` need no bit. You cannot have a time without having got out, so
they already carry the stronger claim.

## Where the bit comes from

| sent from | claim | why |
| --- | --- | --- |
| play page, after a win | `#c/` with a time | strongest claim there is |
| play page, not won | `#b/` if it arrived that way | the badge survives forwarding |
| play page, a shipped room | `#b/` | the suite beats all 18 with all four creatures |
| level editor | `#b/` if a bot got through THIS room | `proved()`, which already existed |
| level editor, no proof | `#p/` | nothing is known, so nothing is said |

The editor case is the one the whole thing is for. `proved()` was kept when the
gate came down — *"a bot has been through THIS room is still a true and useful
thing to know"* — and then its answer was computed and discarded on every
repaint. It says something now.

**The badge survives being forwarded**, which matters more than it looks: a
claim that stopped at the first forward would be worth very little, since
forwarding is most of how these links travel. If a room arrived saying somebody
had got out of it, that is still true when it goes out again.

## What a child sees

On the receiving end, in the same slot a challenge uses:
*"somebody has got out of this one — your turn"*. Quiet, because it is a
reassurance rather than a boast.

In the group chat, the invitation gains one sentence — *"It can be done."* —
and only where that is known. A reassurance printed on every level reassures
nobody, and printed on a room nobody has finished it is the exact thing §12
existed to prevent.

## What this does not do

It does not stop anybody sending anything, and it never will. That was the
point of taking the gate down.
