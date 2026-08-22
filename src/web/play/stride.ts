// A walk cycle for a creature nobody drew a walk cycle for.
//
// WHY THIS EXISTS
//
// The enemies stride. They have two hand-drawn frames each in
// src/core/enemies.ts -- legs together, legs apart -- stepped by DISTANCE
// rather than by a clock, plus a one-pixel bob, and that is most of why a
// goblin reads as a thing that is alive and coming for you.
//
// The player has never had any of it. A child draws ONE sixteen-pixel picture
// in the character editor and that picture is what slides across the screen,
// perfectly rigid, at any speed, for ever. dash/9 and roam/9 gave the movement
// weight; this is the other half of the same complaint, because a creature that
// accelerates beautifully and never moves a leg still reads as a cursor.
//
// WE CANNOT DRAW THE SECOND FRAME
//
// It is the child's drawing. There is no second frame and there never will be
// one, so the walk has to be DERIVED from the one picture we have.
//
// The trick is as old as the problem: shove the bottom few rows sideways by a
// single pixel and the creature is mid-step. Whatever those rows happen to be
// -- feet, wheels, tentacles, the bottom of a blob -- moving them relative to
// the body is what the eye reads as walking. One pixel, because two is a
// stagger, and only the bottom five rows, because a whole-sprite shift is not a
// step, it is a wobble.
//
// A FOUR-BEAT CYCLE, NOT TWO
//
// The enemies alternate between two poses. Derived legs can do better for free:
// left forward, together, right forward, together. Four beats read as a gait
// where two read as a twitch, and it costs one more offscreen canvas.
//
// FEET TOGETHER WHEN YOU STOP
//
// Stepping by distance means a creature that stops mid-stride stays mid-stride,
// standing there with one leg out. The enemies do exactly that and have got
// away with it because nobody watches a guard at the end of its patrol. The
// player is watched constantly, so this tracks whether anything moved at all
// and stands them up straight when it did not.
//
// The grace period is why this is a class rather than a function. The screen
// draws at sixty frames a second and the engine ticks at thirty, so half of all
// frames move nothing even at a dead run -- and while the world is held for a
// hit (see ./hitstop.ts) NO frame moves anything. Without a few frames of
// memory the creature would snap to attention every other frame.
//
// Out of the renderer so the numbers can be argued about in a test rather than
// squinted at in a browser, the same as ./facing.ts and ./hitstop.ts.

import { SPRITE_H, SPRITE_W } from "../../core/sprite.ts";

/** How far a creature travels between one footfall and the next. */
export const STRIDE = 128;

/** Poses in the cycle: forward, together, back, together. */
export const POSES = 4;

/**
 * How many rows count as legs.
 *
 * Three, and the first try used five. Five moves the bottom third of the body
 * with the feet and the creature does not step, it WADDLES -- which is very
 * funny and completely wrong. Confining it to three rows moves the feet and
 * leaves the body still, which is what a step is.
 */
export const LEG_ROWS = 3;

/** Frames of stillness before the feet come together. */
export const SETTLE_FRAMES = 5;

/**
 * Which pose a creature that has travelled this far is in.
 *
 * Distance, not time. A creature strides while it walks and stands still when
 * it stands still; a timer would have it marching on the spot.
 */
export function poseOf(travelled: number): number {
  const step = Math.floor(travelled / STRIDE);
  return (((step % POSES) + POSES) % POSES) | 0;
}

/** How far the legs are thrown in this pose, in art pixels. */
export function legShift(pose: number): number {
  if (pose === 1) return 1;
  if (pose === 3) return -1;
  return 0;
}

/**
 * Does the body drop a pixel in this pose?
 *
 * On the beats where the legs are OUT, which is when a walking body is at its
 * lowest. One pixel: any more and it is a hop, which is the era's whole
 * vocabulary for "this thing is alive" and also its whole budget for it.
 */
export function bobs(pose: number): boolean {
  return legShift(pose) !== 0;
}

/**
 * The same sprite with its bottom rows shoved `by` pixels sideways.
 *
 * Pixels shoved off the edge are dropped rather than wrapped: a foot that
 * reappears on the other side of the creature is a horror, and a creature
 * drawn hard against the edge of its box is one that was going to overhang
 * anyway.
 */
export function strode(pixels: Uint8Array, by: number): Uint8Array {
  if (by === 0) return pixels;
  const out = new Uint8Array(pixels);
  const floor = lowestInked(pixels);
  if (floor < 0) return pixels;
  const from = Math.max(0, (floor - LEG_ROWS + 1) | 0);
  for (let y = from; y <= floor; y = (y + 1) | 0) {
    const row = (y * SPRITE_W) | 0;
    for (let x = 0; x < SPRITE_W; x = (x + 1) | 0) {
      const source = (x - by) | 0;
      out[row + x] = source >= 0 && source < SPRITE_W ? (pixels[row + source] as number) : 0;
    }
  }
  return out;
}

/**
 * The bottom row of the drawing that has anything in it, or -1 for a blank one.
 *
 * The legs are measured from where the creature ACTUALLY ends, not from the
 * bottom of its sixteen-pixel box. A child who draws a small creature in the
 * middle of the square, or a floating one with clear air underneath, still gets
 * a walk -- and the alternative is shoving three rows of nothing sideways and
 * wondering why that creature alone never moves.
 */
export function lowestInked(pixels: Uint8Array): number {
  for (let y = SPRITE_H - 1; y >= 0; y = (y - 1) | 0) {
    const row = (y * SPRITE_W) | 0;
    for (let x = 0; x < SPRITE_W; x = (x + 1) | 0) {
      if ((pixels[row + x] as number) !== 0) return y;
    }
  }
  return -1;
}

/**
 * Which pose to draw, frame by frame.
 *
 * Give it where the creature is; it works out whether that is different from
 * last time and how far it has come altogether.
 */
export class Stride {
  private lastX = 0;

  private lastY = 0;

  private started = false;

  private still = SETTLE_FRAMES;

  /** Total distance walked, in subcells, along both axes. */
  private travelled = 0;

  /** The pose for this frame. 0 is feet together, standing. */
  at(x: number, y: number): number {
    if (!this.started) {
      this.started = true;
      this.lastX = x;
      this.lastY = y;
      return 0;
    }
    const moved = Math.abs(x - this.lastX) + Math.abs(y - this.lastY);
    this.lastX = x;
    this.lastY = y;
    if (moved === 0) {
      if (this.still < SETTLE_FRAMES) this.still = (this.still + 1) | 0;
    } else {
      this.still = 0;
      this.travelled = (this.travelled + moved) | 0;
    }
    if (this.still >= SETTLE_FRAMES) return 0;
    return poseOf(this.travelled);
  }

  /** A new run: nobody has walked anywhere. */
  forget(): void {
    this.started = false;
    this.still = SETTLE_FRAMES;
    this.travelled = 0;
  }
}
