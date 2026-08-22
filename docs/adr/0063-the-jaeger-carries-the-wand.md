# 0063 — The jaeger carries the wand

**Day 22. Accepted.** Vance's weapon changes; his numbers do not.

## The finding

Of the four creatures on the front page, **two were the same creature**. Bash and
Vance had byte-identical caps *and* the same weapon, so a child who picked the
robot instead of the cat got a different picture and an identical game.

It showed up as matching bot times in all fifteen shipped rooms, across all six
engines, in three separate runs:

```
1-first-steps    Bash 16s   Nim 10s   Pell 12s   Vance 16s
2-the-long-way   Bash 26s   Nim 14s   Pell 19s   Vance 26s
11-tall-rocks    Bash 33s   Nim 54s   Pell 44s   Vance 33s
```

Fifteen rooms, six engines, not one tick apart. That is not a coincidence, it is
a duplicate — and it had been sitting in plain sight in every bot table printed
this week.

## It was not an oversight

`0050` measured it and wrote the reasoning down. There are two characteristics
and six points; *"very slow but incredibly strong"* is five of strength and one
of speed, which is exactly what Bash already spends. `HASTE 0` was built and
tried, and it **lost nine of the fifteen rooms**, dying with a full purse and no
hearts. A character a child picks off the front page and then cannot finish the
pack with is a bad default.

So `0050` closed with:

> Making them differ in PLAY needs a third characteristic or a bigger budget,
> and that is a spec change to take on purpose rather than smuggle in behind a
> character.

## The weapon is neither

That sentence is right about the **caps** and it looked straight past the field
next to them. Every creature already carries a weapon. A child already picks one
when they draw a character. It costs **nothing** out of the six points.

It is not a third characteristic and it is not a bigger budget. It is the choice
the game already offers, made differently — so there is no spec change here, and
nothing is being smuggled.

## What it buys

A wand is not a worse sword. It never finishes anything (`killsFor` is false); it
**freezes** — three seconds at no strength, six at full, always from one wave —
and in the garden and the reef it freezes *water*, turning a pond into a bridge
and a bank of urchins into a floor.

So Vance clears a room by **making it safe** rather than by clearing it out,
which is what a machine built for containing giant monsters would do.

| | Bash | Vance |
| --- | --- | --- |
| swing a guard | it dies, and is gone | it freezes, and is still there |
| a pond in the way | walk round | freeze it and walk over |
| in the city | fires a laser | fires a **freeze ray** |

## It also settles a question asked weeks ago

> "It's weird for a jaeger to have a wand, so maybe we have a blue laser instead
> of a wand?"

`weaponArt()` has drawn exactly that since the day the city landed:
`raze` + `wand` → `coldlaser`. **The jaeger has been holding a freeze ray in the
city art all along; until now no default character could actually fire one.**

## The caps do not move

Deliberately. The measurement behind `FORCE 5 / HASTE 1` has not changed and
neither has the six-point budget. This is a weapon change, not a rebalance
smuggled in behind one.

## Proof

- `test/vance.test.ts` — seven tests, including the one that would have caught
  it: no two presets may match on `(FORCE, HASTE, weapon)`.
- Measured in a room with a guard: Bash's swing leaves **0** guards standing,
  Vance's leaves **1**, frozen.
- The bot still clears all fifteen rooms with him — though, as `0062` records,
  the bot never swings, so that is a proof of beatability and not of the wand.
- A mutation that puts the sword back.
