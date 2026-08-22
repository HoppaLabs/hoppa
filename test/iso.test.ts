// The blocks spike: the city, standing up.
//
// "Build a test engine for the city, don't break any existing code."
//
// Most of this file is about the second half of that sentence. The spike is
// allowed to exist because hard rule 5 says an engine emits tile indices and
// presentation maps them -- mapping an index to three faces of a cube instead
// of one flat square is that rule working, not a loophole -- and it is safe
// because of four properties, each of which is checked below:
//
//   1. it is OFF unless the URL asks for it
//   2. no engine imports it, or could
//   3. the height of a building is DERIVED, so no level costs a bit more
//   4. the whole diamond fits a phone at a WHOLE-NUMBER scale
//
// If the answer to the experiment is no, deleting two files and one `if` puts
// everything back.

import { expect, test } from "bun:test";
import {
  ISO_H, ISO_W, MAX_BLOCKS, backToFront, inTheWay, isoAsked, isoHeight,
  isoWidth, isoX, isoY, towerHeight,
} from "../src/web/play/iso.ts";
import { GRID_H, GRID_W } from "../src/core/grid.ts";
import { TILE_FLOOR, TILE_WALL } from "../src/core/tiles.ts";

/** A grid of floor with walls painted where asked. */
function room(walls: ReadonlyArray<readonly [number, number]>): Uint8Array {
  const tiles = new Uint8Array(GRID_W * GRID_H).fill(TILE_FLOOR);
  for (const [x, y] of walls) tiles[y * GRID_W + x] = TILE_WALL;
  return tiles;
}

test("the spike is off unless the URL asks for it", () => {
  // The single most important property. Every child with the game open right
  // now is on the path they were on this morning.
  expect(isoAsked("")).toBe(false);
  expect(isoAsked("?")).toBe(false);
  expect(isoAsked("?iso=0")).toBe(false);
  expect(isoAsked("?iso")).toBe(false);
  expect(isoAsked("?other=1")).toBe(false);
  expect(isoAsked("?iso=1")).toBe(true);
  expect(isoAsked("?a=b&iso=1")).toBe(true);
});

test("no engine knows this exists, and none could", async () => {
  // Hard rule 1's zone reaching into the page would be the end of determinism.
  // Checked across every build, not just the city's, because the projection
  // would be just as wrong to import from swim.
  const { readdirSync } = await import("fs");
  for (const engine of readdirSync("src/engines")) {
    let files: string[];
    try { files = readdirSync(`src/engines/${engine}`); } catch { continue; }
    for (const file of files) {
      const src = await Bun.file(`src/engines/${engine}/${file}`).text();
      expect({ file, reaches: src.includes("iso.ts") || src.includes("isoview") })
        .toEqual({ file, reaches: false });
    }
  }
});

test("the page only reaches the spike behind the switch", async () => {
  const page = await Bun.file("src/web/play/main.ts").text();
  expect(page).toContain("const inBlocks = isoAsked(window.location.search);");
  expect(page).toContain("if (inBlocks) isoView = new IsoView(canvas, level.engine, level.tilesetId);");
  // ...and every drawing path checks it, so a null view is the flat game.
  expect(page).toContain("if (isoView !== null && moving !== null) {");
  expect(page).toContain("if (isoView !== null) {");
});

test("a building's height is derived from the shape, so it costs no bits", () => {
  // The whole reason this can be tried at all. A stored height would be two
  // bits a cell on the wire, and the wire is the product: 336 cells in 77
  // bytes is what makes a level fit in a WhatsApp message and a QR code.
  expect(towerHeight(room([]), 5, 5)).toBe(0);                     // not a wall
  expect(towerHeight(room([[5, 5]]), 5, 5)).toBe(1);               // on its own
  // A frontage: two neighbours along a run.
  expect(towerHeight(room([[4, 5], [5, 5], [6, 5]]), 5, 5)).toBe(MAX_BLOCKS - 1);
  // Deep inside a block: a tower.
  const block: Array<readonly [number, number]> = [];
  for (let x = 4; x <= 6; x++) for (let y = 4; y <= 6; y++) block.push([x, y]);
  expect(towerHeight(room(block), 5, 5)).toBe(MAX_BLOCKS);
});

