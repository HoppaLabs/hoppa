# 0032 — A level with a time on it

**Status:** accepted (day 16)

## What changed

Sharing a level you have beaten now sends the time you beat it in, and the
friend who opens it reads that before anything else:

> **Bash did this in 8 seconds — can you do better?**

## Why it is a new kind of link and not a bigger one

There were two shapes:

| shape | what it is |
| --- | --- |
| `#p/<slug>/<code>` | a level |
| `#r/<slug>/<score>/<code>/<character>` | a reply: I beat your level, this fast, as this |

The obvious move is to hang the time off the end of `#p/`. It does not work. A
level code is base64url, and a run of digits is a perfectly good level code —
so there is no way to look at the last segment of a `#p/` link and know whether
it is a time or part of the level.

So: `#c/<slug>/<score>/<who>/<code>`, a sibling of `#r/`. Every `#p/` link ever
sent still means exactly what it meant.

## Reply and challenge are the same sentence to different people

A **reply** goes back to whoever made the level: they know it, they want to
know how you did. A **challenge** goes out to somebody who has never seen it.
The page already had the boast line for the first; the second uses it.

Which one the share button sends is not a setting — it is which situation the
page is in, as it always was:

| the level you are on | what sharing sends |
| --- | --- |
| one you made, or one of the six | a challenge, with your time |
| one somebody sent you | a reply, with your time and your creature |

So the six ship as passable challenges, and a chain of them each carries the
sender's own number.

## It carries a name, not a creature

A whole character is about 130 characters on top of the level. A reply pays
that because a reply is *about* the creature — you can play as the friend who
beat your level. Here the creature is a footnote to the number, so only its
name travels: measured, under 12 characters more than a plain level link.

The name is not decoration. A quick creature and a strong one are not racing
the same race, and "22 seconds" means nothing without knowing which.

## The time has to be the winning time

This is the part that was nearly wrong. The share button opens the moment you
have beaten the level and **stays** open — including on a fresh load, off a
proof kept from a previous day, with the clock at zero. Reading the clock would
have sent "beaten in 0s".

So the winning time is remembered when the win is established, from whichever
side established it:

- beaten just now → the score of the run that was just proved
- a proof from before → the proof **is** the run, so its length is how long it
  took: `replay()` already returns the tick count

With no winning time known, an ordinary `#p/` level link goes out. Never a
challenge with an invented number in it.

Verified in a browser end to end, on the hard case: plant a real winning log in
storage, load the level cold, share, and follow the link that comes out.
