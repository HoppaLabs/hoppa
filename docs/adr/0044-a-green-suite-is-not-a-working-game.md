# 0044 — A green suite is not the same as a working game

**Status:** accepted (day 18)

Two tools and one pattern, in answer to:

> This is a pretty basic thing to miss, can we devise any tests for this kind
> of thing?

It was basic. "Be more careful" is not a fix, so this is what replaced it.

## The nine misses, and why the suite was green

| | why green |
| --- | --- |
| enemies never moved (`dash/1`–`6`) | nobody asserted the obvious |
| the garden shipped with a working sword | nobody asserted the obvious |
| the reef shipped with no creatures | nobody asserted the obvious |
| an enemy in mid-air froze (`dash/7`) | the fix's own test picked examples, not the space |
| "reach lifts a gem from further away" | the assertion could not fail |
| the editor was dead on load | no test ever boots a page |
| the garden's play button was off | no test ever boots a page |
| a lizard in the underwater palette | no test ever boots a page |
| drowning said "That hurt." | nobody reads the strings |

Three causes, not nine bugs.

## 1. Nobody asserts the obvious → `test/liveness.test.ts`

"Does the thing that is supposed to move, move?" is too obvious to write down,
so nobody wrote it, and it was false for six behaviour versions.

The file does not pick examples. It walks the **cross-product** — every engine
at its newest build × every enemy glyph × every kind of spot a child can drop
one into — and asserts the few things that must be true of all of them. A new
engine or a new creature is covered by existing.

**It measures escaping the starting cell, not distance travelled.** That
distinction is the whole file. A walker with nothing under it flipped its
facing thirty times a second and stood still; a walker sealed in a one-cell box
shuffles a tenth of a cell each way before its leading edge finds the rock, and
that is correct. *Distance travelled cannot tell those apart. Leaving the cell
can.*

Verified against the real bugs rather than assumed:

| | cells visited | |
| --- | --- | --- |
| `dash/6`, enemy on the floor | 1 | **red** |
| `dash/6`, enemy on a ledge | 1 | **red** |
| `dash/7`, enemy in mid-air | 1 | **red** |
| `dash/8`, enemy in mid-air | 22 | green |

It caught two things on its first run. One was my own assumption — I penned an
enemy left and right, which only pens it in a side-on game; a top-down one
walks out through the top. The other was that a walker on a one-cell pillar
never leaves it, which **is correct** — the ledge rule stops it stepping off,
and a one-cell pillar is nothing but ledge. That case is now written down with
its reason, so nobody rediscovers it and "fixes" it.

## 2. An assertion that cannot fail → `bun run check:mutants`

A green suite says the tests did not fail. It does not say they *could*.

`tools/mutate.ts` holds nine one-line edits, each re-creating a defect this
project has shipped or nearly shipped. It applies each, runs the suite, and
requires it to go **red**. A mutation that survives is a hole, and the report
names the file.

It found two on its first run, and both were real:

- **`FLOW_PUSH = 0` in `swim/3` left the suite green.** Every currents test
  hardcodes `behaviour=2`, so the build every new level is now drawn under had
  nothing checking that its water goes anywhere — and with the air gone
  (`0042`), currents are the *only* thing making strength a routing decision
  underwater. Fixed by `test/swim-v3.test.ts`.

- **Hard rule 4 was guarded on 3 builds out of 25.** Adding
  `hashInt32(h, this.level.tilesetId)` to `roam/8`'s `stateHash()` left the
  suite green. E10 — the rule's test — was written on day 3 and covers
  `delve/1`–`3`, the *retired* engine. Everything built since was unguarded.
  If the art a level is drawn with could move its hash, improving a tileset
  would silently invalidate every proof ever sent: the damage hard rule 3
  exists to prevent, arriving by a different door. Fixed by
  `test/hard-rule-4.test.ts`, which reads the registry so a new engine is
  covered by being registered.

A third finding was about the tool itself. The first hard-rule-4 mutation was
`TILE_TREASURE = 4 as number`, which changes nothing — it survived, correctly,
and told me only that I had written a mutation that does not mutate. **A
mutation that cannot break anything is the same mistake as a test that cannot
fail.**

Kept out of `bun run check`: it runs the whole suite once per mutation, so it
is 30 seconds against 4. It runs in CI, where 30 seconds is nothing.

## 3. No page ever boots → the typecheck, and lifting decisions out

The crash class is already covered: `check:types` arrived with `0041` and
catches `ReferenceError: sideOn is not defined` exactly, which is what shipped
a dead editor past 683 passing tests.

The *logic* class needs a pattern rather than a tool: **lift the decision out
of the DOM module so it can be read without a browser.**
`src/web/level/palette.ts` and `src/web/play/breath.ts` are the two worked
examples — what every button says in every world, and what to say about the air
and when. Both were unreachable by any test while they lived inside a page.

## The habit underneath all three

**When a measurement and the screen disagree, check the measurement.**

The near-miss that prompted this: a first pass measured where an enemy started
against where it ended and reported goblins on ledges as `STUCK`. They had
paced back. Trusting it would have meant "fixing" working code and never trying
mid-air, which was the actual fault.
