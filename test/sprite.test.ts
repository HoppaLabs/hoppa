import { expect, test } from "bun:test";
import { DAY4_LEVEL_TEXT } from "../src/core/fixtures.ts";
import { parseLevel } from "../src/core/level.ts";
import { hashHex } from "../src/core/hash.ts";
import { BRUK, NIM, PELL, PRESETS, reskin, uniformCreature } from "../src/core/creature.ts";
import {
  PALETTE,
  PALETTE_SIZE,
  clampIndex,
  colourFor,
  normaliseSubPalette,
} from "../src/core/palette.ts";
import {
  SPRITE_BYTES,
  SPRITE_H,
  SPRITE_PIXELS,
  SPRITE_W,
  SpriteError,
  emptySprite,
  inkedCount,
  packPixels,
  pixelsToText,
  spriteFromRows,
  spriteFromText,
  spriteIndex,
  starterSprite,
  unpackPixels,
  withPixel,
} from "../src/core/sprite.ts";
import { DelveV4 } from "../src/engines/delve/v4.ts";

const level = parseLevel(DAY4_LEVEL_TEXT);
const MOVES: Record<string, number> = { U: 1, R: 2, D: 3, L: 4, ".": 0 };
const A_FEW_MOVES = "RRRRRRRRRDDDDLLLDDDD";

// --- the rule the spec says will actually get broken --------------------------

// Spec S5: "Appearance never touches stateHash(). This is where the rule will
// actually get violated, so E10 tests it explicitly."
test("E10: two creatures that differ ONLY in their sprite play identically", () => {
  const spiky = spriteFromRows(
    [
      "1..............1", ".1............1.", "..1..........1..", "...1........1...",
      "....1......1....", ".....1....1.....", "......1..1......", ".......11.......",
      ".......11.......", "......1..1......", ".....1....1.....", "....1......1....",
      "...1........1...", "..1..........1..", ".1............1.", "1..............1",
    ],
    [39, 40, 41],
  );

  const painted = reskin(BRUK, "Bruk", spiky);
  expect(painted.caps).toEqual(BRUK.caps);
  expect(pixelsToText(painted.sprite)).not.toBe(pixelsToText(BRUK.sprite));

  const plain = new DelveV4(level, BRUK);
  const fancy = new DelveV4(level, painted);
  for (const ch of A_FEW_MOVES) {
    plain.step(MOVES[ch] as number);
    fancy.step(MOVES[ch] as number);
  }

  expect(hashHex(fancy.stateHash())).toBe(hashHex(plain.stateHash()));
  expect(fancy.position()).toEqual(plain.position());
  expect(fancy.collectedCount()).toBe(plain.collectedCount());
});

test("E10: repainting the sub-palette changes nothing about play", () => {
  const recoloured = reskin(NIM, "Nim", {
    pixels: NIM.sprite.pixels,
    sub: normaliseSubPalette([0, 5, 53]),
  });
  const before = new DelveV4(level, NIM);
  const after = new DelveV4(level, recoloured);
  for (const ch of A_FEW_MOVES) {
    before.step(MOVES[ch] as number);
    after.step(MOVES[ch] as number);
  }
  expect(hashHex(after.stateHash())).toBe(hashHex(before.stateHash()));
});

test("a drawing cannot smuggle itself into the capabilities", () => {
  // The tempting bug: MASS from the pixel count. Spec S5 forbids it outright --
  // "a kid draws something spiky and menacing; it can still be a featherweight".
  const heavy = reskin(NIM, "Nim", starterSprite());
  const light = reskin(NIM, "Nim", emptySprite());
  expect(inkedCount(heavy.sprite)).toBeGreaterThan(inkedCount(light.sprite));
  expect(heavy.caps.MASS).toBe(light.caps.MASS);
  expect(new DelveV4(level, heavy).noise()).toBe(new DelveV4(level, light).noise());
});

// --- the sprite model ---------------------------------------------------------

test("a sprite is 16x16 at 2 bits per pixel", () => {
  expect(SPRITE_W).toBe(16);
  expect(SPRITE_H).toBe(16);
  expect(SPRITE_PIXELS).toBe(256);
  expect(SPRITE_BYTES).toBe(64);
  expect(emptySprite().pixels.length).toBe(SPRITE_PIXELS);
});

test("pixels pack and unpack unchanged, four to a byte", () => {
  const sprite = starterSprite();
  const packed = packPixels(sprite);
  expect(packed.length).toBe(SPRITE_BYTES);
  expect([...unpackPixels(packed)]).toEqual([...sprite.pixels]);
});

test("a sprite survives the trip through text", () => {
  for (const creature of PRESETS) {
    const text = pixelsToText(creature.sprite);
    const back = spriteFromText(text, [...creature.sprite.sub]);
    expect([...back.pixels]).toEqual([...creature.sprite.pixels]);
    expect(back.sub).toEqual(creature.sprite.sub);
  }
});

