// Which of the two numbers this world cares about.
//
// THE THING NOBODY COULD SEE
//
// The strength/speed axis INVERTS underwater, and the game has never said so.
// Measured, with the bot, over the three shipped reef rooms and the twelve
// others, three runs in a row:
//
//        the long way (caves)   Nim 14s   Bash 26s     speed wins
//        the reef               Nim 44s   Bash 17s     STRENGTH wins, 2.6x
//        the tall rocks         Nim 54s   Bash 33s
//        the wreck              Nim 46s   Bash 21s
//
// That is not a quirk of one room. Currents push you and strength resists them
// -- swim's own source says "currents are what give STRENGTH a job underwater"
// -- so a fast, light creature spends the whole level being shoved off course.
//
// It is exactly the promise the game is built on: your friend plays your level
// with a creature who is good at different things. And a child picks Nim
// because fast sounds better, drowns in the reef, and has no way on earth to
// learn why.
//
// WHY THIS IS NOT A SENTENCE
//
// The obvious fix is a line of text, and the obvious fix has already been tried
// and removed. traitLine() has been through three versions; the second one
// printed the numbers AND what they buy, and the note on its replacement says
// it "was accurate and was too much to read while a guard was walking towards
// you."
//
// So: no new words. The pips are already on screen. All this does is say which
// ROW the world is about, and the child reads their own number off a picture
// they already understand. In the caves the speed row is lit; open a reef level
// and the highlight moves to strength, which is the discovery, made without
// anybody having to read anything.
//
// Out of the page so the claim can be argued about in a test.

/** The two things a creature is built out of. */
export type Trait = "strength" | "speed";

/**
 * The world's own bias, or null where it has none worth pointing at.
 *
 * ONLY swim, and that restraint is the point. Speed wins on the clock in the
 * other five worlds, but it wins by a length rather than by a mile, and a
 * highlight that is on for five worlds out of six is wallpaper -- it stops
 * being information and becomes decoration. The reef is the one place where
 * picking wrong genuinely spoils the level, so the reef is the one place that
 * says so.
 *
 * The city was the near miss. Only a strong creature brings a building down
 * (smashesFor: FORCE pip >= 4), which sounds like a strength world -- and then
 * the measurement says Nim still beats Bash there, 15s to 26s, by going round.
 * Smashing is a ROUTE, not a requirement, so the city keeps its mouth shut.
 */
export function rewardedBy(engine: string): Trait | null {
  return engine === "swim" ? "strength" : null;
}

/**
 * Why, in the fewest words that are still true. For the label a screen reader
 * announces, and for anybody reading the page aloud -- not drawn as text.
 */
export function becauseOf(trait: Trait | null): string {
  if (trait === "strength") return "the current pushes you about down here";
  return "";
}
