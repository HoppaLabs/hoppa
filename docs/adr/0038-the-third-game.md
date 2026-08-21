# 0038 — The third game: underwater, from the side

**Status:** accepted (day 17)

`swim/1`. A fourth engine family. Free movement with momentum, drawn from the
side, and a breath you have to go up for.

## Who asked, and for what

Across several messages: *"we need an underwater level, that's the feedback"*,
then *"maybe we could try a whole other style other than from above, from the
side?"*, and finally, choosing between three shapes: **"swim and currents, like
Echo the Dolphin"**.

## Why it is an engine and not a tileset

Free movement in four directions is `roam`'s contract, and swimming is the same
contract — so the movement in `swim/1` starts as `roam/8`'s and says so. What is
not shared is everything round it: the level is drawn from the side, the frame
is rock with an open surface on top rather than a box, the paint rules differ,
and there is a thing that kills you which has nothing to do with enemies.

It is emphatically **not** a `dash` variant. Gravity-every-tick is the rule that
makes side-on levels mean anything — platforms, reachable heights, ladders, the
bot's whole route model. Let a player rise freely and all of it dissolves.

## What the wire format allowed — measured before anything was written

| field | width | used | what it meant |
| --- | --- | --- | --- |
| engine id | 4 bits | 4 of 16 | a fourth family cost **nothing** |
| tileset id | 4 bits | parsed, stored, **never read** | a third world cost **nothing** |
| entity kind | 3 bits | **7 of 8** | currents cannot be entities |

That last row is the one that shaped the plan. A current needs a direction; four
directions means four kinds, and exactly one value is left. But ladders are
already written *only* for `CLIMBING_ENGINES`, and the codec's own note says why:
the engine id sits ahead of the field, so *"adding ladders cost NOTHING for every
level and every link that already exists"*. Currents will be a swim-only field on
those terms, in `swim/2`.

## Air is up

> **Superseded on day 18 by `0042`.** The air is gone from `swim/3`. The
> argument below still describes `swim/1` and `swim/2`, which are shipped
> forever and still drown you. What it missed is that a child has to know there
> is a question before a direction can be an answer.


The one mechanic worth taking from Ecco, and the reason it is safe to take.

A breath meter is usually cruel: it punishes the child who explores slowly, and
it hides its own answer in air pockets somebody has to find. Ecco's does
neither, because **the answer is a direction**. The surface is the top of the
screen, it is always there, and "swim up to breathe" is understood before anyone
explains it.

It also gives the level's shape a question to ask, which is the whole job of a
hazard here: a room whose top is sealed with rock is tense, and a child authors
that by painting a line.

So the swim frame is the only frame in the game that **must be open somewhere** —
rock on three sides, and the top row left as water surface.

## The two meanings of "side-on"

`sideOn()` was one predicate doing two jobs, and got away with it because until
now "seen from the side" and "things fall" were the same set of one engine. Split:

- `sideOn()` — the **picture**: which tileset, whether there is a sky, which way
  the frame goes. `dash` and `swim`.
- `falls()` — the **rule**: platform depth, whether a spike needs footing,
  whether ladders exist, which router the bot uses. `dash` only.

## Measured

| | |
| --- | --- |
| coasting after letting go | 0.61 cells |
| first pair of constants tried (ACCEL 10, DRAG 4) | 0.28 cells — a walk that ends untidily |
| one breath | 600 ticks, 20 seconds |
| dive 8s, then rise 8s | row 12 and back to row 0, full breath, no hearts lost |
| drowning | one heart per 45 ticks, not eight at once |
| a reef level's link | 68 characters |

## The thing it does not do yet

**Currents**, and they are the reason it earns its keep. With free movement and
nothing pushing you, `HASTE` still buys speed but `FORCE` has no *routing* job
underwater — in `dash` strength buys jump height, which is what lets a strong
creature reach a ledge a fast one cannot. Nothing underwater is out of reach.

Currents give it back: a strong creature swims against the flow, a fast one goes
the long way round and still gets there first. That is what makes a shared water
level play differently for your friend's creature than for yours, which is the
premise of the whole game. `swim/2`.

## The practical reason this was affordable

The bot's `playFromAbove()` routes free movement, so it routes swimming nearly
unchanged. The pack stays verifiable and the editor's autoplay works on water
from the first day. A block-pushing engine — the other cut engine, `shove`,
whose slot is still reserved at index 1 — would have had none of that:
Sokoban is PSPACE-hard and no bot was going to route it.
