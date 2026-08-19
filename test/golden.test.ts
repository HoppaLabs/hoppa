import { expect, test } from "bun:test";
import day1 from "./golden/day1-walk.json";
import day2 from "./golden/day2-win.json";
import day3 from "./golden/day3-clean.json";
import { DAY1_LEVEL_TEXT, DAY2_LEVEL_TEXT, DAY3_LEVEL_TEXT } from "../src/core/fixtures.ts";
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

const VECTORS = [
  { text: DAY1_LEVEL_TEXT, golden: day1 },
  { text: DAY2_LEVEL_TEXT, golden: day2 },
  { text: DAY3_LEVEL_TEXT, golden: day3 },
];

// E9. If this fails, engine behaviour changed and every shipped link that pins
// that behaviour version just became invalid. Stop and flag it -- do not
// regenerate.
test.each(VECTORS)("E9: the committed golden vector for $golden.level still hashes identically", ({
  text,
  golden,
}) => {
  const engine = engineFor(parseLevel(text));
  let status = STATUS_PLAYING;
  for (const ch of golden.log) status = engine.step(MOVES[ch] as number);

  console.log(
    `\n  golden ${golden.level} behaviour=${golden.behaviourVersion} ` +
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
