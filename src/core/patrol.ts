// Guard patrols, derived from geometry alone (spec S8).
//
// "Guard patrols the corridor it stands in, ping-ponging at walls." No movement
// data is stored in the level, so a kid moving one glyph in the editor can see
// exactly what the piece will do -- and the encoding pays zero bytes for it.
//
// A patrol is a pure function of the turn counter. Nothing accumulates, so a
// replay cannot drift: guard positions at turn t are computable from t alone.

import { GRID_H, GRID_W, idx } from "./grid.ts";
import type { Level } from "./level.ts";

/** Spec S8: movement periods are capped at 8 turns, for the solver's sake. */
export const MAX_PERIOD = 8;
/** A ping-pong over L cells has period 2*(L-1), so 5 cells is the longest run. */
export const MAX_RUN = 5;

export const AXIS_HORIZONTAL = 0;
export const AXIS_VERTICAL = 1;

export interface Patrol {
  /** The guard's home cell, where its glyph sits in the level. */
  readonly home: number;
  readonly axis: 0 | 1;
  /** Cell index of the low end of the run (leftmost or topmost). */
  readonly lo: number;
  /** Number of cells in the run, at least 1. */
  readonly length: number;
  /** The home cell's offset from `lo`, in cells. */
  readonly start: number;
  /** Turns to return to the start of the cycle. 1 when the guard cannot move. */
  readonly period: number;
}

function runLength(level: Level, x: number, y: number, dx: number, dy: number): number {
  let n = 0;
  let cx = (x + dx) | 0;
  let cy = (y + dy) | 0;
  while (cx >= 0 && cx < GRID_W && cy >= 0 && cy < GRID_H && level.walls[idx(cx, cy)] === 0) {
    n = (n + 1) | 0;
    cx = (cx + dx) | 0;
    cy = (cy + dy) | 0;
  }
  return n;
}

/**
 * The patrol for a guard standing on `cell`.
 *
 * The axis is the longer of the two open runs through the cell, horizontal on a
 * tie. A guard in a one-cell dead end simply stands there.
 */
export function patrolFor(level: Level, cell: number): Patrol {
  const x = (cell % GRID_W) | 0;
  const y = ((cell / GRID_W) | 0) | 0;

  const left = runLength(level, x, y, -1, 0);
  const right = runLength(level, x, y, 1, 0);
  const up = runLength(level, x, y, 0, -1);
  const down = runLength(level, x, y, 0, 1);

  const horizontal = (left + right + 1) | 0;
  const vertical = (up + down + 1) | 0;

  const axis: 0 | 1 = horizontal >= vertical ? AXIS_HORIZONTAL : AXIS_VERTICAL;
  const length = axis === AXIS_HORIZONTAL ? horizontal : vertical;
  const start = axis === AXIS_HORIZONTAL ? left : up;
  const lo =
    axis === AXIS_HORIZONTAL ? idx((x - left) | 0, y) : idx(x, (y - up) | 0);

  // A guard that cannot move has period 1, not 0: nothing divides by zero and
  // "one turn, same cell" is the honest description of standing still.
  const period = length > 1 ? (2 * (length - 1)) | 0 : 1;

  return { home: cell, axis, lo, length, start, period };
}

/** Where the guard stands on turn `turn`. Pure function of the turn counter. */
export function patrolCellAt(patrol: Patrol, turn: number): number {
  if (patrol.length <= 1) return patrol.lo;

  const p = patrol.period | 0;
  // The guard walks toward the high end of its run first.
  let u = ((patrol.start + turn) % p) | 0;
  if (u < 0) u = (u + p) | 0;
  const offset = u < patrol.length ? u : (p - u) | 0;

  return patrol.axis === AXIS_HORIZONTAL
    ? (patrol.lo + offset) | 0
    : (patrol.lo + offset * GRID_W) | 0;
}

/** Every guard's patrol, in the level's reading order. */
export function patrolsFor(level: Level): Patrol[] {
  const out: Patrol[] = [];
  for (let i = 0; i < level.guardCells.length; i = (i + 1) | 0) {
    out.push(patrolFor(level, level.guardCells[i] as number));
  }
  return out;
}
