import { expect, test } from "bun:test";
import { isWall, parseLevel } from "../src/core/level.ts";
import { hashHex } from "../src/core/hash.ts";
import { engineFor } from "../src/engines/registry.ts";
import { BRUK, NIM, PELL, creatureFromCaps } from "../src/core/creature.ts";
import { starterSprite } from "../src/core/sprite.ts";
import { ONE, toCell } from "../src/core/fixed.ts";
import { BODY, RoamV2, hitsToKillFor } from "../src/engines/roam/v2.ts";
import { RoamV1 } from "../src/engines/roam/v1.ts";
import {
  HELD_ACT, HELD_LEFT, HELD_RIGHT, HELD_UP,
  STATUS_PLAYING, STATUS_WON,
} from "../src/engines/types.ts";

const ROAM1 = await Bun.file("levels/roam1.lvl").text();
const V2_TEXT = ROAM1.replace("behaviour=1", "behaviour=2");
const level = parseLevel(V2_TEXT);

/**
 * The level the bug was found on: a guard in a short side corridor, and a wide
 * open room to lure it into and then run away across.
 */
const LURE_TEXT = [
  "hoppa/1 roam seed=0 tiles=1 behaviour=2",
  "########################",
  "#@.....................#",
  "#......................#",
  "#......................#",
  "#......................#",
  "####################.###",
  "####################G###",
  "####################.###",
  "#......................#",
  "#......................#",
  "#.....................$#",
  "#......................#",
  "#.....................>#",
  "########################",
].join("\n") + "\n";

/** Every cell an enemy body covers, not just the one under its centre. */
function bodyInWall(lvl: ReturnType<typeof parseLevel>, e: { x: number; y: number }): boolean {
  for (const dx of [-BODY, 0, BODY]) {
    for (const dy of [-BODY, 0, BODY]) {
      if (isWall(lvl, toCell((e.x + dx) | 0), toCell((e.y + dy) | 0))) return true;
    }
  }
  return false;
}

// --- the bug ------------------------------------------------------------------

test("an enemy that gave chase never ends up inside a wall", () => {
  // v1's failure: the chase drags the enemy out of its corridor, and when it
  // loses interest it paces the corridor's LENGTH at whatever column the chase
  // left it in -- straight through solid rock. Reported from a real game.
  const lure = parseLevel(LURE_TEXT);
  // Not budget-legal on purpose: the probe has to survive long enough to watch.
  const probe = creatureFromCaps("probe", "Probe", { FORCE: 255, HASTE: 255 }, starterSprite());
  const engine = new RoamV2(lure, probe);

  let status = STATUS_PLAYING;
  let lured = false;
  let strayedFromCorridor = false;
  for (let t = 0; t < 2000 && status === STATUS_PLAYING; t++) {
    if ((engine.enemyPositions()[0] as { chasing: boolean }).chasing) lured = true;
    // Walk at it until it notices, then run and never come back.
    status = engine.step(lured ? HELD_LEFT : HELD_RIGHT);
    for (const enemy of engine.enemyPositions()) {
      expect(isWall(lure, toCell(enemy.x), toCell(enemy.y))).toBe(false);
      expect(bodyInWall(lure, enemy)).toBe(false);
      if (toCell(enemy.x) !== 20) strayedFromCorridor = true;
    }
  }

  // The test is only worth anything if the chase actually happened.
  expect(lured).toBe(true);
  expect(strayedFromCorridor).toBe(true);
});

test("an enemy dragged off its corridor walks back to it", () => {
  const lure = parseLevel(LURE_TEXT);
  const probe = creatureFromCaps("probe", "Probe", { FORCE: 255, HASTE: 255 }, starterSprite());
  const engine = new RoamV2(lure, probe);

  let status = STATUS_PLAYING;
  let lured = false;
  let home = false;
  for (let t = 0; t < 2000 && status === STATUS_PLAYING; t++) {
    if ((engine.enemyPositions()[0] as { chasing: boolean }).chasing) lured = true;
    status = engine.step(lured ? HELD_LEFT : HELD_RIGHT);
    const enemy = engine.enemyPositions()[0];
    // Once it has been lured out and given up, it should find its way back to
    // the column it was drawn in and stay there.
    if (lured && enemy !== undefined && !enemy.chasing && toCell(enemy.x) === 20) home = true;
  }
  expect(lured).toBe(true);
  expect(home).toBe(true);
});

test("no enemy body overlaps a wall on the shipped level, ever", () => {
  for (const creature of [BRUK, NIM, PELL]) {
    const engine = new RoamV2(level, creature);
    let status: number = STATUS_PLAYING;
    for (let t = 0; t < 1500 && status === STATUS_PLAYING; t++) {
      const held = (t % 5 === 0 ? HELD_ACT : 0) | (t % 200 < 100 ? HELD_RIGHT : HELD_UP);
      status = engine.step(held);
      for (const enemy of engine.enemyPositions()) {
        expect(bodyInWall(level, enemy)).toBe(false);
      }
    }
  }
});

