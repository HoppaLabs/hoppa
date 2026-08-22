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

test("a wall's drawing comes from which sides of it are open", () => {
  // Keyed like a pond, not scattered by a hash. The edge treatment goes only
  // where the wall actually STOPS, which is what "seen from above" needs: a run
  // of wall is one wall with one shadow, not a row of separate blocks.
  const ALL = POND_N | POND_E | POND_S | POND_W;
  // Buried inside a block: nothing stops, so nothing is drawn on the edges and
  // the neighbours merge into it.
  const inside = castleFor(0);
  expect(inside.every((row) => !row.includes("1"))).toBe(true);
  // Out on its own: a shadow and battlements all the way round.
  expect(castleFor(ALL)).not.toEqual(inside);
  // Every combination is a real drawing, and the four sides are independent.
  const seen = new Set<string>();
  for (let open = 0; open < 16; open = (open + 1) | 0) {
    const drawn = castleFor(open);
    expect({ open, rows: drawn.length }).toEqual({ open, rows: 16 });
    seen.add(drawn.join("|"));
  }
  expect(seen.size).toBe(16);
  // ...and it is cached, so the paint loop is a map lookup rather than a redraw.
  expect(castleFor(ALL)).toBe(castleFor(ALL));
});

test("the drawing is a PLAN, not a facade", () => {
  // "The sandcastles look like haystacks, we need to see them from above."
  //
  // The old art was an elevation: battlements along the TOP of the tile only,
  // and nothing along the sides, because a facade has one skyline. Seen from
  // above every open side has an edge. That asymmetry is the mechanical
  // difference between the two, so it is what this measures.
  const withNorth = castleFor(POND_N);
  const withWest = castleFor(POND_W);
  const topRowMarked = (withNorth[0] as string).includes("1");
  const leftColMarked = [...withWest].some((row) => (row as string)[0] === "1");
  expect(topRowMarked).toBe(true);
  expect(leftColMarked).toBe(true);
  // A facade would draw its skyline on top whatever the neighbours said.
  expect((castleFor(POND_S)[0] as string).includes("1")).toBe(false);
});

test("the turret is round: no corner of it is part of the tower", () => {
  // "The turrets should be round." A circle drawn in a square leaves all four
  // corners as the sand outside it, which is the whole test -- an elevation or
  // a square keep would fill them.
  const rows = BEACH.wallCorner as readonly string[];
  const outside = rows[0]?.[0];
  for (const [x, y] of [[0, 0], [15, 0], [0, 15], [15, 15]]) {
    expect({ x, y, ink: (rows[y as number] as string)[x as number] })
      .toEqual({ x, y, ink: outside });
  }
  // ...and the middle is not that, or it is not a tower at all.
  expect((rows[8] as string)[8]).not.toBe(outside);
});

test("a wall is opaque, so every castle fills its tile edge to edge", () => {
  // Terrain, not an object. This is the opposite of the rule in
  // test/inside-the-tile.test.ts, and both are right: a shell sits ON the
  // floor and needs air beside it; a wall IS the floor and a hole in one is a
  // hole you can see the void through.
  for (let open = 0; open < 16; open = (open + 1) | 0) {
    const rows = castleFor(open);
    expect({ open, rows: rows.length }).toEqual({ open, rows: TILE });
    for (let y = 0; y < TILE; y = (y + 1) | 0) {
      const row = rows[y] as string;
      expect({ open, y, wide: row.length }).toEqual({ open, y, wide: TILE });
      expect({ open, y, holes: row.includes(".") }).toEqual({ open, y, holes: false });
    }
  }
});

test("every ink a castle uses is one the beach actually has", () => {
  // A digit past the end of the ramp paints undefined, which is a silent hole
  // in the picture rather than a crash.
  const inks = BEACH.sub.length;
  for (let open = 0; open < 16; open = (open + 1) | 0) {
    for (const row of castleFor(open)) {
      for (const ch of row) {
        expect({ open, ch, ok: Number(ch) >= 1 && Number(ch) <= inks })
          .toEqual({ open, ch, ok: true });
      }
    }
  }
});

test("the beach joins its walls up; the city still picks a kind at random", () => {
  // Two different questions, and the beach's is the one with an answer in the
  // level: WHICH SIDES ARE OPEN is a fact about the shape a child drew, where
  // WHICH SKYSCRAPER is taste. So the beach reads neighbours and the city
  // scatters by a hash, and neither may borrow the other's drawings.
  expect(BEACH.wallFor).toBe(castleFor);
  expect(BEACH.wallKinds).toBeUndefined();
  expect(CITY.wallKinds).toBe(towerFor);
  expect(CITY.wallFor).toBeUndefined();
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
