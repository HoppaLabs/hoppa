// Terminal front end. Zero dependencies: util.parseArgs only.
//
//   bun run cli verify levels/day1.lvl
//   bun run cli play   levels/day1.lvl --moves RRDDLLU

import { parseArgs } from "util";
import { DelveV1 } from "../engines/delve/v1.ts";
import { GRID_AREA, GRID_H, GRID_W } from "../core/grid.ts";
import { LevelParseError, parseLevel } from "../core/level.ts";
import { renderAscii } from "./ascii.ts";
import { hashHex } from "../core/hash.ts";
import { INPUT_DOWN, INPUT_LEFT, INPUT_RIGHT, INPUT_UP, INPUT_WAIT } from "../engines/types.ts";

const MOVE_KEYS: Record<string, number> = {
  U: INPUT_UP,
  R: INPUT_RIGHT,
  D: INPUT_DOWN,
  L: INPUT_LEFT,
  ".": INPUT_WAIT,
};

function usage(): never {
  console.log(
    [
      "hoppa cli",
      "",
      "  verify <file.lvl>              parse and report the level",
      "  play   <file.lvl> --moves URDL apply a move string, print the grid",
      "",
      "  moves: U R D L, '.' waits",
    ].join("\n"),
  );
  process.exit(1);
}

async function loadLevel(path: string | undefined) {
  if (path === undefined) usage();
  const text = await Bun.file(path).text();
  return parseLevel(text);
}

const { values, positionals } = parseArgs({
  args: Bun.argv.slice(2),
  options: { moves: { type: "string", default: "" } },
  allowPositionals: true,
});

const command = positionals[0];
const file = positionals[1];

try {
  if (command === "verify") {
    const level = await loadLevel(file);
    let walls = 0;
    for (let i = 0; i < GRID_AREA; i++) walls += level.walls[i] as number;
    const rows = [
      ["file", file as string],
      ["engine", `${level.engine} behaviour=${level.behaviourVersion}`],
      ["schema", String(level.schema)],
      ["size", `${GRID_W}x${GRID_H}`],
      ["seed", `${level.seedText} (${level.seed})`],
      ["tileset", String(level.tilesetId)],
      ["start", `(${level.startX},${level.startY})`],
      ["walls", `${walls} of ${GRID_AREA}`],
    ];
    for (const [k, v] of rows) console.log(`  ${(k as string).padEnd(9)} ${v}`);
    console.log("\n  ok");
  } else if (command === "play") {
    const level = await loadLevel(file);
    const engine = new DelveV1(level);
    const moves = (values.moves as string).toUpperCase();
    for (const ch of moves) {
      const input = MOVE_KEYS[ch];
      if (input === undefined) {
        console.error(`unknown move "${ch}" -- use U R D L or .`);
        process.exit(1);
      }
      engine.step(input);
    }
    const pos = engine.position();
    console.log(renderAscii(engine.render()));
    console.log(`\n  moves ${moves.length}   at (${pos.x},${pos.y})   hash ${hashHex(engine.stateHash())}`);
  } else {
    usage();
  }
} catch (err) {
  if (err instanceof LevelParseError) {
    console.error(`level error: ${err.message}`);
    process.exit(1);
  }
  throw err;
}