// --- enemies die --------------------------------------------------------------

test("strength decides how many swings put an enemy down", () => {
  expect(hitsToKillFor(BRUK)).toBeLessThan(hitsToKillFor(NIM));
  expect(hitsToKillFor(PELL)).toBeLessThanOrEqual(hitsToKillFor(NIM));
  expect(hitsToKillFor(BRUK)).toBeGreaterThan(0);
});

test("an enemy you have killed is gone, and cannot be hit or hurt you again", () => {
  const arena = parseLevel([
    "hoppa/1 roam seed=1a1a tiles=1 behaviour=2",
    "########################",
    "#......................#",
    "#......................#",
    "#......................#",
    "#......................#",
    "#......................#",
    "#......................#",
    "#.@...G...............$#",
    "#......................#",
    "#......................#",
    "#......................#",
    "#......................#",
    "#.....................>#",
    "########################",
  ].join("\n") + "\n");

  const engine = new RoamV2(arena, BRUK); // one swing is enough
  expect(engine.enemiesLeft()).toBe(1);

  let status: number = STATUS_PLAYING;
  let killed = false;
  for (let t = 0; t < 600 && status === STATUS_PLAYING && !killed; t++) {
    status = engine.step(HELD_RIGHT | (t % 4 === 0 ? HELD_ACT : 0));
    if (engine.justKilled()) killed = true;
  }
  expect(killed).toBe(true);
  expect(engine.enemiesLeft()).toBe(0);
  expect(engine.enemyPositions()).toHaveLength(0);
  expect(engine.hunted()).toBe(false);

  // It stays gone, and the room stays safe.
  const hpBefore = engine.health().hp;
  for (let t = 0; t < 600 && status === STATUS_PLAYING; t++) status = engine.step(HELD_RIGHT);
  expect(engine.enemiesLeft()).toBe(0);
  expect(engine.health().hp).toBe(hpBefore);
});

test("a dead enemy is not drawn", () => {
  const arena = parseLevel([
    "hoppa/1 roam seed=1a1a tiles=1 behaviour=2",
    "########################",
    "#......................#",
    "#......................#",
    "#......................#",
    "#......................#",
    "#......................#",
    "#......................#",
    "#.@...G...............$#",
    "#......................#",
    "#......................#",
    "#......................#",
    "#......................#",
    "#.....................>#",
    "########################",
  ].join("\n") + "\n");
  const engine = new RoamV2(arena, BRUK);
  let status: number = STATUS_PLAYING;
  for (let t = 0; t < 600 && status === STATUS_PLAYING && engine.enemiesLeft() > 0; t++) {
    status = engine.step(HELD_RIGHT | (t % 4 === 0 ? HELD_ACT : 0));
  }
  expect(engine.enemiesLeft()).toBe(0);
  // TILE_GUARD is 7, TILE_GUARD_REELING is 8.
  for (const tile of engine.render()) expect(tile === 7 || tile === 8).toBe(false);
});

// --- v1 is frozen ---------------------------------------------------------------

test("roam/1 still plays exactly as it did: v2 is a new version, not an edit", () => {
  const v1level = parseLevel(ROAM1);
  const hashes: string[] = [];
  for (let run = 0; run < 3; run++) {
    const engine = new RoamV1(v1level, BRUK);
    for (let t = 0; t < 400; t++) engine.step(t % 3 === 0 ? HELD_ACT : HELD_RIGHT);
    hashes.push(hashHex(engine.stateHash()));
  }
  expect(hashes[0]).toBe(hashes[1]);
  expect(hashes[1]).toBe(hashes[2]);
  // Pinned: if this moves, a shipped roam/1 link has silently changed.
  expect(hashes[0]).toBe("e6aa9458");
});

test("both roam builds route, and a level says which one it wants", () => {
  expect(engineFor(parseLevel(ROAM1)).behaviourVersion).toBe(1);
  expect(engineFor(parseLevel(V2_TEXT)).behaviourVersion).toBe(2);
  expect(engineFor(parseLevel(V2_TEXT)).id).toBe("roam");
});

test("v2 replays identically three times over", () => {
  const hashes: string[] = [];
  for (let run = 0; run < 3; run++) {
    const engine = new RoamV2(level, NIM);
    let status: number = STATUS_PLAYING;
    for (let t = 0; t < 900 && status === STATUS_PLAYING; t++) {
      status = engine.step((t % 7 === 0 ? HELD_ACT : 0) | (t % 160 < 80 ? HELD_RIGHT : HELD_UP));
    }
    hashes.push(hashHex(engine.stateHash()));
  }
  expect(hashes[0]).toBe(hashes[1]);
  expect(hashes[1]).toBe(hashes[2]);
});
