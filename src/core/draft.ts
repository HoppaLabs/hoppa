// A level being drawn.
//
// The editor's model, kept out of the page so it can be tested without a
// browser. A draft is just glyphs -- the same glyphs a .lvl file holds -- plus
// which game it is for. Turning one into a Level is parseLevel's job, and the
// checks in verify.ts are what say whether it is any good.
//
// Nothing here decides anything a shipped link depends on. It writes .lvl text
// and hands it to the existing parser, so a level drawn in the editor and a
// level typed in vim are the same object by the time anything plays them.

import { GRID_AREA, GRID_H, GRID_W, idx } from "./grid.ts";
import {
  GLYPH_EXIT,
  GLYPH_FLOOR,
  GLYPH_GUARD,
  GLYPH_LADDER,
  GLYPH_START,
  GLYPH_TREASURE,
  GLYPH_WALL,
} from "./level.ts";

/** Spec S13's L5: at most 8, because the collected mask is 8 bits wide. */
export const MAX_TREASURE = 8;

/**
 * Guards a draft may hold. The wire format's real limit is 31 entities of every
 * kind together; this is well under it, and a room with more than ten guards in
 * it is not a level anyone finishes.
 */
export const MAX_GUARDS = 10;

export type Glyph =
  | typeof GLYPH_WALL
  | typeof GLYPH_FLOOR
  | typeof GLYPH_START
  | typeof GLYPH_EXIT
  | typeof GLYPH_TREASURE
  | typeof GLYPH_GUARD
  | typeof GLYPH_LADDER;

export interface Draft {
  readonly engine: string;
  readonly behaviourVersion: number;
  /** GRID_AREA glyphs in reading order. */
  readonly cells: readonly Glyph[];
}

/** What happened when you tried to paint. `reason` is shown to the player. */
export interface PaintResult {
  readonly draft: Draft;
  readonly changed: boolean;
  readonly reason: string;
}

function countOf(cells: readonly Glyph[], glyph: Glyph): number {
  let n = 0;
  for (let i = 0; i < cells.length; i = (i + 1) | 0) if (cells[i] === glyph) n = (n + 1) | 0;
  return n;
}

function firstOf(cells: readonly Glyph[], glyph: Glyph): number {
  for (let i = 0; i < cells.length; i = (i + 1) | 0) if (cells[i] === glyph) return i;
  return -1;
}

/**
 * An empty room: a wall all the way round, floor inside, and the two things
 * every level must have already placed.
 *
 * Starting from a room rather than a blank sheet matters more than it looks.
 * A kid who taps "make a level" and sees nothing has to be told what a level
 * is; a kid who sees a room with a door in it just starts drawing.
 */
export function blankDraft(engine: string, behaviourVersion: number): Draft {
  const cells: Glyph[] = new Array<Glyph>(GRID_AREA);
  for (let y = 0; y < GRID_H; y = (y + 1) | 0) {
    for (let x = 0; x < GRID_W; x = (x + 1) | 0) {
      const edge = x === 0 || y === 0 || x === GRID_W - 1 || y === GRID_H - 1;
      cells[idx(x, y)] = edge ? GLYPH_WALL : GLYPH_FLOOR;
    }
  }
  cells[idx(1, 1)] = GLYPH_START;
  cells[idx((GRID_W - 2) | 0, (GRID_H - 2) | 0)] = GLYPH_EXIT;
  return { engine, behaviourVersion, cells };
}

/**
 * Paint one cell.
 *
 * The rules that live here are the ones that keep a draft *drawable* rather
 * than the ones that keep it *good*. A level with the exit walled off is a
 * fine thing to have half-drawn; a level with two starts is not a level at
 * all, and finding that out from a red check later is worse than being told
 * "you only get one" the moment you tap.
 */
