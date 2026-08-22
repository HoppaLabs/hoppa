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

const roam = (seed: string) => `hoppa/1 roam seed=${seed} tiles=0 behaviour=9`;
const dash = (seed: string) => `hoppa/1 dash seed=${seed} tiles=0 behaviour=9`;
const swim = (seed: string) => `hoppa/1 swim seed=${seed} tiles=0 behaviour=4`;
const calm = (seed: string) => `hoppa/1 calm seed=${seed} tiles=0 behaviour=3`;
// The beach is the garden's engine drawn somewhere else: same rules, tiles=5.
// See FIRST_SKIN in src/core/tileset.ts.
const beach = (seed: string) => `hoppa/1 calm seed=${seed} tiles=5 behaviour=3`;
// The city is its own GAME as well as its own world: raze/1 is the adventure
// game where a strong creature brings a building down. A new engine id rather
// than roam/9, so no cave level changes -- see src/engines/raze/v1.ts.
const city = (seed: string) => `hoppa/1 raze seed=${seed} tiles=6 behaviour=1`;

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

/**
 * 4. The first side-on room: a ladder, and the first thing you jump.
 *
 * It was a ladder and then walking, in a game with a jump button -- three
 * side-on rooms and not one of them asked you to leave the ground. That was
 * not a design choice, it was the verifier: the bot could not clear a gap, so
 * a room that needed one could not be proved beatable and therefore could not
 * ship. The bot can jump now (tools/bot.ts), so the rooms can ask.
 *
 * A staircase first, because a step you walk into and hop over is the gentlest
 * possible way to be told the button exists.
 */
function upAndOver(): string {
  // Ground and sky, no frame: see Room.ground().
  const room = new Room().ground();
  // Two floors. The gap in the upper floor is where the ladder comes through.
  room.deck(8, [8]);
  room.ladder(8, 8, 12);
  // One block, ON THE WAY, with a gem on top of it.
  //
  // The first draft put a staircase past the ladder, which meant climbing to
  // the deck, seeing the gem below, and coming back down for it -- a detour,
  // and it made the gentlest room in the game the longest. Between the start
  // and the ladder it is not a detour at all: you walk into it, you stop, you
  // hop, and the gem is right there. That is the whole lesson.
  room.put(5, 12, "#").put(5, 11, "$");
  room.put(12, 7, "$").put(17, 7, "$");
  room.put(2, 12, "@").put(21, 7, ">");
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
  // The hole in the deck is back, and this time it is fair.
  //
  // Three drafts got here. The first made you jump a bed of spikes on the
  // ground: a jump clears two cells and lands short of a third, so every
  // creature timed out on a precision no child would enjoy discovering. The
  // second put a hole in the deck with spikes under it, which reads well and
  // killed the BOT outright -- it did not jump gaps, so it fell in every time,
  // and a room the verifier cannot finish cannot ship. So the third draft was
  // spikes standing in the way on a flat deck: honest, and dull.
  //
  // The bot jumps gaps now. So: a two-cell hole with spikes at the bottom of
  // it, which is the shape this room was always meant to be. Fall in and it
  // costs a heart and a climb, not the level -- the ladder is still there.
  // Two holes, not one: the last side-on room should be the longest of the
  // three and it was the shortest, which is the wrong way round for the room a
  // child reaches last. The wide one has the spikes under it and is the one
  // that costs something to get wrong; the narrow one is just a step over.
  // Two holes: a wide one with the spikes under it, and a narrow one further
  // along that is just a step over. The last side-on room came out the
  // SHORTEST of the three, which is the wrong way round for the room a child
  // reaches last.
  room.deck(8, [4, 12, 13, 18]);
  room.ladder(4, 8, 12);
  room.line(12, 12, 13, 12, "^");
  // One gem on the ground at the far end, past the spikes: the last room asks
  // you to go down, come back along underneath, and climb out again. It was
  // the SHORTEST of the three side-on rooms, which is the wrong way round for
  // the one a child reaches last.
  room.put(7, 7, "$").put(16, 7, "$").put(21, 7, "$").put(8, 12, "$");
  room.put(2, 12, "@").put(22, 7, ">");
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
  {
    file: "10-the-reef.lvl",
    name: "the reef",
    teaches: "strength beats a current, speed goes round the long way",
    text: theReef(),
  },
  {
    file: "11-the-tall-rocks.lvl",
    name: "the tall rocks",
    teaches: "weave between the stacks; a current across pushes you off",
    text: theTallRocks(),
  },
  {
    file: "12-the-wreck.lvl",
    name: "the wreck",
    teaches: "down into the hold, and strength is what gets you back out",
    text: theWreck(),
  },
  {
    file: "13-the-garden.lvl",
    name: "the garden",
    teaches: "pick the flowers, mind the bear, keep out of the ponds",
    text: theGarden(),
  },
  {
    file: "14-the-beach.lvl",
    name: "the beach",
    teaches: "pick the shells up, mind the crab, keep out of the sea",
    text: theBeach(),
  },
  {
    file: "15-the-city.lvl",
    name: "the city",
    teaches: "get the people to the evac zone, and mind the kaiju",
    text: theCity(),
  },
];



