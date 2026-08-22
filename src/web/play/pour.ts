// The water leaving the bucket.
//
// THE REPORT
//
//     "The water tool doesn't seem to work very well as it's not clear what
//      it's doing, there are no graphics or animations appearing."
//
// Exactly right, and the code agrees: the ONLY thing pouring did to the screen
// was add a CSS class to the button. Nothing was ever drawn on the board. If
// there happened to be a fire in the cell you were facing it went out sixteen
// ticks later, and if there did not, the press was indistinguishable from the
// button being broken.
//
// This is the second act of adr/0055, "the bucket nobody could see". That one
// was about not being able to FIND the button. Finding it and then being shown
// nothing is a worse version of the same problem, because now the child knows
// the button exists and has concluded it does not work.
//
// The sword has had a sweep since the day it was drawn, and the note on it says
// why: "a bar that blinks on and off reads as a bug; an arc reads as a swing,
// and it is the only feedback saying that press did something." The bucket
// needed its own version of that sentence and never got one.
//
// WHAT WATER LOOKS LIKE HERE
//
// Not a sprite: a handful of drops, thrown in the direction you are facing,
// falling as they go. Whole pixels on the same integer grid as everything else
// (see artUnit in the renderer), because a smooth spray would be the one soft
// thing in a hard picture.
//
// It runs for the whole POUR_TICKS rather than for a few frames, because the
// pour is a commitment -- sixteen ticks of standing still is the price of the
// water, and the animation showing for all of it is what tells a child that
// the price is being paid rather than that the game has hung.
//
// Out of the renderer so the shape can be argued about in a test.

/** One drop, in ART PIXELS from the middle of the creature. */
export interface Drop {
  readonly dx: number;
  readonly dy: number;
  readonly size: number;
  readonly fade: number;
}

/** How many drops are in the air at once. */
export const DROPS = 5;

/** How far the water is thrown, in art pixels, before it has all landed. */
export const THROW = 14;

/**
 * The drops, given how far through the pour we are.
 *
 * `done` runs 0 to 1 across the whole pour. Each drop is at its own point in
 * the throw, staggered so they read as a stream rather than as one lump moving
 * -- and each one loops, so the stream keeps coming for as long as the bucket
 * is tipped rather than emptying once and leaving the rest of the pour blank.
 *
 * `facing` is -1 for left, +1 for right, and 0 when the creature is pointing up
 * or down -- looked at from above, water goes out in front of you and there is
 * no sideways to draw, so it falls straight down the screen instead.
 */
export function dropsAt(done: number, facing: number): readonly Drop[] {
  if (done < 0 || done > 1) return [];
  const out: Drop[] = [];
  for (let i = 0; i < DROPS; i = (i + 1) | 0) {
    // Each drop a quarter of a throw behind the one in front, wrapping round.
    const at = (done * 2 + i / DROPS) % 1;
    // Out from the lip of the bucket, which is clear of the body.
    const along = Math.round(6 + at * THROW);
    // Falling: water leaves flat and arrives low. Squared, because that is
    // what falling does, and at this size two or three steps is the whole of
    // the curve anybody can see.
    const drop = Math.round(at * at * 10);
    out.push({
      dx: facing === 0 ? Math.round((i - (DROPS - 1) / 2) * 2) : (along * facing) | 0,
      dy: facing === 0 ? along : (drop - 6) | 0,
      // Breaking up as it goes. Three then two, not two then one: measured on
      // the real canvas the first version peaked at thirty-six device pixels,
      // which is a pour you have to be told about to notice -- and being told
      // about it is the exact complaint this is fixing.
      size: at < 0.45 ? 3 : 2,
      // Whole steps, never a ramp.
      fade: at < 0.3 ? 1 : at < 0.7 ? 0.66 : 0.33,
    });
  }
  return out;
}
