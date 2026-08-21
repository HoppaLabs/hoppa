// Which run gets advertised, when you beat the same level more than once.
//
// Reported as "When a replay a level it doesn't use my latest time in the
// message". It never did: proveIt() is the only thing that sets `wonIn`, and
// it sat behind `if (won && !proven)`. Once proven, it never ran again -- so
// the time in the share message was the FIRST win, for ever, and a reset
// re-read it from the stored first log.
//
// The time and the LOG have to agree. The message says "I did it in 22s" and
// the stored proof is the evidence for it, so advertising a time from one run
// while keeping the log of another would make the link a lie. So this decides
// both at once: the kept run is the one that gets talked about.

/** Shorter is better. A tie keeps what is already stored, so nothing churns. */
export function keepsFresh(freshTicks: number, keptTicks: number | null): boolean {
  if (keptTicks === null) return true;
  return freshTicks < keptTicks;
}

/**
 * The score to show, from a run's length in ticks.
 *
 * Seconds where the world moves on its own, turns where it waits for you --
 * the same split the HUD makes, in one place so the share message and the HUD
 * cannot drift apart.
 */
export function scoreFromTicks(ticks: number, realtime: boolean): number {
  return realtime ? (ticks / 30) | 0 : ticks;
}
