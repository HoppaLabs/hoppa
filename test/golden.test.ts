import { expect, test } from "bun:test";
import day1 from "./golden/day1-walk.json";
import day2 from "./golden/day2-win.json";
import day3 from "./golden/day3-clean.json";
import day4bruk from "./golden/day4-bruk.json";
import day4nim from "./golden/day4-nim.json";
import day4pell from "./golden/day4-pell.json";
import {
  DAY1_LEVEL_TEXT,
  DAY2_LEVEL_TEXT,
  DAY3_LEVEL_TEXT,
  DAY4_LEVEL_TEXT,
} from "../src/core/fixtures.ts";
import { BRUK, NIM, PELL, type Creature } from "../src/core/creature.ts";
import { parseLevel } from "../src/core/level.ts";
import { hashHex } from "../src/core/hash.ts";
import { engineFor } from "../src/engines/registry.ts";
import { STATUS_LOST, STATUS_PLAYING, STATUS_WON } from "../src/engines/types.ts";

const MOVES: Record<string, number> = { U: 1, R: 2, D: 3, L: 4, ".": 0 };
const STATUS_NAME: Record<number, string> = {
  [STATUS_PLAYING]: "playing",
  [STATUS_WON]: "won",
  [STATUS_LOST]: "lost",
};

const VECTORS: Array<{ text: string; golden: typeof day1 | typeof day4bruk; creature?: Creature }> = [
  { text: DAY1_LEVEL_TEXT, golden: day1 },
  { text: DAY2_LEVEL_TEXT, golden: day2 },
  { text: DAY3_LEVEL_TEXT, golden: day3 },
  { text: DAY4_LEVEL_TEXT, golden: day4bruk, creature: BRUK },
  { text: DAY4_LEVEL_TEXT, golden: day4nim, creature: NIM },
  { text: DAY4_LEVEL_TEXT, golden: day4pell, creature: PELL },
];

// E9. If this fails, engine behaviour changed and every shipped link that pins
// that behaviour version just became invalid. Stop and flag it -- do not
// regenerate.
test.each(VECTORS)("E9: the committed golden vector for $golden.level still hashes identically", ({
  text,
  golden,
  creature,
}) => {
  const engine = engineFor(parseLevel(text), creature);
  let status = STATUS_PLAYING;
  for (const ch of golden.log) status = engine.step(MOVES[ch] as number);

  console.log(
    `\n  golden ${golden.level} behaviour=${golden.behaviourVersion} ` +
      `${creature === undefined ? "" : `creature=${creature.name} `}` +
      `log=${golden.log.length} moves -> ${golden.stateHash} (${golden.status})`,
  );

  expect(engine.behaviourVersion).toBe(golden.behaviourVersion);
  expect((engine as unknown as { position(): unknown }).position()).toEqual(golden.finalPosition);
  expect(STATUS_NAME[status]).toBe(golden.status);
  expect(hashHex(engine.stateHash())).toBe(golden.stateHash);
});

// E12: a result that claims a win must replay to a win. The claim is the
// vector; the check is that replaying the log reproduces it exactly.
test.each([
  { name: "day 2", text: DAY2_LEVEL_TEXT, golden: day2 },
  { name: "day 3", text: DAY3_LEVEL_TEXT, golden: day3 },
])("E12: the $name vector replays to the turn count and win status it claims", ({
  text,
  golden,
}) => {
  const engine = engineFor(parseLevel(text)) as unknown as {
    step(i: number): number;
    turns(): number;
  };
  let status = STATUS_PLAYING;
  for (const ch of golden.log) status = engine.step(MOVES[ch] as number);

  expect(status).toBe(STATUS_WON);
  expect(engine.turns()).toBe(golden.log.length);
});

// The whole point of day 4: one level, one set of rules, three creatures that
// do not play the same. If these ever collapse to one hash, capabilities have
// stopped mattering.
test("the three presets produce three different runs of the same level", () => {
  const hashes = [day4bruk, day4nim, day4pell].map((v) => v.stateHash);
  expect(new Set(hashes).size).toBe(3);

  const rows = [day4bruk, day4nim, day4pell]
    .map((v) => `  ${(v.creature?.name ?? "?").padEnd(5)} ${String(v.log.length).padStart(3)} steps  ` +
      `${String(v.turns).padStart(3)} turns  ${v.stateHash}`)
    .join("\n");
  console.log(`\n${rows}`);

  // Nim's HASTE buys real time: the same level, far fewer turns on the clock.
  expect(day4nim.turns).toBeLessThan(day4bruk.turns);
});

// The day 3 vector is a *clean* run: it exists to prove the guards can be
// dodged, so if a future change makes dodging impossible this fails loudly.
test("the day 3 vector is never heard and never caught", () => {
  const engine = engineFor(parseLevel(DAY3_LEVEL_TEXT)) as unknown as {
    step(i: number): number;
    alertLevel(): number;
    wasCaught(): boolean;
  };
  for (const ch of day3.log) engine.step(MOVES[ch] as number);
  expect(engine.alertLevel()).toBe(0);
  expect(engine.wasCaught()).toBe(false);
});