/**
 * The reef. The one shipped room in the water, and the one that teaches what
 * a current is for.
 *
 * Built round the thing that makes swimming different from walking, which is
 * that STRENGTH decides how well you get up a current and SPEED decides
 * everything else. So there are two ways down to the gem at the bottom:
 * straight down the rising current, which a strong creature manages and a fast
 * one is pushed back out of, or the long way round the outside, which a fast
 * one does quicker than a strong one manages the short way.
 *
 * IT USED TO TEACH THE AIR AS WELL, and on swim/3 there is no air to teach:
 * the deep gem was placed far enough down that the trip back up was a decision
 * rather than a formality, and now it is simply the long way to a gem. That is
 * still a route worth having, so the room is unchanged apart from the version
 * it pins. See docs/adr/0042.
 */
function theReef(): string {
  const room = new Room().border();
  // The top row is the surface: rock everywhere else, open along the top, which
  // is what a swim frame is. border() walls it, so open it back up.
  for (let x = 0; x < GRID_W; x++) room.put(x, 0, OPEN);

  // A shelf across the middle with one gap, so the room has an upstairs and a
  // downstairs and one obvious way between them.
  room.line(1, 6, 15, 6, WALL);
  room.line(19, 6, 22, 6, WALL);

  // The rising current, in the gap. Swim down it if you can.
  room.line(17, 7, 17, 11, "u");

  // Something living in it. The reef shipped with NO creatures at all -- three
  // sea sprites drawn and a room with nothing to put them in, which an audit
  // across the four games found and no test would have.
  //
  // NO CREATURE IN THIS ROOM, and that is a decision rather than an oversight.
  //
  // Three attempts. In the open water you cross: all three creatures died. Off
  // the route at (4,10): Bash and Pell got out, Nim -- the four-heart one --
  // lost every heart with plenty of air left and nowhere near the urchins,
  // because an enemy notices you within SIGHT (three cells) and then follows.
  // Boxed into a pocket behind a ledge: the ledge blocked the way out instead.
  //
  // The reef already asks two things at once, which is a lot for one room: come
  // up for air, and get up a current. A thing that hunts you while you are
  // learning both is a third, and the shipped rooms have to survive a bot that
  // never dodges -- which is the same bar as a child on their first go.
  //
  // The sharks and the kraken are drawn and they are in the cast. They turn up
  // the moment anybody paints one, which is where a hunting thing belongs: in a
  // room somebody chose to make hard.


  // Urchins on the seabed, so the bottom is somewhere to be careful.
  room.line(6, 12, 7, 12, "^").put(13, 12, "^");

  // Gems: two easy ones up top, one at the bottom of the current.
  room.put(3, 2, "$").put(20, 3, "$").put(17, 12, "$");

  room.put(2, 1, "@").put(21, 11, ">");
  return room.text(swim("ssss"));
}

