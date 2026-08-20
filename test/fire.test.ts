import { expect, test } from "bun:test";
import { parseLevel, isFire, GLYPH_FIRE } from "../src/core/level.ts";
import { decodeLevel, encodeLevel } from "../src/core/codec.ts";
import { adviceFor } from "../src/core/advice.ts";
import { verifyLevelText } from "../src/core/verify.ts";
import { engineFor, knownBuilds } from "../src/engines/registry.ts";
import { newestBuild } from "../src/core/builds.ts";
import { PRESETS } from "../src/core/creature.ts";
import { TILE_FIRE } from "../src/core/tiles.ts";
import { HELD_ACT, HELD_RIGHT, HELD_SWING, STATUS_WON } from "../src/engines/types.ts";
import { botPlays, replayWins } from "../tools/bot.ts";
import { MAX_FIRE, blankDraft, paint, tally } from "../src/core/draft.ts";
import { OUTSIDE, UNDERGROUND } from "../src/core/tileset.ts";
import { hashHex } from "../src/core/hash.ts";

function room(engine: string, version: number, rows: readonly string[]): string {
  return [`hoppa/1 ${engine} seed=f tiles=1 behaviour=${version}`, ...rows].join("\n") + "\n";
}

/** One flame between you and the door, with plenty of space to walk round it. */
const AROUND = [
  "########################", "#@.........^..........>#", "#......................#",
  "#......................#", "#......................#", "#......................#",
  "#......................#", "#......................#", "#......................#",
  "#......................#", "#......................#", "#......................#",
  "#......................#", "########################",
];

/** A wall with one gap, and the gap is on fire. No way round at all. */
const THROUGH = [
  "########################", "#@.....................#", "#......................#",
  "############^###########", "#......................#", "#.....................>#",
  "#......................#", "#......................#", "#......................#",
  "#......................#", "#......................#", "#......................#",
  "#......................#", "########################",
];

const SPIKED = [
  "........................", "........................", "........................",
  "........................", "........................", "........................",
  "........................", "........................", "........................",
  "........................", "..$.....................", "........................",
  "..@......^^...........>.", "########################",
];

test("fire is a glyph, a cell you can stand on, and not a wall", () => {
  const level = parseLevel(room("roam", 6, AROUND));
  expect(level.fireCells.length).toBe(1);
  expect(isFire(level, 11, 1)).toBe(true);
  // It is emphatically NOT a wall: you can walk into it, which is the point.
  expect(level.walls[level.fireCells[0] as number]).toBe(0);
  expect(GLYPH_FIRE).toBe("^");
});

test("it costs a heart, once, however long you stand in it", () => {
  // The mercy window a guard's hit gives. Without it, walking the width of one
  // flame would take a heart every tick.
  const level = parseLevel(room("roam", 6, AROUND));
  const engine = engineFor(level, PRESETS[0] as (typeof PRESETS)[number]) as unknown as {
    step: (h: number) => number;
    health: () => { hp: number; max: number };
    justHurt: () => boolean;
  };
  const before = engine.health().hp;
  let hurts = 0;
  for (let t = 0; t < 300; t++) {
    engine.step(HELD_RIGHT);
    if (engine.justHurt()) hurts++;
  }
  expect({ hurts, lost: before - engine.health().hp }).toEqual({ hurts: 1, lost: 1 });
});

test("nothing puts it out", () => {
  // The weapon already answers guards. Giving it a second use would make both
  // weaker, and fire would stop being a question about ROUTES.
  const level = parseLevel(room("roam", 6, AROUND));
  const engine = engineFor(level, PRESETS[0] as (typeof PRESETS)[number]) as unknown as {
    step: (h: number) => number;
    render: () => Uint8Array;
  };
  for (let t = 0; t < 120; t++) engine.step(HELD_ACT | HELD_SWING | HELD_RIGHT);
  expect([...engine.render()].filter((tile) => tile === TILE_FIRE).length).toBe(1);
});

test("a level whose only way through is on fire is still finishable", () => {
  // It is expensive, not impossible -- exactly what a guard is. Every
  // ready-made creature gets out, one heart lighter, and the win replays cold.
  for (const creature of PRESETS) {
    const text = room("roam", 6, THROUGH);
    const attempt = botPlays(text, creature);
    expect({ who: creature.name, won: attempt.won }).toEqual({ who: creature.name, won: true });
    expect(replayWins(text, creature, attempt.log)).toBe(true);
    const [hp, max] = attempt.hearts.split("/").map(Number) as [number, number];
    expect({ who: creature.name, cost: max - hp }).toEqual({ who: creature.name, cost: 1 });
  }
});

test("...and the bot walks round it when it can, like a child would", () => {
  // Refusing to cross would fail levels a child finishes; crossing when there
  // is a dry way would make the bot worse than one.
  for (const creature of PRESETS) {
    const attempt = botPlays(room("roam", 6, AROUND), creature);
    const [hp, max] = attempt.hearts.split("/").map(Number) as [number, number];
    expect({ who: creature.name, won: attempt.won, cost: max - hp }).toEqual({
      who: creature.name,
      won: true,
      cost: 0,
    });
  }
});

