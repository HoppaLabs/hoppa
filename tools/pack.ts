// The six levels the game opens with, written out rather than drawn by hand.
//
// A 24x14 grid typed as text is one miscounted column away from a level that
// will not parse, and the guard rule (spec L5: no patrol cycle longer than 8)
// is easy to break by accident -- a guard standing in a long corridor paces it
// end to end. Building them from parts means the parts can be checked.
//
// Every level here is verified by tools/verify-pack.ts: L1-L5, and then beaten
// by the bot with all three ready-made creatures.

import { GRID_H, GRID_W } from "../src/core/grid.ts";
import { encodeLevel } from "../src/core/codec.ts";
import { parseLevel } from "../src/core/level.ts";
import { slugify } from "../src/web/play/link.ts";

const WALL = "#";
const OPEN = ".";

/** A room under construction: a grid of glyphs you can paint into. */
class Room {
  private readonly cells: string[][];

  constructor(fill: string = OPEN) {
    this.cells = Array.from({ length: GRID_H }, () => Array.from({ length: GRID_W }, () => fill));
  }

  /** Walls all the way round: what a room underground is. */
  border(): this {
    for (let x = 0; x < GRID_W; x++) {
      (this.cells[0] as string[])[x] = WALL;
      (this.cells[GRID_H - 1] as string[])[x] = WALL;
    }
    for (let y = 0; y < GRID_H; y++) {
      (this.cells[y] as string[])[0] = WALL;
      (this.cells[y] as string[])[GRID_W - 1] = WALL;
    }
    return this;
  }

  /**
   * Just the ground, for a room with sky in it.
   *
   * A side-on room does not need walls up the sides or across the top: the
   * grid edge already stops you, in `fits()` in the engine, so those cells
   * were never felt -- only drawn. And drawn is the problem. Walls in the
   * side-on world are grass-topped earth, so a border put a bright green
   * frame around the sky.
   */
  ground(): this {
    return this.line(0, GRID_H - 1, GRID_W - 1, GRID_H - 1, WALL);
  }

  /**
   * A ladder up to a deck, poking ONE CELL above it.
   *
   * This is not decoration, it is the difference between a ladder that works
   * and one that does not. A ladder whose top rung is level with the deck
   * gives you nothing to hold at the top: the engine keeps you climbing only
   * while your body overlaps a ladder tile, and the cell you would stand on is
   * the gap the ladder came through, so there is no floor either. You rise,
   * lose the ladder, fall, catch it again, and bounce -- measured, and it is
   * exactly what "the character falls when it gets to the top" looks like.
   *
   * One rung higher and you climb clear of the deck, then walk off it.
   */
  ladder(x: number, deckY: number, bottomY: number): this {
    return this.line(x, deckY - 1, x, bottomY, "H");
  }

  put(x: number, y: number, glyph: string): this {
    if (x < 0 || y < 0 || x >= GRID_W || y >= GRID_H) {
      throw new Error(`(${x},${y}) is off the grid`);
    }
    (this.cells[y] as string[])[x] = glyph;
    return this;
  }

  /** A run of glyphs. Inclusive at both ends, either direction. */
  line(x1: number, y1: number, x2: number, y2: number, glyph: string): this {
    const steps = Math.max(Math.abs(x2 - x1), Math.abs(y2 - y1));
    const dx = Math.sign(x2 - x1);
    const dy = Math.sign(y2 - y1);
    for (let i = 0; i <= steps; i++) this.put(x1 + dx * i, y1 + dy * i, glyph);
    return this;
  }

  box(x1: number, y1: number, x2: number, y2: number, glyph: string): this {
    for (let y = y1; y <= y2; y++) for (let x = x1; x <= x2; x++) this.put(x, y, glyph);
    return this;
  }

  /**
   * A full-width wall with a gap, which is what every floor and every barrier
   * in the pack is. The gap is where the route goes.
   */
  wallRow(y: number, gaps: readonly number[], glyph: string = WALL): this {
    this.line(1, y, GRID_W - 2, y, glyph);
    for (const x of gaps) this.put(x, y, OPEN);
    return this;
  }

  /**
   * A floor in a room with no side walls, so it runs edge to edge.
   *
   * `wallRow` stops one cell short at each end, which is right inside a
   * bordered room and wrong without one: it would leave a one-cell hole at
   * either end of every floor, which reads as a mistake rather than a way
   * down.
   */
  deck(y: number, gaps: readonly number[]): this {
    this.line(0, y, GRID_W - 1, y, WALL);
    for (const x of gaps) this.put(x, y, OPEN);
    return this;
  }

