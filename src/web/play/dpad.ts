// Where a thumb is on the pad, and what that means.
//
// The old controls were six separate buttons, each capturing the pointer on
// pointerdown and dropping the input on pointerleave. Three things follow from
// that, and all three are what "the controls are quite poor" feels like:
//
//   - you cannot ROLL from one direction to the next. The button you pressed
//     owns the pointer, so sliding your thumb from right to down does nothing
//     until you lift off and press again.
//   - a diagonal needs two fingers, because it needs two buttons.
//   - drifting a few pixels off the edge of a button stops you dead, mid-jump.
//
// A real pad is ONE control you move a thumb around. So the pad captures the
// pointer once, and this turns a position into held directions on every move.
//
// Pure, and its own file, because the only other way to check it is to have
// thumbs on a phone.

import { HELD_DOWN, HELD_LEFT, HELD_NONE, HELD_RIGHT, HELD_UP } from "../../engines/types.ts";

/**
 * How far from the middle before a touch means anything, as a fraction of the
 * pad's radius.
 *
 * A thumb resting in the centre should be still. Too small and the pad twitches
 * between directions under a stationary thumb; too big and the pad feels dead
 * in the middle where a child expects it to be most responsive.
 */
export const DEAD_ZONE = 0.22;

/**
 * The eight directions, as equal 45-degree sectors.
 *
 * Equal, rather than favouring the cardinals, because a diagonal here is a
 * thing you WANT: swimming is free movement in two axes, and from the side
 * walking while you climb is ordinary. Nothing is lost by an accidental one --
 * jump is the action button, not up, so a stray up in the platformer only
 * reaches for a ladder that is not there.
 */
const SECTORS: readonly number[] = [
  HELD_RIGHT,
  HELD_RIGHT | HELD_DOWN,
  HELD_DOWN,
  HELD_DOWN | HELD_LEFT,
  HELD_LEFT,
  HELD_LEFT | HELD_UP,
  HELD_UP,
  HELD_UP | HELD_RIGHT,
];

/**
 * The directions held by a thumb at (dx, dy) from the middle of a pad of this
 * radius. y grows downward, as it does everywhere else here.
 */
export function heldFor(dx: number, dy: number, radius: number): number {
  if (radius <= 0) return HELD_NONE;
  const distance = Math.sqrt(dx * dx + dy * dy);
  if (distance < radius * DEAD_ZONE) return HELD_NONE;

  // Sector 0 is centred on RIGHT, so rotate half a sector before dividing.
  const turn = Math.atan2(dy, dx) / (Math.PI * 2);
  const at = Math.floor((turn + 1 / 16 + 1) * 8) % 8;
  return SECTORS[at] as number;
}

/** Every bit this pad can set, for clearing them all in one go. */
export const PAD_MASK = (HELD_UP | HELD_DOWN | HELD_LEFT | HELD_RIGHT) | 0;
