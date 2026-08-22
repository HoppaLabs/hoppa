// What the message says when a link goes out.
//
// Three different things get sent from this game and they are not
// interchangeable: a level you made, a level you were sent and beat, and a
// score going back to whoever set it. The words have to say which, because the
// link looks the same either way and a child reading it in WhatsApp has only
// the words.
//
// Here rather than inside the play page because the level editor now sends
// links too -- see src/web/send.ts -- and two copies of a sentence is one copy
// that quietly stops matching. Testable without a browser, which is the point.

export interface Invite {
  /** A score going back to whoever sent the level, rather than a level. */
  readonly sendingBack: boolean;
  /** Did the sender make this level? */
  readonly mine: boolean;
  /** Has the sender actually beaten it? */
  readonly beaten: boolean;
  /** The winning time, when there is one. */
  readonly score: number;
  /** "s" or " turns" -- a real-time game counts seconds, a turn-based one does not. */
  readonly unit: string;
  readonly name: string;
}

/**
 * The line above the link.
 *
 * The unbeaten wording is the newest of the three. With the share gate open
 * (adr/0046) and the level editor able to send a room the child has never
 * played, most links now go out unbeaten -- and "nobody has done it yet"
 * reads as a warning about a broken level rather than an invitation.
 * Reported exactly that way: it wants to say what it is FOR.
 */
export function inviteText(invite: Invite): string {
  if (invite.sendingBack) return `I did it in ${invite.score}${invite.unit}. Beat that.`;
  if (invite.beaten) {
    const what = invite.mine ? "My level" : invite.name;
    return `${what}: I did it in ${invite.score}${invite.unit}. Beat that.`;
  }
  // Not beaten by whoever is sending it. An invitation, not a disclaimer.
  return invite.mine
    ? `Try playing this level I designed: ${invite.name}`
    : `Try playing this level: ${invite.name}`;
}