test("a 16x16 sprite is about 86 characters of text -- spec S5's ~50 plus slack", () => {
  const text = pixelsToText(BRUK.sprite);
  console.log(`\n  sprite text: ${text.length} chars raw (spec S5 predicts ~50 once RLE'd)`);
  expect(text.length).toBe(86); // 64 bytes, unRLE'd
  expect(encodeURIComponent(text)).toBe(text);
});

test("painting one pixel leaves every other pixel alone", () => {
  const before = starterSprite();
  const after = withPixel(before, 3, 4, 2);
  expect(after.pixels[spriteIndex(3, 4)]).toBe(2);
  expect(before.pixels[spriteIndex(3, 4)]).not.toBe(2); // the original is untouched
  let differences = 0;
  for (let i = 0; i < SPRITE_PIXELS; i++) {
    if (before.pixels[i] !== after.pixels[i]) differences++;
  }
  expect(differences).toBe(1);
});

test("painting outside the sprite is ignored rather than an error", () => {
  const sprite = starterSprite();
  for (const [x, y] of [[-1, 0], [16, 0], [0, -1], [0, 16], [99, 99]]) {
    expect(withPixel(sprite, x as number, y as number, 1)).toBe(sprite);
  }
});

test("a pixel value is always one of the four the format has", () => {
  const sprite = withPixel(starterSprite(), 0, 0, 7);
  expect(sprite.pixels[0]).toBeLessThanOrEqual(3);
});

test("a malformed sprite is refused, not guessed at", () => {
  expect(() => spriteFromRows(["...."], [0, 1, 2])).toThrow(SpriteError);
  expect(() => spriteFromRows(new Array(16).fill("..."), [0, 1, 2])).toThrow(SpriteError);
  expect(() => unpackPixels(new Uint8Array(10))).toThrow(SpriteError);
  expect(() => spriteFromText("!!!!", [0, 1, 2])).toThrow(SpriteError);
});

// --- the palette --------------------------------------------------------------

test("the master palette is 54 colours, as spec S4 says", () => {
  expect(PALETTE.length).toBe(PALETTE_SIZE);
  expect(PALETTE_SIZE).toBe(54);
  for (const colour of PALETTE) expect(colour).toMatch(/^#[0-9a-f]{6}$/);
});

test("the palette has no duplicates -- 54 colours means 54 choices", () => {
  expect(new Set(PALETTE).size).toBe(PALETTE.length);
});

test("a sub-palette index fits in the 6 bits spec S5 budgets for it", () => {
  expect(PALETTE_SIZE).toBeLessThanOrEqual(64);
  for (const creature of PRESETS) {
    for (const index of creature.sprite.sub) {
      expect(index).toBeGreaterThanOrEqual(0);
      expect(index).toBeLessThan(PALETTE_SIZE);
    }
  }
});

test("a nonsense palette index is clamped rather than painting undefined", () => {
  expect(clampIndex(-5)).toBe(0);
  expect(clampIndex(9999)).toBe(PALETTE_SIZE - 1);
  expect(normaliseSubPalette([-1, 999, 7])).toEqual([0, PALETTE_SIZE - 1, 7]);
  expect(normaliseSubPalette([])).toEqual([0, 0, 0]);
});

test("pixel value 0 is transparent and has no colour at all", () => {
  const sub = normaliseSubPalette([1, 2, 3]);
  expect(colourFor(sub, 0)).toBeNull();
  expect(colourFor(sub, 1)).toBe(PALETTE[1] as string);
  expect(colourFor(sub, 3)).toBe(PALETTE[3] as string);
  expect(colourFor(sub, 4)).toBeNull();
});

// --- the presets look like themselves -----------------------------------------

test("every preset has a sprite somebody actually drew", () => {
  const rows = PRESETS.map((c) => `  ${c.name.padEnd(5)} ${String(inkedCount(c.sprite)).padStart(3)} pixels  sub ${c.sprite.sub.join(",")}`);
  console.log(`\n${rows.join("\n")}`);
  for (const creature of PRESETS) {
    expect(inkedCount(creature.sprite)).toBeGreaterThan(40);
    expect(creature.sprite.pixels.length).toBe(SPRITE_PIXELS);
  }
});

test("the three presets do not look like each other", () => {
  const shapes = PRESETS.map((c) => pixelsToText(c.sprite));
  expect(new Set(shapes).size).toBe(PRESETS.length);
  const palettes = PRESETS.map((c) => c.sprite.sub.join(","));
  expect(new Set(palettes).size).toBe(PRESETS.length);
});

test("reskin changes the looks and the name, and nothing else", () => {
  const painted = reskin(PELL, "Wobbly", starterSprite());
  expect(painted.name).toBe("Wobbly");
  expect(painted.caps).toEqual(PELL.caps);
  expect(painted.id).toBe(PELL.id);
  expect(painted.glyph).toBe(PELL.glyph);
});

test("E1/E2's uniform creatures still have something to draw", () => {
  for (const value of [0, 255]) {
    const creature = uniformCreature(value, "Test");
    expect(creature.sprite.pixels.length).toBe(SPRITE_PIXELS);
    expect(inkedCount(creature.sprite)).toBeGreaterThan(0);
  }
});
