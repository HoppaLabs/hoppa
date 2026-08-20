// .lvl is ASCII art on disk: readable, diffable, editable in vim over SSH.
// This parser is strict on purpose -- an unknown glyph is a mistake, not a hint.
//
// It is strict about *shape* only. Whether a level is playable -- one exit, the
// exit reachable, treasure you can actually get to -- is spec S13's L2-L5 and
// lives in verify.ts. A level with no exit still parses; it just does not pass
// verification. That split is what lets day 1's exit-less level keep working.

import { GRID_AREA, GRID_H, GRID_W, idx } from "./grid.ts";

export const GLYPH_WALL = "#";
export const GLYPH_FLOOR = ".";
export const GLYPH_START = "@";
export const GLYPH_TREASURE = "$";
export const GLYPH_EXIT = ">";
export const GLYPH_GUARD = "G";
/** A ladder. Side-on engines climb it; from above it is ordinary floor. */
export const GLYPH_LADDER = "H";

export interface Level {
  readonly schema: number;
  readonly engine: string;
  readonly behaviourVersion: number;
  readonly tilesetId: number;
  readonly seed: number;
  readonly seedText: string;
  /** 1 = wall, 0 = open. Length GRID_AREA. */
  readonly walls: Uint8Array;
  readonly startX: number;
  readonly startY: number;
  /** -1 when the level has no exit glyph. L2 is what complains about that. */
  readonly exitX: number;
  readonly exitY: number;
  /**
   * Treasure cell indices in reading order. The position in this array is the
   * treasure's bit in the engine's collected mask, so reading order is a
   * shipped-link concern: never sort it differently.
   */
  readonly treasureCells: Int16Array;
  /** GRID_AREA lookup: treasure slot at this cell, or -1. */
  readonly treasureSlot: Int8Array;
  /**
   * Guard home cells in reading order. A guard stores no movement data: its
   * patrol is derived from the corridor it stands in (spec S8), so moving one
   * glyph in a level editor is the whole edit.
   */
  readonly guardCells: Int16Array;
  /**
   * 1 where a cell is a ladder. Ladders are open ground that a side-on engine
   * can climb; engines from above ignore them entirely.
   */
  readonly ladders: Uint8Array;
}

export class LevelParseError extends Error {}

function fail(message: string): never {
  throw new LevelParseError(message);
}

function parseHeader(line: string) {
  const parts = line.trim().split(/\s+/);
  const schemaField = parts[0] ?? "";
  if (!schemaField.startsWith("hoppa/")) {
    fail(`header must start with "hoppa/<schema>", got "${schemaField}"`);
  }
  const schema = parseInt(schemaField.slice("hoppa/".length), 10) | 0;
  if (schema !== 1) fail(`unsupported schema version ${schema}`);

  const engine = parts[1] ?? "";
  if (engine.length === 0) fail("header is missing an engine id");

  let seedText = "0";
  let tilesetId = 1;
  let behaviourVersion = 1;
  for (let i = 2; i < parts.length; i = (i + 1) | 0) {
    const field = parts[i] as string;
    const eq = field.indexOf("=");
    if (eq < 0) fail(`header field "${field}" is not key=value`);
    const key = field.slice(0, eq);
    const value = field.slice(eq + 1);
    if (key === "seed") seedText = value;
    else if (key === "tiles") tilesetId = parseInt(value, 10) | 0;
    else if (key === "behaviour") behaviourVersion = parseInt(value, 10) | 0;
    else fail(`unknown header field "${key}"`);
  }

  // Seeds are written base36 so they stay short and typeable.
  const seed = parseInt(seedText, 36) | 0;
  if (!Number.isInteger(seed)) fail(`seed "${seedText}" is not base36`);

  return { schema, engine, behaviourVersion, tilesetId, seed, seedText };
}

export function parseLevel(text: string): Level {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  while (lines.length > 0 && (lines[lines.length - 1] as string).trim() === "") {
    lines.pop();
  }
  if (lines.length === 0) fail("empty level file");

  const header = parseHeader(lines[0] as string);
  const rows = lines.slice(1);
  if (rows.length !== GRID_H) {
    fail(`level must be ${GRID_H} rows tall, got ${rows.length}`);
  }

  const walls = new Uint8Array(GRID_AREA);
  const treasureSlot = new Int8Array(GRID_AREA).fill(-1);
  const found: number[] = [];
  const guards: number[] = [];
  const ladders = new Uint8Array(GRID_AREA);
  let startX = -1;
  let startY = -1;
  let exitX = -1;
  let exitY = -1;

  for (let y = 0; y < GRID_H; y = (y + 1) | 0) {
    const row = rows[y] as string;
    if (row.length !== GRID_W) {
      fail(`row ${y + 1} must be ${GRID_W} chars wide, got ${row.length}`);
    }
    for (let x = 0; x < GRID_W; x = (x + 1) | 0) {
      const ch = row[x] as string;
      if (ch === GLYPH_WALL) {
        walls[idx(x, y)] = 1;
      } else if (ch === GLYPH_FLOOR) {
        walls[idx(x, y)] = 0;
      } else if (ch === GLYPH_START) {
        if (startX >= 0) fail(`two starts: (${startX},${startY}) and (${x},${y})`);
        walls[idx(x, y)] = 0;
        startX = x;
        startY = y;
      } else if (ch === GLYPH_EXIT) {
        // A Level holds one exit, so a second one is a shape error, not an
        // L2 validity question.
        if (exitX >= 0) fail(`two exits: (${exitX},${exitY}) and (${x},${y})`);
        walls[idx(x, y)] = 0;
        exitX = x;
        exitY = y;
      } else if (ch === GLYPH_TREASURE) {
        walls[idx(x, y)] = 0;
        treasureSlot[idx(x, y)] = found.length | 0;
        found.push(idx(x, y));
      } else if (ch === GLYPH_GUARD) {
        walls[idx(x, y)] = 0;
        guards.push(idx(x, y));
      } else if (ch === GLYPH_LADDER) {
        walls[idx(x, y)] = 0;
        ladders[idx(x, y)] = 1;
      } else {
        fail(`row ${y + 1} col ${x + 1}: glyph "${ch}" is not in the tile set`);
      }
    }
  }

  if (startX < 0) fail(`level has no start glyph "${GLYPH_START}"`);

  const treasureCells = new Int16Array(found.length);
  for (let i = 0; i < found.length; i = (i + 1) | 0) {
    treasureCells[i] = found[i] as number;
  }

  const guardCells = new Int16Array(guards.length);
  for (let i = 0; i < guards.length; i = (i + 1) | 0) {
    guardCells[i] = guards[i] as number;
  }

  return {
    schema: header.schema,
    engine: header.engine,
    behaviourVersion: header.behaviourVersion,
    tilesetId: header.tilesetId,
    seed: header.seed,
    seedText: header.seedText,
    walls,
    startX,
    startY,
    exitX,
    exitY,
    treasureCells,
    treasureSlot,
    guardCells,
    ladders,
  };
}

export function isWall(level: Level, x: number, y: number): boolean {
  return level.walls[idx(x, y)] === 1;
}

export function hasExit(level: Level): boolean {
  return level.exitX >= 0;
}

export function isLadder(level: Level, x: number, y: number): boolean {
  return level.ladders[idx(x, y)] === 1;
}

/** Does this level carry anything only a side-on engine can use? */
export function hasLadders(level: Level): boolean {
  for (let i = 0; i < GRID_AREA; i = (i + 1) | 0) {
    if (level.ladders[i] === 1) return true;
  }
  return false;
}
