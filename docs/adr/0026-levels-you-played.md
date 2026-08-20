# 0026 — The last few levels you played

**Status:** accepted (day 15)

## The hole this fills

A level is only ever a link. That is the whole design — no accounts, no server,
nothing to come back to — and `docs/adr/0006` is right that it should stay that
way.

But it has a cost that only shows up on the second day. Play your cousin's level
on Tuesday, close the tab, and on Wednesday it is gone unless you still have the
message. The link was the level, and nothing kept it.

## What is kept

The last **six** levels you played, as the codes that were in their links.

Not the levels: the codes. A code *is* a link, so tapping one of these is
exactly the same act as tapping it in a message — same URL shape, same page,
same everything. Nothing new can be reached this way that a link could not
already reach.

Newest first, deduplicated by code, oldest dropped. Only levels that arrived
from a link: the built-in one is always there, and a list whose first entry is
"the level you are already on" is furniture. The level you are currently playing
is filtered out for the same reason, so the row is only ever somewhere to *go*.

## Storage lies, so this assumes it does

Same posture as the character and the draft (spec §5b). Every read is guarded,
and a record that is not exactly right is skipped rather than trusted:

| planted in storage | what comes back |
| --- | --- |
| not JSON | empty list |
| JSON that is not an array | empty list |
| entries with no code, or no name | those entries dropped, the rest kept |
| the same code twice | one entry |
| fifty entries | six |
| a 500-character name | cut to 24 |
| storage that throws | empty list, no exception |

Losing this list costs nothing anybody cannot get back from the message the
link came in.

## It goes through slugify and textContent

The name comes out of storage, so it is treated as untrusted on the way back
out: `slugify` before it goes in a URL, `textContent` rather than `innerHTML`
on the way to the page. Only a child's own storage can be tampered with here,
so the stakes are low — but "low stakes" is how the first real one gets in.

## What it looks like

A row of small chips under the footer, labelled **played before**, each one the
level's name. Without the label they read as two more buttons with no
explanation — which is exactly how it looked the first time it was put on a
phone.

Measured: the row costs no level size at all (360×210 with and without, on a
390pt phone), because the play page measures its own chrome rather than
guessing at it (`docs/adr/0021`).
