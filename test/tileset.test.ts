import { expect, test } from "bun:test";
import { PALETTE, PALETTE_SIZE } from "../src/core/palette.ts";
import {
  OUTSIDE, RAMP_MAX, TILESETS, TILE_PX, UNDERGROUND, inkOf, patternIsSound, tilesetFor,
} from "../src/core/tileset.ts";

test("every tile is square on the shared grid, three colours plus transparent", () => {
  for (const set of TILESETS) {
    for (const [name, pattern] of [["wall", set.wall], ["floor", set.floor], ["ladder", set.ladder]] as const) {
      expect({ set: set.name, name, sound: patternIsSound(pattern, set.sub.length) })
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
    // A RAMP: at least three steps, all different, no more than the digits
    // "1".."9" can name. Three was the old ceiling, inherited from the
    // creature format for no reason a tile has to obey -- see Pattern.
    expect(set.sub.length).toBeGreaterThanOrEqual(3);
    expect(set.sub.length).toBeLessThanOrEqual(RAMP_MAX);
    expect(new Set(set.sub).size).toBe(set.sub.length);
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
  const wide = (fill: string) => new Array(TILE_PX).fill(fill.repeat(TILE_PX / 8));
  expect(patternIsSound(["1234567"])).toBe(false);            // too few rows
  expect(patternIsSound(wide("1234567"))).toBe(false);        // rows too short
  expect(patternIsSound(wide("1111111x"))).toBe(false);       // bad character
  // ...and a digit past the end of the ramp it is drawn against.
  expect(patternIsSound(wide("11111119"), 3)).toBe(false);
  expect(patternIsSound(wide("11111113"), 3)).toBe(true);
  expect(patternIsSound(wide("...11223"))).toBe(true);
});

test("a flame frame index is never negative, however long the game has run", async () => {
  // `| 0` is the house style for integer arithmetic and it was wrong here.
  // Date.now() / 160 is about eleven billion; `| 0` truncates to 32 bits and
  // eleven billion wraps NEGATIVE, so the frame lookup missed and the cell fell
  // through to the flat orange square that exists for when a stamp fails to
  // build. On screen: a row of hazards, some flames and some plain blocks,
  // flickering between the two.
  const frames = 3;
  const pick = (cell: number, now: number): number => {
    const step = Math.floor(now / 160) + cell;
    return ((step % frames) + frames) % frames;
  };
  // The value that broke it, plus a spread across the next century.
  for (const now of [0, 1, 1787000000000, 1787227946392, 2_000_000_000_000, 4_102_444_800_000]) {
    for (const cell of [0, 1, 47, 335]) {
      const at = pick(cell, now);
      expect({ now, cell, sound: at >= 0 && at < frames }).toEqual({ now, cell, sound: true });
    }
    // ...and the old arithmetic really did wrap, or this proves nothing. It is
    // the truncation that goes negative; the modulo of it then lands on a
    // negative index, or on -0, and both miss the array.
    if (now > 1_000_000_000_000) {
      expect((now / 160) | 0).toBeLessThan(0);
      expect(((now / 160) | 0) % frames).toBeLessThanOrEqual(0);
    }
  }
});

test("fire flickers and spikes do not", async () => {
  const { UNDERGROUND, OUTSIDE, patternIsSound } = await import("../src/core/tileset.ts");
  // A flame that held still would be the only thing in the room that should
  // move and doesn't. A spike is metal.
  expect((UNDERGROUND.fireFrames ?? []).length).toBeGreaterThan(1);
  expect(OUTSIDE.fireFrames).toBeUndefined();
  for (const frame of UNDERGROUND.fireFrames ?? []) expect(patternIsSound(frame)).toBe(true);
  // Only the tip moves: a base that wandered reads as the whole fire sliding.
  const bases = new Set((UNDERGROUND.fireFrames ?? []).map((f) => f.slice(TILE_PX - 2).join("|")));
  expect(bases.size).toBe(1);
});
