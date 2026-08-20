# 0027 — Sound, and where it is not allowed

**Status:** accepted (day 15). Takes sound off the not-in-scope list in
`CLAUDE.md`, by decision.

## It was ruled out, and then asked for

`CLAUDE.md` listed sound among the things to not add and not design for. It was
asked for on day 15, so it is in — recorded here rather than quietly crossed
out, because the list is binding and this is the only way off it.

## Nothing is downloaded

Every noise is a couple of oscillators and an envelope. No audio files, so
nothing new to fetch, nothing new in the offline cache, and nothing new to
depend on — the same bargain as the QR encoder and the PNG writer.

| cue | what it is |
| --- | --- |
| treasure | two square notes up, 880 → 1320 |
| hurt | one sawtooth down, 300 → 90 |
| swing | a 45ms triangle blip |
| won | three square notes up |
| lost | three square notes down |

Quiet enough to sit under a room with other people in it. The swing is barely a
noise on purpose: it fires several times a second while a child holds the
button, and anything louder is a drill.

## Off until somebody asks

A link gets opened on a bus, in a waiting room, and at the back of a classroom.
A game that starts making noises on a stranger's phone is a game that gets
closed, so the default is silence and there is a **sound off / sound on** button
in the footer that remembers.

That default also solves a technical problem for free: a browser will not let a
page make a noise until somebody has touched it, and the tap that turns sound on
*is* that gesture. The `AudioContext` is built on the first cue rather than on
load, so a page that never makes a noise never makes one to be suspended.

Verified in a browser: **zero** oscillators started across two and a half
seconds of play with sound off.

## Where sound is not allowed

**No engine may know about it.** Hard rule 4 says cosmetics never touch
`stateHash()`, and an engine that knows about a noise is an engine whose
behaviour could come to depend on one — a shipped link would then replay
differently with the sound on.

So nothing is ever *reported*. Every cue is worked out by the play page,
comparing this frame's read-outs with the last:

```
treasure went up  -> treasure
a heart went down -> hurt
playing -> finished -> won or lost
```

There is a test that greps every file under `src/engines` and `src/core` for the
words that could only mean sound, and fails if any of them appears.

## The deciding is separate from the noise

`soundsFor(before, after)` is a pure function returning a list of cues. It is
where the bugs would be — "when should this make a sound" — so it is testable
without a browser, and tested for the cases that are easy to get wrong:

- the **last** heart is one noise, not the hurt and the loss on top of each other
- a win that takes the last treasure says **both**, because both are true
- restarting is not a theft: treasure going to zero and hearts refilling are silent
- "finished" is not an event — a run that is over does not keep sounding
- a turn-based level, which has neither hearts nor treasure, makes neither noise

The swing is the exception, and deliberately so: whether a swing *connected* is
state, but whether a child pressed the button is not, so that one is played
straight off the button press.

## Measured in a real browser

Walked a run with the spy attached to Web Audio; every oscillator that starts is
a noise somebody would have heard:

| heard | count | what it was |
| --- | --- | --- |
| sawtooth 300Hz | 6 | six hits taken — hearts went 8 → 2 |
| square 880Hz + 1320Hz | 1 each | one treasure |

Exactly the score, and nothing else.
