import { encodeLevel } from "../../core/codec.ts";
import { parseLevel } from "../../core/level.ts";

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
 * ONE question now, and it is not about the child: can this room become a
 * link at all? A level that will not encode has nothing to send, and that is a
 * fact about the wire format rather than a judgement about the drawing.
 *
 * THE BOT PROOF IS NO LONGER A GATE. adr/0053 made the editor's button wait
 * for a bot to get through this exact room, on the reasoning that the editor
 * was "the only place left that can honestly say this is possible before the
 * link goes." That was true and it was still a gate: it meant a child who had
 * drawn a room and wanted to send it had to find and press another button
 * first, and be told no if the bot fluffed it. Asked for directly:
 *
 *     "A user should be able to share a level from the level editor even if it
 *      hasn't been autoplayed."
 *
 * So the proof stops deciding and goes back to being advice. The editor
 * already prints what it thinks of a room -- "looks playable. try it and see."
 * -- from a flood fill that costs nothing, and that line is where a doubt
 * belongs. A child who sends a room nobody can finish has sent a room nobody
 * can finish; they have not been stopped from talking to their friend.
 *
 * `proved()` is kept, because "a bot has been through THIS room" is still a
 * true and useful thing to know, and the trick that makes it trustworthy --
 * the proof carrying the room it is a proof of -- is worth keeping working.
 */
export function canSend(code: string): boolean {
  if (code.trim() === "") return false;
  try {
    encodeLevel(parseLevel(code));
    return true;
  } catch {
    return false;
  }
}

/**
 * Has a bot been through THIS room?
 *
 * The trick is "THIS room". A proof of a room you have since drawn a wall
 * across is not a proof of anything, and a flag cleared by hand at every place
 * the draft changes is a flag that will one day be missed at a new one. So the
 * proof CARRIES the room it is a proof of, and the comparison does the
 * clearing: paint one cell and the codes stop matching on their own.
 *
 * A place counts as proved by being wandered through: there is no exit to
 * reach, so `won` is never true and demanding it would say no to exactly the
 * levels the youngest children draw.
 */
export function proved(run: BotRun | null, code: string): boolean {
  if (run === null) return false;
  if (!run.won && !run.place) return false;
  return run.code === code;
}
