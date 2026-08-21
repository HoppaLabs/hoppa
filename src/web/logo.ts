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
    "###.......",
    "###.......",
    "###.......",
    "###.......",
    "###.####..",
    "##########",
    "###....###",
    "###....###",
    "###....###",
    "###....###",
    "###....###",
    "###....###",
    "..........",
    "..........",
    "..........",
    "..........",
  ],
  o: [
    "..........",
    "..........",
    "..........",
    "..........",
    "..######..",
    ".########.",
    "###....###",
    "###....###",
    "###....###",
    "###....###",
    ".########.",
    "..######..",
    "..........",
    "..........",
    "..........",
    "..........",
  ],
  p: [
    "..........",
    "..........",
    "..........",
    "..........",
    "########..",
    "#########.",
    "###....###",
    "###....###",
    "###....###",
    "###....###",
    "#########.",
    "########..",
    "###.......",
    "###.......",
    "###.......",
    "###.......",
  ],
  // Single-storey, and told apart from the o by its corners: the right-hand
  // stem is STRAIGHT, so the a has square corners where the o has round ones.
  // Two letters that differ only in a rounding read as the same letter at the
  // size a phone draws this.
  a: [
    "..........",
    "..........",
    "..........",
    "..........",
    "..########",
    ".#########",
    "###....###",
    "###....###",
    "###....###",
    "###....###",
    ".#########",
    "..########",
    "..........",
    "..........",
    "..........",
    "..........",
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

      // Inside. The ramp runs down the x-height band, so a descender does not
      // restart the gradient halfway through the word.
      const through = Math.min(1, Math.max(0, (py - 5) / 8));
      let shade = through < 0.34 ? 4 : through < 0.72 ? 3 : 2;
      // Bevel: lit along the top edge, shadowed along the bottom.
      if (at(px, py - 1) === 0) shade = 5;
      else if (at(px, py + 1) === 0) shade = 2;
      ink[py * w + px] = shade;
    }
  }
  return { w, h, ink };
}

/**
 * The ramp, darkest first, with the outline in front.
 *
 * Gold, because the treasure is gold and the player is gold: the name of the
 * game should be made of the thing the game is about. Held against the page's
 * own dark, which every screen already sits on.
 */
export const RAMP: readonly string[] = [
  "#1b1206", // outline
  "#8a5a12",
  "#c78a1c",
  "#f0b52e",
  "#ffe08a", // top-edge highlight
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
