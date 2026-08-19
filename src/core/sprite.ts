// Creature sprites. Spec S5: 16x16 at 2 bits per pixel, plus a sub-palette.
//
// Pixel values: 0 is transparent, 1..3 index the creature's three colours.
//
// APPEARANCE NEVER TOUCHES stateHash(). Spec S5 says this is where the rule will
// actually get violated, so there is a test that draws two different sprites and
// asserts the same hash.

import { normaliseSubPalette, type SubPalette } from "./palette.ts";
import { fromBase64url, toBase64url } from "./bits.ts";

export const SPRITE_W = 16;
export const SPRITE_H = 16;
export const SPRITE_PIXELS = 256; // SPRITE_W * SPRITE_H
export const SPRITE_BYTES = 64; // 256 pixels at 2bpp

export interface Sprite {
  /** Length SPRITE_PIXELS, each 0..3. */
  readonly pixels: Uint8Array;
  readonly sub: SubPalette;
}

export class SpriteError extends Error {}

export function emptySprite(sub: readonly number[] = [28, 38, 4]): Sprite {
  return { pixels: new Uint8Array(SPRITE_PIXELS), sub: normaliseSubPalette(sub) };
}

export function spriteIndex(x: number, y: number): number {
  return ((y | 0) * SPRITE_W + (x | 0)) | 0;
}

export function withPixel(sprite: Sprite, x: number, y: number, value: number): Sprite {
  if (x < 0 || x >= SPRITE_W || y < 0 || y >= SPRITE_H) return sprite;
  const pixels = new Uint8Array(sprite.pixels);
  pixels[spriteIndex(x, y)] = (value | 0) & 3;
  return { pixels, sub: sprite.sub };
}

/** How many pixels are painted. Presentation only -- never gameplay. */
export function inkedCount(sprite: Sprite): number {
  let n = 0;
  for (let i = 0; i < SPRITE_PIXELS; i = (i + 1) | 0) {
    if ((sprite.pixels[i] as number) !== 0) n = (n + 1) | 0;
  }
  return n;
}

/** Four pixels to a byte, most significant pair first. */
export function packPixels(sprite: Sprite): Uint8Array {
  const bytes = new Uint8Array(SPRITE_BYTES);
  for (let i = 0; i < SPRITE_PIXELS; i = (i + 1) | 0) {
    const byte = (i >>> 2) | 0;
    const shift = (6 - ((i & 3) << 1)) | 0;
    bytes[byte] = ((bytes[byte] as number) | (((sprite.pixels[i] as number) & 3) << shift)) & 0xff;
  }
  return bytes;
}

export function unpackPixels(bytes: Uint8Array): Uint8Array {
  if (bytes.length !== SPRITE_BYTES) {
    throw new SpriteError(`a sprite is ${SPRITE_BYTES} bytes; got ${bytes.length}`);
  }
  const pixels = new Uint8Array(SPRITE_PIXELS);
  for (let i = 0; i < SPRITE_PIXELS; i = (i + 1) | 0) {
    const byte = bytes[(i >>> 2) | 0] as number;
    const shift = (6 - ((i & 3) << 1)) | 0;
    pixels[i] = (byte >>> shift) & 3;
  }
  return pixels;
}

/** Spec S11's `sprite.pixels`: base64url of the packed 2bpp bytes. */
export function pixelsToText(sprite: Sprite): string {
  return toBase64url(packPixels(sprite));
}

export function spriteFromText(text: string, sub: readonly number[]): Sprite {
  let bytes: Uint8Array;
  try {
    bytes = fromBase64url(text);
  } catch (err) {
    throw new SpriteError(`that is not a sprite: ${(err as Error).message}`);
  }
  return { pixels: unpackPixels(bytes), sub: normaliseSubPalette(sub) };
}

/**
 * A starter shape, so a kid opening the editor has something to change rather
 * than a blank grid. Drawn as text because that is the only readable way to
 * write a sprite in source.
 */
const STARTER = [
  "................",
  ".....111111.....",
  "....11111111....",
  "...1111111111...",
  "...1122112211...",
  "...1122112211...",
  "...1111111111...",
  "...1111111111...",
  "...1133113311...",
  "...1111111111...",
  "....11111111....",
  "...1.111111.1...",
  "..11..1111..11..",
  ".11...1..1...11.",
  "......1..1......",
  ".....11..11.....",
];

/** A sprite written as 16 rows of "0123" or ".", which is the only readable
 *  way to put pixels in source. */
export function spriteFromRows(rows: readonly string[], sub: readonly number[]): Sprite {
  if (rows.length !== SPRITE_H) {
    throw new SpriteError(`a sprite is ${SPRITE_H} rows; got ${rows.length}`);
  }
  const pixels = new Uint8Array(SPRITE_PIXELS);
  for (let y = 0; y < SPRITE_H; y = (y + 1) | 0) {
    const row = rows[y] as string;
    if (row.length !== SPRITE_W) {
      throw new SpriteError(`row ${y} is ${row.length} wide; a sprite is ${SPRITE_W}`);
    }
    for (let x = 0; x < SPRITE_W; x = (x + 1) | 0) {
      const ch = row[x] as string;
      pixels[spriteIndex(x, y)] = ch === "." ? 0 : (parseInt(ch, 10) | 0) & 3;
    }
  }
  return { pixels, sub: normaliseSubPalette(sub) };
}

export function starterSprite(sub: readonly number[] = [28, 38, 4]): Sprite {
  return spriteFromRows(STARTER, sub);
}
