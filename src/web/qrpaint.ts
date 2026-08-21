// Drawing a QR code at a size a camera can actually read.
//
// Reported live: "the QR code is not working, meaning the iPhone camera app is
// not detecting it". Not a bad code -- test/qr.test.ts reads every one of them
// back with an independent reader -- a code drawn too small.
//
// The numbers, measured for the levels in the pack. A link is 98-126
// characters, which is QR version 6-8, so 41-49 modules across, plus the eight
// modules of quiet zone that a reader needs to find the edges. The old code
// capped the square at 200px, giving 3 CSS pixels per module. An iPhone is
// about 390 CSS px across a 64mm screen, so that is 0.49mm per module, held at
// arm's length, off a screen, through glass, usually at an angle. Phone cameras
// want roughly 1mm.
//
// So it is drawn as big as the space allows instead of as big as some number
// somebody typed. On a 390px phone that is 6 px per module -- about 1mm -- and
// twice the square it was.
//
// This lives in one file because it is drawn on two pages, and the failure it
// fixes is invisible on the machine that writes it: the code looks perfectly
// fine on a laptop at any size.

import { encodeQr, QrError } from "../core/qr.ts";

/** Modules of white all the way round. Below four, readers stop finding it. */
export const QUIET = 4;

/**
 * The smallest module we will ever draw, in CSS pixels.
 *
 * A square that overflows and makes the panel scroll is a nuisance; a square
 * nobody can scan is not a QR code at all. So this is a floor, not a target,
 * and the panels it is drawn in scroll.
 */
export const MIN_SCALE = 3;

/** How wide the square may be, in CSS pixels, on this screen right now. */
export function roomFor(width: number, height: number): number {
  // Width, less the panel padding either side. Height matters too -- there is a
  // verdict, a tally, a hint and two buttons sharing the panel -- but never
  // enough to shrink it below something scannable, so it has a floor.
  return Math.min(width - 40, Math.max(220, height - 320), 360);
}

/**
 * Draw `text` as a QR code filling as much of the canvas's surroundings as it
 * can, and show it. Returns false, having done nothing, when the text is too
 * long for any code -- the caller decides what to say about that.
 */
export function paintQrOnto(canvas: HTMLCanvasElement, text: string): boolean {
  let code;
  try {
    code = encodeQr(text);
  } catch (err) {
    if (!(err instanceof QrError)) throw err;
    return false;
  }

  const modules = code.size + QUIET * 2;
  const scale = Math.max(MIN_SCALE, Math.floor(roomFor(window.innerWidth, window.innerHeight) / modules));
  const side = modules * scale;

  // Drawn at the screen's real resolution rather than in CSS pixels. With
  // `image-rendering: pixelated` and a whole-number ratio this changes nothing;
  // on the phones whose ratio is not a whole number it stops one module in
  // three coming out a pixel narrower than its neighbours.
  const dpr = Math.max(1, Math.min(4, Math.round(window.devicePixelRatio || 1)));
  canvas.width = side * dpr;
  canvas.height = side * dpr;
  canvas.style.width = `${side}px`;
  canvas.style.height = `${side}px`;

  const ctx = canvas.getContext("2d");
  if (ctx === null) return false;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, side * dpr, side * dpr);
  ctx.fillStyle = "#000000";
  const step = scale * dpr;
  for (let y = 0; y < code.size; y++) {
    for (let x = 0; x < code.size; x++) {
      if (code.modules[y * code.size + x] === 1) {
        ctx.fillRect((x + QUIET) * step, (y + QUIET) * step, step, step);
      }
    }
  }

  canvas.hidden = false;
  return true;
}
