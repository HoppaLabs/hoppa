# 0045 — The garden grows teeth

**Status:** accepted (day 18)

`calm/2`. The garden becomes a level: an exit, a bear that hunts you, a sword
to answer it — and bunnies and squirrels that do neither.

`calm/1` is still routed and still a place. Hard rule 3: every garden link
already sent pins it.

## What was asked for

> In the garden game the bunny, bird and squirrel should just wonder not attack
> or follow, and no weapons should be used, and the garden needs an exit

and then, a few minutes later:

> In the garden we'll have a bear as an enemy, so we need the weapons back.

## It stops being a place

`0040` argued that a garden is somewhere to be rather than a room to escape,
and everything followed from that: no exit, no win, no loss, no clock, no
weapon, no share gate. A garden with a **way out**, a thing that **hunts** you
and a **sword** is not that. It is a level wearing a garden.

So `aPlace()` takes a version now. `calm/1` is a place; `calm/2` gets hearts, a
clock, a win, a loss and the gate, like every other level.

Derived from `roam/8` rather than from `calm/1`, because what it needed back
was everything `calm/1` took out.

## The bear takes the guard slot

Offered the choice, the answer was to spend nothing on the wire:

> Bear takes the "guard" slot

`G` is already the one that hurts you in every world — a goblin below ground, a
shark in the water. So the bear is what `G` draws in a garden, kind 7 stays
free, and no link ever sent changes meaning.

**The cost is the bird.** Three slots, three creatures, and the bear wanted one.

## What is genuinely new, and it is new to the whole project

**Which creature it is now decides what it does.**

Everywhere else the three enemies "walk, chase and die exactly alike — what
changes is what a child sees walking towards them", and `level.guardArt` has
only ever picked a drawing. In this garden:

| | |
| --- | --- |
| `G` bear | hunts you, hurts you, and can be fought |
| `B` bunny | wanders, and is not part of the fight at all |
| `D` squirrel | the same |

A bunny you can kill with a sword is not a bunny. A bunny that chases you is
not one either. There is no way to have both a thing that hunts and things that
do not while all three are one entity kind.

The art field is load-bearing **here and nowhere else**. It is level data, it
is fixed for the life of a level, and it travels in the link — so a run still
replays identically for everybody, which is the property that actually matters.
The old sentence was a design choice, not a rule, and a new build is the only
place a choice like that may change.

## Three things found by measuring rather than by reading

**The bot went blind.** All three creatures collected every flower; two walked
out and Nim "ran out of ticks". The exit tile read `7` — `TILE_GUARD`. A bunny
had wandered onto the gate, an actor's tile index overwrites the cell it stands
on, and `goal()` looked for the exit in the *render*. So the bot had nowhere to
route to and stopped dead. It takes the exit off the level now. **This could
have happened in any room, to any build, at any time**: a guard pausing on a
door for one tick was all it needed.

**The bunnies were hunting.** Hearts came out at 1/8, 2/4, 1/6 — and stayed at
exactly those numbers wherever in the room I put the bear, which is what said
the bear was never what was hurting them. The cause was mine: an edit script
asserted its way to a failure *before* writing the file, so the two guards it
was adding were never saved and only the later script's edits landed. Now every
edit is read back out of the file and checked.

**A bridge charged you a heart.** `fits()` lets you walk onto a bridged pond —
that is what a bridge is for — and `touchFire()` then took a heart for it,
every `MERCY_TICKS`, for as long as the crossing took. Only visible once the
garden had damage in it at all.

## The test only exists because a mutation survived

`tools/mutate.ts` was given the one-line deletion that lets a bunny hurt you.
The whole suite stayed green. `test/calm-v2.test.ts` is what closed it, and it
checks the thing rather than the code: twenty seconds of walking into each
creature, and how many hearts are left.
