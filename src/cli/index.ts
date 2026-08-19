// Terminal front end. Zero dependencies: util.parseArgs only.
//
//   bun run cli verify levels/day2.lvl
//   bun run cli play   levels/day2.lvl --moves RRDDLLU

import { parseArgs } from "util";
import { GRID_AREA, GRID_H, GRID_W } from "../core/grid.ts";
import { LevelParseError, parseLevel } from "../core/level.ts";
import { verifyLevelText } from "../core/verify.ts";
import { renderAscii } from "./ascii.ts";
import { hashHex } from "../core/hash.ts";
import { engineFor, UnknownBehaviourError } from "../engines/registry.ts";
import { PRESETS, presetByName } from "../core/creature.ts";
import { CodecError, decodeLevel, encodeLevel, levelToText, sameLevel } from "../core/codec.ts";
import {
  INPUT_DOWN,
  INPUT_LEFT,
  INPUT_RIGHT,
  INPUT_UP,
  INPUT_WAIT,
  STATUS_LOST,
  STATUS_PLAYING,
  STATUS_WON,
} from "../engines/types.ts";

const MOVE_KEYS: Record<string, number> = {
  U: INPUT_UP,
  R: INPUT_RIGHT,
  D: INPUT_DOWN,
  L: INPUT_LEFT,
  ".": INPUT_WAIT,
};

const STATUS_NAME: Record<number, string> = {
  [STATUS_PLAYING]: "playing",
  [STATUS_WON]: "WON",
  [STATUS_LOST]: "LOST",
};

function usage(): never {
  console.log(
    [
      "hoppa cli",
      "",
      "  verify <file.lvl>              run spec S13 checks L1-L5",
      "  play   <file.lvl> --moves URDL apply a move string, print the grid",
      "         [--creature <name>]     one of: " + PRESETS.map((c) => c.name).join(", "),
      "  link   <file.lvl> [--site URL] print a share link for a level",
      "  open   <url-or-code>           decode a link back to .lvl on stdout",
      "",
      "  moves: U R D L, '.' waits",
    ].join("\n"),
  );
  process.exit(1);
}

async function readLevelText(path: string | undefined): Promise<string> {
  if (path === undefined) usage();
  return await Bun.file(path).text();
}

const { values, positionals } = parseArgs({
  args: Bun.argv.slice(2),
  options: {
    moves: { type: "string", default: "" },
    creature: { type: "string", default: "" },
    site: { type: "string", default: "https://hoppalabs.github.io/hoppa/" },
  },
  allowPositionals: true,
});

const command = positionals[0];
const file = positionals[1];

try {
  if (command === "verify") {
    const result = verifyLevelText(await readLevelText(file));
    const level = result.level;

    if (level !== null) {
      let walls = 0;
      for (let i = 0; i < GRID_AREA; i++) walls += level.walls[i] as number;
      const rows = [
        ["file", file as string],
        ["engine", `${level.engine} behaviour=${level.behaviourVersion}`],
        ["size", `${GRID_W}x${GRID_H}`],
        ["seed", `${level.seedText} (${level.seed})`],
        ["tileset", String(level.tilesetId)],
        ["start", `(${level.startX},${level.startY})`],
        ["exit", level.exitX >= 0 ? `(${level.exitX},${level.exitY})` : "none"],
        ["treasure", String(level.treasureCells.length)],
        ["guards", String(level.guardCells.length)],
        ["walls", `${walls} of ${GRID_AREA}`],
        ["reachable", `${result.reachableCells} cells from the start`],
      ];
      for (const [k, v] of rows) console.log(`  ${(k as string).padEnd(10)} ${v}`);
      console.log("");
    }

    console.log("  ID  RESULT  CHECK");
    for (const check of result.checks) {
      const mark = check.ok === null ? "skip  " : check.ok ? "ok    " : "FAIL  ";
      console.log(`  ${check.id}  ${mark}  ${check.title}`);
      console.log(`              ${check.detail}`);
    }

    console.log(result.ok ? "\n  ok" : "\n  NOT PLAYABLE");
    if (!result.ok) process.exit(1);
  } else if (command === "play") {
    const level = parseLevel(await readLevelText(file));

    const wanted = values.creature as string;
    const creature = wanted === "" ? undefined : presetByName(wanted);
    if (wanted !== "" && creature === undefined) {
      console.error(
        `unknown creature "${wanted}" -- try one of: ${PRESETS.map((c) => c.name).join(", ")}`,
      );
      process.exit(1);
    }

    const engine = engineFor(level, creature);
    const moves = (values.moves as string).toUpperCase();

    let status = STATUS_PLAYING;
    let played = 0;
    for (const ch of moves) {
      const input = MOVE_KEYS[ch];
      if (input === undefined) {
        console.error(`unknown move "${ch}" -- use U R D L or .`);
        process.exit(1);
      }
      status = engine.step(input);
      played++;
      if (status !== STATUS_PLAYING) break;
    }

    console.log(renderAscii(engine.render()));

    const parts = [
      creature === undefined ? "no creature" : `as ${creature.name}`,
      `moves ${played}/${moves.length}`,
      `${STATUS_NAME[status] ?? String(status)}`,
      `hash ${hashHex(engine.stateHash())}`,
    ];
    console.log(`\n  ${parts.join("   ")}`);
    const message = engine.message();
    if (message !== null) console.log(`  "${message}"`);
  } else if (command === "link") {
    const level = parseLevel(await readLevelText(file));
    const code = encodeLevel(level);

    // L6 on the spot: a link nobody can decode is worse than no link.
    if (!sameLevel(level, decodeLevel(code))) {
      console.error("round-trip FAILED -- refusing to hand out a link that does not decode");
      process.exit(1);
    }

    const name = (file as string).replace(/^.*\//, "").replace(/\.lvl$/, "");
    const url = `${values.site as string}#p/${name}/${code}`;
    console.log(`  code   ${code}`);
    console.log(`  chars  ${code.length} of 150 (spec S10 budget)`);
    console.log(`  url    ${url.length} of 300`);
    console.log("");
    console.log(url);
  } else if (command === "open") {
    const argument = file;
    if (argument === undefined) usage();
    const at = argument.lastIndexOf("/");
    const code = at < 0 ? argument : argument.slice(at + 1);
    process.stdout.write(levelToText(decodeLevel(code)));
  } else {
    usage();
  }
} catch (err) {
  if (err instanceof LevelParseError) {
    console.error(`level error: ${err.message}`);
    process.exit(1);
  }
  if (err instanceof CodecError) {
    console.error(`link error: ${err.message}`);
    process.exit(1);
  }
  if (err instanceof UnknownBehaviourError) {
    console.error(`engine error: ${err.message}`);
    process.exit(1);
  }
  throw err;
}
