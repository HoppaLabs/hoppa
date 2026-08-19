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

const WINS = {
  Bruk: ".RRRRRRRRRDDDDLLLDDDDLLLLLRRRRRUUUURRRRRRRRRRRRRRRLDDDDLLLDDDLLLLRRRRRRRR",
  Nim: "...RRRRRRRRRDDDDLLLDDDDLLLLLRRRDDDRRRRRRRRRRRRRUUURRRUUUURLDDDDLLLDDDRRRR",
  Pell: "..RRRRRRRRRDDDDLLLDDDDLLLLRRDDDRRRRRRRRRRRRRUUURRRUUUDDDLLLDDDRRRR",
} as const;

function play(creature: (typeof PRESETS)[number], log: string) {
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
  expect(presetByName("bruk")).toBe(BRUK);
  expect(presetByName("NIM")).toBe(NIM);
  expect(presetByName("nobody")).toBeUndefined();
});

// --- capabilities actually do something --------------------------------------

test("MASS makes you loud: heavy creatures are heard from further away", () => {
  expect(noiseRadiusFor(BRUK)).toBe(2);
  expect(noiseRadiusFor(NIM)).toBe(1);
  expect(new DelveV4(level, BRUK).noise()).toBeGreaterThan(new DelveV4(level, NIM).noise());
});

test("GUARD buys spottings, and never more than the alert ceiling", () => {
  expect(alertCeilingFor(BRUK)).toBe(3);
  expect(alertCeilingFor(NIM)).toBe(2);
  for (const creature of PRESETS) {
    expect(alertCeilingFor(creature)).toBeLessThanOrEqual(ALERT_MAX);
  }
});

test("REACH lifts a gem from the next cell, without stepping on it", () => {
  expect(reachFor(PELL)).toBe(1);
  expect(reachFor(BRUK)).toBe(0);

  // There is a gem at (2,9). This route stops at (3,9): right beside it, never
  // on it. The long arm should come away with it; the short arm should not.
  expect(level.treasureSlot[idx(2, 9)]).toBeGreaterThanOrEqual(0);
  const BESIDE_THE_GEM = "RRRRRRRRRDDDDLLLDDDDLLLL";

  const longArm = new DelveV4(level, PELL);
  const shortArm = new DelveV4(level, BRUK);
  for (const engine of [longArm, shortArm]) {
    for (const ch of BESIDE_THE_GEM) engine.step(MOVES[ch] as number);
  }

  expect(longArm.position()).toEqual({ x: 3, y: 9 });
  expect(shortArm.position()).toEqual({ x: 3, y: 9 });
  expect(longArm.collectedCount()).toBe(1);
  expect(shortArm.collectedCount()).toBe(0);
});

test("HASTE buys turns: the same number of steps costs Nim less clock", () => {
  const bruk = play(BRUK, WINS.Bruk).engine;
  const nim = play(NIM, WINS.Nim).engine;
  expect(WINS.Bruk.length).toBe(WINS.Nim.length);
  expect(nim.turns()).toBeLessThan(bruk.turns());
});

test("a free step moves you without moving the world", () => {
  const engine = new DelveV4(level, NIM);
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

test.each(PRESETS.map((c) => [c.name, c] as const))(
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
  const hashes = PRESETS.map((c) => hashHex(play(c, log).engine.stateHash()));
  expect(new Set(hashes).size).toBe(3);
});

test("E3: three replays of one log produce identical hashes", () => {
  const log = WINS.Pell.slice(0, 30);
  const hashes = [0, 1, 2].map(() => hashHex(play(PELL, log).engine.stateHash()));
  expect(new Set(hashes).size).toBe(1);
});

test("E10: cosmetics still do not reach stateHash()", () => {
  const restyled = parseLevel(DAY4_LEVEL_TEXT.replace("tiles=1", "tiles=7"));
  const log = WINS.Nim.slice(0, 20);
  const themed = new DelveV4(restyled, NIM);
  for (const ch of log) themed.step(MOVES[ch] as number);
  expect(hashHex(themed.stateHash())).toBe(hashHex(play(NIM, log).engine.stateHash()));
});

test("the engine declares the capabilities it actually reads", () => {
  const engine = new DelveV4(level, BRUK);
  expect([...engine.consumes].sort()).toEqual(["GUARD", "HASTE", "MASS", "REACH"]);
});

test("a level with no creature named still plays, as Bruk", () => {
  const engine = new DelveV4(level);
  expect(engine.who().name).toBe("Bruk");
  expect(engine.step(INPUT_RIGHT)).toBe(STATUS_PLAYING);
});
