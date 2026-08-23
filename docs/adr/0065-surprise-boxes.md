# 0065 — Surprise boxes

**Day 23. Accepted and shipped.** `dash/10` and `roam/10`; dash/9 and roam/9
stay exactly as they are and every link ever sent still replays.

## What was asked

> I also think we need surprises, like a question mark box in Mario — for
> example it gives you treasure or maybe unleashes an enemy. Kids will like
> surprising their friends. Not sure how we can implement that simply and if we
> have the space to do it?

then, after the first design came back:

> I want the author to decide if it's treasure or an enemy.

and:

> We need something equivalent for Zelda esque games.

## The space, measured

The question was "do we have the room". Measured rather than reasoned about,
which is this project's rule for the encoding budget:

| | |
|---|---|
| Cost per box | **~4 characters** for the first, ~3 each after |
| Cost to a level with no boxes | **zero** |
| Longest shipped level today | 107 characters (whole URL 156) |
| Real ceiling | **31 entities**, shared by start, exit, treasure, enemies, fire and boxes |

The first estimate given was "2 characters", from adding *fire* entities to a
large room. It is more than that, and the reason is worth writing down: **a box
is also a wall**, so it perturbs the run-length wall encoding on its way past.
Twelve bits of entity plus one of payload is a little over two characters; the
rest is the wall bitmap moving.

## The design that was rejected, and why

The first design derived the contents from the level's existing 32-bit seed and
the cell index. It cost **nothing at all** on the wire and every player of the
same link would have got the same surprise.

It was wrong, and the correction is the whole feature:

> a surprise the author cannot aim is a lottery, not a level

The point is the child who hides a bear behind the gem their friend is bound to
go for. That requires the author to choose, and a choice has to travel.

## The wire

`KIND_BOX = 7` — **the last of the eight kinds a 3-bit field holds.** There is no
ninth without a `CODEC_VERSION` bump, so this one was spent on purpose rather
than reached for.

It is also the first kind that carries a **payload**: one bit after the kind,
`0` = treasure, `1` = an enemy. That bit is read *only* when the kind just read
is a box, and no code made before today contains that kind — so no decoder ever
reaches for a bit that is not there. It is exactly the trick ladders used: put
the new field behind something already on the wire that says whether to expect
it.

The test that matters most asserts the thing that did **not** change: every
shipped level's code decodes and re-encodes to the byte it started on.

## Both kinds look identical in play

The engine emits `TILE_BOX` for a box with a gem in it and `TILE_BOX` for a box
with a bear in it. It has to — **a trap your friend can see coming is not a
trap.**

The **level editor** draws them apart, because the author is the one person
entitled to know: `TILE_BOX_ENEMY` exists, no engine ever emits it, and the
difference is one red stud instead of a gold one. That is precisely the line
hard rule 5 draws — the engine says "box", and who is allowed to know more than
that is a question about the screen, not about the game.

## Two ways to knock

| | how you open one |
|---|---|
| **dash/10** (Mario side) | jump into it from underneath, or swing |
| **roam/10** (Zelda side) | swing at the cell you are facing |

The head-bump is why a box overhead is worth drawing at all. It is technique,
not expression: hitting a block from below is how a platformer has worked since
the mid eighties. Every tile in this game is ours.

A swing opens one too, in both games, because a box on a ledge you cannot get
under would otherwise be a room nobody can finish. **A wand opens one exactly as
well as a sword** — the wand is the weapon that cannot finish anything, and
handing a child a weapon that also cannot open the box in the doorway would be a
mean joke. Opening is not killing; it is knocking.

## Three things that had to be got right

**A box is a WALL until it is opened.** That is the mechanic, not a detail: it
blocks the way, so you have to deal with it, and dealing with it is the gamble.
Everything asks through one `wallAt()`, the way raze/1 learned to when buildings
started coming down.

**The swing that opens a box must not also kill what comes out.** Measured: the
first version opened the box *first*, which put a freshly released enemy inside
the same swing's reach — one press opened the box and finished the bear, and the
bear arrived already down. A box you can defuse in the act of opening is a
button, not a gamble. The opener now runs **last**.

**A monster in a box is already in the room.** It is built at construction like
every other enemy and simply not let out yet. An engine that allocated one
mid-run would be an engine whose replay depended on *when* things happened, and
every enemy after it in the list would shift.

**A gem in a box is a gem** — it takes a treasure slot after the level's own and
counts toward the door. That is what stops boxes being decoration: a room can put
a gem in one and mean it, and the friend has to open the thing to get out.

## Proof

- `test/boxes-wire.test.ts` (8) — including every shipped code round-tripping
  unchanged, and the cost measured rather than claimed.
- `test/boxes.test.ts` (10) — across both engines, including that the two kinds
  render identically, that the releasing swing does not kill, and that dash/9
  and roam/9 have never heard of a box.
- Eight new mutations.
- The bot beats all fifteen pack rooms with all four creatures on both new
  builds.

## Two test bugs worth recording

Both mine, both the same shape — a test that failed while the code was fine:

- **The weapon is a different button in the two games.** From above the action
  button *is* the weapon; from the side it is JUMP and the weapon has its own.
  Swinging with `HELD_ACT` in a platformer makes the creature hop, so every dash
  case failed and the boxes were fine.
- **A one-tick tap is a hop.** dash/9's jump cut gives about a third of the rise
  for a tap, which does not reach a box two rows up. The head-bump test tapped,
  and read as the bump not working — the same trap that cost three wrong guesses
  in `0058`.
