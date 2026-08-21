# 0042 — The air comes out of the water

**Status:** accepted (day 18)

`swim/3`. You do not drown; you just swim. Everything else about the water is
untouched.

`swim/1` and `swim/2` are still shipped and still drown you. Hard rule 3: every
reef link already sent pins one of them and plays exactly as it did.

## Why

Asked for directly:

> I think we should remove the need for air in the underwater levels

The day after this, from a phone:

> In the underwater level the player character seems to randomly get hurt after
> passing a bubble, very odd?

The bubbles were innocent — they live in the renderer and no engine has ever
read one. It was the air running out at `AIR_TICKS` and a heart going every
`DROWN_TICKS`, announced by the engine as **"That hurt."**, the same three words
an urchin uses, on a tick with nothing anywhere near.

The page was made to say so — a labelled meter, "come up for air" when it turns
orange, "no air -- swim up!" for as long as it is true. That work stands and
still runs, because `swim/2` still exists. But it fixed the *reporting* of a
mechanic whose real problem was that it is a **clock**, and a clock is the one
thing that turns exploring a room into being chased out of it. Nothing else in
this game takes a heart for taking your time.

## What `0038` got right, and what it missed

`0038` argued for the breath meter and the argument was good:

> A breath meter is usually cruel: it punishes the child who explores slowly,
> and it hides its own answer in air pockets somebody has to find. Ecco's does
> neither, because **the answer is a direction**.

Both halves are true. The answer *is* a direction, and swimming up *does* work —
measured: air 40 → 600 in four seconds of holding up, no hearts lost. What the
argument missed is that a child has to know there is a question before a
direction can be an answer, and twenty seconds of silence is a long time to be
told nothing at all.

It also claimed the meter gives the level's shape a question to ask — "a room
whose top is sealed with rock is tense, and a child authors that by painting a
line". Nobody has authored one. The only room in the water is the reef, and its
top is open.

## What it cost, measured

The reef, played by the bot, before and after:

| creature | swim/2 | swim/3 |
| --- | --- | --- |
| Bash | won, 8/8 hearts | won, 8/8 hearts, 15s |
| Nim | **lost** — ran the 3600-tick cap out with all three gems picked | **won**, 4/4 hearts, 30s |
| Pell | won, 6/6 hearts | won, 6/6 hearts, 25s |

Removing it did not merely remove an annoyance: it made the room winnable by the
fast creature, which is half the point of having three of them.

Two minutes idle on the seabed now costs nothing, where it used to cost every
heart.

## What survives

Everything that made the water worth building.

**Momentum** — `ACCEL 4` against `DRAG 2`, the coast that makes swimming feel
unlike walking.

**Currents** — and they matter more now, not less. `0039` built them because
`swim/1` gave a strong creature no reason to exist underwater; that argument is
untouched, and with the air gone currents are the *only* thing that makes
`FORCE` a routing decision down there. The reef still has two ways to the deep
gem and they still favour opposite builds.

**Urchins, the sword, the gems, the door.** Unchanged.

## The mechanics of taking it out

`breath()` is simply **not defined** on `swim/3`.

The meter and both warnings ask the engine whether it has one — `breath?.()` —
so they switch themselves off for `v3` and stay on for `v2` with no branch
anywhere in the page. The bot's `breathingRoom()` does the same thing and needs
no change: it still surfaces the bot on a `v2` level a friend might send.

The diff against `v2` is the air and nothing else: four constants, two fields,
two constructor lines, one call, the `breathe()` method, **two `hashInt32`
lines**, and the read-out. Those two hash lines are why this had to be a new
behaviour version rather than an edit.

## The reef itself

Unchanged apart from the version it pins. Its deep gem was placed far enough
down that the trip back up was a decision rather than a formality; now it is
simply the long way to a gem, which is still a route worth having. What it
teaches is one thing shorter: *strength beats a current, speed goes round the
long way*.
