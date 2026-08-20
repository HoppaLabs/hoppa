import { expect, test } from "bun:test";
import { parseLevel } from "../src/core/level.ts";
import { hashHex } from "../src/core/hash.ts";
import { engineFor } from "../src/engines/registry.ts";
import { creatureFromBuild, type Build } from "../src/core/creature.ts";
import { starterSprite } from "../src/core/sprite.ts";
import { DashV2 } from "../src/engines/dash/v2.ts";
import {
  DashV3, downTicksFor, hitsToKillFor, killsFor, reachFor,
} from "../src/engines/dash/v3.ts";
import { REACH as ROAM_REACH } from "../src/engines/roam/v3.ts";
import {
  HELD_ACT, HELD_LEFT, HELD_RIGHT, HELD_SWING, STATUS_PLAYING,
} from "../src/engines/types.ts";
import { DASH2_LEVEL_TEXT, DASH3_LEVEL_TEXT } from "../src/core/fixtures.ts";

const armed = (build: Build, weapon: "sword" | "wand") =>
  creatureFromBuild("x", weapon, "@", build, starterSprite(), weapon);

/** Flat ground, one walker four cells to the right of the start. Nothing else. */
const ARENA = parseLevel([
  "hoppa/1 dash seed=0 tiles=1 behaviour=3",
  "#......................#",
  "#......................#",
  "#......................#",
  "#......................#",
  "#......................#",
  "#......................#",
  "#......................#",
  "#......................#",
  "#......................#",
  "#......................#",
  "#......................#",
  "#@...G................>#",
  "########################",
  "########################",
].join("\n") + "\n");

/** Walk at it and swing. Report what happened. */
function fight(weapon: "sword" | "wand", build: Build) {
  const engine = new DashV3(ARENA, armed(build, weapon));
  while (!engine.onGround()) engine.step(0);
  let status: number = STATUS_PLAYING;
  let killed = false;
  let froze = false;
  for (let t = 0; t < 900 && status === STATUS_PLAYING && !killed; t++) {
    status = engine.step(HELD_RIGHT | (t % 4 === 0 ? HELD_SWING : 0));
    if (engine.justKilled()) killed = true;
    if (engine.justFroze()) froze = true;
  }
  return { killed, froze, left: engine.enemiesLeft() };
}

// --- the weapon works here now ---------------------------------------------------

test("a sword kills from the side, and a wand freezes", () => {
  const strong: Build = { FORCE: 5, HASTE: 1 };
  const sword = fight("sword", strong);
  expect(sword.killed).toBe(true);
  expect(sword.left).toBe(0);

  const wand = fight("wand", strong);
  expect(wand.killed).toBe(false);
  expect(wand.froze).toBe(true);
  expect(wand.left).toBe(1);
});

test("the weapon means the same thing in both games", () => {
  const build: Build = { FORCE: 3, HASTE: 3 };
  // Same reach as from above: a child should not have to learn the distance twice.
  expect(reachFor(armed(build, "sword"))).toBe(ROAM_REACH);
  expect(killsFor(armed(build, "sword"))).toBe(true);
  expect(killsFor(armed(build, "wand"))).toBe(false);
  expect(hitsToKillFor(armed(build, "wand"))).toBe(0);
  expect(downTicksFor(armed(build, "wand")))
    .toBeGreaterThan(downTicksFor(armed(build, "sword")) * 2);
});

test("stomping still works -- swinging is another answer, not a replacement", () => {
  // Jump onto it rather than swinging, and it should still bounce off.
  const engine = new DashV3(ARENA, armed({ FORCE: 3, HASTE: 3 }, "sword"));
  while (!engine.onGround()) engine.step(0);
  let status: number = STATUS_PLAYING;
  let stomped = false;
  for (let t = 0; t < 900 && status === STATUS_PLAYING && !stomped; t++) {
    status = engine.step(HELD_RIGHT | (t % 24 === 0 ? HELD_ACT : 0));
    if (engine.justStomped()) stomped = true;
  }
  expect(stomped).toBe(true);
});

