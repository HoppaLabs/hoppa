import { expect, test } from "bun:test";
import { parseLevel } from "../src/core/level.ts";
import { encodeLevel, decodeLevel, CodecError, MAX_CURRENTS } from "../src/core/codec.ts";
import { engineFor, knownBuilds } from "../src/engines/registry.ts";
import { PRESETS } from "../src/core/creature.ts";
import { HELD_LEFT, HELD_RIGHT } from "../src/engines/types.ts";
import { FLOW_PUSH } from "../src/engines/swim/v2.ts";
import { TILE_FLOW } from "../src/core/tiles.ts";
import { blankDraft, draftFromLevel, FLOW_SET, MAX_FLOW, paint } from "../src/core/draft.ts";

// swim/2 -- currents. See docs/adr/0039.
//
// The reason the engine earns its keep. swim/1 could swim and could drown, and
// a strong creature had no reason to exist in it: with free movement nothing is
// out of reach, so STRENGTH bought hearts and sword hits and nothing about
// ROUTE. A current gives it back, and inverts the obvious.

/**
 * A swim level from twelve rows of exactly 24 characters.
 *
 * The width is asserted rather than assumed: the first draft of these tests
 * built rows with padEnd and string replaces, and two of them came out 23 and
 * 25 characters wide, which the parser rejects for reasons that have nothing to
 * do with what the test was checking.
 */
function swimLevel(rows: readonly string[], behaviour = 2): string {
  expect(rows).toHaveLength(14);
  for (const row of rows) expect({ row, wide: row.length }).toEqual({ row, wide: 24 });
  return [`hoppa/1 swim seed=0 tiles=1 behaviour=${behaviour}`, ...rows].join("\n");
}

/** A three-row corridor flowing RIGHT, with you at its right-hand end. */
function corridor(behaviour = 2): string {
  return [
    `hoppa/1 swim seed=0 tiles=1 behaviour=${behaviour}`,
    "........................",
    "#......................#",
    "########################",
    "#.rrrrrrrrrrrrrrrrrr.@.#",
    "#.rrrrrrrrrrrrrrrrrrrr.#",
    "########################",
    ...Array.from({ length: 6 }, () => "#......................#"),
    "#.....................>#",
    "########################",
  ].join("\n");
}

interface Swimmer {
  step(held: number): number;
  where(): { x: number; y: number };
  render(): Uint8Array;
}

/** Cells gained upstream in ten seconds of swimming into the flow. */
function upstream(who: (typeof PRESETS)[number], behaviour = 2): number {
  const engine = engineFor(parseLevel(corridor(behaviour)), who) as unknown as Swimmer;
  for (let tick = 0; tick < 10; tick++) engine.step(0);
  const from = engine.where().x;
  for (let tick = 0; tick < 300; tick++) engine.step(HELD_LEFT);
  return (from - engine.where().x) / 256;
}

test("the slowest creature is the fastest one through a current", () => {
  // The whole point, and the thing that was missing from swim/1. Nim is nearly
  // twice Bash's speed in open water -- 50 subcells a tick against 26 -- and
  // less than half as effective against a current.
  const gained = PRESETS.map((who) => ({ name: who.name, cells: upstream(who) }));
  console.log(
    "\n  ten seconds swimming into the flow:\n" +
    gained.map((g) => `    ${g.name.padEnd(6)} ${g.cells >= 0 ? "+" : ""}${g.cells.toFixed(2)} cells`).join("\n"),
  );
  const bash = gained.find((g) => g.name === "Bash")?.cells ?? 0;
  const nim = gained.find((g) => g.name === "Nim")?.cells ?? 0;
  const pell = gained.find((g) => g.name === "Pell")?.cells ?? 0;

  expect(bash).toBeGreaterThan(pell);
  expect(pell).toBeGreaterThan(nim);
  // Not a rounding difference -- a difference you would plan a route around.
  expect(bash).toBeGreaterThan(nim * 2);
  // ...and nobody is stopped dead. A current you cannot beat is a wall, and a
  // wall with no answer is what the water bucket exists to stop being a thing.
  expect(nim).toBeGreaterThan(0);
});

test("the push is above a fast creature's own speed, or none of it matters", () => {
  // Chosen against the speed table rather than picked. The fastest creature in
  // the game swims at 50 subcells a tick; a push under that is decoration.
  expect(FLOW_PUSH).toBeGreaterThan(50);
});

test("standing still in a current carries you off", () => {
  // Started at the LEFT end this time: in corridor() the start sits at the far
  // end of the flow, pressed against the rock it is being pushed into, which
  // is a fine level and a useless measurement.
  const swept = swimLevel([
    "........................",
    "#......................#",
    "########################",
    "#.@rrrrrrrrrrrrrrrrrrr.#",
    "#..rrrrrrrrrrrrrrrrrrr.#",
    "########################",
    "#......................#",
    "#......................#",
    "#......................#",
    "#......................#",
    "#......................#",
    "#......................#",
    "#.....................>#",
    "########################",
  ]);
  const engine = engineFor(parseLevel(swept), PRESETS[1] as (typeof PRESETS)[number]) as unknown as Swimmer;
  // Into the flow first: the start cannot itself be a current, because a cell
  // holds one glyph, so every swim level has you step into the water.
  for (let tick = 0; tick < 20; tick++) engine.step(HELD_RIGHT);
  const from = engine.where().x;
  for (let tick = 0; tick < 30; tick++) engine.step(0);
  const carried = (engine.where().x - from) / 256;
  console.log(`\n  one second of doing nothing in a current: carried ${carried.toFixed(2)} cells`);
  expect(carried).toBeGreaterThan(0.5);
});

