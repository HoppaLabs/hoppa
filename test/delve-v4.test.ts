import { expect, test } from "bun:test";
import { DAY4_LEVEL_TEXT } from "../src/core/fixtures.ts";
import { GRID_AREA, idx } from "../src/core/grid.ts";
import { parseLevel } from "../src/core/level.ts";
import { hashHex } from "../src/core/hash.ts";
import {
  BRUK,
  CAP_KEYS,
  NIM,
  PELL,
  PRESETS,
  creatureFromCaps,
  normalise,
  presetByName,
  uniformCreature,
} from "../src/core/creature.ts";
import {
  ALERT_MAX,
  DelveV4,
  HASTE_PER_STEP,
  TURN_CAP,
  alertCeilingFor,
  noiseRadiusFor,
  reachFor,
} from "../src/engines/delve/v4.ts";
import { INPUT_RIGHT, INPUT_WAIT, STATUS_PLAYING, STATUS_WON } from "../src/engines/types.ts";

const level = parseLevel(DAY4_LEVEL_TEXT);
const MOVES: Record<string, number> = { U: 1, R: 2, D: 3, L: 4, ".": 0 };

// v4's rules are frozen, so its INPUTS are pinned here too. These are the caps
// the presets had on day 4, recorded in test/golden/day4-*.json. The live
// presets have since been rebalanced onto a pip budget, and a frozen engine
// must not be tested against a moving target -- see docs/adr/0008.
const V4_BRUK = creatureFromCaps("01J8XK4M2P7Q", "Bruk", {
  MOVE_GROUND: 180, MOVE_AIR: 40, REACH: 90, FORCE: 220,
  GUARD: 200, HASTE: 60, MASS: 240, SPARK: 10,
});
const V4_NIM = creatureFromCaps("01J8XK6R4T2B", "Nim", {
  MOVE_GROUND: 210, MOVE_AIR: 120, REACH: 60, FORCE: 50,
  GUARD: 40, HASTE: 210, MASS: 40, SPARK: 90,
});
const V4_PELL = creatureFromCaps("01J8XK8W6Y5N", "Pell", {
  MOVE_GROUND: 120, MOVE_AIR: 20, REACH: 200, FORCE: 90,
  GUARD: 240, HASTE: 30, MASS: 110, SPARK: 40,
});
const V4_PRESETS = [V4_BRUK, V4_NIM, V4_PELL] as const;

const WINS = {
  Bruk: ".RRRRRRRRRDDDDLLLDDDDLLLLLRRRRRUUUURRRRRRRRRRRRRRRLDDDDLLLDDDLLLLRRRRRRRR",
  Nim: "...RRRRRRRRRDDDDLLLDDDDLLLLLRRRDDDRRRRRRRRRRRRRUUURRRUUUURLDDDDLLLDDDRRRR",
  Pell: "..RRRRRRRRRDDDDLLLDDDDLLLLRRDDDRRRRRRRRRRRRRUUURRRUUUDDDLLLDDDRRRR",
} as const;

function play(creature: (typeof V4_PRESETS)[number], log: string) {
  const engine = new DelveV4(level, creature);
  let status: number = STATUS_PLAYING;
  for (const ch of log) status = engine.step(MOVES[ch] as number);
  return { engine, status };
}

// --- the creature model ------------------------------------------------------

test("every preset has all eight axes, in range", () => {
  for (const creature of PRESETS) {
    for (const key of CAP_KEYS) {
      expect(creature.caps[key]).toBeGreaterThanOrEqual(0);
      expect(creature.caps[key]).toBeLessThanOrEqual(255);
    }
  }
});

test("a malformed creature is clamped, never a crash", () => {
  const caps = normalise({ MASS: 9999, GUARD: -40 } as never);
  expect(caps.MASS).toBe(255);
  expect(caps.GUARD).toBe(0);
  expect(caps.SPARK).toBe(0); // absent axes default rather than go undefined
});

test("presets are findable by name, case-insensitively", () => {
  expect(presetByName("bash")).toBe(BRUK);
  expect(presetByName("NIM")).toBe(NIM);
  expect(presetByName("nobody")).toBeUndefined();
});

// --- capabilities actually do something --------------------------------------

test("v4 still reads MASS, and always will: a heavy creature is heard further", () => {
  // MASS stopped being read from v5 on, but a link pinning behaviour 4 must
  // keep playing exactly as it did. This is that promise, as a test.
  expect(noiseRadiusFor(V4_BRUK)).toBe(2);
  expect(noiseRadiusFor(V4_NIM)).toBe(1);
  expect(new DelveV4(level, V4_BRUK).noise()).toBeGreaterThan(
    new DelveV4(level, V4_NIM).noise(),
  );
});

test("GUARD buys spottings, and never more than the alert ceiling", () => {
  expect(alertCeilingFor(V4_BRUK)).toBe(3);
  expect(alertCeilingFor(V4_NIM)).toBe(2);
  for (const creature of [...V4_PRESETS, ...PRESETS]) {
    expect(alertCeilingFor(creature)).toBeLessThanOrEqual(ALERT_MAX);
  }
});