/**
 * The tall rocks. The second room in the water, and the one that teaches what
 * a SIDEWAYS current does.
 *
 * It was drafted as a kelp forest, and the name did not survive looking at it:
 * a wall in the reef is drawn as rock with a green top, so the "kelp" came out
 * as a row of stone stacks. Naming a room after something it does not look
 * like is the same class of mistake as the palette that said goblin over a
 * picture of a shark -- so the room is named after what is on the screen.
 *
 * "The users are asking for more underwater templates" -- one shipped room in
 * a whole game is not a template shelf, it is an example. The reef teaches the
 * rising current; this one teaches the other thing a current can be, which is
 * a thing that pushes you off your line while you are trying to thread a gap.
 *
 * Kelp is drawn as rock, in columns from the seabed up with a gap over each
 * one, so the room reads as a forest to weave through rather than a wall to
 * find the door in. Every column has a way past both above and beside it: this
 * is a room to feel your way through, not a maze to solve.
 *
 * No creature in it, for the reason the reef has none -- see theReef(). A room
 * that ships has to survive a bot that never dodges, and that is the same bar
 * as a child on their first go.
 */
function theTallRocks(): string {
  const room = new Room().border();
  for (let x = 0; x < GRID_W; x++) room.put(x, 0, OPEN);

  // Four stacks, rooted on the seabed, none of them reaching the surface.
  // Uneven heights, because a row of equal columns reads as a comb.
  const stacks: readonly (readonly [number, number])[] = [[5, 5], [9, 7], [14, 4], [18, 6]];
  for (const [x, top] of stacks) room.line(x, top, x, GRID_H - 2, WALL);

  // The currents run ACROSS, in the open water above the stacks: swim through
  // them and you arrive one stand along from where you aimed. A strong
  // creature holds its line; a fast one gets there first anyway.
  room.line(6, 2, 8, 2, "r");
  room.line(15, 3, 17, 3, "l");

  // Urchins at the foot of two stacks, so the seabed is somewhere to be
  // careful rather than the easy way along.
  room.line(10, 12, 11, 12, "^").put(16, 12, "^");

  // Gems: one in the open above, two down among the stacks where the current
  // cannot help you.
  room.put(11, 1, "$").put(7, 9, "$").put(16, 8, "$").put(21, 11, "$");

  room.put(2, 1, "@").put(21, 2, ">");
  return room.text(swim("rock"));
}

/**
 * The wreck. The third room in the water, and the longest.
 *
 * A hull on the seabed with two ways in, and the thing inside it is a DOWN
 * current in the hold -- the first current in the pack that pushes you
 * somewhere you did not mean to go rather than somewhere you did. Swim in
 * over the deck, drop through the hatch, take the gem, and come out of the
 * hole in the bow.
 *
 * The way out is above the wreck rather than inside it, so the room ends by
 * asking you to climb back out of the thing you just climbed into.
 */
function theWreck(): string {
  const room = new Room().border();
  for (let x = 0; x < GRID_W; x++) room.put(x, 0, OPEN);

  // The deck of the wreck, with a hatch amidships and a hole at the bow.
  // TWO CELLS WIDE, both of them.
  //
  // A one-cell gap in a wall is something a router walks into rather than
  // through: the fast creature spent two minutes bouncing left and right
  // underneath a single-cell hatch with every gem already picked up. The reef
  // has a three-cell gap in its shelf and nothing has ever caught on it.
  room.line(4, 7, 19, 7, WALL);
  room.line(5, 7, 6, 7, OPEN);     // the hole in the bow
  room.line(10, 7, 11, 7, OPEN);   // the hatch amidships
  // The hull sides, which stop short of the seabed so you can swim out under.
  room.line(4, 8, 4, 10, WALL);
  room.line(19, 8, 19, 10, WALL);

  // A broken mast: a stub, not a pole.
  //
  // It was four cells tall and the fast creature spent the whole two minutes
  // bouncing off the side of it -- a one-cell-wide wall standing in open water
  // is something a router walks into rather than round, and what a router does
  // there is what a child does there. Snapped off at the deck, it reads as a
  // wreck and gets in nobody's way.
  room.line(14, 5, 14, 6, WALL);

  // The hold: a down current, and NOT under the hatch.
  //
  // It was under it, and it made the room unwinnable for the middle creature:
  // the bot came back up for the gem on deck, met the current head on in the
  // only opening it knew, and spent the rest of the two minutes being pushed
  // back down. Strong got through and fast went round; middling did neither.
  // A current across the only way out is not a challenge, it is a door.
  //
  // Beside the hatch, it is what it was meant to be: a ride DOWN to the gem
  // in the bilge, with clear water either side of it to come back up through.
  room.line(15, 8, 15, 10, "d");

  // Urchins in the hold, off to one side of the current so the drop is safe
  // and the wander round the bottom is not.
  room.line(7, 12, 8, 12, "^");

  // Gems: one on deck, one in the hold at the bottom of the current, one out
  // past the stern where nothing helps you.
  room.put(9, 5, "$").put(15, 11, "$").put(21, 10, "$").put(2, 11, "$");

  room.put(2, 1, "@").put(21, 2, ">");
  return room.text(swim("wrck"));
}

