// Water joins up.
//
// "The ponds sprites should merge when joined to create a bigger pool rather
// than a several little pools." POND draws its own rim on all four sides, so
// two cells side by side showed two rims and a seam down the middle, and six
// cells of pond read as six puddles.
//
// The rim now goes only where the water actually ends. Same trick a tree
// already uses -- a wall with nothing beside it is drawn as a canopy -- read
// off the neighbours rather than out of the level, so it costs the wire format
// nothing at all.

import { expect, test } from "bun:test";
import {
  GARDEN, POND_E, POND_N, POND_S, POND_W, REEF, UNDERGROUND,
  openSides, pondFor, sidesOf,
} from "../src/core/tileset.ts";
import { GRID_H, GRID_W } from "../src/core/grid.ts";
import { TILE_FIRE, TILE_FLOOR, TILE_WALL } from "../src/core/tiles.ts";

const ALL_OPEN = POND_N | POND_E | POND_S | POND_W;
const rim = (rows: readonly string[], y: number, x: number) => (rows[y] as string)[x] as string;

test("a lone puddle has a bank all the way round", () => {
  const one = pondFor(ALL_OPEN);
  expect(rim(one, 0, 8)).not.toBe("1");    // north
  expect(rim(one, 15, 8)).not.toBe("1");   // south
  expect(rim(one, 8, 0)).not.toBe("1");    // west
  expect(rim(one, 8, 15)).not.toBe("1");   // east
});

test("water running under an edge reaches it, so two cells make one pool", () => {
  // The middle of a horizontal strip: banks north and south, open east/west.
  const middle = pondFor(POND_N | POND_S);
  expect(rim(middle, 8, 0)).toBe("1");
  expect(rim(middle, 8, 15)).toBe("1");
  // ...and it still has a far bank and a near one.
  expect(rim(middle, 0, 8)).not.toBe("1");
  expect(rim(middle, 15, 8)).not.toBe("1");
});

test("a cell with water on every side is water edge to edge", () => {
  const inside = pondFor(0);
  for (let y = 0; y < 16; y++) {
    for (let x = 0; x < 16; x++) {
      expect({ y, x, ink: rim(inside, y, x) }).toEqual({ y, x, ink: "1" });
    }
  }
});

test("the glint is on the surface, not on every cell", () => {
  // Every cell having one made a big pond look spotty rather than wet. It goes
  // where the light would be: the top of a pool, which is a cell with open air
  // to the north.
  expect(pondFor(POND_N).join("")).toContain("5");
  expect(pondFor(POND_S | POND_E | POND_W).join("")).not.toContain("5");
});

test("all sixteen are the right shape, and each is its own drawing", () => {
  const seen = new Set<string>();
  for (let open = 0; open < 16; open++) {
    const made = pondFor(open);
    expect(made).toHaveLength(16);
    for (const row of made) expect(row).toHaveLength(16);
    seen.add(made.join("|"));
  }
  expect(seen.size).toBe(16);
});

test("only the world whose hazard is WATER joins up", () => {
  // A flame and a bank of urchins are things you count. A pond is a thing you
  // see the shape of.
  expect(GARDEN.fireFor).toBeDefined();
  expect(UNDERGROUND.fireFor).toBeUndefined();
  expect(REEF.fireFor).toBeUndefined();
});

// --- which sides the shoreline goes on ----------------------------------

/** A grid of floor with water at the given cells. */
function pool(...cells: readonly (readonly [number, number])[]): Uint8Array {
  const tiles = new Uint8Array(GRID_W * GRID_H).fill(TILE_FLOOR);
  for (const [x, y] of cells) tiles[y * GRID_W + x] = TILE_FIRE;
  return tiles;
}

test("a lone cell of water is open on all four sides", () => {
  expect(openSides(pool([5, 5]), 5, 5)).toBe(POND_N | POND_E | POND_S | POND_W);
});

test("two cells side by side each stop drawing the bank between them", () => {
  const tiles = pool([5, 5], [6, 5]);
  expect(openSides(tiles, 5, 5) & POND_E).toBe(0);
  expect(openSides(tiles, 6, 5) & POND_W).toBe(0);
  // ...and the outside of the pair still has its bank.
  expect(openSides(tiles, 5, 5) & POND_W).not.toBe(0);
  expect(openSides(tiles, 6, 5) & POND_E).not.toBe(0);
});

test("the middle of a 3x3 pool has no bank at all", () => {
  const cells: [number, number][] = [];
  for (let y = 4; y <= 6; y++) for (let x = 4; x <= 6; x++) cells.push([x, y]);
  expect(openSides(pool(...cells), 5, 5)).toBe(0);
});

test("water against the wall of the world still has a bank there", () => {
  // Off-grid is not water, so the edge reads as shore. Otherwise a pond in the
  // corner would bleed off the side of the screen.
  const tiles = pool([0, 0]);
  expect(openSides(tiles, 0, 0) & POND_W).not.toBe(0);
  expect(openSides(tiles, 0, 0) & POND_N).not.toBe(0);
});

test("only water counts as water: a bridge over a pond breaks the surface", () => {
  const tiles = pool([5, 5], [6, 5]);
  tiles[5 * GRID_W + 6] = TILE_FLOOR;
  expect(openSides(tiles, 5, 5) & POND_E).not.toBe(0);
});

// --- and the same read, asked about a different tile -------------------------

/** A grid of floor with walls at the given cells. */
function terrace(...cells: readonly (readonly [number, number])[]): Uint8Array {
  const tiles = new Uint8Array(GRID_W * GRID_H).fill(TILE_FLOOR);
  for (const [x, y] of cells) tiles[y * GRID_W + x] = TILE_WALL;
  return tiles;
}

test("sidesOf reads whichever tile it is asked about", () => {
  // openSides() is this with the water baked in; the roofs needed the same
  // read for walls, so the neighbour test took a parameter rather than a copy.
  const tiles = terrace([5, 5], [6, 5]);
  expect(sidesOf(tiles, 5, 5, TILE_WALL) & POND_E).toBe(0);
  expect(sidesOf(tiles, 5, 5, TILE_WALL) & POND_W).not.toBe(0);
  // ...and asked about water, the same two cells are not water at all.
  expect(sidesOf(tiles, 5, 5, TILE_FIRE)).toBe(POND_N | POND_E | POND_S | POND_W);
});