  text(header: string): string {
    const rows = this.cells.map((row) => row.join(""));
    for (const row of rows) {
      if (row.length !== GRID_W) throw new Error(`row is ${row.length} wide, not ${GRID_W}`);
    }
    if (rows.length !== GRID_H) throw new Error(`${rows.length} rows, not ${GRID_H}`);
    return [header, ...rows].join("\n") + "\n";
  }
}

export interface PackLevel {
  readonly file: string;
  readonly name: string;
  /** What this room is for. One line, in the words a child would use. */
  readonly teaches: string;
  readonly text: string;
}

const roam = (seed: string) => `hoppa/1 roam seed=${seed} tiles=1 behaviour=7`;
const dash = (seed: string) => `hoppa/1 dash seed=${seed} tiles=1 behaviour=6`;

/* -------------------------------------------------------------------------- */

/** 1. An empty room with two gems. Nothing can go wrong here. */
function firstSteps(): string {
  const room = new Room().border();
  // A wall across the middle with two ways through, both of them clear.
  for (const y of [5, 6, 7]) room.wallRow(y, [7, 16]);
  // A guard pacing in the OPEN, not standing in a doorway.
  //
  // Two things decide where a guard can go. L5 refuses a patrol longer than
  // eight turns, and a patrol runs along whichever of its two openings is
  // LONGER -- so the usual answer is a one-cell gap through a thick band, which
  // gives a run of five. But that makes the guard a GATE: it fills the only way
  // past, and you have to time it. The bot walks straight at everything the way
  // a child does the first time, and on the slowest creature it died here every
  // single attempt, even with the gap widened to two cells.
  //
  // The floor below the band is five rows deep, which is already the longest
  // run L5 allows. So a guard standing in it is short-cycled for free, and two
  // blocks either side keep its sideways run shorter still. It paces up and
  // down in the middle of a room twenty cells wide: impossible to miss, and
  // impossible to be trapped by.
  room.put(11, 10, WALL).put(15, 10, WALL);
  room.put(13, 10, "G");
  // ...and the first thing that hurts and never moves. Both sit in open floor
  // with room either side, so they are something you SEE before they are ever
  // something you learn.
  room.put(5, 10, "^").put(19, 3, "^");
  room.put(4, 2, "$").put(20, 2, "$").put(12, 3, "$");
  room.put(3, 11, "@").put(19, 11, ">");
  return room.text(roam("1aa1"));
}

/**
 * 2. A snake. Every corridor is a dead end except at one side, so the route is
 * the whole room and there is nothing to work out but which way to turn.
 *
 * Guards go in the SHORT vertical joins, never the long corridors: a guard
 * paces the corridor it stands in, and a 22-cell corridor is a 42-tick cycle,
 * which L5 refuses and which no child could time anyway.
 */
function theLongWay(): string {
  const room = new Room().border();
  // One floor across the middle with a way up at the far right. Two rooms, and
  // the gems are deliberately not all on the way to the door.
  room.wallRow(6, [21]).wallRow(7, [21]);
  // No guards at all. This room teaches the route and nothing else -- and it is
  // also why it can be a long corridor: a guard paces the corridor it stands
  // in, and everything here is twenty cells wide.
  room.put(3, 10, "$").put(20, 3, "$").put(3, 3, "$");
  room.put(3, 12, "@").put(12, 12, ">");
  return room.text(roam("2bb2"));
}

/**
 * 3. Four gems in four corners, and three bands of shafts between them.
 *
 * The shape is the one the built-in level uses, and the reason is the guard
 * rule. A patrol runs until it hits a wall, so a guard is only short-cycled
 * inside a ONE-CELL shaft: three walled rows with a gap, open corridor above
 * and below, gives a five-cell run and a period of exactly 8 -- the most L5
 * allows. Guards in an open room pace the whole room and the check refuses it.
 */
function fourCorners(): string {
  const room = new Room().border();
  for (const y of [2, 3, 4]) room.wallRow(y, [3, 10, 20]);
  for (const y of [6, 7, 8]) room.wallRow(y, [7, 15, 21]);
  for (const y of [10, 11]) room.wallRow(y, [5, 11, 18]);
  room.put(2, 1, "$").put(21, 1, "$").put(2, 9, "$").put(21, 9, "$");
  room.put(3, 3, "B").put(15, 7, "G");
  room.put(11, 12, "@").put(18, 12, ">");
  return room.text(roam("3cc3"));
}

