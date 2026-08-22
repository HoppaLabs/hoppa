// Walking, for the engines that look down at the room.
//
// WHY THIS FILE EXISTS
//
// The complaint was "it feels like moving a cursor", and in the four top-down
// builds that was literally true:
//
//     if (buttons & HELD_LEFT)  x -= speed;
//     if (buttons & HELD_RIGHT) x += speed;
//
// Position assigned from the button, with nothing in between. There is no
// state where the creature is "getting going" or "still going", so it never
// reads as an object with a body -- it reads as a caret being retyped.
//
// Everything here is arithmetic on integers with no memory of its own, so the
// numbers can be argued about in a test instead of felt for in a browser. The
// engines keep the state; this file just says what the next number should be.
//
// NOTHING EXISTING IMPORTS THIS. Hard rule 3 says a shipped build's behaviour
// never changes, and the cheapest way to keep that promise is for the new
// builds to be the only readers -- so a later tweak in here can never reach
// roam/8 or calm/3 by accident.

import { ONE, abs, clamp, fraction, sign, towards } from "./fixed.ts";

/**
 * Ticks to reach full speed, near enough. Creature speeds run 20 to 50
 * subcells a tick, so a quarter of the speed per tick is four ticks, an eighth
 * of a second.
 *
 * This is much shorter than the platformer's ramp and deliberately so. In a
 * side-on room the ramp IS the game: you are judging a run-up. Looking down at
 * a room full of guards, a long ramp is just latency between deciding to dodge
 * and dodging. Four ticks is enough to see, not enough to fight.
 */
export function walkAccelFor(speed: number): number {
  const step = (speed / 4) | 0;
  return step > 5 ? step : 5;
}

/**
 * Slowing down is faster than speeding up: about three ticks.
 *
 * The asymmetry is the point. Coming to a stop slightly quicker than you got
 * going means the creature settles rather than drifts, which is what a floor
 * feels like. Water does it the other way round -- see swim, where letting go
 * leaves you to the current.
 */
export function walkDragFor(speed: number): number {
  const step = (speed / 3) | 0;
  return step > 6 ? step : 6;
}

/**
 * Diagonals, as a fraction of ONE.
 *
 * 181/256 is 1/root 2 to three decimal places, which is as much precision as
 * a 256-subcell grid can hold anyway.
 *
 * Without this, holding two buttons moves you `speed` on BOTH axes -- 41% faster
 * across the room than any single direction. Every player finds that within a
 * minute and then never walks in a straight line again, and every room's
 * difficulty was tuned against a speed nobody uses.
 */
export const DIAGONAL = 181;

/** The speed to aim for on one axis, given both axes' inputs. */
export function targetFor(speed: number, mine: number, other: number): number {
  if (mine === 0) return 0;
  const full = (speed * mine) | 0;
  if (other === 0) return full;
  return (Math.imul(full, DIAGONAL) >> 8) | 0;
}

/**
 * Turning round is quicker than starting from still.
 *
 * A reversal otherwise costs the whole of stopping plus the whole of starting,
 * and that reads as the controls being ignored rather than as weight.
 */
export function pushFor(velocity: number, target: number, accel: number): number {
  const turning = (velocity > 0 && target < 0) || (velocity < 0 && target > 0);
  return turning ? (accel * 2) | 0 : accel;
}

/**
 * How far a body may be shoved sideways in one tick to get round a corner.
 *
 * A tenth of a cell. Correcting the worst honest misalignment -- about half a
 * body, 50-odd subcells -- takes two or three ticks, which is quick enough to
 * read as the creature turning into the gap and slow enough that you can see
 * it happen.
 */
export const SLIP = 24;

/**
 * Which way, and how far, to nudge a body to line it up with its own row or
 * column. Zero if it is already lined up.
 *
 * THE STICKY DOOR
 *
 * This is most of what makes a top-down game feel unfair. A body is 192
 * subcells across in a 256 cell, so it fits through a one-cell gap with 32
 * subcells to spare either side -- and the player has no way to see whether
 * they are inside that 64-subcell window. Walk at a doorway slightly high and
 * you simply stop, with the gap visibly right there. Nobody reads that as
 * "you missed"; they read it as the game refusing to move.
 *
 * The fix is not a wider door. It is that when the way ahead is blocked, the
 * game finds out whether lining you up would open it, and if so does the
 * lining up for you.
 *
 * Toward the middle of your OWN cell is the only direction worth trying: a
 * body narrower than a cell that does not fit in the row it is mostly in is
 * always overlapping the row it is mostly NOT in, and the middle is the only
 * place it can definitely sit.
 */
