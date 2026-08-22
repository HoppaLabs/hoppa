# 0055 — The bucket nobody could see

**Day 21. Accepted.**

## What was asked

> Can the wand put out fires, or at least make them cooler so they don't hurt?

## The answer, which is embarrassing

The game has had a bucket of water since roam/8. It was asked for in those
words — "a water bucket to put out the fires" — built, tested, and shipped. Then
calm/1, calm/2, swim/1, swim/2, swim/3 and raze/1 each copied the mechanism,
because hard rule 3 makes a new behaviour a new build rather than an edit, so
seven builds across four engines read `HELD_SWING` and put out the fire in front
of you.

**The button has never once been visible.** Not in roam/8, which exists because
a child asked for it.

Two separate things hid it, and either alone was enough:

1. `hasWater()` asked `engine === "roam" && version >= 8`. Written when roam was
   the only engine that doused, and never revisited as four more picked it up.
   A condition that names one engine is a condition that silently excludes the
   next five.

2. `#pad.one #swing, #pad.one #water { display: none; }`. The pad goes into
   `one` mode when there is one ACTION button, which is every top-down game —
   and the bucket was swept up with the weapon. This one hid it even in roam,
   where the first condition passed.

So the ability shipped four times and was unreachable every time, and it
surfaced from the far end: somebody with a bucket asking whether a wand could do
what the bucket already did.

## What changed

- The build question is a **table** in `src/web/play/water.ts`, and
  `test/water.test.ts` reads every engine's source to check the table matches
  what the engines actually do — in both directions, so a build that douses
  without an entry fails, and an entry without a douse fails too.
- `#pad.one` hides the weapon and not the bucket, which now sits in the corner
  the centred action button leaves free.

## ...and a third thing, found on the way

Turning it on in every engine that douses put a bucket of water on a lawn.

The engines all call it fire, and always will: `TILE_FIRE` is the index and it
is in every shipped log. But a world **draws** it as whatever that world has,
and only two of the six draw a flame:

| world | hazard | bucket? |
| --- | --- | --- |
| underground | a flame | yes |
| city | a flame | yes |
| outside (side-on) | metal spikes | no |
| reef | urchins | no |
| garden | a pond | no |
| beach | the sea | no |

So `Tileset` now carries a `hazard`, **required rather than optional** — a new
world cannot be added without somebody saying what its hazard is, which is
precisely what the condition this replaces failed at.

## What is still open

Two gaps, neither of them fixable without new engine builds, so neither is in
this change:

- **The side-on game has no bucket at all.** Not an oversight: from the side
  `HELD_ACT` is jump and `HELD_SWING` is the weapon, so there is no free bit.
  It needs a new held bit (`HELD_POUR`), a third button, and dash/9.

- **A pond, the sea and a bank of urchins have no answer.** A bucket is the
  wrong tool and there is no right one. The obvious candidate is the original
  question: **the wand**, which already freezes enemies, freezing water so a
  child can walk across it. That is the same verb the wand already has, it
  would give the wand a real job in three worlds, and it is a behaviour change —
  one new build per engine, and a decision to take deliberately rather than
  slide into.