test("...and never grows past the cap, wherever it is measured", () => {
  const all: Array<readonly [number, number]> = [];
  for (let x = 0; x < GRID_W; x++) for (let y = 0; y < GRID_H; y++) all.push([x, y]);
  const solid = room(all);
  for (const [x, y] of all) {
    const tall = towerHeight(solid, x, y);
    expect({ x, y, ok: tall >= 1 && tall <= MAX_BLOCKS }).toEqual({ x, y, ok: true });
  }
});

test("the grid is drawn back to front, every cell exactly once", () => {
  // Painter's algorithm, and in this projection "further away" is a smaller
  // x + y: a cell can only be hidden by one further east or further south, and
  // both have a larger sum. So one sort and no depth buffer.
  const order = backToFront();
  expect(order).toHaveLength(GRID_W * GRID_H);
  const seen = new Set<number>();
  let last = -1;
  for (const [x, y] of order) {
    const key = y * GRID_W + x;
    expect({ key, twice: seen.has(key) }).toEqual({ key, twice: false });
    seen.add(key);
    expect(x + y).toBeGreaterThanOrEqual(last);
    last = x + y;
  }
});

test("the whole diamond fits a phone at a whole-number scale", () => {
  // The number that chose ISO_W. A 32-wide face would be 608 pixels against a
  // 390-point phone: a 0.64 downscale, which is exactly the fractional squash
  // that turned the dragon into a smudge on day 12. Whole pixels or nothing.
  expect(isoWidth()).toBe((GRID_W + GRID_H) * (ISO_W / 2));
  expect(isoWidth()).toBeLessThanOrEqual(360);
  expect(isoHeight()).toBeLessThanOrEqual(360);
});

test("the projection is 2:1, which is why the diagonals stay crisp", () => {
  expect(ISO_W).toBe(ISO_H * 2);
  // One cell east goes right and down; one cell south goes left and down.
  expect(isoX(1, 0) - isoX(0, 0)).toBe(ISO_W / 2);
  expect(isoY(1, 0) - isoY(0, 0)).toBe(ISO_H / 2);
  expect(isoX(0, 1) - isoX(0, 0)).toBe(-ISO_W / 2);
  expect(isoY(0, 1) - isoY(0, 0)).toBe(ISO_H / 2);
  // ...and a block of lift is straight up the screen.
  expect(isoX(3, 3)).toBe(isoX(3, 3));
  expect(isoY(3, 3, 0) - isoY(3, 3, 1)).toBeGreaterThan(0);
});

test("a tower between the camera and the player is seen through", () => {
  // The finding of the first render, kept as a test: a city of tall towers is
  // beautiful and unplayable, because the streets and everyone in them vanish.
  // "A gem you cannot see is a level you cannot finish" is a rule this game
  // already lives by.
  expect(inTheWay(6, 6, 5, 5)).toBe(true);    // one cell nearer, same column
  expect(inTheWay(7, 7, 5, 5)).toBe(true);    // two nearer
  expect(inTheWay(5, 5, 5, 5)).toBe(false);   // the player's own cell
  expect(inTheWay(4, 4, 5, 5)).toBe(false);   // behind them: hides nothing
  expect(inTheWay(12, 12, 5, 5)).toBe(false); // far in front: a different street
});

test("...and only in the player's own column, not a stripe across the city", () => {
  // Fading the whole column would carve a channel through the skyline every
  // time the player walked, which reads as a rendering fault rather than help.
  expect(inTheWay(8, 6, 5, 5)).toBe(false);
  expect(inTheWay(6, 8, 5, 5)).toBe(false);
});
