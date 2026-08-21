// What to SAY about the air, and when.
//
// Pure, and in its own file, for the reason the palette is: the only way to
// see it otherwise is to hold your breath in front of a phone for twenty
// seconds. Reported as "the player character seems to randomly get hurt after
// passing a bubble" -- it was drowning, and nothing on screen said so.
//
// Presentation only. The engine is shipped and a run replays identically
// whether any of this was ever said; see hard rule 4 and swim/v2.

/** How much of a lungful is left. What swim's breath() returns. */
export interface Breath {
  readonly left: number;
  readonly full: number;
}

/** Nothing said yet this dive. */
export const AIR_QUIET = 0;
/** "come up for air" has been said once, on the way down. */
export const AIR_WARNED = 1;
/** The air is gone and the page is saying so, for as long as it is true. */
export const AIR_OUT = 2;

/**
 * A third of a lungful. The same moment the meter turns orange, so the word
 * and the colour arrive together rather than the colour going first and the
 * word arriving too late to swim anywhere.
 */
export const LOW = 3;

/**
 * The line to flash, and what to remember for next tick.
 *
 * Out of air it speaks EVERY tick, not once: a one-shot got 900ms and was then
 * buried under the engine's own "That hurt." arriving every DROWN_TICKS, which
 * is the damage announcing itself and never the reason for it.
 */
export function breathWarning(
  breath: Breath | undefined,
  said: number,
): { text: string | null; said: number } {
  if (breath === undefined) return { text: null, said };
  if (breath.left <= 0) return { text: "no air -- swim up!", said: AIR_OUT };
  if (breath.left * LOW <= breath.full) {
    if (said >= AIR_WARNED) return { text: null, said };
    return { text: "come up for air", said: AIR_WARNED };
  }
  // Back at the surface with a full lungful: the next trip down gets its own
  // warning. Without this you are told once a game rather than once a dive.
  if (breath.left >= breath.full) return { text: null, said: AIR_QUIET };
  return { text: null, said };
}

/** The meter itself: how many pips are lit, and which state it is in. */
export function breathPips(breath: Breath, pips: number): { lit: number; state: string } {
  const lit = Math.ceil((breath.left / breath.full) * pips);
  return { lit, state: lit <= 1 ? "air-0" : lit <= 2 ? "air-1" : "air" };
}
