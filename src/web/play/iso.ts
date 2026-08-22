// A SPIKE: the city, drawn as blocks.
//
// "Build a test engine for the city, don't break any existing code."
//
// This is a one-day experiment to answer one question -- does hoppa look better
// as extruded blocks, and does it still PLAY on a phone -- and it is built so
// that a "no" costs nothing to walk away from:
//
//   * No engine is touched. raze/1 is exactly the file it was.
//   * Nothing reaches stateHash(). Hard rule 4, so every city link ever sent
//     replays identically whether it was watched flat or in blocks.
//   * Nothing on the wire. The height of a building is DERIVED from the shape
//     the child drew (see towerHeight), so a level costs not one bit more.
//   * Off unless asked for. It draws only behind ?iso=1, so the game every
//     child has open right now is byte-for-byte the game it was.
//
// Hard rule 5 is what makes this legal at all: an engine emits tile indices and
// presentation maps them. Mapping an index to three faces of a cube instead of
// one flat square is the rule working as intended, not a loophole.
//
// The decisions live out here, away from the canvas, because a projection you
// cannot run a test against is a projection nobody is checking.

import { GRID_H, GRID_W } from "../../core/grid.ts";
import { TILE_WALL } from "../../core/tiles.ts";

/**
 * A 2:1 isometric cell: twice as wide as it is tall.
 *
 * The oldest trick in the book and still the right one -- the diagonals land on
 * exact half-pixels, so a diamond drawn at whole-pixel coordinates has clean
 * edges and no anti-aliasing, which is the same discipline the flat renderer
 * keeps with integer scale factors.
 */
export const ISO_W = 16;
export const ISO_H = 8;

/** How tall one block stands. Half a tile, so a three-block tower reads. */
export const BLOCK_H = 8;

/**
 * Tallest a building may grow. Past this the skyline hides the street.
 *
 * Four, first, and the first render settled it: a city of four-block towers is
 * beautiful and unplayable. The streets vanished and so did everyone standing
 * in them -- and "a gem you cannot see is a level you cannot finish" is a rule
 * this game already lives by. Three is the tallest that still leaves a street
 * you can see along.
 */
export const MAX_BLOCKS = 3;

/**
 * The whole grid, projected, is a wide flat diamond.
 *
 * 24 across and 14 down comes to 38 half-widths either way, which at ISO_W is
 * 304 pixels -- and that is the number that decided ISO_W. A 32-wide face would
 * be 608, and a phone is 390: it would have to be scaled by 0.64, which is
 * exactly the fractional downscale that turned the dragon into a smudge on day
 * 12. Whole pixels or nothing.
 */
export function isoWidth(): number {
  return (GRID_W + GRID_H) * (ISO_W / 2);
}

/** ...and tall enough for the deepest cell plus the tallest tower on it. */
export function isoHeight(): number {
  return (GRID_W + GRID_H) * (ISO_H / 2) + MAX_BLOCKS * BLOCK_H;
}

/** Where the left corner of a cell's top face lands, before the origin shift. */
export function isoX(x: number, y: number): number {
  return (x - y) * (ISO_W / 2);
}

/** ...and its vertical, with z blocks of lift under it. */
export function isoY(x: number, y: number, z = 0): number {
  return (x + y) * (ISO_H / 2) - z * BLOCK_H;
}

/** The origin that puts the whole diamond inside a canvas of isoWidth(). */
export function originX(): number {
  return GRID_H * (ISO_W / 2);
}

/** ...and the top margin, which is the room a full-height tower needs. */
export function originY(): number {
  return MAX_BLOCKS * BLOCK_H;
}

/**
 * How tall the building on this cell stands, in blocks. 0 for anything else.
 *
 * DERIVED, not stored, and that is the point of the spike: a skyline that costs
 * the wire format nothing. A building swells towards the middle of a block, so
 * a child who draws a fat blob gets a tower and one who draws a thin line gets
 * a low wall -- which is what those two shapes look like in a real city, and
 * means the drawing a child already knows how to make is the drawing that
 * produces the skyline.
 *
 * The same idea as the sandcastle corners and the joined-up ponds: read the
 * neighbours, spend nothing.
 */
export function towerHeight(tiles: Uint8Array, x: number, y: number): number {
  if (!isWall(tiles, x, y)) return 0;
  let around = 0;
  if (isWall(tiles, x, y - 1)) around = (around + 1) | 0;
  if (isWall(tiles, x + 1, y)) around = (around + 1) | 0;
  if (isWall(tiles, x, y + 1)) around = (around + 1) | 0;
  if (isWall(tiles, x - 1, y)) around = (around + 1) | 0;
  if (around >= 3) return MAX_BLOCKS;      // deep inside a block: a tower
  if (around >= 2) return MAX_BLOCKS - 1;  // along a frontage
  return 1;                                // a corner, or standing on its own
}

function isWall(tiles: Uint8Array, x: number, y: number): boolean {
  if (x < 0 || x >= GRID_W || y < 0 || y >= GRID_H) return false;
  return tiles[y * GRID_W + x] === TILE_WALL;
}

/**
 * Every cell, back to front.
 *
 * Painter's algorithm, and in this projection "further away" is simply a
 * smaller x + y: a cell can only ever be hidden by one that is further east or
 * further south, and both of those have a larger sum. So one sort, no depth
 * buffer, and it is stable -- which matters, because an unstable sort would
 * make the skyline shimmer between frames.
 */
export function backToFront(): ReadonlyArray<readonly [number, number]> {
  const cells: Array<readonly [number, number]> = [];
  for (let sum = 0; sum <= GRID_W + GRID_H - 2; sum = (sum + 1) | 0) {
    for (let y = 0; y < GRID_H; y = (y + 1) | 0) {
      const x = (sum - y) | 0;
      if (x < 0 || x >= GRID_W) continue;
      cells.push([x, y]);
    }
  }
  return cells;
}

/** Is this spike switched on? Off unless the URL says otherwise. */
export function isoAsked(search: string): boolean {
  return new URLSearchParams(search).get("iso") === "1";
}

/**
 * Is the tower on this cell standing between the camera and the player?
 *
 * The occlusion answer, and the thing the first render proved is needed. In
 * this projection a cell's screen column is x - y and its depth is x + y, so a
 * block hides the player when it is in roughly the same column and a few cells
 * nearer the camera. Those get drawn see-through.
 *
 * A few cells, not all of them: fading the entire column would carve a stripe
 * through the city every time the player walked, which reads as a rendering
 * fault rather than as help.
 */
export function inTheWay(x: number, y: number, px: number, py: number): boolean {
  const column = (x - y) - (px - py);
  if (column < -1 || column > 1) return false;
  const nearer = (x + y) - (px + py);
  return nearer > 0 && nearer <= 6;
}
