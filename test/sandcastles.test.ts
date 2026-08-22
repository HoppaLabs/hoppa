// Sandcastles on the beach.
//
// "Could we add sandcastles to the beach? So kids can build a fort etc?"
//
// Which is really a question about what a WALL is on a beach. A child on the
// beach draws walls already -- that is how you make a room -- and until now
// every one of them came out a dune. Now three in four come out battlemented,
// so a blob of drawn wall is a fort and a line of it is a rampart.
//
// It costs the wire format NOTHING. The level says "wall"; which castle stands
// there is worked out from the cell's own coordinates, the same trick the city
// uses for its skyscrapers and the cars in its streets.

import { expect, test } from "bun:test";
import {
  BEACH, CITY, POND_E, POND_N, POND_S, POND_W, WALL_KINDS,
  castleFor, isTurret, towerFor,
} from "../src/core/tileset.ts";

const TILE = 16;

test("no wall a child drew inside the room comes out as plain sand", () => {
  // It used to be one kind in four, on the argument that a quarter of it sand
  // keeps the shape readable. That was written when a beach's walls were
  // mostly its BORDER. Now the border is dune by rule and the walls inside are
  // the things somebody built -- and a mottled sand cell in the middle of a
  // battlemented wall does not read as variety, it reads as a breach.
  for (let kind = 0; kind < WALL_KINDS; kind = (kind + 1) | 0) {
    expect({ kind, dune: castleFor(kind) === BEACH.wall }).toEqual({ kind, dune: false });
  }
  // ...and the dune has not gone anywhere: it is what the rim is made of.
  expect(BEACH.wall).toBeDefined();
  expect(BEACH.rim).toBe("sea");
});

test("there are three castles, and every kind lands on one of them", () => {
  const seen = new Set<string>();
  for (let kind = 0; kind < WALL_KINDS; kind = (kind + 1) | 0) {
    seen.add(castleFor(kind).join("|"));
  }
  // Three drawings, four kinds: the fourth comes round to the first.
  expect(seen.size).toBe(3);
  expect(castleFor(3)).toEqual(castleFor(0));
  // A kind from anywhere still lands on a real drawing rather than undefined.
  for (const kind of [0, 1, 2, 3, 7, 99]) {
    expect({ kind, drawn: castleFor(kind).length }).toEqual({ kind, drawn: 16 });
  }
});

test("a wall is opaque, so every castle fills its tile edge to edge", () => {
  // Terrain, not an object. This is the opposite of the rule in
  // test/inside-the-tile.test.ts, and both are right: a shell sits ON the
  // floor and needs air beside it; a wall IS the floor and a hole in one is a
  // hole you can see the void through.
  for (let kind = 0; kind < WALL_KINDS; kind = (kind + 1) | 0) {
    const rows = castleFor(kind);
    expect({ kind, rows: rows.length }).toEqual({ kind, rows: TILE });
    for (let y = 0; y < TILE; y = (y + 1) | 0) {
      const row = rows[y] as string;
      expect({ kind, y, wide: row.length }).toEqual({ kind, y, wide: TILE });
      expect({ kind, y, holes: row.includes(".") }).toEqual({ kind, y, holes: false });
    }
  }
});

test("every ink a castle uses is one the beach actually has", () => {
  // A digit past the end of the ramp paints undefined, which is a silent hole
  // in the picture rather than a crash.
  const inks = BEACH.sub.length;
  for (let kind = 0; kind < WALL_KINDS; kind = (kind + 1) | 0) {
    for (const row of castleFor(kind)) {
      for (const ch of row) {
        expect({ kind, ch, ok: Number(ch) >= 1 && Number(ch) <= inks })
          .toEqual({ kind, ch, ok: true });
      }
    }
  }
});

test("the beach asks for kinds, and the city still has its own", () => {
  expect(BEACH.wallKinds).toBe(castleFor);
  expect(CITY.wallKinds).toBe(towerFor);
  // Same mechanism, two worlds, and neither may borrow the other's drawings.
  expect(castleFor(1)).not.toEqual(towerFor(1));
});

test("a lone wall in a world WITHOUT turrets is still that world's tree", async () => {
  // Found by adding the castles: the kinds path in the renderer ran before the
  // `alone` check, so every palm on every beach became a sandcastle the moment
  // the beach gained sandcastles. The garden's trees still depend on this.
  const renderer = await Bun.file("src/web/play/renderer.ts").text();
  expect(renderer).toContain("if (tile === TILE_WALL && !alone && this.towers.size > 0) {");
});

// --- corners --------------------------------------------------------------
//
// "Corner cells should be whole turrets" and "single cells should be turrets",
// which is how a castle is actually shaped -- battlements along the walls, a
// tower at every corner -- and how a child draws one.
//
// `open` is the sidesOf() mask: a bit SET means that side is NOT wall, so a
// neighbour exists where the bit is clear.

const ALL = POND_N | POND_E | POND_S | POND_W;

test("a wall cell on its own is a whole turret", () => {
  expect(isTurret(ALL)).toBe(true);
});

test("the four corners of a drawn box are turrets", () => {
  // Top-left of a box: walls to the east and the south, open north and west.
  expect(isTurret(POND_N | POND_W)).toBe(true);
  expect(isTurret(POND_N | POND_E)).toBe(true);   // top-right
  expect(isTurret(POND_S | POND_W)).toBe(true);   // bottom-left
  expect(isTurret(POND_S | POND_E)).toBe(true);   // bottom-right
});

test("a straight run of wall is not a row of towers, it is a wall", () => {
  // Two neighbours facing each other. A tower every cell is not a castle, it
  // is a fence -- and it would erase the shape the child drew.
  expect(isTurret(POND_N | POND_S)).toBe(false);  // a vertical run
  expect(isTurret(POND_E | POND_W)).toBe(false);  // a horizontal run
});

test("the end of a wall, and the inside of a block, are both wall", () => {
  // One neighbour: the end of a run. Three or four: buried inside a block,
  // where a turret would be a tower nobody can see the top of.
  for (const open of [POND_N, POND_E, POND_S, POND_W]) {
    expect({ open, turret: isTurret(open) }).toEqual({ open, turret: false });
  }
  expect(isTurret(0)).toBe(false);
  expect(isTurret(POND_N)).toBe(false);
  expect(isTurret(ALL & ~POND_N)).toBe(false);
});

test("the beach has a turret and the city does not", () => {
  expect(BEACH.wallCorner).toBeDefined();
  // Not an oversight: a skyscraper block has no corners to put a tower on, and
  // the city's own kinds already vary its skyline.
  expect(CITY.wallCorner).toBeUndefined();
});

test("the turret fills its tile, like every other piece of terrain", () => {
  const rows = BEACH.wallCorner as readonly string[];
  expect(rows).toHaveLength(TILE);
  for (const row of rows) {
    expect(row).toHaveLength(TILE);
    expect(row.includes(".")).toBe(false);
  }
});