/**
 * The garden. Somewhere to be, rather than something to beat.
 *
 * The tenth room and the only one that is not a challenge -- asked for as "a
 * cosy place to hang out for your friend's creatures". So it is built like a
 * garden and not like a level: no way out, no route to solve, and nothing in
 * it that can hurt anybody.
 *
 * Everything a level uses to make a SHAPE, a garden uses to make a PLACE:
 *
 *   * two ponds, because water is what you walk round, and walking round
 *     something is what turns an open field into somewhere with corners
 *   * hedges in clumps rather than lines, so nothing reads as a wall you are
 *     meant to find the gap in
 *   * a path, which is the ladder tile doing the one job a ladder cannot do
 *     in a level with no gravity
 *   * flowers spread to the corners, since picking them is the activity and a
 *     flower you can see from the last one is not worth crossing to
 *   * four bunnies, well apart, so there is always one somewhere to go and find
 */
function theGarden(): string {
  const room = new Room().border();

  // CLUSTERED, not scattered. The first garden spaced everything evenly across
  // the room, which is how you lay out a LEVEL -- each obstacle its own problem,
  // nothing near anything else -- and it is exactly why a room that was a third
  // full still read as empty. A place is the other way round: things gather,
  // and the gaps between the gatherings are what make it feel like somewhere.
  //
  // So: three corners of planting, one pond with a bridge, and a wide open lawn
  // through the middle to walk across.

  // A pond in the west, with a bridge over it. Nine cells, which is what the
  // ten-cell water budget allows and enough that a crossing leaves water
  // showing on both sides of the planks.
  room.box(4, 6, 6, 8, "^");
  room.line(3, 7, 7, 7, "H");

  // The orchard, north-east: trees standing apart, which is what makes them
  // trees. A lone wall cell has no wall beside it and is drawn as a canopy;
  // put two together and they are a hedge instead.
  room.put(16, 2, WALL).put(19, 3, WALL).put(21, 2, WALL);
  room.put(18, 6, WALL).put(21, 6, WALL);
  // Flowers under the trees, in a bed rather than one each.
  room.put(17, 3, "$").put(20, 4, "$").put(19, 2, "$");

  // A thicket in the south-west, behind the pond: a proper mass of hedge, and
  // the one thing in the room you cannot see over.
  room.box(2, 10, 5, 11, WALL);
  room.put(7, 11, WALL);          // one tree pulled out of it, on its own

  // A second bed, south-east, tucked against a short hedge.
  room.box(16, 10, 19, 10, WALL);
  room.put(17, 11, "$").put(18, 11, "$").put(20, 11, "$");

  // Two more trees loose on the lawn, so the middle is not bare.
  room.put(11, 4, WALL).put(12, 9, WALL);

  // The creatures gather where the cover is, the way animals do. On calm/2 the
  // glyph decides what a thing DOES, so this line is the level design and not
  // the dressing: "B" and "D" are a bunny and a squirrel and neither of them
  // will ever come after you.
  room.put(3, 12, "B").put(6, 12, "D");
  room.put(19, 4, "D");
  room.put(13, 6, "B");

  // ONE bear, and it is a long way from where you start. It hunts, so a child
  // meets it having already learned the pad on a lawn full of things that do
  // not -- and it stands between the south-east flower bed and the gate, which
  // is what makes the sword worth having.
  room.put(17, 8, "G");

  // Two flowers out on the lawn, so there is a reason to cross it.
  room.put(10, 7, "$").put(13, 11, "$");

  // You in the north-west, the gate in the south-east, and the whole garden in
  // between. calm/1 had no door because there was nowhere to get to; calm/2
  // was asked for with one. See adr/0045.
  room.put(2, 2, "@");
  room.put(21, 12, ">");
  return room.text(calm("cccc"));
}

