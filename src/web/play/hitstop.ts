// The world flinching when something lands.
//
// Asked for as "the world doesn't react to you", which is most of what
// separates this from the games it is being compared to. Zelda's feel is not
// its physics, it is the two or three frames where EVERYTHING STOPS on a sword
// connecting -- and then the knockback, the flash, the noise. The stop is the
// cheapest of those and by far the biggest return: a hit with no pause reads as
// the enemy politely agreeing to move.
//
// WHY THIS COSTS NOTHING ON THE WIRE
//
// The engine is not touched and no build moves. A hoppa run is a LIST OF
// INPUTS, one per tick, and the page decides when a tick happens (see
// src/core/clock.ts -- wall-clock time never crosses into the engine). Holding
// the clock still for a few frames simply means the log has fewer entries in
// it; replaying that log reproduces exactly the same states, because a replay
// has no idea how long anybody waited between two ticks.
//
// So a level beaten today and a level beaten last week both replay, and hard
// rule 3 is not in play at all: step() does the same thing it always did.
//
// Out of the page so the numbers can be argued about in a test rather than felt
// for in a browser.

/** The kinds of landing worth stopping for. */
export type Impact = "kill" | "smash" | "hurt" | "freeze";

/**
 * Frames to hold, by what happened. At sixty frames a second these are 50 to
 * 100 milliseconds.
 *
 * Ordered by how final the thing is. Killing something is the biggest event in
 * the game and gets the longest stop; taking a hit yourself is next, because
 * the pause is the game insisting you noticed; freezing is the shortest,
 * because the thing is still there and the run has not really turned.
 *
 * Deliberately short. Past about eight frames a stop stops reading as impact
 * and starts reading as a dropped frame, which is the opposite of the point.
 */
export const HOLD_FRAMES: Readonly<Record<Impact, number>> = {
  kill: 6,
  smash: 5,
  hurt: 4,
  freeze: 3,
};

/**
 * How long the world is holding still.
 *
 * A new impact never SHORTENS a hold that is already running -- two things
 * landing in the same instant should feel like the bigger of the two, not like
 * whichever happened to be checked last.
 */
export class Hitstop {
  private left = 0;

  private hard = false;

  /** Something landed. Takes the longest hold of everything in this instant. */
  bite(impacts: readonly Impact[]): void {
    for (const impact of impacts) {
      const frames = HOLD_FRAMES[impact];
      if (frames > this.left) this.left = frames;
      // Two pixels for the things that END something, one for the rest. At
      // integer scale a single pixel is the smallest shake there is, and on a
      // phone it is nearly invisible; a kill deserves to be felt.
      if (impact === "kill" || impact === "smash") this.hard = true;
    }
  }

  /** Is the clock held right now? */
  holding(): boolean {
    return this.left > 0;
  }

  /** One frame of the hold spent. Called once per animation frame. */
  frame(): void {
    if (this.left > 0) this.left = (this.left - 1) | 0;
    if (this.left === 0) this.hard = false;
  }

  /**
   * How hard to shake, in whole pixels, right now.
   *
   * Whole pixels, and it alternates rather than decaying smoothly: this game
   * draws pixel art at integer scale, and a shake on a fraction of a pixel is
   * a blur. One pixel, one way then the other, for as long as the stop lasts.
   */
  shake(): number {
    if (this.left <= 0) return 0;
    const wide = this.hard ? 2 : 1;
    return this.left % 2 === 0 ? wide : -wide;
  }

  /** A new run: nothing is landing. */
  forget(): void {
    this.left = 0;
    this.hard = false;
  }
}

/** What landed between two instants, from what the engine already reports. */
export interface Landing {
  readonly killed: boolean;
  readonly froze: boolean;
  readonly smashed: boolean;
  /** Hearts a moment ago, and now. A drop is a hit taken. */
  readonly hpBefore: number;
  readonly hpNow: number;
  readonly playing: boolean;
}

/**
 * Which impacts this instant is worth.
 *
 * Pure, and separate from the thing that holds the clock, for the same reason
 * soundsFor() is separate from the thing that makes the noise.
 */
export function impactsOf(landing: Landing): readonly Impact[] {
  const impacts: Impact[] = [];
  if (landing.killed) impacts.push("kill");
  if (landing.smashed) impacts.push("smash");
  if (landing.froze) impacts.push("freeze");
  // Only while the run is still going: the last hit and the loss are one
  // moment, and stopping the world twice for it reads as a stutter.
  if (landing.hpNow < landing.hpBefore && landing.playing) impacts.push("hurt");
  return impacts;
}

/**
 * A gate that opens once per engine tick.
 *
 * Without this the whole thing DEADLOCKS, and it does so in a way no unit test
 * of Hitstop could show. The engine's `justKilled()` and friends are per-TICK
 * flags: they are set inside step() and cleared at the top of the next step().
 * The page reads them once per animation FRAME -- and while the world is held,
 * no tick runs, so the flag never clears, so every frame re-triggers the hold,
 * so no tick ever runs again. The game stops dead on the first kill.
 *
 * Caught in a browser: the shake came back as three hundred frames of the same
 * single direction, because `left` was being set back to its maximum before it
 * could ever count down. The measurement said "shaking a lot"; what it meant
 * was "frozen".
 *
 * So impacts are read once per tick, and a frame that has not advanced the
 * engine reads nothing at all.
 */
export class OncePerTick {
  private seen = -1;

  /** True the first time this tick number is offered, false every time after. */
  fresh(tick: number): boolean {
    if (tick === this.seen) return false;
    this.seen = tick;
    return true;
  }

  forget(): void {
    this.seen = -1;
  }
}