/** 4. The first side-on room: one ladder, and everything else is walking. */
function upAndOver(): string {
  // Ground and sky, no frame: see Room.ground().
  const room = new Room().ground();
  // Two floors. The gap in the upper floor is where the ladder comes through.
  room.deck(8, [4]);
  room.ladder(4, 8, 12);
  room.put(8, 7, "$").put(15, 7, "$");
  room.put(2, 12, "@").put(20, 7, ">");
  return room.text(dash("4dd4"));
}

/**
 * 5. Three floors, two ladders, and a guard on the middle one.
 *
 * The ladders are on opposite sides on purpose: you cannot go straight up, so
 * the room is a climb rather than a lift.
 */
function theTallRoom(): string {
  const room = new Room().ground();
  room.deck(5, [18]);
  room.deck(9, [4]);
  room.ladder(18, 5, 8);
  room.ladder(4, 9, 12);
  room.put(3, 4, "$").put(20, 8, "$").put(9, 12, "$");
  room.put(12, 8, "D");
  room.put(2, 12, "@").put(20, 4, ">");
  return room.text(dash("5ee5"));
}

/**
 * 6. Tight doorways with something walking through them.
 *
 * The hard one, and the reason it is not harder: with three guards on the only
 * route, two of the three ready-made creatures died every time the bot tried
 * it, and the bot plays the way a child plays the first time -- straight at
 * everything. Two guards, and a second way through every band.
 */
function theGauntlet(): string {
  const room = new Room().border();
  // The same three-band skeleton as room 3, because it is the only shape that
  // keeps a guard's patrol inside the eight-turn limit -- but every gap is
  // offset from the one above it, so there is no straight run anywhere.
  for (const y of [2, 3, 4]) room.wallRow(y, [2, 12, 21]);
  for (const y of [6, 7, 8]) room.wallRow(y, [6, 16]);
  for (const y of [10, 11]) room.wallRow(y, [4, 14, 20]);
  room.put(6, 1, "$").put(18, 1, "$").put(3, 5, "$").put(21, 9, "$");
  room.put(12, 3, "B").put(16, 7, "G");
  room.put(9, 12, "@").put(20, 12, ">");
  return room.text(roam("6ff6"));
}

/**
 * 7. Fire, and a way round it.
 *
 * The first room where the danger does not move. A guard is a question about
 * timing; fire is a question about which way you go, and this room asks it as
 * plainly as possible -- the short way is on fire and the long way is not.
 */
function theHotFloor(): string {
  const room = new Room().border();
  // A wall across the middle with three gaps. The near one is the short way
  // and it is burning; the far one costs you the length of the room.
  room.wallRow(7, [4, 12, 20]);
  room.put(4, 7, "^").put(12, 7, "^");
  room.line(9, 3, 14, 3, "^");
  room.put(2, 2, "$").put(21, 2, "$").put(11, 10, "$");
  room.put(3, 11, "@").put(20, 11, ">");
  return room.text(roam("7gg7"));
}

/**
 * 8. Every doorway is watched or burning, and never both.
 *
 * The two dangers finally in one room, doing the two different jobs they are
 * for: a guard you can wait out, a fire you cannot. The point of the room is
 * that waiting and walking are different answers.
 */
function theNarrowWay(): string {
  const room = new Room().border();
  // The three-band skeleton exactly: bands at 2-4, 6-8 and 10-11, ONE open row
  // between them. A guard's shaft is bounded by the open rows either side of
  // its band, so widening that gap to three rows gives a 7-cell run and L5
  // refuses it -- measured twice while drawing this room. See docs/adr/0030.
  for (const y of [2, 3, 4]) room.wallRow(y, [3, 11, 19]);
  for (const y of [6, 7, 8]) room.wallRow(y, [6, 15, 21]);
  for (const y of [10, 11]) room.wallRow(y, [4, 13, 19]);
  // Fire in one gap of each band, so there is always another way and it is
  // always longer.
  room.put(11, 3, "^").put(15, 7, "^").put(13, 10, "^");
  room.put(3, 3, "B");
  room.put(2, 1, "$").put(21, 1, "$").put(2, 9, "$").put(21, 9, "$");
  room.put(11, 12, "@").put(19, 12, ">");
  return room.text(roam("8hh8"));
}

/**
 * 9. Spikes, from the side, where fire would look like a mistake.
 *
 * Same entity, same rules, drawn as spikes because the world here is grass and
 * sky. Gravity does the rest of the work: a bed of spikes under a gap is a
 * question about where you land.
 */
