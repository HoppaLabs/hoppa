# 0050 — The city, and where the jaeger ended up

Day 19. Accepted. The open question was answered the next morning — see the end.

## What was asked for

"Did we ever do the city level, it should be user vs Kaiju, and one of the
default characters should be a jaeger, very slow but incredibly strong, the
user has to rescue people and get them to an evac zone whilst fighting the
kaiju. It will need a new sprite palette for the user."

## The city

Shipped in full, and it needed no new engine. **Rescue the people and get them
to an evac zone is what "pick the treasure up and the door opens" already is**
— so the city is `roam/8` with `tiles=6`, the second skin after the beach.

What changed is everything a child sees:

- **Streets.** Blocks of building with roads between them, so a room is a grid
  of corridors you can see along rather than a cave you feel your way through.
  That changes how a monster works in it: you see the kaiju coming from the end
  of a street, and the decision is which way to turn.
- **A cast of three** — a kaiju, a flying swarmer, a crawler on many legs.
- **People instead of gems.** They wave rather than spin. A person turning end
  over end is not somebody asking for help, and the first draft — the gem's own
  frames, recoloured — read as a doll being thrown.
- **An evac zone instead of a door.** A padlocked oak door is wrong twice over
  in a city: nobody rescues people through one, and there is no wall for it to
  be set into. The city's way out is a landing pad, grey while people are still
  out there and lit when the last one is aboard. One drawing for both states —
  a pad does not change shape, the lights come on.

The street tile has **no lane marking**, and that is the second draft. The
first had a dashed line down the middle of every tile, which is right for one
cell of a north-south road and wrong for every other: on an empty grid it came
out as corduroy, and in a room it put a vertical dash down the middle of every
horizontal street. A tile cannot know which way the road runs.

The shipped room puts every monster in a **one-cell alley through a block**,
and that is a rule rather than a look. Spec S8 caps a guard's patrol at eight
turns, which is a run of five cells; a city street is twenty-two. The first
draft had four fat blocks and open avenues, and all three monsters failed L5
with runs of twelve and twenty-two. An alley is exactly five — the street at
each end plus three cells through the block — which is the trick "the gauntlet"
already plays with its doorways, and it makes a monster something you meet at a
gap rather than something you watch approach for ten seconds.

## The jaeger, and the question

The jaeger is drawn, and it is on the **character shelf** rather than in the
preset stable. That is a measurement, not a preference.

There are two characteristics and six points. "Very slow but incredibly strong"
is `FORCE 5 / HASTE 1` — which is **Bash's build, exactly**. The only build
further out is `HASTE 0`, spending five points of six, and it is genuinely
distinct: speed 20 against Bash's 26, the slowest thing in the game.

So it was built, and then measured against the shipped rooms:

| build | rooms won (of 14) | lost |
|---|---|---|
| FORCE 5, HASTE 1 | 14 | — |
| FORCE 5, HASTE 2 | 14 | — |
| FORCE 5, HASTE 0 | **9** | four corners, the gauntlet, the narrow way, the garden, the beach |

A bot that never dodges loses five of the fourteen with it, dying with a full
purse and no hearts. A preset a child picks off the front page and then cannot
finish the shipped rooms with is a bad default, and `test/pack.test.ts` exists
to say so.

**So the request does not fit the current budget**, and per CLAUDE.md that is
flagged rather than worked around. Three ways forward, for a decision:

1. **Leave it on the shelf** (what ships today). A child starts from the jaeger
   sprite and spends its six points themselves. Costs nothing, and the mech is
   in the game.
2. **A fourth preset with Bash's numbers.** Honest about being a re-skin, and
   two identical characters in a four-chip picker is its own problem.
3. **Widen the budget** so a genuinely slower-and-stronger build exists — a
   third characteristic, or more points. That is a spec change and it touches
   the creature editor, so it is not a thing to do without asking.

The jaeger arrived with three companions — a kaiju, a dog and a frog — because
the shelf is four wide and a twenty-first character on its own leaves a hole in
the last row. A hole reads as a character that failed to load; it was reported
as one once already.

## Two measurements that caught art the eye passed

`tools/gallery.ts` measures a character's body colour against the swatch behind
it and refuses anything under 4:1. The jaeger's first draft used the slate the
city's own buildings are drawn in — 1.6:1, and simply invisible. The kaiju and
the dog failed the same check at 2.8 and 3.1. All three were fixed by moving one
step up the palette, and none of the three looked wrong to me before the tool
said so.


## The answer (day 20)

"I want the jaeger included as one of the default characters."

So **Vance** is the fourth preset, at `FORCE 5 / HASTE 1` — option 2 above. It
beats all fifteen shipped rooms with the bot, and four chips fit across a
360-pixel phone.

Vance and Bash therefore have the same numbers and differ in look and name,
which is most of what a preset is to a nine-year-old. Making them differ in
PLAY needs a third characteristic or a bigger budget, and that is a spec change
to take on purpose rather than smuggle in behind a character.
