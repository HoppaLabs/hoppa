// The home screen icon: the starter creature, big.
//
// Not a logo. A kid finds this on a screen of thirty apps, and the thing that
// makes it findable is that it looks like the thing they were playing. It is
// drawn from the real sprite and the real palette, so it cannot drift away from
// what the game looks like.

import { colourFor } from "../src/core/palette.ts";
import { SPRITE_H, SPRITE_W, starterSprite } from "../src/core/sprite.ts";
import { encodeIndexedPng } from "./png.ts";

/** The page background, so the icon sits on the same dark as the game. */
const BACKGROUND = "#0d1014";

function rgbOf(hex: string): readonly [number, number, number] {
  const n = Number.parseInt(hex.slice(1), 16);
  return [(n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff];
}

/**
 * Draw the creature centred in a square, with a margin.
 *
 * Home screens round the corners off and some platforms crop further, so the
 * art keeps clear of the edge -- an eighth all round, which survives both the
 * iOS squircle and Android's maskable circle.
 *
 * The four colours of the icon are exactly the four values of a sprite pixel:
 * 0 is see-through, which here means the background, and 1 to 3 are the
 * creature's own sub-palette. So the icon needs no palette of its own.
 */
export function iconPng(side: number): Uint8Array {
  if (side % 4 !== 0) throw new Error(`icon side must pack into whole bytes, got ${side}`);

  const sprite = starterSprite();
  const pixels = new Uint8Array(side * side); // 0 everywhere: all background

  // Whole-pixel scaling only. A creature is pixel art, and a fractional scale
  // would blur the one thing that makes it recognisable.
  const scale = Math.max(1, Math.floor((side - Math.floor(side / 4)) / SPRITE_W));
  const left = Math.floor((side - scale * SPRITE_W) / 2);
  const top = Math.floor((side - scale * SPRITE_H) / 2);

  for (let y = 0; y < SPRITE_H; y++) {
    for (let x = 0; x < SPRITE_W; x++) {
      const value = sprite.pixels[y * SPRITE_W + x] as number;
      if (value === 0) continue;
      for (let dy = 0; dy < scale; dy++) {
        for (let dx = 0; dx < scale; dx++) {
          pixels[(top + y * scale + dy) * side + (left + x * scale + dx)] = value;
        }
      }
    }
  }

  const palette: (readonly [number, number, number])[] = [rgbOf(BACKGROUND)];
  for (const value of [1, 2, 3]) {
    const colour = colourFor(sprite.sub, value);
    palette.push(colour === null ? rgbOf(BACKGROUND) : rgbOf(colour));
  }

  return encodeIndexedPng(side, side, pixels, palette);
}
