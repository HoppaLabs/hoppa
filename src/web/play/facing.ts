// Which way a walking thing is drawn.
//
// Reported: "the shark is facing the wrong way when it targets the player."
//
// The renderer used to mirror an enemy on the `dir` its engine reports, and
// `dir` is a PATROL field: it is set when the enemy paces, and the chase branch
// never touches it. So a shark that turns to come at you keeps whichever way it
// happened to be pacing, and swims at you backwards.
//
// It was wrong a second way nobody had noticed. `dir` is the direction along
// the patrol's own axis, so for a VERTICAL corridor it means up or down -- and
// mirroring on it flipped the sprite left-right according to whether the thing
// was swimming up or down.
//
// Both go away by asking a better question. Not "which way does the engine say
// it is pointing" but "which way did it just GO", which needs no engine to
// answer, is right during a chase, a patrol and a walk home alike, and fixes
// every engine at once including the ones already shipped -- nothing here
// reaches stateHash, so a proof from yesterday still replays (hard rule 4).
//
// Out of the renderer so it can be read without a browser.

/**
 * Which way each seat faces, remembered between frames.
 *
 * Horizontal movement only: a shark swimming straight down is not facing down,
 * it is facing whichever way it last went, and mirroring is a left-right thing.
 * A thing that has never moved sideways faces right, which is the way this
 * game's sprites are drawn.
 */
export class Facing {
  private readonly wasAt: number[] = [];
  private readonly face: number[] = [];

  /** Which way seat `seat` is drawn, having just arrived at `x`. */
  of(seat: number, x: number): number {
    const before = this.wasAt[seat];
    if (before !== undefined && x !== before) this.face[seat] = x > before ? 1 : -1;
    this.wasAt[seat] = x;
    return this.face[seat] ?? 1;
  }

  /** A new run, or a new level: nothing is where it was. */
  forget(): void {
    this.wasAt.length = 0;
    this.face.length = 0;
  }
}
