// Whether the level you are drawing can be sent yet.
//
// "We need to add share level to the level editor even if the match is unplayed
// by the user, but it needs to have been autoplayed."
//
// So the editor's send button is not the play page's gate (which is open --
// adr/0046) and it is not a lock on drawing either. It is one narrow claim: a
// bot has been through THIS room and got out of it. That is worth having,
// because the editor is where a six-year-old draws a room they cannot finish
// themselves, and it is the only place left that can honestly say "this is
// possible" before the link leaves the phone.
//
// The trick is "THIS room". A proof of a room you have since drawn a wall
// across is not a proof of anything, and a flag cleared by hand at every place
// the draft changes is a flag that will one day be missed at a new one. So the
// proof CARRIES the room it is a proof of, and the comparison does the
// clearing: paint one cell and the codes stop matching on their own.

export interface BotRun {
  /** The level text the bot actually played, verbatim. */
  readonly code: string;
  /** Did it get out? */
  readonly won: boolean;
  /** A garden: somewhere to be, with nothing to win. See adr/0040. */
  readonly place: boolean;
}

/**
 * Can this draft go out?
 *
 * A place counts as proved by being wandered through: there is no exit to
 * reach, so `won` is never true and demanding it would shut the button
 * permanently on exactly the levels the youngest children draw.
 */
export function canSend(run: BotRun | null, code: string): boolean {
  if (run === null) return false;
  if (!run.won && !run.place) return false;
  return run.code === code;
}
