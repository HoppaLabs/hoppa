// The tick clock.
//
// Real-time does NOT mean "no ticks". It means the ticks come from a clock
// instead of from a thumb. The simulation still advances in whole, numbered
// steps, so a replay is still a list of inputs against tick numbers and still
// hashes identically on every device -- which is what keeps share links and
// win proofs working now that the world moves on its own.
//
// The engine never sees wall-clock time. The PAGE owns the clock, converts
// elapsed milliseconds into a whole number of ticks, and calls the engine that
// many times. Time never enters the determinism zone.

/** Ticks per second. 30 is smooth enough to read and cheap enough for a phone. */
export const TICK_HZ = 30;

/** Milliseconds per tick. 1000/30 is not an integer, so ticks are counted in
 *  whole milliseconds and the remainder is carried -- no drift, no floats. */
export const TICK_MS = 33;

/**
 * Turns elapsed real time into whole ticks, carrying the remainder so that a
 * slow frame is caught up rather than lost, and a fast one does not run the
 * simulation twice for the same instant.
 */
export class TickPump {
  private carried = 0;
  /** A hard limit, so a backgrounded tab does not return and simulate a minute
   *  of game in one frame. */
  private readonly maxCatchUp: number;

  constructor(maxCatchUp = 6) {
    this.maxCatchUp = maxCatchUp | 0;
  }

  /** How many ticks to run for this many elapsed milliseconds. */
  pump(elapsedMs: number): number {
    const ms = elapsedMs > 0 ? elapsedMs | 0 : 0;
    this.carried = (this.carried + ms) | 0;
    let ticks = (this.carried / TICK_MS) | 0;
    this.carried = (this.carried - ticks * TICK_MS) | 0;
    if (ticks > this.maxCatchUp) {
      ticks = this.maxCatchUp;
      this.carried = 0;
    }
    return ticks;
  }

  reset(): void {
    this.carried = 0;
  }
}
