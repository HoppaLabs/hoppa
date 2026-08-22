// The edge of a beach is not something a child built.
//
// "The beach levels should have the sea at the bottom, and not surrounded by
// sandcastle walls, they should be little castles inside with walls around
// them."
//
// Which is a distinction worth having in general. A sandcastle is a thing you
// MAKE on the sand; a ring of them round the whole room says the opposite, and
// it also drowns out the shapes a child actually drew. So the outer ring of a
// beach is terrain -- sea along the bottom, dune on the other three -- and
// everything inside it is theirs.
//
// The sea line is free, which is the part that matters. Water is an entity and
// the wire format holds ten, so a painted strip along the bottom came to
// forty-four cells and would not encode -- there is a comment in tools/pack.ts
// that says so, and that is why the beach used to have a small bay instead.
// Drawing the rim as sea costs nothing at all, so the ten entities can be spent
// on water that reaches UP the beach.

import { expect, test } from "bun:test";
import {
  BEACH, CITY, GARDEN, POND_E, POND_N, POND_S, POND_W,
  onRim, openSides, seaSides,
} from "../src/core/tileset.ts";
import { GRID_H, GRID_W } from "../src/core/grid.ts";
import { TILE_FIRE, TILE_FLOOR } from "../src/core/tiles.ts";

test("the rim is the outer ring, and nothing else is", () => {
  expect(onRim(0, 5)).toBe(true);
  expect(onRim(GRID_W - 1, 5)).toBe(true);
  expect(onRim(5, 0)).toBe(true);
  expect(onRim(5, GRID_H - 1)).toBe(true);
  expect(onRim(1, 1)).toBe(false);
  expect(onRim(GRID_W - 2, GRID_H - 2)).toBe(false);
});

test("only the beach asks for a sea rim", () => {
  // A city's edge being more city is right, and a garden's edge being more
  // hedge is right. This is a beach's problem alone.
  expect(BEACH.rim).toBe("sea");
  expect(CITY.rim).toBeUndefined();
  expect(GARDEN.rim).toBeUndefined();
});

test("the sea along the bottom has a shoreline facing up the beach", () => {
  // The only side that ENDS is the one facing the sand. At the two bottom
  // corners the side facing out of the room ends too, or the water would run
  // off the edge of the picture with no line on it.
  expect(seaSides(10)).toBe(POND_N);
  expect(seaSides(0)).toBe(POND_N | POND_W);
  expect(seaSides(GRID_W - 1)).toBe(POND_N | POND_E);
  // Never a line along the bottom: there is more sea past the edge.
  for (const x of [0, 5, GRID_W - 1]) {
    expect({ x, southern: (seaSides(x) & POND_S) !== 0 }).toEqual({ x, southern: false });
  }
});

test("water painted above the shore joins it, instead of growing a seam", () => {
  // A child who draws a bay running down to the sea should get ONE body of
  // water. Without this they get a shoreline drawn between their bay and the
  // sea it obviously runs into.
  const tiles = new Uint8Array(GRID_W * GRID_H).fill(TILE_FLOOR);
  const x = 10;
  const y = GRID_H - 2;                       // the row just above the rim
  tiles[y * GRID_W + x] = TILE_FIRE;
  expect((openSides(tiles, x, y, false) & POND_S) !== 0).toBe(true);   // a seam
  expect((openSides(tiles, x, y, true) & POND_S) !== 0).toBe(false);   // one body
});

test("...and only on that row, so a pond up the beach still has a shoreline", () => {
  // The rule is "the row above the sea", not "anywhere on a beach". A pond in
  // the middle of the sand must keep its bottom edge.
  const tiles = new Uint8Array(GRID_W * GRID_H).fill(TILE_FLOOR);
  tiles[5 * GRID_W + 10] = TILE_FIRE;
  expect((openSides(tiles, 10, 5, true) & POND_S) !== 0).toBe(true);
});

test("the renderer draws the rim before it draws anything built", () => {
  // Order is the whole rule: the turret check and the castle kinds both come
  // after it, so a corner of the ROOM never becomes a corner of a castle.
  return Bun.file("src/web/play/renderer.ts").text().then((renderer) => {
    const rim = renderer.indexOf('this.tiles().rim === "sea" && onRim(x, y)');
    const turret = renderer.indexOf("isTurret(sidesOf(tiles, x, y, TILE_WALL))");
    const kinds = renderer.indexOf("this.towers.get(this.kindAt(x, y))");
    expect(rim).toBeGreaterThan(0);
    expect(turret).toBeGreaterThan(rim);
    expect(kinds).toBeGreaterThan(turret);
  });
});
