import { expect, test } from "bun:test";
import day1 from "./golden/day1-walk.json";
import day2 from "./golden/day2-win.json";
import day3 from "./golden/day3-clean.json";
import day4bruk from "./golden/day4-bruk.json";
import day4nim from "./golden/day4-nim.json";
import day4pell from "./golden/day4-pell.json";
import day7bruk from "./golden/day7-bruk.json";
import day7nim from "./golden/day7-nim.json";
import day7pell from "./golden/day7-pell.json";
import {
  DAY1_LEVEL_TEXT,
  DAY2_LEVEL_TEXT,
  DAY3_LEVEL_TEXT,
  DAY4_LEVEL_TEXT,
  DAY7_LEVEL_TEXT,
} from "../src/core/fixtures.ts";
import { creatureFromCaps, type Creature } from "../src/core/creature.ts";

// A vector records the caps it was made with. Rebuilding the creature from the
// FILE rather than from today's preset is what lets the presets be rebalanced
// without quietly changing what a committed vector claims.
function creatureOf(vector: { creature: { id: string; name: string; caps: unknown } | null }) {
  if (vector.creature === null) return undefined;
  return creatureFromCaps(
    vector.creature.id,
    vector.creature.name,
    vector.creature.caps as Record<string, number>,
  );
}
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
  { text: DAY4_LEVEL_TEXT, golden: day4bruk, creature: creatureOf(day4bruk) },
  { text: DAY4_LEVEL_TEXT, golden: day4nim, creature: creatureOf(day4nim) },
  { text: DAY4_LEVEL_TEXT, golden: day4pell, creature: creatureOf(day4pell) },
  { text: DAY7_LEVEL_TEXT, golden: day7bruk, creature: creatureOf(day7bruk) },
  { text: DAY7_LEVEL_TEXT, golden: day7nim, creature: creatureOf(day7nim) },
  { text: DAY7_LEVEL_TEXT, golden: day7pell, creature: creatureOf(day7pell) },
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

test("behaviour 5 reads no MASS at all: every day 7 vector has MASS zero", () => {
  for (const vector of [day7bruk, day7nim, day7pell]) {
    expect(vector.creature?.caps.MASS).toBe(0);
  }
  // ...and the day 4 vectors, made when it still mattered, keep theirs.
  expect(day4bruk.creature?.caps.MASS).toBe(240);
});

test("the three budget builds still produce three different runs", () => {
  const rows = [day7bruk, day7nim, day7pell]
    .map((v) => `  ${(v.creature?.name ?? "?").padEnd(5)} ${String(v.log.length).padStart(3)} steps  ` +
      `${String(v.turns).padStart(3)} turns  ${v.stateHash}`)
    .join("\n");
  console.log(`\n${rows}`);
  expect(new Set([day7bruk, day7nim, day7pell].map((v) => v.stateHash)).size).toBe(3);
  // Speed still buys time: Nim spends far fewer turns than the others.
  expect(day7nim.turns).toBeLessThan(day7bruk.turns);
  expect(day7nim.turns).toBeLessThan(day7pell.turns);
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
