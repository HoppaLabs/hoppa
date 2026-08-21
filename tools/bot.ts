// The bot moved into src/core so the PAGE can use it too.
//
// It was a build-time tool: prove a room is beatable by beating it, in the
// test suite, and nowhere else. But the same machinery answers "show me
// somebody play this" in the level editor, and a proof you can watch is worth
// more to a child than a green tick they never see. See src/core/bot.ts.
//
// This file stays so the tools and tests that import it keep working.

export { botPlays, replayWins, type Attempt } from "../src/core/bot.ts";