test("REACH lifts a gem from the next cell, without stepping on it", () => {
  expect(reachFor(V4_PELL)).toBe(1);
  expect(reachFor(V4_BRUK)).toBe(0);

  // There is a gem at (2,9). This route stops at (3,9): right beside it, never
  // on it. The long arm should come away with it; the short arm should not.
  expect(level.treasureSlot[idx(2, 9)]).toBeGreaterThanOrEqual(0);
  const BESIDE_THE_GEM = "RRRRRRRRRDDDDLLLDDDDLLLL";

  const longArm = new DelveV4(level, V4_PELL);
  const shortArm = new DelveV4(level, V4_BRUK);
  for (const engine of [longArm, shortArm]) {
    for (const ch of BESIDE_THE_GEM) engine.step(MOVES[ch] as number);
  }

  expect(longArm.position()).toEqual({ x: 3, y: 9 });
  expect(shortArm.position()).toEqual({ x: 3, y: 9 });
  expect(longArm.collectedCount()).toBe(1);
  expect(shortArm.collectedCount()).toBe(0);
});

test("HASTE buys turns: the same number of steps costs Nim less clock", () => {
  const bruk = play(V4_BRUK, WINS.Bruk).engine;
  const nim = play(V4_NIM, WINS.Nim).engine;
  expect(WINS.Bruk.length).toBe(WINS.Nim.length);
  expect(nim.turns()).toBeLessThan(bruk.turns());
});

test("a free step moves you without moving the world", () => {
  const engine = new DelveV4(level, V4_NIM);
  let frees = 0;
  let turnsBefore = 0;
  for (let i = 0; i < 20; i++) {
    turnsBefore = engine.turns();
    engine.step(INPUT_WAIT);
    if (engine.tookFreeStep()) {
      frees++;
      expect(engine.turns()).toBe(turnsBefore); // the clock did not move
    } else {
      expect(engine.turns()).toBe(turnsBefore + 1);
    }
  }
  expect(frees).toBeGreaterThan(0);
});

test("E4/E2: even an all-255 creature terminates -- HASTE cannot stall the clock", () => {
  // Without the no-two-free-steps rule this loops forever: the accumulator
  // banks faster than it spends and the turn counter stops advancing.
  const sprinter = uniformCreature(255, "Blur");
  const engine = new DelveV4(level, sprinter);
  let status: number = STATUS_PLAYING;
  let steps = 0;
  while (status === STATUS_PLAYING && steps < TURN_CAP * 3) {
    status = engine.step(INPUT_WAIT);
    steps++;
  }
  expect(status).not.toBe(STATUS_PLAYING);
  expect(steps).toBeLessThan(TURN_CAP * 3);
  expect(HASTE_PER_STEP).toBe(256);
});

test("E1: an all-zero creature plays without crashing", () => {
  const lump = uniformCreature(0, "Lump");
  const engine = new DelveV4(level, lump);
  expect(engine.noise()).toBe(1);
  expect(engine.alertMax()).toBe(2);
  expect(engine.reachCells()).toBe(0);
  let status: number = STATUS_PLAYING;
  for (let i = 0; i < 300 && status === STATUS_PLAYING; i++) status = engine.step(i % 5);
  expect(engine.render().length).toBe(GRID_AREA);
});

// --- the runs ----------------------------------------------------------------

test.each(V4_PRESETS.map((c) => [c.name, c] as const))(
  "%s can beat the level, and says something of its own about it",
  (name, creature) => {
    const { engine, status } = play(creature, WINS[name as keyof typeof WINS]);
    expect(status).toBe(STATUS_WON);
    expect(engine.collectedCount()).toBe(engine.treasureTotal());
    const said = engine.message();
    expect(said).not.toBeNull();
    expect(said).toContain(name);
    console.log(`  ${name.padEnd(5)} ${engine.turns()} turns  "${said}"`);
  },
);

test("the same log on three creatures gives three different hashes", () => {
  const log = WINS.Bruk.slice(0, 25);
  const hashes = V4_PRESETS.map((c) => hashHex(play(c, log).engine.stateHash()));
  expect(new Set(hashes).size).toBe(3);
});

test("E3: three replays of one log produce identical hashes", () => {
  const log = WINS.Pell.slice(0, 30);
  const hashes = [0, 1, 2].map(() => hashHex(play(V4_PELL, log).engine.stateHash()));
  expect(new Set(hashes).size).toBe(1);
});

test("E10: cosmetics still do not reach stateHash()", () => {
  const restyled = parseLevel(DAY4_LEVEL_TEXT.replace("tiles=1", "tiles=7"));
  const log = WINS.Nim.slice(0, 20);
  const themed = new DelveV4(restyled, V4_NIM);
  for (const ch of log) themed.step(MOVES[ch] as number);
  expect(hashHex(themed.stateHash())).toBe(hashHex(play(V4_NIM, log).engine.stateHash()));
});

test("the engine declares the capabilities it actually reads", () => {
  const engine = new DelveV4(level, V4_BRUK);
  expect([...engine.consumes].sort()).toEqual(["GUARD", "HASTE", "MASS", "REACH"]);
});

test("a level with no creature named still plays, as the default", () => {
  const engine = new DelveV4(level);
  expect(engine.who().name).toBe(BRUK.name);
  expect(engine.step(INPUT_RIGHT)).toBe(STATUS_PLAYING);
});
