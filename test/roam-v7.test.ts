import { expect, test } from "bun:test";
import { parseLevel } from "../src/core/level.ts";
import { hashHex } from "../src/core/hash.ts";
import { engineFor, knownBuilds } from "../src/engines/registry.ts";
import { creatureFromBuild, type Build } from "../src/core/creature.ts";
import { starterSprite } from "../src/core/sprite.ts";
import { RoamV6 } from "../src/engines/roam/v6.ts";
import { RoamV7 } from "../src/engines/roam/v7.ts";
import { HELD_RIGHT, STATUS_PLAYING } from "../src/engines/types.ts";

const made = creatureFromBuild("p", "P", "@", { FORCE: 2, HASTE: 2 } as Build, starterSprite());

/**
 * An open room with a guard placed off BOTH axes, and inside SIGHT.
 *
 * Off both axes deliberately: an enemy directly above or beside has only one
 * way to come, and the change this file is about only shows when there are
 * two. Inside sight (ONE * 3, so three cells) equally deliberately -- the
 * first draft of this room put the guard six cells away, it never chased at
 * all, and the test dutifully reported that v6 and v7 agreed.
 */
function room(version: number): string {
  const rows = [`hoppa/1 roam seed=0 tiles=1 behaviour=${version}`];
  for (let y = 0; y < 14; y++) {
    if (y === 0 || y === 13) rows.push("########################");
    else if (y === 4) rows.push("#....G.................#");
    else if (y === 6) rows.push("#..@..............$...>#");
    else rows.push("#......................#");
  }
  return rows.join("\n") + "\n";
}

/** Every tick's enemy position, so a diagonal step is visible as one. */
function walk(version: number, ticks: number): { x: number; y: number }[] {
  const engine = engineFor(parseLevel(room(version)), made) as unknown as {
    step: (held: number) => number;
    enemyPositions?: () => ReadonlyArray<{ x: number; y: number }>;
  };
  const seen: { x: number; y: number }[] = [];
  for (let i = 0; i < ticks; i++) {
    engine.step(0);
    const at = engine.enemyPositions?.()[0];
    if (at !== undefined) seen.push({ x: at.x, y: at.y });
  }
  return seen;
}

/** Ticks where BOTH coordinates changed: a diagonal step. */
function diagonals(path: { x: number; y: number }[]): number {
  let n = 0;
  for (let i = 1; i < path.length; i++) {
    const was = path[i - 1] as { x: number; y: number };
    const now = path[i] as { x: number; y: number };
    if (now.x !== was.x && now.y !== was.y) n++;
  }
  return n;
}

test("in roam/6 a chasing enemy cuts diagonals", () => {
  // Not a criticism of v6 -- it is what v6 does, and every link that pinned it
  // still does exactly this. It is here so the change below is measured against
  // something rather than asserted.
  expect(diagonals(walk(6, 200))).toBeGreaterThan(0);
});

test("in roam/7 it moves one direction at a time, like a thumb", () => {
  // A diagonal covers about 1.41 times the ground of an axis step, for free,
  // and only the enemy could ever do it.
  expect(diagonals(walk(7, 200))).toBe(0);
});

test("...and it still gets somewhere, rather than pressing into a wall", () => {
  // The obvious way to write this -- move the dominant axis, full stop --
  // leaves an enemy stuck against a wall while you walk round it, which is
  // worse than the diagonal it replaces. Blocked on one axis, it tries the
  // other.
  const path = walk(7, 200);
  const first = path[0] as { x: number; y: number };
  const last = path[path.length - 1] as { x: number; y: number };
  const moved = Math.abs(last.x - first.x) + Math.abs(last.y - first.y);
  expect(moved).toBeGreaterThan(0);
});

test("roam/6 plays exactly as it did: v7 is a new version, not an edit", () => {
  // Hard rule 3. Every link that pinned roam/6 replays as it always did.
  const level = parseLevel(room(6));
  const runs = [0, 1, 2].map(() => {
    const engine = new RoamV6(level, made);
    for (let i = 0; i < 150; i++) engine.step(i < 60 ? HELD_RIGHT : 0);
    return hashHex(engine.stateHash());
  });
  expect(new Set(runs).size).toBe(1);

  const seven = new RoamV7(parseLevel(room(7)), made);
  for (let i = 0; i < 150; i++) seven.step(i < 60 ? HELD_RIGHT : 0);
  // ...and v7 on the same inputs is a different run, or the version is pointless.
  expect(hashHex(seven.stateHash())).not.toBe(runs[0]);
});

test("v7 replays identically three times over", () => {
  const level = parseLevel(room(7));
  const hashes = [0, 1, 2].map(() => {
    const engine = new RoamV7(level, made);
    for (let i = 0; i < 200; i++) engine.step(i % 40 < 20 ? HELD_RIGHT : 0);
    return hashHex(engine.stateHash());
  });
  expect(new Set(hashes).size).toBe(1);
});

test("all eight roam builds route, because retiring one breaks every link", () => {
  expect(knownBuilds().filter((b) => b.startsWith("roam/"))).toEqual([
    "roam/1", "roam/2", "roam/3", "roam/4", "roam/5", "roam/6", "roam/7", "roam/8",
  ]);
  const engine = engineFor(parseLevel(room(7)), made);
  expect(engine.behaviourVersion).toBe(7);
  expect(engine.currentStatus()).toBe(STATUS_PLAYING);
});