function mindTheSpikes(): string {
  const room = new Room().ground();
  // Nothing here asks for a stunt, and it took two drafts to get there.
  //
  // The first made you jump a bed of spikes on the ground: a jump clears two
  // cells and lands short of a third, so every creature timed out on a
  // precision no child would enjoy discovering. The second put a hole in the
  // deck with spikes under it, which reads well and kills the bot outright --
  // it does not jump gaps, so it fell in every time.
  //
  // What is left is the honest version: spikes IN the way, two cells of them,
  // walk through for a heart or go round. Which is what a hazard that does not
  // move is for.
  room.deck(8, [4]);
  room.ladder(4, 8, 12);
  // On the deck, in the way, and only two cells of it. You can walk through
  // for a heart or you can go back down and round -- which is the same
  // question the top-down rooms ask, asked with gravity in the room.
  room.line(12, 7, 13, 7, "^");
  room.put(7, 7, "$").put(18, 7, "$").put(8, 12, "$");
  room.put(2, 12, "@").put(21, 7, ">");
  return room.text(dash("9ii9"));
}

export const PACK: readonly PackLevel[] = [
  {
    file: "1-first-steps.lvl",
    name: "first steps",
    teaches: "pick the gems up, then the door opens",
    text: firstSteps(),
  },
  {
    file: "2-the-long-way.lvl",
    name: "the long way",
    teaches: "a room can double back \u2014 the gems are not all on your way",
    text: theLongWay(),
  },
  {
    file: "3-four-corners.lvl",
    name: "four corners",
    teaches: "plan a loop rather than chasing the nearest gem",
    text: fourCorners(),
  },
  {
    file: "4-up-and-over.lvl",
    name: "up and over",
    teaches: "from the side: ladders go up, and gravity does the rest",
    text: upAndOver(),
  },
  {
    file: "5-the-tall-room.lvl",
    name: "the tall room",
    teaches: "three floors, and the ladders are never above one another",
    text: theTallRoom(),
  },
  {
    file: "6-the-gauntlet.lvl",
    name: "the gauntlet",
    teaches: "pick the doorway that is not being walked through",
    text: theGauntlet(),
  },
  {
    file: "7-the-hot-floor.lvl",
    name: "the hot floor",
    teaches: "the short way is on fire; the long way is not",
    text: theHotFloor(),
  },
  {
    file: "8-the-narrow-way.lvl",
    name: "the narrow way",
    teaches: "a guard you can wait out, a fire you cannot",
    text: theNarrowWay(),
  },
  {
    file: "9-mind-the-spikes.lvl",
    name: "mind the spikes",
    teaches: "walk through for a heart, or go round the long way",
    text: mindTheSpikes(),
  },
];

/**
 * The pack as the web build sees it: a name and a code, nothing else.
 *
 * Codes rather than level text, because the play page only ever needs to build
 * a link out of one. Six levels as text would be two kilobytes in a bundle a
 * child downloads on mobile data; as codes it is under six hundred bytes.
 */
function packModule(): string {
  const lines = [
    "// GENERATED by tools/pack.ts -- do not edit. Run `bun run tools/pack.ts`.",
    "//",
    "// The six rooms the game opens with. Every one is checked by",
    "// test/pack.test.ts: L1-L5, and then beaten by the bot in tools/bot.ts with",
    "// all three ready-made creatures, with the winning run replayed to prove it.",
    "",
    "export interface PackLevel {",
    "  readonly slug: string;",
    "  readonly name: string;",
    "  /** What this room is for, in the words a child would use. */",
    "  readonly teaches: string;",
    "  readonly code: string;",
    "}",
    "",
    "export const PACK: readonly PackLevel[] = [",
  ];
  for (const level of PACK) {
    const code = encodeLevel(parseLevel(level.text));
    lines.push("  {");
    lines.push(`    slug: ${JSON.stringify(slugify(level.name))},`);
    lines.push(`    name: ${JSON.stringify(level.name)},`);
    lines.push(`    teaches: ${JSON.stringify(level.teaches)},`);
    lines.push(`    code: ${JSON.stringify(code)},`);
    lines.push("  },");
  }
  lines.push("];");
  lines.push("");
  return lines.join("\n");
}

if (import.meta.main) {
  for (const level of PACK) {
    await Bun.write(`levels/pack/${level.file}`, level.text);
    console.log(`  levels/pack/${level.file}`);
  }
  await Bun.write("src/core/pack.ts", packModule());
  console.log("  src/core/pack.ts");
}
