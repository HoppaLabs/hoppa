// The icons: on a home screen, in a tab, and beside a link in WhatsApp.
//
// Not a logo. A kid finds this on a screen of thirty apps, and the thing that
// makes it findable is that it looks like the thing they were playing. It is
// drawn from a real preset sprite and the real palette, so it cannot drift away
// from what the game looks like.
//
// The jaeger, since day 21. It was the starter creature -- gold, round, and
// reported as "a yellow creature" when it turned up beside a shared link. A
// link in WhatsApp is how this game travels, so that picture is doing more work
// than any other single thing on the site, and "use the jaeger instead" is
// right: a mech reads at sixteen pixels in a way a blob does not, and it is the
// newest thing in the game rather than the oldest.

import { colourFor } from "../src/core/palette.ts";
import { SPRITE_H, SPRITE_W, type Sprite } from "../src/core/sprite.ts";
import { VANCE } from "../src/core/creature.ts";
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
export function iconPng(side: number, sprite: Sprite = VANCE.sprite, margin = true): Uint8Array {
  if (side % 4 !== 0) throw new Error(`icon side must pack into whole bytes, got ${side}`);

  const pixels = new Uint8Array(side * side); // 0 everywhere: all background

  // Whole-pixel scaling only. A creature is pixel art, and a fractional scale
  // would blur the one thing that makes it recognisable.
  // ...with a margin on a home screen, and none in a tab: a favicon is drawn at
  // sixteen or twenty pixels on a real screen, and an eighth of that given away
  // to air is an eighth of the only thing anybody can see.
  const room = margin ? side - Math.floor(side / 4) : side;
  const scale = Math.max(1, Math.floor(room / SPRITE_W));
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

/**
 * The tab icon.
 *
 * Separate from the home-screen ones only because of the margin: those keep an
 * eighth clear all round to survive the iOS squircle and Android's maskable
 * circle, and a favicon is drawn at sixteen or twenty pixels on a real screen,
 * where an eighth given away to air is an eighth of the only thing anybody can
 * see.
 *
 * It used to be a yellow SQUARE -- four pixels of #ffc23d, written inline as an
 * SVG data URI on day one and never looked at since. A real file rather than a
 * data URI now, for two reasons: the jaeger is 130-odd lit pixels and inlining
 * it three times would put a kilobyte of rects in every page, and a file joins
 * the offline shell, so a link opened with the radio off still has its icon.
 *
 * 32, because that is the size a tab and a link preview ask for, and whole-
 * pixel scaling from a 16-pixel sprite means exactly 2.
 */
export function faviconPng(): Uint8Array {
  return iconPng(32, VANCE.sprite, false);
}