export function paint(draft: Draft, x: number, y: number, glyph: Glyph): PaintResult {
  if (x < 0 || y < 0 || x >= GRID_W || y >= GRID_H) {
    return { draft, changed: false, reason: "" };
  }
  const cell = idx(x, y);
  const was = draft.cells[cell] as Glyph;
  if (was === glyph) return { draft, changed: false, reason: "" };

  const cells = draft.cells.slice() as Glyph[];

  // You get one of each, and they move rather than multiply.
  if (glyph === GLYPH_START || glyph === GLYPH_EXIT) {
    const old = firstOf(cells, glyph);
    if (old >= 0) cells[old] = GLYPH_FLOOR;
    cells[cell] = glyph;
    return { draft: { ...draft, cells }, changed: true, reason: "" };
  }

  // ...and they cannot be painted over, because every level needs both. Moving
  // one is a deliberate act with its own tool.
  if (was === GLYPH_START) {
    return { draft, changed: false, reason: "that is where you start -- move it with the start tool" };
  }
  if (was === GLYPH_EXIT) {
    return { draft, changed: false, reason: "that is the way out -- pick the door / exit tool to move it" };
  }

  if (glyph === GLYPH_TREASURE && countOf(cells, GLYPH_TREASURE) >= MAX_TREASURE) {
    return { draft, changed: false, reason: `${MAX_TREASURE} treasure is the most a level can hold` };
  }
  if (glyph === GLYPH_GUARD && countOf(cells, GLYPH_GUARD) >= MAX_GUARDS) {
    return { draft, changed: false, reason: `${MAX_GUARDS} guards is plenty` };
  }

  cells[cell] = glyph;
  return { draft: { ...draft, cells }, changed: true, reason: "" };
}

/** How many of a thing the draft holds. Used for the counters in the editor. */
export function tally(draft: Draft, glyph: Glyph): number {
  return countOf(draft.cells, glyph);
}

/**
 * The .lvl text for this draft.
 *
 * Seed 0 on purpose: nothing in either engine reads it, and a hand-drawn level
 * has no generated part to seed. It stays in the header because the format has
 * it and shipped links carry it.
 */
export function draftToText(draft: Draft): string {
  const rows: string[] = [
    `hoppa/1 ${draft.engine} seed=0 tiles=1 behaviour=${draft.behaviourVersion}`,
  ];
  for (let y = 0; y < GRID_H; y = (y + 1) | 0) {
    let row = "";
    for (let x = 0; x < GRID_W; x = (x + 1) | 0) row += draft.cells[idx(x, y)] as string;
    rows.push(row);
  }
  return `${rows.join("\n")}\n`;
}

/** Read a draft back out of a level, so an existing level can be changed. */
export function draftFromLevel(level: {
  engine: string;
  behaviourVersion: number;
  walls: Uint8Array;
  ladders: Uint8Array;
  startX: number;
  startY: number;
  exitX: number;
  exitY: number;
  treasureSlot: Int8Array;
  guardCells: Int16Array;
}): Draft {
  const cells: Glyph[] = new Array<Glyph>(GRID_AREA);
  for (let i = 0; i < GRID_AREA; i = (i + 1) | 0) {
    cells[i] = level.walls[i] === 1 ? GLYPH_WALL : GLYPH_FLOOR;
  }
  for (let i = 0; i < GRID_AREA; i = (i + 1) | 0) {
    if (level.ladders[i] === 1) cells[i] = GLYPH_LADDER;
  }
  for (let i = 0; i < GRID_AREA; i = (i + 1) | 0) {
    if (level.treasureSlot[i] !== -1) cells[i] = GLYPH_TREASURE;
  }
  for (let i = 0; i < level.guardCells.length; i = (i + 1) | 0) {
    cells[level.guardCells[i] as number] = GLYPH_GUARD;
  }
  if (level.exitX >= 0) cells[idx(level.exitX, level.exitY)] = GLYPH_EXIT;
  cells[idx(level.startX, level.startY)] = GLYPH_START;
  return { engine: level.engine, behaviourVersion: level.behaviourVersion, cells };
}

/** Swap which game a draft is for, dropping anything the new one cannot hold. */
export function retarget(draft: Draft, engine: string, behaviourVersion: number): Draft {
  if (engine === draft.engine) return { ...draft, behaviourVersion };
  const cells = draft.cells.slice() as Glyph[];
  if (engine !== "dash") {
    // Only side-on games climb. A ladder left in a top-down level would encode
    // as nothing and then vanish on the way back, which looks like a bug.
    for (let i = 0; i < cells.length; i = (i + 1) | 0) {
      if (cells[i] === GLYPH_LADDER) cells[i] = GLYPH_FLOOR;
    }
  }
  return { engine, behaviourVersion, cells };
}