test("swim/1 has no currents, because that is how its links were played", () => {
  // Hard rule 3. A level pinned to swim/1 has still water in it, whatever its
  // glyphs say, because that is the game the person who beat it played.
  const still = upstream(PRESETS[1] as (typeof PRESETS)[number], 1);
  const flowing = upstream(PRESETS[1] as (typeof PRESETS)[number], 2);
  console.log(`\n  the same swim, same room: swim/1 ${still.toFixed(2)} cells, swim/2 ${flowing.toFixed(2)}`);
  expect(still).toBeGreaterThan(flowing);
  expect(knownBuilds()).toContain("swim/1");
});

test("a current is one tile index, and the level says which way", () => {
  // Hard rule 5: an engine emits an index and knows nothing about the picture.
  // Four indices would have spent a quarter of the 16-tile budget on something
  // the level already knows.
  const level = parseLevel(corridor());
  const engine = engineFor(level, PRESETS[0] as (typeof PRESETS)[number]) as unknown as Swimmer;
  const drawn = [...engine.render()].filter((t) => t === TILE_FLOW).length;
  expect(drawn).toBeGreaterThan(20);
  expect(level.currentDirs.every((d) => d === 1)).toBe(true);
});

// --- the wire ----------------------------------------------------------------

test("currents cost every level that is not underwater nothing at all", () => {
  // Carried behind the engine id, exactly as ladders are for dash. A decoder
  // knows from the header whether to expect the field, so no existing link
  // pays a single bit for a feature it cannot use.
  const dry = parseLevel([
    "hoppa/1 roam seed=0 tiles=1 behaviour=8",
    "########################",
    "#.@...................>#",
    ...Array.from({ length: 11 }, () => "#......................#"),
    "########################",
  ].join("\n"));
  const before = encodeLevel(dry).length;
  expect(dry.currentCells.length).toBe(0);
  console.log(`\n  a top-down level is still ${before} chars`);
  expect(decodeLevel(encodeLevel(dry)).currentCells.length).toBe(0);
});

test("a current survives the round trip, pointing the same way", () => {
  const ALL_FOUR = swimLevel([
    "........................",
    "#......................#",
    "########################",
    "#.rrrrllllsuuuuddddss.@#".replace(/s/g, "."),
    "#......................#",
    "########################",
    "#......................#",
    "#......................#",
    "#......................#",
    "#......................#",
    "#......................#",
    "#......................#",
    "#.....................>#",
    "########################",
  ]);
  const level = parseLevel(ALL_FOUR);
  const back = decodeLevel(encodeLevel(level));
  expect([...back.currentCells]).toEqual([...level.currentCells]);
  expect([...back.currentDirs]).toEqual([...level.currentDirs]);
  // All four directions really did make it, not just the default.
  expect(new Set(back.currentDirs).size).toBe(4);
});

test("too many currents is refused loudly, never trimmed quietly", () => {
  // Writing the first 24 and dropping the rest hands somebody a link that
  // plays differently from the level they drew, with nothing saying so.
  // Twenty-six cells across two rows: one over the cap, and no row wider than
  // the grid.
  const tooMany = parseLevel(swimLevel([
    "........................",
    "#.@....................#",
    "#.rrrrrrrrrrrrr........#",
    "#.rrrrrrrrrrrrr........#",
    "#......................#",
    "#......................#",
    "#......................#",
    "#......................#",
    "#......................#",
    "#......................#",
    "#......................#",
    "#......................#",
    "#.....................>#",
    "########################",
  ]));
  expect(tooMany.currentCells.length).toBeGreaterThan(MAX_CURRENTS);
  expect(() => encodeLevel(tooMany)).toThrow(CodecError);
});

// --- the editor --------------------------------------------------------------

test("currents are an underwater tool and nothing else", () => {
  for (const engine of ["roam", "dash"]) {
    const refused = paint(blankDraft(engine, 1), 8, 8, "r");
    expect({ engine, changed: refused.changed, why: refused.reason })
      .toEqual({ engine, changed: false, why: "currents are an underwater thing" });
  }
  const allowed = paint(blankDraft("swim", 2), 8, 8, "r");
  expect(allowed.changed).toBe(true);
});

test("the editor stops you before the link does", () => {
  // MAX_FLOW and the codec's MAX_CURRENTS are the same number on purpose: a
  // child should be told they have run out while they are drawing, not handed
  // a level that will not encode.
  expect(MAX_FLOW).toBe(MAX_CURRENTS);
  let draft = blankDraft("swim", 2);
  for (let i = 0; i < MAX_FLOW; i++) {
    const step = paint(draft, 1 + (i % 20), 3 + Math.floor(i / 20), "r");
    draft = step.draft;
  }
  const over = paint(draft, 21, 9, "r");
  expect(over.changed).toBe(false);
  expect(over.reason).toContain("all a link will carry");
});

test("opening a water level in the editor keeps its currents pointing", () => {
  // Without this, opening a level and saving it back flattens every current --
  // the same class of bug as the enemies losing their kind.
  const ALL_FOUR = swimLevel([
    "........................",
    "#......................#",
    "########################",
    "#.rrrrllllsuuuuddddss.@#".replace(/s/g, "."),
    "#......................#",
    "########################",
    "#......................#",
    "#......................#",
    "#......................#",
    "#......................#",
    "#......................#",
    "#......................#",
    "#.....................>#",
    "########################",
  ]);
  const level = parseLevel(ALL_FOUR);
  const draft = draftFromLevel(level as never);
  const kept = draft.cells.filter((g) => FLOW_SET.includes(g)).join("");
  console.log(`\n  reopened and still pointing: ${kept}`);
  expect(kept).toBe("rrrrlllluuuudddd");
  expect(new Set(kept).size).toBe(4);
});
