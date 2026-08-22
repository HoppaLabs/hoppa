// Which of the two numbers a world is about.
//
// The strength/speed axis inverts underwater and the game has never said so.
// Measured with the bot, three runs in a row, over the three shipped reef rooms
// and the twelve others:
//
//       the long way (caves)   Nim 14s   Bash 26s     speed wins
//       the reef               Nim 44s   Bash 17s     STRENGTH wins, 2.6x
//       the tall rocks         Nim 54s   Bash 33s
//       the wreck              Nim 46s   Bash 21s
//
// A child picks Nim because fast sounds better, drowns in the reef, and has no
// way to learn why.

import { expect, test } from "bun:test";
import { becauseOf, rewardedBy } from "../src/web/play/rewards.ts";
import { ENGINE_IDS } from "../src/core/codec.ts";

test("the reef is about strength, because the current is", () => {
  expect(rewardedBy("swim")).toBe("strength");
});

test("...and nowhere else claims anything, because that would be wallpaper", () => {
  // A highlight that is on for five worlds out of six stops being information
  // and becomes decoration. Speed wins on the clock in the others, but it wins
  // by a length rather than by a mile.
  for (const engine of ENGINE_IDS) {
    if (engine === "swim") continue;
    expect({ engine, wants: rewardedBy(engine) }).toEqual({ engine, wants: null });
  }
});

test("the city keeps its mouth shut, and that is the interesting one", () => {
  // Only a strong creature brings a building down (smashesFor: FORCE pip >= 4),
  // which sounds like a strength world -- and then the measurement says Nim
  // still beats Bash there, 15s to 26s, by going round. Smashing is a ROUTE,
  // not a requirement.
  expect(rewardedBy("raze")).toBeNull();
});

test("an unknown engine says nothing rather than guessing", () => {
  // A link pins its own engine and the page can be handed one this build has
  // never heard of. Silence is the right answer, not a default.
  expect(rewardedBy("")).toBeNull();
  expect(rewardedBy("nonsense")).toBeNull();
});

test("the reason is one short true sentence, and nothing else has one", () => {
  expect(becauseOf("strength")).toContain("current");
  expect(becauseOf(null)).toBe("");
  expect(becauseOf("speed")).toBe("");
});
