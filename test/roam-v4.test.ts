import { expect, test } from "bun:test";
import { parseLevel } from "../src/core/level.ts";
import { hashHex } from "../src/core/hash.ts";
import { engineFor } from "../src/engines/registry.ts";
import { creatureFromBuild, type Build } from "../src/core/creature.ts";
import { starterSprite } from "../src/core/sprite.ts";
import { RoamV3 } from "../src/engines/roam/v3.ts";
import { ENEMY_SPEED, RoamV4, heartsFor, speedFor } from "../src/engines/roam/v4.ts";
import { ENEMY_SPEED as V3_ENEMY_SPEED } from "../src/engines/roam/v3.ts";
import { HELD_ACT, HELD_LEFT, HELD_RIGHT, HELD_UP, STATUS_PLAYING } from "../src/engines/types.ts";
import { ROAM3_LEVEL_TEXT, ROAM4_LEVEL_TEXT } from "../src/core/fixtures.ts";

const BUILDS: Build[] = [0, 1, 2, 3, 4, 5].map(
  (force) => ({ FORCE: force, HASTE: Math.min(5, 6 - force) }) as Build,
);
const made = (build: Build) => creatureFromBuild("p", "P", "@", build, starterSprite());

/** A wide corridor with one enemy, for testing getting away from it. */
const CORRIDOR = (version: number) =>
  [
    `hoppa/1 roam seed=0 tiles=1 behaviour=${version}`,
    "########################",
    "#......................#",
    "#......................#",
    "#......................#",
    "#......................#",
    "#......................#",
    "#..........@......G....#",
    "#......................#",
    "#......................#",
    "#......................#",
    "#......................#",
    "#......................#",
    "#.....................>#",
    "########################",
  ].join("\n") + "\n";

// --- the trap v4 exists to remove -------------------------------------------------

test("every creature you can build outruns an enemy", () => {
  // v3's enemies walked at 30 and the strongest build at 26, so a creature that
  // spent its points on strength could never break away -- strength bought
  // hearts and took away any way of using them.
  for (const build of BUILDS) {
    const speed = speedFor(made(build));
    expect(speed).toBeGreaterThan(ENEMY_SPEED);
  }
  // The slowest build is only just faster; the fastest is far faster. Speed
  // still decides HOW easily you get away, not whether you can.
  const slowest = Math.min(...BUILDS.map((b) => speedFor(made(b))));
  const fastest = Math.max(...BUILDS.map((b) => speedFor(made(b))));
  expect(slowest / ENEMY_SPEED).toBeLessThan(1.3);
  expect(fastest / ENEMY_SPEED).toBeGreaterThan(2);
});

test("v3 really did have a build slower than its enemies, which is the point", () => {
  const slowest = Math.min(...BUILDS.map((b) => speedFor(made(b))));
  expect(slowest).toBeLessThan(V3_ENEMY_SPEED);
  expect(V3_ENEMY_SPEED).toBeGreaterThan(ENEMY_SPEED);
});

/** Walk into the enemy until it lands a hit, then run and count what follows. */
function escape(version: number, build: Build) {
  const Engine = version === 3 ? RoamV3 : RoamV4;
  const engine = new Engine(parseLevel(CORRIDOR(version)), made(build));
  let status: number = STATUS_PLAYING;
  const max = engine.health().max;
  for (let t = 0; t < 400 && status === STATUS_PLAYING && engine.health().hp === max; t++) {
    status = engine.step(HELD_RIGHT);
  }
  const afterFirst = engine.health().hp;
  for (let n = 0; n < 300 && status === STATUS_PLAYING; n++) status = engine.step(HELD_LEFT);
  return { max, extra: afterFirst - engine.health().hp, left: engine.health().hp };
}

