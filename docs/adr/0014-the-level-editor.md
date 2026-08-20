# 0014 — The level editor

**Status:** accepted (day 10)

## Decision

A third page, `/level/`. Draw a room on the 24×14 grid, put things in it, tap
**play it**. Beat it and the share gate hands you a link and a QR code, exactly
as it does for a level somebody sent you.

Tools, in the words on the buttons: **wall**, **clear**, **start**, **door**,
**treasure**, **enemy**, and **ladder** for the side-on game. Two game buttons:
**from above** and **from the side**.

## How the level gets from the editor to the game

Through the URL fragment — the same route a shared level takes:

```
/level/   →  play it  →  /#p/<name>/<code>
```

There is no handoff to invent and no second storage format. "Play the level I
just drew" and "play the level my friend sent me" are the same code path, which
means the share gate, the replay, the win screen and the QR all work on a drawn
level without a line written for them.

The reverse direction is the remix loop. On a level somebody sent you, the
editor link reads **change this level** and opens `/level/#from/<code>` — their
rooms, your walls, your creature. This is the strongest argument for keeping the
level in the link rather than on a server: a level you received is a level you
can take apart.

## What the editor does and does not promise

Rules enforced while drawing — the ones that keep a draft *drawable*:

- one start and one door, and they move rather than multiply
- neither can be painted over (you are told which tool moves it)
- at most 8 treasure and 10 enemies, with a live counter on the button

Everything else is **advice**, in plain sentences, one at a time:

> you cannot get from the start to the door — there is a wall in the way
> a guard has too long a corridor to march up and down — shorten it to five squares or fewer

Three states, three colours: red stops you playing (and greys out **play it**),
amber is worth knowing, green is "looks playable, try it and see".

**The editor does not promise a level is winnable.** Reachability here is a
flood fill: it knows about walls and nothing about jumping, so it cannot tell a
side-on player that a gap is too wide. That is fine, because **the share gate is
the real filter** — you cannot send a level you have not beaten. The checks are
here to save a wasted attempt, not to replace the gate. A gravity-and-guard-aware
playability check has now been wanted three times (days 3, 4 and 8) and deserves
its own day.

## Layout

One flexible column that becomes two when the width can hold both — measured,
not keyed to device names. A phone in portrait gets the level on top and the
tools under it; a tablet, or a phone turned sideways, gets the tools beside the
level. The canvas is sized from the space the tools actually leave, read off the
DOM, so it does not go wrong when a reader has forced a larger font.

Dragging paints walls, clear and ladders — that is how you draw a room. A start,
a door, treasure and enemies are placed one tap at a time, because dragging them
would scatter them under a finger.

## Rejected

**A blank sheet to start from.** A kid who taps "make a level" and sees nothing
has to be told what a level is. A room with a wall round it and a door in it is
something you start drawing on.

**Storing the draft as its own format.** It is 336 glyphs and the engine's own
header. `draftToText()` produces a real `.lvl`, and everything downstream —
parser, codec, checks, engines — is the code that was already there.
