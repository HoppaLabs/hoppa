// Which piece of junk is bolted to which wall cell, and when its lamp is lit.
//
//     "I was thinking more 'GREEBLIES' like in Star Wars and blinking lights"
//
// Greebling is a real technique with a real name: a big smooth surface reads as
// a toy, so you cover it in small mechanical detail that has no function and no
// explanation. The station's corridors are the one place in this game with a
// surface big enough to need it.
//
// WHY THIS IS NOT IN THE RENDERER
//
// It was, and it was three decisions -- does this cell get one, which one, and
// is the lamp on -- buried in a canvas call that no test can reach. The house
// rule after the editor shipped completely dead is to lift the decision out of
// the DOM module so it can be read without a browser; see src/web/level/
// palette.ts and src/web/play/breath.ts. The renderer paints. This decides.
//
// Nothing here is state. It is chosen from a cell's own coordinates, so it
// costs the wire format nothing, two people opening the same link see the same
// wall, and hard rule 4 holds: a run replays identically whether the lamps
// happened to be lit or not.

import { POND_E, POND_N, POND_S, POND_W } from "../../core/tileset.ts";

/** Every side open: nothing is beside this cell at all. */
const ALL_OPEN = POND_N | POND_E | POND_S | POND_W;

/** How many wall cells in eight carry something. */
const IN_EIGHT = 4;

export interface Bolted {
  /** Which drawing, as an index into the tileset's greeble list. */
  readonly which: number;
  /** Which colour, as an index into the tileset's lamp list. */
  readonly colour: number;
  /** Milliseconds from one blink to the next. */
  readonly period: number;
  /** Where in its own cycle this lamp starts, so two never march in step. */
  readonly phase: number;
}

/**
 * The cell's own hash. Two odd multiplies and a xor -- the one the cars and the
 * buildings already use, with different offsets so a cell that has a car does
 * not also always have a vent.
 */
function hashAt(x: number, y: number): number {
  return (Math.imul(x + 5, 0x2545f491) ^ Math.imul(y + 11, 0x9e3779b1)) >>> 0;
}

/**
 * What is bolted to the wall at (x, y), or null for a bare stretch of it.
 *
 * `open` is the sidesOf() mask: a bit SET means that side is not wall.
 *
 * A cell with every side open is that world's LONE thing -- an egg, in the
 * station -- and you do not bolt a vent to an egg. That is the one rule in
 * here worth stating out loud, because it is invisible until somebody looks at
 * a screenshot and by then it has shipped.
 */
export function boltedAt(
  x: number,
  y: number,
  open: number,
  greebles: number,
  colours: number,
): Bolted | null {
  if (greebles <= 0 || open === ALL_OPEN) return null;
  const h = hashAt(x, y);
  // Just under half. All of them is wallpaper; a handful is litter.
  if ((h >>> 3) % 8 >= IN_EIGHT) return null;
  return {
    which: (h >>> 7) % greebles,
    colour: colours > 0 ? (h >>> 23) % colours : 0,
    // 320ms to just under two seconds. A wall of lamps on one period reads as
    // one thing flashing rather than as a lot of unrelated machinery.
    period: 320 + ((h >>> 17) % 7) * 240,
    phase: h >>> 11,
  };
}

/**
 * Whether this lamp is lit at this moment.
 *
 * On two beats in three, not one in two: a lamp that spends half its life dark
 * reads as broken, and these are meant to look like something working away
 * that nobody has explained to you.
 */
export function lampLit(bolted: Bolted, nowMs: number): boolean {
  // Math.floor rather than | 0: Date.now() / 320 is about forty billion, and
  // | 0 wraps that to a negative number. Exactly the bug that put plain orange
  // squares among the flames -- see flameFrame() in renderer.ts.
  const beat = Math.floor(nowMs / bolted.period) + bolted.phase;
  return ((beat % 3) + 3) % 3 !== 0;
}
