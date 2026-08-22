// Breaking the surface: the way out of a world that is not the way out.
//
// "An interesting Easter egg if you go above the sea on the underwater level it
// loads a beach level" -- and then "we could also do an Easter egg if you go
// above the beach you end up in the city".
//
// So the three worlds stack, which is a lovely thing for a game made of one
// room at a time to say: the reef is under the beach, the beach is under the
// city, and they are all the same place. Swim up hard enough and you come out
// somewhere else.
//
// WHAT IT COSTS, WHICH IS NOTHING
//
// This looked like a new engine build and it is not. Surfacing is not an
// OUTCOME -- you have not won and you have not lost, which is exactly how it
// was asked for ("you escape you don't win, it acts as a new game") -- so no
// engine learns a new status, nothing reaches stateHash(), no behaviour version
// moves, and nothing on the wire changes. It is the page navigating, the same
// way tapping a room in the picker is. Which means it works on every reef and
// beach link ALREADY SENT, including the ones the kids shared this week.
//
// WHY THE HOLD
//
// The trigger has to be deliberate. Touching the top row happens constantly in
// ordinary play, and a child yanked out of their friend's level by accident has
// not found a secret, they have found a crash. So you have to PUSH: hold up at
// the surface for about a second and you break through. It is the first thing
// anybody tries against a ceiling, and it never happens by mistake.
//
// WHY BUNDLED, RATHER THAN ONE BEACH PER LEVEL
//
// Asked for that way, and it is the right way round. A beach generated from
// each reef level's seed would give every link its own private beach, which
// sounds better and is worse: the point of a secret is that children can
// compare notes about it. One beach, the same one, is a thing they can tell
// each other about.

/** The row that counts as the surface: the first playable one under the rim. */
export const SURFACE_ROW = 1;

/**
 * Ticks of holding up at the surface before you break through.
 *
 * Forty-five is a second and a half at thirty ticks a second. Long enough that
 * swimming up to a gem in the top row never does it; short enough that a child
 * pushing at the ceiling on purpose is rewarded before they give up.
 */
export const PUSH_TICKS = 45;

/**
 * What lies above each world, by the world's own name.
 *
 * A table rather than a condition, for the reason src/web/play/water.ts spells
 * out: a condition that names one world silently excludes the next five. A
 * world absent from here has nothing above it, which is the right answer for
 * the city (nothing is above a city), the garden and the two rooms underground.
 */
const ABOVE: Readonly<Record<string, { room: string; says: string }>> = {
  reef: { room: "the beach", says: "you broke the surface" },
  // Not "the surface": there is no surface to break on a beach, and a line
  // that does not fit what just happened turns a secret back into a glitch.
  beach: { room: "the city", says: "up the beach, and into town" },
};

/** The name of the bundled room above this world, or null at the top of the sky. */
export function above(world: string): string | null {
  return ABOVE[world]?.room ?? null;
}

/** What to say on the way out of this world. */
export function surfaceSays(world: string): string {
  return ABOVE[world]?.says ?? "up you go";
}

/** Every world that has somewhere above it, for tests to walk. */
export function stackedWorlds(): readonly string[] {
  return Object.keys(ABOVE);
}

/**
 * How long you have been pushing at the surface.
 *
 * Out here rather than as a counter in the page so the rule can be run without
 * a browser: leaving the top row forgets the whole push, so drifting along the
 * surface with up tapped never accumulates.
 */
export class Surfacer {
  private held = 0;

  /**
   * One tick. True on the tick you break through -- once, and then not again
   * until you have gone back down and pushed afresh.
   */
  push(atTop: boolean, holdingUp: boolean): boolean {
    if (!atTop || !holdingUp) {
      this.held = 0;
      return false;
    }
    this.held = (this.held + 1) | 0;
    if (this.held < PUSH_TICKS) return false;
    this.held = 0;
    return true;
  }

  /** A new run: nothing has been pushed. */
  forget(): void {
    this.held = 0;
  }
}
