// Regenerates test/golden/*.json. Run this ONLY when deliberately adding a new
// vector -- never to make a failing test go green. A golden vector that changes
// means engine behaviour changed, which means every shipped link just broke.
//
// It rewrites every vector, so `git diff test/golden/` after running it is the
// check that matters: a new file should appear and the existing ones should not
// move a byte.

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

const VECTORS: ReadonlyArray<{ file: string; level: string; text: string; log: string }> = [
  {
    file: "test/golden/day1-walk.json",
    level: "levels/day1.lvl",
    text: DAY1_LEVEL_TEXT,
    log: "RRRRRRRRRRRRDDDDDDDDDDDLLLLLLLLUUUURRDD",
  },
  {
    // The BFS-optimal win: collects all five treasures, then the exit opens.
    file: "test/golden/day2-win.json",
    level: "levels/day2.lvl",
    text: DAY2_LEVEL_TEXT,
    log:
      "DDDDDDRRRRRRRUUUURRRDDDDLDDRRRUURRDDDDLRUUUULLDDLLLUUUURUULLLDDDD" +
      "LLLLDDDUUULLLUUUUUURRRDDLDDRRRUUUURRRRRRRDDDDRRUUUURRRRRRRDDDDLRDDDDDDD",
  },
  {
    // A clean run: all four gems, past four patrols, never once heard.
    file: "test/golden/day3-clean.json",
    level: "levels/day3.lvl",
    text: DAY3_LEVEL_TEXT,
    log:
      ".RRRR..DDDDRRDDDDLLLLLRRRRRRRRRRR..DDDLLRR..UUUUUUULLUUUURRRRRRRRRR" +
      "DDDDRLDDDDLRDDDR",
  },
];

for (const spec of VECTORS) {
  const level = parseLevel(spec.text);
  const engine = engineFor(level);
  let status = STATUS_PLAYING;
  for (const ch of spec.log) status = engine.step(MOVES[ch] as number);

  const vector = {
    note: "sacred: see CLAUDE.md hard rule 6. do not regenerate to go green.",
    level: spec.level,
    engine: level.engine,
    behaviourVersion: engine.behaviourVersion,
    log: spec.log,
    finalPosition: (engine as unknown as { position(): { x: number; y: number } }).position(),
    status: STATUS_NAME[status] as string,
    stateHash: hashHex(engine.stateHash()),
  };

  await Bun.write(spec.file, `${JSON.stringify(vector, null, 2)}\n`);
  console.log(`${spec.file}  ${vector.status.padEnd(7)} ${vector.stateHash}`);
}
