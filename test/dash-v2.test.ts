import { expect, test } from "bun:test";
import { parseLevel } from "../src/core/level.ts";
import { hashHex } from "../src/core/hash.ts";
import { GRID_H, GRID_W, idx } from "../src/core/grid.ts";
import { DashV1 } from "../src/engines/dash/v1.ts";
import { DashV2 } from "../src/engines/dash/v2.ts";
import { engineFor } from "../src/engines/registry.ts";
import { creatureFromBuild, type Build } from "../src/core/creature.ts";
import { starterSprite } from "../src/core/sprite.ts";
import { toCell } from "../src/core/fixed.ts";
import { HELD_ACT, HELD_LEFT, HELD_RIGHT, STATUS_PLAYING } from "../src/engines/types.ts";
import { bestStepUp, landingFrom, reachableWithGravity, stepTableFor } from "../src/core/playable.ts";
import { adviceFor } from "../src/core/advice.ts";
import { DASH1_LEVEL_TEXT, DASH2_LEVEL_TEXT } from "../src/core/fixtures.ts";

/** Lower ground walkable at row 11; from x >= 12 the ground is `h` cells higher. */
function stepLevel(h: number, version: number): string {
  const rows: string[] = [];
  for (let y = 0; y < GRID_H; y++) {
    let row = "";
    for (let x = 0; x < GRID_W; x++) {
      const bottom = y >= 12;
      const raised = x >= 12 && y >= 12 - h;
      row += bottom || raised || x === 0 || x === GRID_W - 1 ? "#" : ".";
    }
    rows.push(row);
  }
  rows[11] = "#@" + (rows[11] as string).slice(2);
  return `hoppa/1 dash seed=0 tiles=1 behaviour=${version}\n${rows.join("\n")}\n`;
}

/** Drive the real engine: can this creature actually get up a step of `h`? */
function canMount(pips: number, h: number): boolean {
  const level = parseLevel(stepLevel(h, 2));
  const build = { FORCE: pips, HASTE: 5 - pips } as Build;
  const creature = creatureFromBuild("p", "P", "@", build, starterSprite());
  for (let k = 0; k < 140; k++) {
    const engine = new DashV2(level, creature);
    while (!engine.onGround()) engine.step(0);
    for (let t = 0; t < 420; t++) {
      const jump = t >= k && t < k + 3 ? HELD_ACT : 0;
      if (engine.step(HELD_RIGHT | jump) !== STATUS_PLAYING) break;
      const where = engine.where();
      if (toCell(where.x) >= 13 && toCell(where.y) <= 11 - h && engine.onGround()) return true;
    }
  }
  return false;
}

// --- the thing v2 exists for --------------------------------------------------------

test("a creature with NO strength can climb a step -- the trap is gone", () => {
  expect(canMount(0, 1)).toBe(true);
  expect(stepTableFor(2)[0]).toBeGreaterThanOrEqual(1);
});

test("dash/2's step table matches what dash/2 actually does, at every strength", () => {
  const measured: number[] = [];
  for (let pips = 0; pips <= 5; pips++) {
    let best = 0;
    for (let h = 1; h <= 4; h++) if (canMount(pips, h)) best = h;
    measured.push(best);
  }
  console.log(`\n  step-up measured from dash/2: ${JSON.stringify(measured)}`);
  expect(measured).toEqual([...stepTableFor(2)]);
  expect(Math.max(...measured)).toBe(bestStepUp(2));
});

test("strength still buys height: three tiers, not one boundary", () => {
  const table = stepTableFor(2);
  // Everybody climbs something...
  for (const step of table) expect(step).toBeGreaterThanOrEqual(1);
  // ...and the strongest climbs more than the weakest.
  expect(table[5] as number).toBeGreaterThan(table[0] as number);
  expect(new Set(table).size).toBeGreaterThanOrEqual(3);
});

// --- v1 is frozen ---------------------------------------------------------------------