/**
 * The beach. The garden's rules, at the seaside.
 *
 * "We have a request for beach levels." A beach is not a new game -- it is
 * somewhere else to put one, and the garden's rules already fit it exactly:
 * one thing that chases you, two that do not, water to walk round, a plank
 * across it and something to collect. So this room is calm/2 with tiles=5,
 * which is the first level in the pack whose `tiles=` field says anything at
 * all. See FIRST_SKIN in src/core/tileset.ts.
 *
 * Laid out like a beach rather than like a garden, which is the whole reason
 * to have both: the sea takes one WHOLE EDGE instead of sitting in the middle
 * as a pond, so the room has a shore rather than an obstacle. Everything else
 * lines up along it -- shells at the waterline, a jetty out over the water,
 * palms up on the dry sand, and the crab down where the crabs are.
 */
function theBeach(): string {
  const room = new Room().border();

  // THE SEA IS ALONG THE BOTTOM, and it costs nothing.
  //
  // It used to be a bay of ten cells, and there is a good reason it was: water
  // is an ENTITY and the wire format holds ten of them, so a strip along the
  // whole bottom edge came to forty-four cells and would not encode.
  //
  // The rim solves it. A beach draws its bottom edge as sea whether or not
  // anybody paints one -- see Tileset.rim -- so the shoreline is free, and the
  // ten entities can be spent on water that reaches UP the beach instead of on
  // the line that was always going to be there. Painted water in the row above
  // the edge joins it into one body with one shoreline (see openSides).
  room.line(9, 12, 14, 12, "^");
  room.line(11, 11, 13, 11, "^");

  // A jetty out over it. In the garden the plank tile is a bridge across a
  // pond; here it is the one way to stand out on the water.
  room.line(12, 10, 12, 12, "H");

  // TWO LITTLE CASTLES, which is what a beach is for.
  //
  // Asked for exactly: "not surrounded by sandcastle walls, they should be
  // little castles inside with walls around them". A ring of wall is a castle
  // -- the corners come out as turrets and the runs between them as
  // battlements, all read off the shape (see isTurret and castleFor) -- so a
  // rectangle with a hollow middle is a keep with a courtyard in it, and it
  // costs the wire format nothing beyond the wall cells themselves.
  //
  // A way in on each, because a castle you cannot get into is a block of sand.
  room.box(3, 4, 7, 7, WALL);
  room.put(5, 7, OPEN);
  room.box(16, 3, 20, 6, WALL);
  room.put(18, 6, OPEN);
  // Hollow them out: box() fills, and a castle is a wall with a yard inside.
  for (let x = 4; x <= 6; x++) for (let y = 5; y <= 6; y++) room.put(x, y, OPEN);
  for (let x = 17; x <= 19; x++) for (let y = 4; y <= 5; y++) room.put(x, y, OPEN);

  // Two lone towers out on the sand, away from the castles. A wall cell with
  // nothing beside it comes out as a whole turret -- asked for as "single cells
  // should be turrets" -- so one cell is the smallest castle there is.
  room.put(10, 2, WALL).put(21, 9, WALL);

  // Shells: one in each courtyard, so both castles are worth going into, and
  // the rest along the waterline where you find them.
  room.put(5, 6, "$").put(18, 5, "$");
  room.put(3, 10, "$").put(7, 11, "$").put(16, 10, "$").put(20, 11, "$");
  room.put(12, 9, "$");

  // A gull and a jellyfish, and neither will ever come after you: on calm the
  // glyph decides what a thing DOES. Gulls up on the sand where gulls stand
  // about, the jellyfish at the water's edge.
  room.put(9, 2, "B").put(14, 4, "B");
  room.put(15, 11, "D");

  // ONE crab, and it hunts. Down by the water between the far shells and the
  // way out, which is what makes the weapon worth carrying.
  room.put(19, 10, "G");

  room.put(2, 1, "@");
  room.put(22, 1, ">");
  return room.text(beach("bbbb"));
}


