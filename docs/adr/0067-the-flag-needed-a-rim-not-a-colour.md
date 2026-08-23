# 0067 — The flag needed a rim, not a colour

## The defect

The flag that replaced the door (adr/0066's neighbour, shipped the day before)
was painted:

    const FLAG_INKS_SHUT = ["#39485c", "#7c8899", "#6b7688", ...]

with the comment *"Bright, because it is the thing you aim at."*

`#39485c` and `#7c8899` are palette 2 and 3. The underground wall's ramp is
palette 0–4. The furled flag was painted in the dungeon wall's own colours, and
in a cave the exit read as a grey scratch on grey stone.

The comment and the colours disagreed and the colours won. It took looking at a
screenshot of a real room to notice, which is the second time this month that
the render caught something reading the code did not.

## The measurement, and the first wrong version of it

First attempt: take the worst contrast between a candidate cloth and *every ink
in the terrain ramp*, across the four worlds that fly a flag. It scored eight
candidates at 1.00 — including white, which is obviously fine.

Of course it did. Every ramp runs dark to light, so *something* in one always
matches any colour's brightness. But a flag does not stand in front of a ramp.
It stands in one open cell, on that world's floor, with the lit face of a wall
behind its top half; the dark end of the wall ramp is *inside a wall*.

Measured against that instead:

                        underground   outside   garden   beach
    white                      9.31      1.87     1.78    1.61
    gold (as shipped)          5.78      1.16     1.10    1.00
    blue                       2.22      1.90     1.24    1.10
    crimson                    1.96      1.68     1.10    1.24
    purple                     1.76      1.50     1.02    1.39

## Two conclusions, and the second one is the real one

**White wins for the furled flag** — half again better than anything else, and
the only candidate that cannot clash by hue because it has none, which is what
decides it when the four backdrops are grey stone, pale sky, green grass and
gold sand. It also says the right thing with no second drawing to learn: a
plain white flag hanging limp, and the same flag *gold* and flying.

**But read down the columns, not across.** Garden and beach are bad for
everything. Their floors are bright — `#6fd968` grass, `#ffc23d` sand — so any
cloth light enough to read on stone is lost on them. Gold scores 1.00 on a
beach because on a beach, gold *is* the floor. No choice of hue fixes that;
picking the best column-minimum would just have moved the failure.

So the cloth got the thing every enemy sprite has had since they were drawn and
the flag never did: **a rim**. A dark edge reads against a bright floor, a
bright cloth reads against a dark one, and one of the two always carries it —
in every world, in both states. The pole is dark wood for the same reason.

This is the same shape of fix as `rimmed()` in `tools/enemies.ts`. The flag was
simply never put through it.

## Cost

Cosmetic only: hard rule 4. `doorFrames()` and `doorInks()` already took the
world and the open/shut state, so nothing outside the renderer changed, and no
engine was told anything.

The flying flag's interior digit was freed up for the lighter gold, so the ring
that used to be the highlight is now the rim — the pattern gained an outline
without gaining an ink.