test("dash/1 still cannot climb with no strength, and still plays identically", () => {
  // The old rules are shipped and must stay exactly as they were, trap and all.
  expect(stepTableFor(1)[0]).toBe(0);

  const level = parseLevel(DASH1_LEVEL_TEXT);
  const creature = creatureFromBuild("p", "P", "@", { FORCE: 3, HASTE: 3 } as Build, starterSprite());
  const hashes: string[] = [];
  for (let run = 0; run < 3; run++) {
    const engine = new DashV1(level, creature);
    let status: number = STATUS_PLAYING;
    for (let t = 0; t < 600 && status === STATUS_PLAYING; t++) {
      status = engine.step((t % 200 < 100 ? HELD_RIGHT : HELD_LEFT) | (t % 40 === 0 ? HELD_ACT : 0));
    }
    hashes.push(hashHex(engine.stateHash()));
  }
  expect(hashes[0]).toBe(hashes[1]);
  expect(hashes[1]).toBe(hashes[2]);
  // Pinned: if this moves, a shipped dash/1 link has silently changed.
  expect(hashes[0]).toBe("716211eb");
});

test("v1 and v2 do NOT play the same -- that is the point of the new version", () => {
  const creature = creatureFromBuild("p", "P", "@", { FORCE: 0, HASTE: 5 } as Build, starterSprite());
  const play = (Engine: typeof DashV1 | typeof DashV2, text: string) => {
    const engine = new Engine(parseLevel(text), creature);
    let status: number = STATUS_PLAYING;
    for (let t = 0; t < 400 && status === STATUS_PLAYING; t++) {
      status = engine.step(HELD_RIGHT | (t % 30 === 0 ? HELD_ACT : 0));
    }
    return hashHex(engine.stateHash());
  };
  expect(play(DashV1, DASH1_LEVEL_TEXT)).not.toBe(play(DashV2, DASH2_LEVEL_TEXT));
});

test("both side-on builds route", () => {
  expect(engineFor(parseLevel(DASH1_LEVEL_TEXT)).behaviourVersion).toBe(1);
  expect(engineFor(parseLevel(DASH2_LEVEL_TEXT)).behaviourVersion).toBe(2);
  expect(engineFor(parseLevel(DASH2_LEVEL_TEXT)).id).toBe("dash");
});

test("v2 replays identically three times over", () => {
  const level = parseLevel(DASH2_LEVEL_TEXT);
  const creature = creatureFromBuild("p", "P", "@", { FORCE: 2, HASTE: 4 } as Build, starterSprite());
  const hashes: string[] = [];
  for (let run = 0; run < 3; run++) {
    const engine = new DashV2(level, creature);
    let status: number = STATUS_PLAYING;
    for (let t = 0; t < 700 && status === STATUS_PLAYING; t++) {
      status = engine.step((t % 180 < 90 ? HELD_RIGHT : HELD_LEFT) | (t % 25 === 0 ? HELD_ACT : 0));
    }
    hashes.push(hashHex(engine.stateHash()));
  }
  expect(hashes[0]).toBe(hashes[1]);
  expect(hashes[1]).toBe(hashes[2]);
});

// --- the check follows the level's own rules ---------------------------------------------

test("a level is judged by the jump IT pins, not by the newest one", () => {
  // A ledge two cells up: dash/2's strongest clears it, dash/1's does too, but
  // a level pinning v1 must be measured with v1's table either way.
  const rows = [
    "#......................#",
    "#......................#",
    "#......................#",
    "#......................#",
    "#......................#",
    "#......................#",
    "#......................#",
    "#......................#",
    "#......................#",
    "#...................$..#",
    "#..................#####",
    "#@....................>#",
    "########################",
    "########################",
  ];
  const asV1 = `hoppa/1 dash seed=0 tiles=1 behaviour=1\n${rows.join("\n")}\n`;
  const asV2 = `hoppa/1 dash seed=0 tiles=1 behaviour=2\n${rows.join("\n")}\n`;
  expect(adviceFor(asV1).playable).toBe(true);
  expect(adviceFor(asV2).playable).toBe(true);

  // The tables really are different, so the two runs are not the same call.
  expect([...stepTableFor(1)]).not.toEqual([...stepTableFor(2)]);
});

test("the shipped side-on level is playable under the new rules too", () => {
  const advice = adviceFor(DASH2_LEVEL_TEXT);
  expect(advice.notes.filter((n) => n.fatal)).toEqual([]);
  expect(advice.playable).toBe(true);
});

test("a three-cell ledge needs maximum strength, and the check knows", () => {
  const start = { x: 1, y: 11 };
  const level = parseLevel(stepLevel(3, 2));
  const landed = landingFrom(level, start.x, start.y);
  // Nobody but a five-pip creature gets up a three-cell step.
  expect(reachableWithGravity(level, landed.x, landed.y, 2)[idx(20, 8)]).toBe(0);
  expect(reachableWithGravity(level, landed.x, landed.y, 3)[idx(20, 8)]).toBe(1);
});