/**
 * The city. Rescue the people, get them to the evac zone, and there is a kaiju
 * on the street.
 *
 * "It should be user vs Kaiju... the user has to rescue people and get them to
 * an evac zone whilst fighting the kaiju." Which is what the adventure game
 * already is -- pick the treasure up and the door opens -- so the rules needed
 * nothing at all and the room is roam/8 with tiles=6.
 *
 * Laid out as STREETS, which is the whole reason to have it as well as the
 * caves: blocks of building with roads between them, so the room is a grid of
 * corridors you can see along rather than a cave you feel your way through.
 * That changes how a monster works in it -- you see the kaiju coming from the
 * end of a street, and the decision is which way to turn, not whether you
 * noticed.
 */
function theCity(): string {
  const room = new Room().border();

  // Three bands of building with avenues between them, and a ONE-CELL ALLEY
  // through a block wherever a monster stands.
  //
  // That last part is the whole shape of the room, and it is a rule rather
  // than a look: spec S8 caps a guard's patrol at eight turns, which is a run
  // of five cells, and a city street is twenty-two. The first draft had four
  // fat blocks and open avenues, and all three monsters failed L5 with runs of
  // twelve and twenty-two. An alley is exactly five -- the street at each end
  // plus the three cells through the block -- which is the same trick "the
  // gauntlet" plays with its doorways, and it makes the monster something you
  // meet at a gap rather than something you see coming half a mile off.
  const BANDS: readonly (readonly [number, number])[] = [[2, 4], [6, 8], [10, 11]];
  // The last block is a cell narrower than the other three, which leaves a
  // THREE-cell street down the east side -- the only place in a grid this
  // dense where a wall cell can have no wall beside it, and therefore the only
  // place a tower can stand. Every other gap is one or two cells between two
  // blocks, so anything put in it is drawn as part of a terrace.
  const BLOCKS: readonly (readonly [number, number])[] = [[2, 5], [7, 10], [12, 15], [17, 19]];
  for (const [top, bottom] of BANDS) {
    for (const [left, right] of BLOCKS) room.box(left, top, right, bottom, WALL);
  }

  // The alleys, cut back out of the blocks the monsters stand in.
  const ALLEYS: readonly (readonly [number, number, string])[] = [
    [8, 0, "G"],    // the kaiju, in band A, halfway across town
    [13, 1, "B"],   // the swarmer, in band B
    [3, 2, "D"],    // the crawler, in band C
  ];
  for (const [x, band, who] of ALLEYS) {
    const [top, bottom] = BANDS[band] as readonly [number, number];
    room.line(x, top, x, bottom, OPEN);
    room.put(x, ((top + bottom) / 2) | 0, who);
  }

  // Two towers standing on their own in the wide street on the east side. A
  // wall cell with no wall beside it is ONE building rather than a terrace --
  // same rule as the garden's tree and the beach's palm, and it costs the wire
  // format nothing at all.
  room.put(21, 3, WALL).put(21, 10, WALL);

  // Burning wreckage in the avenues, so the quickest way across is not the
  // safe one. Not in an alley: a fire in the only gap is a wall.
  room.put(11, 5, "^").put(16, 9, "^").put(6, 9, "^");

  // People, along the streets. Six, and they are what the room is for.
  room.put(4, 1, "$").put(14, 1, "$").put(19, 1, "$");
  room.put(3, 5, "$").put(20, 5, "$");
  room.put(9, 12, "$");

  // In at the top left, out at the bottom right: the evac zone is a landing
  // pad rather than a door -- see doorShape() -- and getting the last person
  // to it is a walk right across town.
  room.put(1, 1, "@");
  room.put(21, 12, ">");
  return room.text(city("city"));
}

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
