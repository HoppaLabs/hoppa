import { expect, test } from "bun:test";
import golden from "./golden/day1-walk.json";
import { DAY1_LEVEL_TEXT } from "../src/core/fixtures.ts";
import { parseLevel } from "../src/core/level.ts";
import { hashHex } from "../src/core/hash.ts";
import { DelveV1 } from "../src/engines/delve/v1.ts";

const MOVES: Record<string, number> = { U: 1, R: 2, D: 3, L: 4, ".": 0 };

// E9. If this fails, engine behaviour changed and every shipped link that pins
// behaviour version 1 just became invalid. Stop and flag it -- do not regenerate.
test("E9: the committed golden vector still hashes identically", () => {
  const engine = new DelveV1(parseLevel(DAY1_LEVEL_TEXT));
  for (const ch of golden.log) engine.step(MOVES[ch] as number);

  console.log(
    `\n  golden ${golden.level} behaviour=${golden.behaviourVersion} ` +
      `log=${golden.log.length} moves -> ${golden.stateHash}`,
  );

  expect(engine.behaviourVersion).toBe(golden.behaviourVersion);
  expect(engine.position()).toEqual(golden.finalPosition);
  expect(hashHex(engine.stateHash())).toBe(golden.stateHash);
});
