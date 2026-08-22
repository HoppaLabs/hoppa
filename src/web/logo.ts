// The wordmark.
//
// There was not one. The name was 12px letter-spaced uppercase text -- a label,
// not a logo -- on a game whose sprites have been held to a 16-bit standard
// since day 16. Asked for: "let's have a better logo then, more SNES quality".
//
// So it is drawn the way everything else here is drawn: as pixels, at whole
// scales, from a silhouette outwards. The same lesson the enemies taught --
// shape first, shading second -- because a wordmark that reads at 24px reads at
// 96px, and one that only works big is a picture of a logo.
//
// It is presentation and it is the whole of what it does. Nothing here can
// reach an engine.

/** Ink 0 is nothing; 1 is the outline; 2..5 run dark to light. */
export type Ink = 0 | 1 | 2 | 3 | 4 | 5;

/**
 * The letters, as solid shapes.
 *
 * Silhouettes only. Every bevel, outline and highlight below is DERIVED from
 * these, so a letter can be redrawn by moving blocks about without also having
 * to keep four shades consistent by hand -- which is exactly the trap that ate
 * two days of sprite work.
 *
 * Sixteen rows: an ascender band (0-3), the x-height (4-11), and a descender
 * band (12-15). Every letter is the same sixteen rows so they cannot drift out
 * of line with each other.
 */
const LETTERS: Readonly<Record<string, readonly string[]>> = {
  h: [
    "####........",
    "####........",
    "####........",
    "####........",
    "####.#####..",
    "############",
    "####....####",
    "####....####",
    "####....####",
    "####....####",
    "####....####",
    "####....####",
    "............",
    "............",
    "............",
    "............",
  ],
  o: [
    "............",
    "............",
    "............",
    "............",
    "..########..",
    ".##########.",
    "####....####",
    "####....####",
    "####....####",
    "####....####",
    ".##########.",
    "..########..",
    "............",
    "............",
    "............",
    "............",
  ],
  p: [
    "............",
    "............",
    "............",
    "............",
    "##########..",
    "###########.",
    "####....####",
    "####....####",
    "####....####",
    "###########.",
    "##########..",
    "####........",
    "####........",
    "####........",
    "####........",
    "............",
  ],
  a: [
    "............",
    "............",
    "............",
    "............",
    "..########..",
    ".##########.",
    "........####",
    ".###########",
    "############",
    "####....####",
    "############",
    ".#####..####",
    "............",
    "............",
    "............",
    "............",
  ],
};

const ROWS = 16;
/**
 * Columns between one letter and the next, before the outline is grown.
 *
 * Two, not one. The outline grows a cell in every direction, so a single
 * column of air between two letters is entirely eaten by it and they come out
 * welded together -- which is what the first draft did to the h and the o.
 */
const KERN = 2;

export const WORD = "hoppa";

/**
 * The word as a grid of inks, outline and bevel included.
 *
 * Built rather than drawn. The rules are the ones the era used and the ones the
 * sprites already follow:
 *
 * - a hard outline all the way round, because a wordmark has to survive being
 *   put on any colour;
 * - a vertical ramp through the body, light at the top and dark at the bottom,
 *   which is what makes flat letters look moulded;
 * - one row of highlight along the top edge of each shape, and one row of
 *   shadow along the bottom, which is the bevel.
 */
export function wordGrid(word: string = WORD): { w: number; h: number; ink: Uint8Array } {
  const glyphs = [...word].map((ch) => LETTERS[ch] ?? LETTERS.o as readonly string[]);
  const width = glyphs.reduce((n, g) => n + (g[0] as string).length + KERN, -KERN);

  // One cell of air all round, for the outline to grow into.
  const w = width + 2;
  const h = ROWS + 2;
  const solid = new Uint8Array(w * h);

  let x = 1;
  for (const glyph of glyphs) {
    const cols = (glyph[0] as string).length;
    for (let row = 0; row < ROWS; row++) {
      const line = glyph[row] as string;
      for (let col = 0; col < cols; col++) {
        if (line[col] === "#") solid[(row + 1) * w + (x + col)] = 1;
      }
    }
    x += cols + KERN;
  }

  const at = (px: number, py: number): number =>
    px < 0 || px >= w || py < 0 || py >= h ? 0 : (solid[py * w + px] as number);

  const ink = new Uint8Array(w * h);
  for (let py = 0; py < h; py++) {
    for (let px = 0; px < w; px++) {
      if (at(px, py) === 0) {
        // Outline: any empty cell touching the shape, including diagonally, so
        // there are no thin corners for a phone to lose.
        let touches = false;
        for (let dy = -1; dy <= 1 && !touches; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            if ((dx !== 0 || dy !== 0) && at(px + dx, py + dy) === 1) { touches = true; break; }
          }
        }
        ink[py * w + px] = touches ? 1 : 0;
        continue;
      }

      // Inside. The spectrum runs down the X-HEIGHT and then HOLDS, so a p's
      // descender stays the colour the rest of the letter ended on. Banding by
      // absolute row instead dropped the descenders off the end of the ramp
      // and out the other side, which reads as a fault rather than a gradient.
      const through = Math.min(1, Math.max(0, (py - 5) / 7));
      const steps = RAMP.length - 1;                 // the outline is not a step
      let shade = 2 + Math.min(steps - 1, Math.round((1 - through) * (steps - 1)));
      // Bevel: lit along the top edge, and down into the deepest colour along
      // the bottom. At six inks that is gold over magenta, which is the whole
      // effect in two rows.
      if (at(px, py - 1) === 0) shade = RAMP.length;
      else if (at(px, py + 1) === 0) shade = 2;
      ink[py * w + px] = shade;
    }
  }
  return { w, h, ink };
}

/**
 * The ramp, darkest first, with the outline in front.
 *
 * A SPECTRUM, magenta up through orange to gold. Asked for as "1980s sci-fi,
 * imagining Epcot launch", and then chosen from four: the spectrum was on
 * everything in 1982 and it is the only one of the four that still reads at
 * the size a phone actually draws this. The chrome one looked the part blown
 * up and went muddy small; the dark band across the gold closed up.
 *
 * Not anybody's actual mark -- the era's idea, not the era's artwork.
 */
export const RAMP: readonly string[] = [
  "#12060f", // outline
  "#b8256e", // the magenta the word sits down into
  "#e8477a",
  "#ff6a3d",
  "#ffa32e",
  "#ffd76a", // gold, along the top edge
];

/**
 * Draw the wordmark into a canvas at a whole-number scale, and size the canvas
 * to fit it exactly.
 *
 * Whole scales only. A fractional one blurs the pixels, and blurred pixel art
 * is the single thing that makes a 16-bit look read as a mistake instead of a
 * choice.
 */
export function paintLogo(canvas: HTMLCanvasElement, scale: number): void {
  const { w, h, ink } = wordGrid();
  const step = Math.max(1, Math.floor(scale));
  const dpr = Math.max(1, Math.min(4, Math.round(window.devicePixelRatio || 1)));

  canvas.width = w * step * dpr;
  canvas.height = h * step * dpr;
  canvas.style.width = `${w * step}px`;
  canvas.style.height = `${h * step}px`;

  const ctx = canvas.getContext("2d");
  if (ctx === null) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const box = step * dpr;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const value = ink[y * w + x] as number;
      if (value === 0) continue;
      ctx.fillStyle = RAMP[value - 1] as string;
      ctx.fillRect(x * box, y * box, box, box);
    }
  }
}
