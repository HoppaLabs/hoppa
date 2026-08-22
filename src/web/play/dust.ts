// The puff when you land.
//
// The squash is already there: a jump that only changes its y coordinate reads
// as a sprite being slid upwards, so the creature stretches thin through the
// fall and flattens on impact. That says what happened to the CREATURE. It
// says nothing about what happened to the FLOOR, and a landing that leaves the
// ground completely undisturbed is half a landing.
//
// Two puffs, one each side of the feet, thrown outward and gone in a tenth of
// a second. SYMMETRIC, deliberately: a puff that trails behind reads as speed,
// and this is not about speed, it is about weight arriving. Both sides at once
// is the only shape that reads as impact.
//
// WHOLE PIXELS, AND ONLY A FEW
//
// Everything else on this screen is stamped on an integer grid at an integer
// scale (see artUnit in the renderer), so dust drawn at fractional coordinates
// or fading through a smooth alpha ramp would be the one soft thing in a hard
// picture -- which is exactly the fault that had to be found and fixed twice
// already, once for the enemies and once for the player. Whole pixels, whole
// steps, six frames, gone.
//
// Out of the renderer so the shape can be argued about in a test rather than
// squinted at, the same as ./stride.ts and ./hitstop.ts.

/** How long a puff lasts. Six frames is a tenth of a second. */
export const DUST_FRAMES = 6;

/**
 * How hard you have to land before the floor notices, in subcells per tick.
 *
 * The same threshold the squash already uses. Walking off a one-cell step is
 * not an impact and should not raise anything; dropping the height of the room
 * is. Sharing the number means the two effects can never disagree about
 * whether a landing happened, which they would eventually if each had its own.
 */
export const DUST_AT_SPEED = 34;

/** One puff of dust, in ART PIXELS from the point between the creature's feet. */
export interface Puff {
  readonly dx: number;
  readonly dy: number;
  /** Side of the square, in art pixels. */
  readonly size: number;
  /** 0..1. Whole steps rather than a smooth ramp. */
  readonly fade: number;
}

/**
 * Where the dust is on this frame of the puff.
 *
 * `frame` counts UP from 0. Past the last frame there is nothing, which is the
 * caller's cue to stop asking.
 *
 * It travels outward and slightly UP before settling: dust kicked sideways
 * along the ground reads as sliding, and the small rise is what makes it read
 * as displaced by something heavy landing on it.
 */
export function puffsAt(frame: number): readonly Puff[] {
  if (frame < 0 || frame >= DUST_FRAMES) return [];
  // Out by one art pixel a frame, starting OUTSIDE the creature.
  //
  // Seven, and it took two goes to find that, both times by drawing it rather
  // than by reasoning about it.
  //
  // It began at two. Rendered ten times life size next to a mocked-up pair of
  // feet that looked about right, that seemed fine. The mock was the bug: a
  // creature's sprite is SIXTEEN art pixels across, so it spans eight either
  // side of its centre, and the mock feet I had judged it against spanned two.
  // Redrawn against a true-size silhouette, frames zero to three were entirely
  // inside the creature -- and the dust is drawn UNDER the creature, so none of
  // it was ever going to be seen. A probe counting transient pixels on the real
  // canvas had already said as much and I had read it as "subtle".
  //
  // Judging a size against a drawing of the wrong size is the same mistake as
  // trusting a metric without a control. Seven clears the sprite.
  const dx = (7 + frame) | 0;
  // On the ground while it is thick, drifting up as it thins.
  //
  // This was -1 through the middle, which lifted the puff a whole art pixel
  // clear of the floor and read as two blocks hovering rather than as dust:
  // rendered at ten times scale next to a pair of feet, the gap under them is
  // the first thing you see. Dust leaves the ground and then rises; it does
  // not start in the air.
  const dy = frame < 3 ? 0 : frame < 5 ? -1 : -2;
  // Three art pixels while it is thick, two once it has spread, one at the end.
  //
  // The first pass used two and one, and a probe that counted transient pixels
  // on the canvas found it peaking at SIXTEEN device pixels on a 780-wide
  // board -- which is not restraint, it is an effect nobody will ever see. An
  // effect nobody can see is not worth the code that draws it.
  const size = frame < 2 ? 3 : frame < 4 ? 2 : 1;
  // Whole steps: three levels, not a ramp.
  const fade = frame < 2 ? 1 : frame < 4 ? 0.66 : 0.33;
  return [
    { dx: (-dx) | 0, dy, size, fade },
    { dx, dy, size, fade },
  ];
}

/**
 * Is this landing worth a puff?
 *
 * Only on the frame the creature actually arrives -- airborne last frame,
 * grounded this one -- and only if it was moving down fast enough to matter.
 */
export function landed(wasAirborne: boolean, airborne: boolean, vy: number): boolean {
  return wasAirborne && !airborne && vy > DUST_AT_SPEED;
}