test("jump and swing are separate buttons: jumping alone never swings", () => {
  const engine = new DashV3(ARENA, armed({ FORCE: 5, HASTE: 1 }, "sword"));
  while (!engine.onGround()) engine.step(0);
  let status: number = STATUS_PLAYING;
  for (let t = 0; t < 200 && status === STATUS_PLAYING; t++) {
    status = engine.step(HELD_ACT);
    expect(engine.swinging()).toBe(false);
  }
});

test("a killed walker is gone: not drawn, not dangerous, not in the way", () => {
  const engine = new DashV3(ARENA, armed({ FORCE: 5, HASTE: 1 }, "sword"));
  while (!engine.onGround()) engine.step(0);
  let status: number = STATUS_PLAYING;
  for (let t = 0; t < 900 && status === STATUS_PLAYING && engine.enemiesLeft() > 0; t++) {
    status = engine.step(HELD_RIGHT | (t % 4 === 0 ? HELD_SWING : 0));
  }
  expect(engine.enemiesLeft()).toBe(0);
  expect(engine.enemyPositions()).toHaveLength(0);
  // TILE_GUARD is 7, TILE_GUARD_REELING is 8.
  for (const tile of engine.render()) expect(tile === 7 || tile === 8).toBe(false);

  const hpBefore = engine.health().hp;
  for (let t = 0; t < 400 && status === STATUS_PLAYING; t++) status = engine.step(HELD_RIGHT);
  expect(engine.health().hp).toBe(hpBefore);
});

// --- the older side-on builds are frozen ---------------------------------------------

test("dash/2 still has no weapon at all, and the swing bit does nothing there", () => {
  const creature = armed({ FORCE: 5, HASTE: 1 }, "sword");
  const play = (bits: number) => {
    const engine = new DashV2(parseLevel(DASH2_LEVEL_TEXT), creature);
    let status: number = STATUS_PLAYING;
    for (let t = 0; t < 500 && status === STATUS_PLAYING; t++) {
      status = engine.step(HELD_RIGHT | bits);
      expect(engine.swinging()).toBe(false);
    }
    return hashHex(engine.stateHash());
  };
  // Pressing swing in dash/2 must change nothing whatsoever.
  expect(play(HELD_SWING)).toBe(play(0));
});

test("all three side-on builds route", () => {
  for (const version of [1, 2, 3]) {
    const text = DASH3_LEVEL_TEXT.replace("behaviour=3", `behaviour=${version}`);
    expect(engineFor(parseLevel(text)).behaviourVersion).toBe(version);
  }
});

test("v3 replays identically three times over, with either weapon", () => {
  for (const weapon of ["sword", "wand"] as const) {
    const hashes: string[] = [];
    for (let run = 0; run < 3; run++) {
      const engine = new DashV3(parseLevel(DASH3_LEVEL_TEXT), armed({ FORCE: 2, HASTE: 4 }, weapon));
      let status: number = STATUS_PLAYING;
      for (let t = 0; t < 700 && status === STATUS_PLAYING; t++) {
        status = engine.step(
          (t % 180 < 90 ? HELD_RIGHT : HELD_LEFT) |
          (t % 25 === 0 ? HELD_ACT : 0) |
          (t % 11 === 0 ? HELD_SWING : 0),
        );
      }
      hashes.push(hashHex(engine.stateHash()));
    }
    expect(hashes[0]).toBe(hashes[1]);
    expect(hashes[1]).toBe(hashes[2]);
  }
});

test("the weapon changes the hash in v3 -- it is doing something", () => {
  const play = (weapon: "sword" | "wand") => {
    const engine = new DashV3(parseLevel(DASH3_LEVEL_TEXT), armed({ FORCE: 3, HASTE: 3 }, weapon));
    let status: number = STATUS_PLAYING;
    for (let t = 0; t < 700 && status === STATUS_PLAYING; t++) {
      status = engine.step(HELD_RIGHT | (t % 6 === 0 ? HELD_SWING : 0));
    }
    return hashHex(engine.stateHash());
  };
  expect(play("sword")).not.toBe(play("wand"));
});
