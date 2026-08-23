# 0075 — A flag is for a world that has not been given something better

**Accepted, day 23.** Reverses half of the flags decision:

> "I forgot about garden and beach put them back how they were"

## What went wrong

Two worlds had each been given their own way out, asked for by name:

> "we can use the sea chest on the beach levels as well"
> "the garden can have an exit, a cute wooden door actually"

Both were drawn, both shipped. Then, days later:

> "Maybe instead of doors and exits we should have flags that flutter, except
> for the city and underwater levels?"

That was read **literally** — two exceptions, everything else flies — and it
swept up the chest and the door along with the dungeon's oak. The sentence
names the two worlds whose exits had been discussed most recently; it does not
say "and throw away the other two you just drew."

The rule that should have been applied, and is now written down: **a flag is
for a world that has not been given something better.** Four of nine fly one.

## How long it took to notice

Days, and it was not noticed by looking. The table entries for the beach and
the garden stayed exactly where they were and simply stopped being reachable,
because `doorShape()` returns for a flagged world before it ever reads them.
Nothing crashed, no test failed, and the code went on saying in plain English
that the garden draws a wooden door.

`check:mutants` is what found it, in the only way anything could have: it
deleted the garden's door entry and **nothing broke**. A mutation that changes
nothing is code that does nothing. See `adr/0074` for the other half of that
run, where a test turned out to be unable to fail.

## What is guarded now

Three mutations, all caught:

| | |
|---|---|
| the garden's way out goes back to a padlocked oak door on the grass | the entry is live again, so deleting it fails `world-legibility` |
| the beach loses its sea chest and gets the dungeon's door | same |
| the garden is swept back onto the flag list | fails `way-out`, which is the mistake this ADR is about |

...and `test/way-out.test.ts` now lists four worlds that fly and four that were
given something better, rather than six and two.
