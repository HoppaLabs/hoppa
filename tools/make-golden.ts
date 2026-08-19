// Regenerates test/golden/*.json. Run this ONLY when deliberately adding a new
// vector -- never to make a failing test go green. A golden vector that changes
// means engine behaviour changed, which means every shipped link just broke.

import { DAY1_LEVEL_TEXT } from "../src/core/fixtures.ts";
import { parseLevel } from "../src/core/level.ts";
import { hashHex } from "../src/core/hash.ts";
import { DelveV1 } from "../src/engines/delve/v1.ts";

const LOG = "RRRRRRRRRRRRDDDDDDDDDDDLLLLLLLLUUUURRDD";
const MOVES: Record<string, number> = { U: 1, R: 2, D: 3, L: 4, ".": 0 };

const level = parseLevel(DAY1_LEVEL_TEXT);
const engine = new DelveV1(level);
for (const ch of LOG) engine.step(MOVES[ch] as number);

const vector = {
  note: "sacred: see CLAUDE.md hard rule 6. do not regenerate to go green.",
  level: "levels/day1.lvl",
  engine: "delve",
  behaviourVersion: engine.behaviourVersion,
  log: LOG,
  finalPosition: engine.position(),
  stateHash: hashHex(engine.stateHash()),
};

await Bun.write("test/golden/day1-walk.json", `${JSON.stringify(vector, null, 2)}\n`);
console.log(JSON.stringify(vector, null, 2));
