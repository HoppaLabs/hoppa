# 0054 — What a chasing creature looks like

**Day 21. Accepted.**

## What was reported

> I think the shark is facing the wrong way when it targets the player, and it
> seems to go browner for some reason?

Two bugs in one sentence, both in the eight lines that draw an enemy, and both
much wider than the shark.

## Browner

A creature that has noticed you was drawn with 28% of `#ff8a3d` mixed through
every one of its inks. That tint was chosen against a green goblin, where warmer
reads as angrier, and it was never looked at against anything cold. Through the
shark it produces:

| ink | as drawn | chasing |
| --- | --- | --- |
| outline `#0b0f14` | near black | `rgb(79,49,31)` — milk chocolate |
| body `#2b3a4a` | slate blue | `rgb(102,80,70)` — brown |

The outline is about a third of the lit pixels at sixteen across, so the whole
fish went brown. Rendered side by side against the reef's water, it is not
subtle and it is not arguable.

**The body is now left exactly alone and only the OUTLINE changes**, to
`#ff4d2e`. It reads at a glance on every cast in the game, it cannot muddy a
colour scheme it was not designed against, and a shark still looks like a shark.

Ink 5 is the outline in every cast by construction rather than by luck:
`tools/enemies.ts` writes the digit 6 on every edge pixel at emit time (see
adr/0051 and `test/inside-the-tile.test.ts`). There is a test that measures it
rather than trusting it — the darkest ink of every creature in the game is
asserted to be index 5.

The stun flash still mixes through everything, and should: stunned is not
"angrier", it is "hit by that", and washing the whole creature blue or white is
the signal.

## Facing the wrong way

The renderer mirrored an enemy on the `dir` its engine reports. `dir` is a
**patrol** field: it is set in the pacing branch, and no chase branch in any
engine touches it. So a shark that turned to come at you kept whichever way it
had been pacing and swam at you tail-first.

Asked whether the other engines had the same problem, they did, and worse. Only
one of the five real-time engines was drawing enemies the right way round:

| engine | what it emitted | so it was |
| --- | --- | --- |
| swim | `dir`, stale during a chase | wrong when chasing |
| roam | nothing | **always facing right** |
| calm | nothing | **always facing right** |
| raze | nothing | **always facing right** |
| dash | `dir`, maintained; walkers never chase | right |

A bear, a goblin, a bunny and a kaiju have never once turned around. They walked
left facing right for as long as those engines have existed, and only the shark
got reported — because a shark's snout is the most obvious thing in the game.

There is a second, quieter wrongness in the same field. `dir` is the direction
along the patrol's **own axis**, so on a vertical corridor it means up or down —
and mirroring on it flipped the sprite left-right according to whether the thing
was swimming up or down.

## The fix, and why it is not an engine change

Ask a different question: not "which way does the engine say it is pointing" but
**"which way did it just go"**. `src/web/play/facing.ts` remembers where each
enemy was last frame and compares.

That needs no engine to answer it. It is right during a chase, a patrol and a
walk home alike, it is right on a vertical corridor, and it fixes every engine
at once — including every build already shipped.

Doing it the other way would have cost a new engine version per engine.
`enemy.dir` is in `stateHash()` and it steers the patrol, so **setting it during
a chase changes behaviour** and hard rule 3 forbids that in place: every level
anybody has ever sent pins a build, and a movement tweak silently invalidates
every proof ever sent. Nothing in `facing.ts` reaches `stateHash` — hard rule 4
— so a proof from yesterday still replays.

## What this does not fix

While measuring the above, one more: `enemyPositions()` filters out dead
enemies, and the play page attaches guard ART by position in that filtered
array. So killing the first enemy shifts everyone's picture down a seat — the
kraken is drawn as a shark and the squid as a kraken. Confirmed, unreported, and
handled separately: it needs an identity on the read-out rather than a different
way of drawing.
