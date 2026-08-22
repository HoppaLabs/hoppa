# 0060 — calm/4, raze/2, swim/5: the same body everywhere else

**Day 22. Accepted and shipped.** `NEWEST_BUILD` is now
`delve 5, roam 9, dash 9, swim 5, calm 4, raze 2`. Every older build still
routes and every link ever sent still replays.

## What was asked

The rest of the overnight brief that `0058` and `0059` started:

> For the gameplay and character control **all** the side and above games need
> work.

roam is the caves. calm is the garden and the beach. raze is the city. swim is
the reef. All four are looked down into, and three of the four had exactly
roam/8's movement, because they were copied from it.

## calm/4 and raze/2: roam/9's movement, unchanged

Acceleration and friction, normalised diagonals, the doorway assist, the swing
buffer, and being thrown rather than teleported. Character-for-character the
same code, because the change was right in roam and neither the garden nor the
city has any reason to walk differently.

Both worlds want the doorway assist **more** than the caves do:

- A garden is hedges and flowerbeds with gaps between them. It is nearly all
  doorway.
- A city is one-cell streets meeting at right angles, and the jaeger is the
  biggest thing in the game — so it is the build where being stopped by nothing
  looks silliest.

## swim/5: three things only, and the water untouched

**The reef is the one build nobody meant.** Swimming has had momentum since
swim/1 — holding builds speed towards a cap, letting go leaves you to the water,
and the gap between those two rates is the best feel in the game. None of that
is touched, and there is a test that walks swim/5 and swim/4 tick-for-tick
through push–coast–reverse and demands identical positions on all sixty ticks.

What swim shared with the others was invisible until measured:

| | swim/4 | swim/5 |
|---|---|---|
| Straight vs diagonal, 40 ticks | 3.78 vs **5.35** cells | 3.78 vs 3.80 |
| Worst near miss that still gets through a gap | 24 subcells | 96 |
| Swing pressed during a swing | dropped | remembered |
| Being hit | moved 1.90 cells in one tick | thrown over eight |

The diagonal bug was in the cap, not the acceleration: `pushed()` is applied per
axis with `cap = speed`, so holding two buttons allowed full speed on each. The
fix is one line — cut the cap to `181/256` of itself when both axes are held —
and it leaves swimming in a single direction bit-identical.

## Three copies of one change

Hard rule 3 forbids editing a shipped build, so roam/9's movement exists four
times over. Three copies is three chances for one of them to drift, and a test
that only ever exercises roam would never notice.

Two things guard that:

- **`test/topdown-weight.test.ts`** asserts the *contract* across roam/9, calm/4
  and raze/2 together — twelve tests, each looping over all three engines. If
  one copy loses a feature the failure names which engine.
- **Seven new mutations** in `tools/mutate.ts` aimed at the copies specifically
  (`calm/v4.ts`, `raze/v2.ts`, `swim/v5.ts`), including one that changes the
  reef's drift, to prove the "water untouched" test can actually fail.

## A test that had stopped being able to fail

Worth recording. Re-pinning the pack to roam/9 made the mutation *"enemies stop
moving at all"* — the day-17 bug, in `roam/v8.ts` — start **surviving**. It had
been caught for weeks by the bot beating the pack rooms, and moving the pack off
roam/8 quietly took that cover away while roam/8 stayed routed for every link
that pinned it.

**Retiring a build from the pack is not retiring it from the game.** There is
now an explicit test in `test/roam-v8.test.ts` that roam/8's guards walk.

Then it happened a second time, in the same afternoon and for a different
reason. `test/freeze-water.test.ts` built its rooms with
`version = newestBuild(engine)` — so the moment calm/4 and swim/5 landed, the
whole file walked off calm/3 and swim/4 and **four more mutations started
surviving**:

```
SURVIVED  frozen water never reaches the hash, so a proof stops proving
SURVIVED  ice never wears off, so a wand becomes a bucket
SURVIVED  only the cell in front freezes, so crossing costs a heart a square
SURVIVED  frozen ponds stay solid, so the garden's wand does nothing
SURVIVED  a sword freezes water too, so the wand has no job again
```

Nothing about those builds had changed. The tests had quietly stopped looking.
`WORLDS` in that file is now an explicit list of **both** the build that
introduced freezing and the newest one, and every test loops over all four.

The general rule, learned twice in one day: **`newestBuild()` is the wrong
default for a test of a behaviour that older builds still have.** It silently
re-points at whatever landed last, and the coverage it leaves behind goes with
it. Only `check:mutants` can see that happen — a green suite says the tests did
not fail, not that they could.

Two version tripwires also went red, both by design: `test/swim-v3.test.ts` and
`test/swim-v1.test.ts` each asserted `newestBuild("swim") === 4`. They are now
`> 3` and `>= 4` — the fact worth guarding is that the old build has been
superseded and still routes, and that does not need editing again on every
build.

## Proof

- 956 tests green.
- `test/swim-v5.test.ts` — 8 tests, including the tick-for-tick water guard.
- `test/topdown-weight.test.ts` — 12 tests across three engines.
- The bot beats all fifteen pack rooms with all four creatures.

## Where this leaves the brief

Every engine a player controls now has weight: delve is turn-based and has none
to have. dash/9 is the side-on game, roam/9 / calm/4 / raze/2 the top-down ones,
swim/5 the reef. That is the whole of "all the side and above games need work".
