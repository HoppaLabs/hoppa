# 0030 — The six rooms the game opens with

**Status:** accepted (day 16)

## What was there before

One level. `levels/day7.lvl`, the room the engines were developed against:
four gems, three guards, corridors one cell wide. It was never designed to be
played first — it was designed to make guards, corners and the treasure count
all happen at once so the engine could be tested. A child who taps a link,
draws nothing and presses go got that.

It is now room 6.

## What ships

Six rooms, in order, each one thing at a time:

| # | name | what it is for | game |
| --- | --- | --- | --- |
| 1 | first steps | pick the gems up, then the door opens | roam |
| 2 | the long way | the gems are not all on your way out | roam |
| 3 | four corners | plan a loop rather than chasing the nearest gem | roam |
| 4 | up and over | ladders go up, and gravity does the rest | dash |
| 5 | the tall room | three floors, ladders never above one another | dash |
| 6 | the gauntlet | pick the doorway nobody is walking through | roam |

Room 1 has no guards at all. Room 2 has no guards either — it teaches the
route. Guards first appear in room 3.

## They are levels, not a tutorial

Each one is shown as an ordinary `#p/<slug>/<code>` link and nothing else.
Tapping one in the list is the same act as tapping one in a message: same URL
shape, same page, same code path. **"Edit level" opens the room you are looking
at**, the six included, so every one of them is a starting point rather than a
thing you can only play.

That last part cost a small change: the editor link used to be wired only when
a level had arrived from a link, which would have made the front door the one
room in the game you could not open up. There is a test that fails if the guard
comes back.

The six are kept out of **played before** (`docs/adr/0026`), which now means
"levels somebody sent you". They have their own list, permanently; the same room
in both is furniture, and six shipped rooms would push every real one off the
end of a list six long.

## Reachability is not beatability

Spec §13's L3 and L4 flood-fill the open cells: can you reach the gems, can you
reach the door. They know nothing about guards, hearts, gravity or the
two-minute clock. A level can pass all five checks and still be a room nobody
gets out of.

So `tools/bot.ts` plays them. It drives the real engine, tick by tick, through
the same held-button mask a thumb produces, and has to actually finish. It
plays the way a child plays the first time — straight at the nearest gem, no
dodging, no waiting for a guard to turn round. Every room is beaten by all three
ready-made creatures, and **each winning run is then replayed cold**, which is
the same proof the share gate demands of a player.

A room the bot cannot finish is not necessarily unfinishable. It is a room too
hard to be one of the six the game opens with, which for this purpose is the
same answer. That is what killed the first draft of room 6: with three guards on
the only route, two of the three creatures died every attempt.

| room | Bash | Nim | Pell |
| --- | --- | --- | --- |
| 1. first steps | 13s | 6s | 9s |
| 2. the long way | 25s | 13s | 17s |
| 3. four corners | 19s | 10s | 14s |
| 4. up and over | 8s | 6s | 6s |
| 5. the tall room | 23s | 15s | 18s |
| 6. the gauntlet | 19s | 11s | 14s |

Those seconds are the closest thing to a difficulty score that can be measured,
and they are only comparable **within one game**: room 4 is quicker than room 1
without being easier, because a side-on room is walked at a different speed.
The test asserts the ordering per engine, not across both.

## Why the rooms look the way they do

Three of them are built out of the same skeleton — three walled bands with
one-cell gaps — and that is not a house style, it is L5.

A patrol runs until it hits a wall, so a guard is only short-cycled inside a
narrow shaft. Three walled rows with a gap, open corridor above and below,
gives a five-cell run and a period of exactly 8 — the most L5 allows. A guard
standing in an open room paces the whole room, and the check refuses it, as it
should: a 22-cell corridor is a 42-tick cycle no child could ever time.

Room 2 is the exception that proves it. It wanted to be a long snaking corridor,
and a long corridor is exactly where a guard cannot stand. It has no guards.

## Built from parts, not typed out

`tools/pack.ts` writes them. A 24×14 grid typed by hand is one miscounted column
from a level that will not parse, and there is no way to see the mistake in a
diff on a phone. The rooms are composed from `border`, `wallRow`, `line`, `box`,
and the width and height are checked on the way out.

It emits two things: the `.lvl` files under `levels/pack/`, which are the
source, and `src/core/pack.ts`, which is what the web build imports. The bundle
gets **codes, not level text** — six levels as text is about two kilobytes in
something a child downloads on mobile data; as codes it is under six hundred
bytes. A test re-encodes each `.lvl` and fails if the code in the bundle is not
the code on disk, because a level nobody checked is exactly what drift produces.

## What this does not change

Nothing about the engines, the codec or any shipped link. The six are levels
like any other level, on the newest behaviour of their engine (there is a test),
and every old link still runs on the build it was made with.
