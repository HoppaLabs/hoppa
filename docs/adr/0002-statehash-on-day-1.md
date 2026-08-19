# 0002 — `stateHash()` landed on day 1, not day 2

**Status:** accepted (day 1)

## Decision

`src/core/hash.ts` (FNV-1a 32) and a minimal `DelveV1.stateHash()` covering the
actor's position shipped on day 1, one day ahead of the day table in spec §16.

## Why

The day 1 deliverable includes the determinism CI check. That check is a grep —
it proves nobody *wrote* `Math.random`, but it cannot prove the engine actually
replays identically. Check E3 ("three replays of one log produce identical
hashes") needs something to hash, and without it the day 1 determinism work is
a lint rule with no test behind it.

It is roughly fifteen lines and no player-visible behaviour, so it does not
count as building day 2's win screen or turn counter early.

## Consequence

There is now a committed golden vector (`test/golden/day1-walk.json`) from day 1
rather than day 14. It is sacred under CLAUDE.md hard rule 6: if it fails, engine
behaviour changed — stop and flag it, do not regenerate.