test("the side-on game gets the same entity, and gets out too", () => {
  const text = room("dash", 6, SPIKED);
  expect(parseLevel(text).fireCells.length).toBe(2);
  for (const creature of PRESETS) {
    const attempt = botPlays(text, creature);
    expect({ who: creature.name, won: attempt.won }).toEqual({ who: creature.name, won: true });
  }
});

test("one tile index, two worlds, and neither engine knows which", () => {
  // Hard rule 5: engines emit tile indices, presentation maps them. A flame
  // standing on grass would look like a mistake; spikes in a cave would not.
  expect(UNDERGROUND.fire).not.toEqual(OUTSIDE.fire);
  expect(UNDERGROUND.fire.length).toBe(8);
  expect(OUTSIDE.fire.length).toBe(8);
  for (const row of [...UNDERGROUND.fire, ...OUTSIDE.fire]) {
    expect(row.length).toBe(8);
    expect(row).toMatch(/^[.123]+$/);
  }
  // Spikes sit ON the ground, so the bottom row is solid and the top is not:
  // the shape has to say which way is down.
  expect((OUTSIDE.fire[7] as string).includes(".")).toBe(false);
  expect((OUTSIDE.fire[0] as string).includes(".")).toBe(true);
});

test("it cost the wire format nothing, so every old link still means what it meant", () => {
  // The entity kind field is 3 bits and only four values were ever used. Fire
  // is kind 4; kinds 5, 6 and 7 are still free.
  const text = room("roam", 6, AROUND);
  const code = encodeLevel(parseLevel(text));
  const back = decodeLevel(code);
  expect(back.fireCells.length).toBe(1);
  expect(encodeLevel(back)).toBe(code);
  // A level with no fire encodes to exactly the bytes it always did.
  const plain = room("roam", 6, AROUND.map((r) => r.replace("^", ".")));
  const level = parseLevel(plain);
  expect(level.fireCells.length).toBe(0);
  expect(decodeLevel(encodeLevel(level)).fireCells.length).toBe(0);
});

test("fire does not block the checks, because it does not block a route", () => {
  // Same posture the flood fill takes for guards: a hazard makes a route
  // expensive, and a level that is merely hard is a fine level.
  const failed = verifyLevelText(room("roam", 6, THROUGH))
    .checks.filter((check) => !check.ok)
    .map((check) => check.id);
  expect(failed).toEqual([]);
});

test("...but the editor says so, because it is worth knowing", () => {
  const forced = adviceFor(room("roam", 6, THROUGH));
  expect(forced.playable).toBe(true);
  expect(forced.notes.some((n) => !n.fatal && n.text.includes("only way to the door"))).toBe(true);
  // With a way round, there is nothing to say.
  const round = adviceFor(room("roam", 6, AROUND));
  expect(round.notes.filter((n) => n.text.includes("fire")).length).toBe(0);
});

test("a level can hold ten, because the wire format has room for that many", () => {
  // 31 entities in total, shared: a start, an exit, 8 treasure and 10 guards is
  // 20, which leaves 11. Ten is codeable however the rest is filled.
  expect(MAX_FIRE).toBe(10);
  let draft = blankDraft("roam", 6);
  for (let i = 0; i < MAX_FIRE + 4; i++) {
    draft = paint(draft, 3 + (i % 15), 5 + ((i / 15) | 0), GLYPH_FIRE).draft;
  }
  expect(tally(draft, GLYPH_FIRE)).toBe(MAX_FIRE);
});

test("v5 plays exactly as it did: v6 is a new version, not an edit", () => {
  // Hard rule 3. The rooms without fire have to be untouched, and the only way
  // to be sure is to run one and compare the hash.
  const noFire = AROUND.map((r) => r.replace("^", "."));
  for (const [engine, rows] of [["roam", noFire]] as const) {
    const five = engineFor(parseLevel(room(engine, 5, rows)), PRESETS[0] as (typeof PRESETS)[number]);
    const six = engineFor(parseLevel(room(engine, 6, rows)), PRESETS[0] as (typeof PRESETS)[number]);
    for (let t = 0; t < 150; t++) {
      five.step(HELD_RIGHT);
      six.step(HELD_RIGHT);
    }
    // Same inputs, no fire on the board: v6 must be v5 to the bit.
    expect(hashHex(six.stateHash())).toBe(hashHex(five.stateHash()));
  }
});

test("every build still routes, and v6 is what a new level pins", () => {
  const builds = knownBuilds();
  expect(builds).toContain("roam/6");
  expect(builds).toContain("dash/6");
  expect(builds).toContain("roam/5");
  expect(builds).toContain("dash/5");
  expect(newestBuild("roam")).toBe(6);
  expect(newestBuild("dash")).toBe(6);
});

test("a winning run through fire is a proof the share gate accepts", () => {
  const text = room("roam", 6, THROUGH);
  const creature = PRESETS[2] as (typeof PRESETS)[number];
  const attempt = botPlays(text, creature);
  expect(attempt.won).toBe(true);
  const engine = engineFor(parseLevel(text), creature);
  let status = 0;
  for (const held of attempt.log) status = engine.step(held);
  expect(status).toBe(STATUS_WON);
});
