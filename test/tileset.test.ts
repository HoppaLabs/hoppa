import { expect, test } from "bun:test";
import { PALETTE, PALETTE_SIZE } from "../src/core/palette.ts";
import {
  OUTSIDE, TILESETS, TILE_PX, UNDERGROUND, inkOf, patternIsSound, tilesetFor,
} from "../src/core/tileset.ts";

test("every tile is 8x8 and uses three colours plus transparent", () => {
  for (const set of TILESETS) {
    for (const [name, pattern] of [["wall", set.wall], ["floor", set.floor], ["ladder", set.ladder]] as const) {
      expect({ set: set.name, name, sound: patternIsSound(pattern) })
        .toEqual({ set: set.name, name, sound: true });
      expect(pattern).toHaveLength(TILE_PX);
    }
  }
});

test("sub-palettes are real palette entries", () => {
  for (const set of TILESETS) {
    for (const index of set.sub) {
      expect(Number.isInteger(index)).toBe(true);
      expect(index).toBeGreaterThanOrEqual(0);
      expect(index).toBeLessThan(PALETTE_SIZE);
    }
    // Three DIFFERENT colours, or the art has no shading to work with.
    expect(new Set(set.sub).size).toBe(3);
  }
});

test("ink maps pattern characters onto the palette, and nothing else", () => {
  expect(inkOf(UNDERGROUND, "1")).toBe(PALETTE[UNDERGROUND.sub[0]] as string);
  expect(inkOf(UNDERGROUND, "2")).toBe(PALETTE[UNDERGROUND.sub[1]] as string);
  expect(inkOf(UNDERGROUND, "3")).toBe(PALETTE[UNDERGROUND.sub[2]] as string);
  expect(inkOf(UNDERGROUND, ".")).toBeNull();
  expect(inkOf(UNDERGROUND, "x")).toBeNull();
});

test("each world gets its own tileset", () => {
  expect(tilesetFor(false)).toBe(UNDERGROUND);
  expect(tilesetFor(true)).toBe(OUTSIDE);
  expect(UNDERGROUND.id).not.toBe(OUTSIDE.id);
});

test("the side-on floor is empty, because open space there is air", () => {
  // You fall through it. A textured "floor" would say the opposite.
  for (const row of OUTSIDE.floor) expect(row).toBe(".".repeat(TILE_PX));
});

test("the ladder leaves gaps, so what is behind it shows through", () => {
  const holes = UNDERGROUND.ladder.join("").split("").filter((c) => c === ".").length;
  expect(holes).toBeGreaterThan(0);
});

test("patternIsSound catches a malformed tile", () => {
  expect(patternIsSound(["1234567"])).toBe(false);              // too few rows
  expect(patternIsSound(new Array(8).fill("1234567"))).toBe(false);  // rows too short
  expect(patternIsSound(new Array(8).fill("11111119"))).toBe(false); // bad character
  expect(patternIsSound(new Array(8).fill("...11223"))).toBe(true);
});