test("after a hit, every build can get away alive", () => {
  // Reported from real play: "the player dies too quickly and the enemies move
  // too quickly". The cause was here -- you are thrown two cells, and at 30 an
  // enemy covered that in 0.6s, well inside 1.7s of mercy, so it was on you the
  // instant mercy ended and hearts came off in a chain.
  for (const build of BUILDS) {
    const out = escape(4, build);
    expect({ build, left: out.left > 0 }).toEqual({ build, left: true });
    // Not trivial either: getting clear still costs something sometimes.
    expect(out.extra).toBeLessThanOrEqual(2);
  }
});

test("...and in v3 several builds died doing exactly that", () => {
  const died = BUILDS.filter((build) => escape(3, build).left <= 0).length;
  expect(died).toBeGreaterThan(0);
});

test("hearts start at three, not two", () => {
  // Two meant a creature that spent everything on speed died to two touches,
  // and the first is nearly free while you are still learning the room.
  expect(heartsFor(made({ FORCE: 0, HASTE: 5 } as Build))).toBe(3);
  expect(heartsFor(made({ FORCE: 5, HASTE: 1 } as Build))).toBe(8);
  for (const build of BUILDS) expect(heartsFor(made(build))).toBeGreaterThanOrEqual(3);
});

test("strength still buys hearts, one for one", () => {
  const hearts = BUILDS.map((b) => heartsFor(made(b)));
  for (let i = 1; i < hearts.length; i++) {
    expect((hearts[i] as number) - (hearts[i - 1] as number)).toBe(1);
  }
});

// --- the older builds are frozen ----------------------------------------------------

test("roam/3 plays exactly as it did: v4 is a new version, not an edit", () => {
  const level = parseLevel(ROAM3_LEVEL_TEXT);
  const creature = made({ FORCE: 3, HASTE: 3 } as Build);
  const hashes: string[] = [];
  for (let run = 0; run < 3; run++) {
    const engine = new RoamV3(level, creature);
    let status: number = STATUS_PLAYING;
    for (let t = 0; t < 600 && status === STATUS_PLAYING; t++) {
      status = engine.step((t % 5 === 0 ? HELD_ACT : 0) | (t % 160 < 80 ? HELD_RIGHT : HELD_UP));
    }
    hashes.push(hashHex(engine.stateHash()));
  }
  expect(hashes[0]).toBe(hashes[1]);
  expect(hashes[1]).toBe(hashes[2]);
  expect(V3_ENEMY_SPEED).toBe(30);
});

test("v3 and v4 do not play the same, which is the whole point", () => {
  const creature = made({ FORCE: 3, HASTE: 3 } as Build);
  const play = (Engine: typeof RoamV3 | typeof RoamV4, text: string) => {
    const engine = new Engine(parseLevel(text), creature);
    let status: number = STATUS_PLAYING;
    for (let t = 0; t < 600 && status === STATUS_PLAYING; t++) {
      status = engine.step(t % 160 < 80 ? HELD_RIGHT : HELD_UP);
    }
    return hashHex(engine.stateHash());
  };
  expect(play(RoamV3, ROAM3_LEVEL_TEXT)).not.toBe(play(RoamV4, ROAM4_LEVEL_TEXT));
});

test("all four roam builds route", () => {
  for (const version of [1, 2, 3, 4]) {
    const text = ROAM4_LEVEL_TEXT.replace("behaviour=4", `behaviour=${version}`);
    expect(engineFor(parseLevel(text)).behaviourVersion).toBe(version);
  }
});

test("v4 replays identically three times over", () => {
  const level = parseLevel(ROAM4_LEVEL_TEXT);
  const creature = made({ FORCE: 2, HASTE: 4 } as Build);
  const hashes: string[] = [];
  for (let run = 0; run < 3; run++) {
    const engine = new RoamV4(level, creature);
    let status: number = STATUS_PLAYING;
    for (let t = 0; t < 800 && status === STATUS_PLAYING; t++) {
      status = engine.step((t % 7 === 0 ? HELD_ACT : 0) | (t % 150 < 75 ? HELD_RIGHT : HELD_LEFT));
    }
    hashes.push(hashHex(engine.stateHash()));
  }
  expect(hashes[0]).toBe(hashes[1]);
  expect(hashes[1]).toBe(hashes[2]);
});
