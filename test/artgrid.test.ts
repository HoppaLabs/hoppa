import { expect, test } from "bun:test";
import { ENEMIES } from "../src/core/enemies.ts";
import { GALLERY } from "../src/core/gallery.ts";
import { SPRITE_H, SPRITE_PIXELS, SPRITE_W } from "../src/core/sprite.ts";
import { TILESETS, TILE_PX } from "../src/core/tileset.ts";

const renderer = await Bun.file("src/web/play/renderer.ts").text();
const level = await Bun.file("src/web/level/main.ts").text();
const levelHtml = await Bun.file("src/web/level/index.html").text();

/**
 * Pull the quoted rows out of a named art block, so a drawing can be checked
 * without exporting it just for the test.
 */
function artRows(name: string): string[] {
  const at = renderer.indexOf(`const ${name}`);
  expect({ name, found: at >= 0 }).toEqual({ name, found: true });
  const end = Math.min(
    ...["\n];", "\n]];"].map((mark) => renderer.indexOf(mark, at)).filter((i) => i > 0),
  );
  return [...renderer.slice(at, end).matchAll(/"([^"]*)"/g)].map((m) => m[1] as string);
}

// THE RULE, and this file is where it is written down.
//
// Every drawing in this game is authored on a grid of TILE_PX units to the
// cell and drawn at artUnit() screen pixels per unit. One pixel of the gem is
// the same size as one pixel of the knight standing next to it.
//
// It was not so. Tiles, the gem, the door and the clouds were drawn on grids
// of 8, 8, 8 and 5 while sprites were drawn on 16, and all of them are one
// cell wide -- so terrain came out at double scale and the clouds at triple.
// Reported as "treasure pixels look much bigger than the other sprites. This
// needs to be a rule that's enforced." So: enforced here.

test("there is ONE art grid, and the tiles and the sprites are both on it", () => {
  expect(SPRITE_W).toBe(SPRITE_H);
  expect(SPRITE_W * SPRITE_H).toBe(SPRITE_PIXELS);
  expect(TILE_PX).toBe(SPRITE_W);
});

test("every terrain tile is drawn on it", () => {
  for (const set of TILESETS) {
    const art: [string, readonly string[]][] = [
      ["wall", set.wall], ["floor", set.floor], ["ladder", set.ladder], ["fire", set.fire],
      ...(set.fireFrames ?? []).map((f, i) => [`fire/${i}`, f] as [string, readonly string[]]),
    ];
    for (const [name, pattern] of art) {
      expect({ set: set.name, name, rows: pattern.length }).toEqual({
        set: set.name, name, rows: TILE_PX,
      });
      for (const row of pattern) {
        expect({ set: set.name, name, width: row.length }).toEqual({
          set: set.name, name, width: TILE_PX,
        });
      }
    }
  }
});

test("...and so is the gem, and so is the door", () => {
  // These two live in the renderer because they carry colours of their own
  // rather than the tileset's. That is not a licence to draw them coarser.
  for (const name of ["GEM_FRAMES", "DOOR_SHUT", "DOOR_OPEN"]) {
    const rows = artRows(name);
    expect({ name, rows: rows.length % TILE_PX }).toEqual({ name, rows: 0 });
    expect({ name, wrong: rows.filter((r) => r.length !== TILE_PX) })
      .toEqual({ name, wrong: [] });
  }
});

test("...and every enemy, and every character", () => {
  for (const enemy of ENEMIES) {
    for (const frame of enemy.frames) {
      expect({ enemy: enemy.name, rows: frame.length }).toEqual({
        enemy: enemy.name, rows: SPRITE_H,
      });
      for (const row of frame) {
        expect({ enemy: enemy.name, width: row.length }).toEqual({
          enemy: enemy.name, width: SPRITE_W,
        });
      }
    }
  }
  for (const one of GALLERY) expect(one.sprite.pixels.length).toBe(SPRITE_PIXELS);
});

test("the clouds are drawn at the same size as everything else", () => {
  // They are the one drawing that is not one cell wide, so the grid cannot be
  // checked by counting to sixteen. What is checked instead is that they are
  // stepped by artUnit() like everything else -- they used to be stepped by
  // t/5, which made a cloud pixel three times the size of a creature pixel.
  const at = renderer.indexOf("private paintClouds(");
  const body = renderer.slice(at, renderer.indexOf("\n  }", at));
  expect(body).toContain("const step = artUnit(t);");
  expect(body).not.toMatch(/Math\.round\(t \/ \d/);
  // Rectangular, or a row runs off the end of the drawing.
  for (const name of ["CLOUD_WIDE", "CLOUD_SMALL"]) {
    const rows = artRows(name);
    expect({ name, widths: new Set(rows.map((r) => r.length)).size })
      .toEqual({ name, widths: 1 });
    // ...and big enough to still read as weather at one pixel a pixel.
    expect({ name, wide: (rows[0] as string).length >= TILE_PX * 2 })
      .toEqual({ name, wide: true });
  }
});

test("one place decides how big an art pixel is", () => {
  // Three separate sums for the same number is how they drifted apart in the
  // first place. Every scale in the renderer comes through artUnit().
  expect(renderer).toContain("function artUnit(tile: number): number {");
  expect(renderer).toContain("return Math.max(1, Math.round(tile / TILE_PX));");
  const uses = [...renderer.matchAll(/artUnit\(/g)].length;
  expect(uses).toBeGreaterThan(4);
  // Nothing works out a sprite scale for itself any more.
  expect(renderer).not.toMatch(/Math\.(floor|round)\([a-z]+ \/ SPRITE_W\)/);
});

test("a tool chip is a whole number of art pixels, so its tile and its sprite agree", () => {
  // At 24 the chip drew a 16-unit tile at one and a half screen pixels and the
  // sprite in it at one, which is the same mismatch the rooms had.
  const size = Number(/\n        (\d+),\n/.exec(level.slice(level.indexOf("tileChip(")))?.[1]);
  expect(Number.isInteger(size)).toBe(true);
  expect(size % TILE_PX).toBe(0);
  // ...and the box on the page is that size, or the browser resamples it.
  expect(levelHtml).toContain(`width: ${size}px; height: ${size}px;`);
});