export function alignStep(position: number): number {
  const middle = ONE >> 1;
  const off = (middle - fraction(position)) | 0;
  if (off === 0) return 0;
  return towards(0, off, SLIP);
}

/** The middle of the row or column a position is in. */
export function middleOf(position: number): number {
  return ((position | 0) - fraction(position) + (ONE >> 1)) | 0;
}

/**
 * Is a nudge of this size worth trying at all?
 *
 * A body already within a few subcells of the middle that still does not fit
 * is not misaligned -- the way is genuinely blocked -- and shoving it about
 * would only look like a twitch.
 */
export function worthSlipping(step: number): boolean {
  return abs(step) > 0;
}

/**
 * Ticks the player has no say, after taking a hit.
 *
 * Short on purpose. Long enough that the hit is a thing that HAPPENED to you
 * rather than a number changing in a corner; short enough that it never
 * cascades -- being knocked into a second guard while still stunned by the
 * first is how a game gets a reputation for being unfair.
 */
export const STUN_TICKS = 5;

/**
 * How hard a hit shoves, in subcells per tick, before drag eats it.
 *
 * Twice the fastest creature's walking speed, which sounds enormous and is
 * over in a third of a second: drag takes it back at the same rate it takes
 * back a walk, so the whole slide is about two cells. That is deliberately the
 * same distance the engines used to TELEPORT you on a hit -- the destination is
 * not the change here, the travelling is.
 */
export const KNOCK_SPEED = 96;

/**
 * The shove away from whatever hit you, as a velocity on each axis.
 *
 * Away on both axes, normalised, so being caught on a corner throws you off
 * the corner rather than along it. Each axis is applied separately by the
 * mover, so a shove into a wall is simply eaten on that axis and the other
 * half still happens.
 *
 * WHY A VELOCITY AND NOT A PLACE
 *
 * The engines used to move you two whole cells on the tick you were hit. It is
 * the same destination and it reads completely differently: you do not see
 * yourself thrown, you see yourself somewhere else, and a child watching it
 * cannot tell whether they were hit or whether the game glitched. A hit has to
 * be a thing that HAPPENS over several frames or it is just a number going
 * down in the corner.
 */
export function knockback(
  fromX: number, fromY: number, atX: number, atY: number,
): { readonly vx: number; readonly vy: number } {
  const sx = sign((atX - fromX) | 0);
  const sy = sign((atY - fromY) | 0);
  // Dead centre -- exactly overlapping -- counts as a shove to the right
  // rather than as no shove at all, so a hit is never silent.
  if (sx === 0 && sy === 0) return { vx: KNOCK_SPEED, vy: 0 };
  const vx = (sx * KNOCK_SPEED) | 0;
  const vy = (sy * KNOCK_SPEED) | 0;
  if (sx !== 0 && sy !== 0) {
    return {
      vx: (Math.imul(vx, DIAGONAL) >> 8) | 0,
      vy: (Math.imul(vy, DIAGONAL) >> 8) | 0,
    };
  }
  return { vx, vy };
}

/**
 * Ticks a swing asked for slightly too early is remembered.
 *
 * The same argument as the platformer's jump buffer. A swing takes eight ticks
 * and a child mashing the button lands the second press inside the first
 * swing, where it used to be dropped on the floor. Six ticks is three quarters
 * of a swing -- long enough to catch honest mashing, short enough that a press
 * never fires so late that it looks like the game swinging on its own.
 */
export const SWING_BUFFER_TICKS = 6;

/**
 * The buffer counter for one tick: armed on the EDGE of the press, counted
 * down otherwise.
 *
 * On the edge, not on the button being down -- otherwise holding the button
 * re-arms it every tick and the creature flails for as long as you lean on it,
 * which is a different game and a worse one.
 */
export function bufferedFor(down: boolean, wasDown: boolean, left: number): number {
  if (down && !wasDown) return SWING_BUFFER_TICKS;
  return left > 0 ? (left - 1) | 0 : 0;
}

/** Keep a velocity inside what the creature can actually do. */
export function capped(velocity: number, speed: number): number {
  return clamp(velocity, (-speed) | 0, speed | 0);
}
