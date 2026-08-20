# 0031 — Taking hold of a ladder

**Status:** accepted (day 16)

## What was reported

Two things, a few minutes apart, both about the same ladder:

> the character falls when it gets to top of the ladder, so it's difficult to
> get off the ladder by hitting left or right

> Aligning on the stairs to go up is difficult as well to be honest, often
> overshooting or undershooting

They are separate faults with separate fixes, and only the second one needed a
new engine.

## The arithmetic underneath both

A cell is `ONE` = 256 subcells. A body is `BODY` = 96 either side of its
centre, so 192 across — three quarters of a cell. A ladder that comes up
through a hole in a floor is a **one-cell** hole.

A body 192 wide fits a hole 256 wide only within `(256 - 192) / 2` = **32
subcells** of the centre. That is a window 64 wide out of 256. A walking step
is 40 or more. So a player running at a ladder steps over the window about as
often as into it, presses up, climbs until their shoulders jam under the floor,
and slides back down.

Measured before the change, standing at each place a step could leave you
across the ladder's own cell: two of six climbed.

## Fault one: the ladder was the wrong length

A ladder whose top rung is level with the deck gives you nothing to hold at the
top. You climb until your body no longer overlaps a ladder tile, and the cell
you would then stand on is the hole the ladder came through — so there is no
floor either. You rise, lose the ladder, fall, catch it again. Traced: it
oscillates.

**Ladders now stand one rung proud of the deck they serve.** That is a level
fix, not an engine fix, and it is enforced where levels are built —
`Room.ladder(x, deckY, bottomY)` in `tools/pack.ts` draws from `deckY - 1`, so
it cannot be got wrong by counting.

## Fault two: you had to be aligned already — dash/5

Hard rule 3, so this is a new behaviour version. Every link that pinned
`dash/4` still runs `DashV4` and replays exactly as it always did; there is a
test that runs one and compares the hash.

**Pressing up or down while your middle is over a ladder puts you on it,
centred.** This is what Donkey Kong, Lode Runner, Montezuma's Revenge and
Prince of Persia all do, and it costs one assignment.

The window goes from 64 subcells to the whole 256: if the ladder is the cell
you are standing in, up climbs it.

### Pressing a direction means "step off", and it wins

The first version of this snapped whenever up was held. That is worse than the
bug it fixes: `moveSideways` runs before `moveVertically` within a tick, so the
snap dragged you straight back onto the ladder every time you tried to leave
it. You could climb a ladder and then never get off.

So the snap is skipped whenever left or right is held. Up alone climbs; up and
right steps off. There is a test that climbs a ladder and then leaves it.

### Two ladders touching

`ladderColumn` takes the one nearest the middle of you, and a tie goes to the
left. Not because either is better, but because a replay has to make the same
choice on someone else's phone a week later.

### It never snaps into a wall

A ladder tucked against a wall would otherwise shove you through it. The move
is checked with `fits` first, exactly like every other move.

## What this cost the bot

`tools/bot.ts` proves the six rooms are beatable. It had a workaround for fault
one — climb a bit more whenever stepping sideways goes nowhere — and a
separate one for the alignment, walking to within 30 subcells of a ladder's
centre before pressing up. Both are now doing nothing, and are kept only
because the bot must also play `dash/4` levels.

The real bug the change exposed was in the bot: `ladderFromHere` accepted any
ladder with a tile at the player's feet and open air above. Once ladders stand
proud of their deck, the ladder you have just climbed satisfies that — so the
bot walked back onto the ladder it was already standing on top of, forever, and
room 5 went from beaten to timed out. It now requires the next rung to exist.

That is the useful kind of test failure: the instrument was wrong, and it only
showed up because the thing it measures changed underneath it.
