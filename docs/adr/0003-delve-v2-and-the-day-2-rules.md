# 0003 — Delve v2, and the rules day 2 had to invent

**Status:** accepted (day 2)

## Decision

Day 2 (treasure, an exit, a win screen, a turn counter) ships as a **new engine
build**, `src/engines/delve/v2.ts`, routed by the level's `behaviour=` field
through `src/engines/registry.ts`. `v1.ts` is untouched.

Four rules the spec does not state had to be chosen. They are recorded here
because they are now baked into behaviour version 2 and cannot be revised in
place:

| | Rule | Why |
|---|---|---|
| 1 | The exit is **shut until every treasure is collected** | Spec S13's L4 makes an unreachable treasure invalidate a level. That check only earns its place if treasure is mandatory; if it were optional, a stranded gem would be a shrug, not a defect. |
| 2 | **Every step is a turn** — moving, waiting, and bumping a wall alike | A turn counter you can cheat by walking into walls is not a counter. It also keeps `turns === log.length`, which day 9's replay verification depends on. |
| 3 | The turn cap is **999**, and hitting it is a loss | Spec S13's E4 demands termination but names no number. Spec S14's sim table has a median of 118 turns, so a player at 999 is lost or idle, and three digits keeps the HUD from reflowing. |
| 4 | A finished game is **absorbing**: further steps change nothing | Replaying a log past its winning move must land on the same hash as stopping there, or every result link from day 11 is a lie. |

## Why a new behaviour version rather than an edit

CLAUDE.md hard rule 3. v1 always returned `PLAYING`; v2 can win and lose, counts
turns, and hashes four more fields. That is a behaviour change in the strict
sense, so it gets its own build and its own number, and both ship in the bundle.

The cost is one duplicated movement loop — v2 does not import v1's step. That
duplication is the point: if v2's movement is ever tuned, v1 must not move with
it. Sharing the code would make an accidental edit invisible.

`levels/day1.lvl` still says `behaviour=1` and still routes to `DelveV1`, so the
day 1 golden vector replays byte-identically. There is now a second vector,
`test/golden/day2-win.json`, pinning a 136-turn win on `levels/day2.lvl`.

## Parsing and verifying are different questions

Spec S13 lists L1–L8 under `hoppa verify`, not under the parser, and day 2 made
that distinction load-bearing. `parseLevel` answers *"is this the right shape"*;
`verifyLevel` answers *"is this worth playing"*.

So a level with no exit **parses** and **fails L2**. That is what lets
`levels/day1.lvl` — which has no exit, because day 1 had no such concept — keep
parsing and keep replaying its golden vector, while still being correctly
reported as not a playable day 2 level.

The parser does still refuse a *second* start or exit, because a `Level` holds
one of each: that is a shape error, not a validity opinion.

The split paid for itself immediately. L4 caught a treasure sealed inside a
walled-off pocket while `levels/day2.lvl` was being drawn — a bug that would
otherwise have shipped as an unwinnable level.

## Consequences

- `TILE_COUNT` is 7. Cosmetics still never reach `stateHash()` (E10 covers v2).
- The collected-treasure mask is 8 bits, matching spec S8's solver cap.
  `DelveV2` refuses a level with more than 8 treasures rather than silently
  dropping the ninth; `verify` reports the same thing as L5.
- `stateHash()` for v2 covers position, turn, collected mask and status, in that
  order. **Append new state at the end, never in the middle.**
