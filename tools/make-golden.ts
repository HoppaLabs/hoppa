// Regenerates test/golden/*.json. Run this ONLY when deliberately adding a new
// vector -- never to make a failing test go green. A golden vector that changes
// means engine behaviour changed, which means every shipped link just broke.
//
// It rewrites every vector, so `git diff test/golden/` after running it is the
// check that matters: a new file should appear and the existing ones should not
// move a byte.

import {
  DAY1_LEVEL_TEXT,
  DAY2_LEVEL_TEXT,
  DAY3_LEVEL_TEXT,
  DAY4_LEVEL_TEXT,
  DAY7_LEVEL_TEXT,
} from "../src/core/fixtures.ts";
import { BRUK, NIM, PELL, creatureFromCaps, type Creature } from "../src/core/creature.ts";

// The day 4 vectors were made before the presets moved onto a pip budget. A
// golden vector is (level, CREATURE, log) -> hash, so its creature is part of
// the fixture and must be spelled out here rather than read from whatever the
// presets happen to be today. Regenerating these to match a rebalance is
// exactly what CLAUDE.md hard rule 6 forbids.
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

// The day 7 vectors were made when a character spent points across FOUR
// characteristics. The set later shrank to two, so these are pinned for the
// same reason as the day 4 set: a vector is (level, CREATURE, log) -> hash, and
// the creature is part of the fixture.
const V5_BASH = creatureFromCaps("01J8XK4M2P7Q", "Bash", { FORCE: 255, GUARD: 153 });
const V5_NIM = creatureFromCaps("01J8XK6R4T2B", "Nim", { HASTE: 255, GUARD: 51, REACH: 102 });
const V5_PELL = creatureFromCaps("01J8XK8W6Y5N", "Pell", { GUARD: 204, REACH: 204 });
import { CODEC_VERSION, encodeLevel } from "../src/core/codec.ts";
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

const VECTORS: ReadonlyArray<{
  file: string;
  level: string;
  text: string;
  log: string;
  creature?: Creature;
}> = [
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
  // Spec S15 keys golden vectors on (level, creature, log). From day 4 the
  // creature is a real input: same level, same rules, three different runs.
  {
    file: "test/golden/day4-bruk.json",
    level: "levels/day4.lvl",
    text: DAY4_LEVEL_TEXT,
    creature: V4_BRUK,
    log: ".RRRRRRRRRDDDDLLLDDDDLLLLLRRRRRUUUURRRRRRRRRRRRRRRLDDDDLLLDDDLLLLRRRRRRRR",
  },
  {
    file: "test/golden/day4-nim.json",
    level: "levels/day4.lvl",
    text: DAY4_LEVEL_TEXT,
    creature: V4_NIM,
    log: "...RRRRRRRRRDDDDLLLDDDDLLLLLRRRDDDRRRRRRRRRRRRRUUURRRUUUURLDDDDLLLDDDRRRR",
  },
  {
    file: "test/golden/day4-pell.json",
    level: "levels/day4.lvl",
    text: DAY4_LEVEL_TEXT,
    creature: V4_PELL,
    log: "..RRRRRRRRRDDDDLLLDDDDLLLLRRDDDRRRRRRRRRRRRRUUURRRUUUDDDLLLDDDRRRR",
  },
  // Behaviour 5: MASS is no longer read, and a creature is built from a pip
  // budget. Three legal builds, three different runs of one level.
  {
    file: "test/golden/day7-bruk.json",
    level: "levels/day7.lvl",
    text: DAY7_LEVEL_TEXT,
    creature: V5_BASH,
    log: "..RRRRRRRRRDDDDLLLDDDDLLLLLRRRDDDRRRRRRRRRRRRRUUURRRUUUURLDDDDLLLDDDRRRR",
  },
  {
    file: "test/golden/day7-nim.json",
    level: "levels/day7.lvl",
    text: DAY7_LEVEL_TEXT,
    creature: V5_NIM,
    log: "...RRRRRRRRRDDDDLLLDDDDLLLLLRRRDDDRRRRRRRRRRRRRUUURRRUUUURLDDDDLLLDDDRRRR",
  },
  {
    file: "test/golden/day7-pell.json",
    level: "levels/day7.lvl",
    text: DAY7_LEVEL_TEXT,
    creature: V5_PELL,
    log: "RRRRRRRRRDDDDLLLDDDDLLLLRRRRRRRRRRRRRRRRRRUUUDDDLLLDDDLLLRRRRRRR",
  },
];

// The wire format itself is a golden vector. A link is permanent and unhosted:
// if these codes ever change, every link already sent decodes to something else
// or stops decoding at all. Changing one is not a merge conflict to resolve, it
// is a decision to make -- see docs/adr/0006.
const CODES = [
  { level: "levels/day1.lvl", text: DAY1_LEVEL_TEXT },
  { level: "levels/day2.lvl", text: DAY2_LEVEL_TEXT },
  { level: "levels/day3.lvl", text: DAY3_LEVEL_TEXT },
  { level: "levels/day4.lvl", text: DAY4_LEVEL_TEXT },
  { level: "levels/day7.lvl", text: DAY7_LEVEL_TEXT },
];

const codes = {
  note: "sacred: a shipped link is permanent. see CLAUDE.md hard rule 6 and docs/adr/0006.",
  codecVersion: CODEC_VERSION,
  levels: CODES.map((entry) => {
    const code = encodeLevel(parseLevel(entry.text));
    return { level: entry.level, chars: code.length, code };
  }),
};
await Bun.write("test/golden/codes.json", `${JSON.stringify(codes, null, 2)}\n`);
for (const row of codes.levels) {
  console.log(`code ${row.level.padEnd(16)} ${String(row.chars).padStart(3)} chars  ${row.code}`);
}

for (const spec of VECTORS) {
  const level = parseLevel(spec.text);
  const engine = engineFor(level, spec.creature);
  let status = STATUS_PLAYING;
  for (const ch of spec.log) status = engine.step(MOVES[ch] as number);

  const vector = {
    note: "sacred: see CLAUDE.md hard rule 6. do not regenerate to go green.",
    level: spec.level,
    engine: level.engine,
    behaviourVersion: engine.behaviourVersion,
    creature:
      spec.creature === undefined
        ? null
        : { id: spec.creature.id, name: spec.creature.name, caps: spec.creature.caps },
    log: spec.log,
    turns: (engine as unknown as { turns?(): number }).turns?.() ?? spec.log.length,
    finalPosition: (engine as unknown as { position(): { x: number; y: number } }).position(),
    status: STATUS_NAME[status] as string,
    stateHash: hashHex(engine.stateHash()),
  };

  await Bun.write(spec.file, `${JSON.stringify(vector, null, 2)}\n`);
  console.log(`${spec.file}  ${vector.status.padEnd(7)} ${vector.stateHash}`);
}
