// What the message says when a link goes out.
//
// The wording used to live inside a nested ternary in the play page, and the
// only way to check it was to grep the source for the sentences. That catches
// a deletion and nothing else: it cannot tell you that "my level" is being
// said about somebody else's room, because it never runs the decision.
//
// It runs now. src/web/invite.ts is browser-free on purpose.

import { expect, test } from "bun:test";
import { inviteText, type Invite } from "../src/web/invite.ts";

const base: Invite = {
  sendingBack: false,
  mine: false,
  beaten: false,
  score: 0,
  unit: "s",
  name: "the deep",
};

test("a level you made and have not played invites somebody to try it", () => {
  // Reported: "You need to change the share wording in unplayed levels, to
  // something like 'Try playing this level I designed'." The old line was
  // "Play my level: the deep -- I have not done it yet!", which reads as a
  // warning that the room might be broken rather than an invitation to it.
  const words = inviteText({ ...base, mine: true });
  expect(words).toBe("Try playing this level I designed: the deep");
  expect(words).not.toContain("not done it yet");
});

test("a level somebody else made is passed on without claiming it", () => {
  const words = inviteText({ ...base, mine: false });
  expect(words).toBe("Try playing this level: the deep");
  // The one word that must not appear: it is not theirs to have designed.
  expect(words).not.toContain("I designed");
});

test("a level you beat goes out as a challenge, with the time in it", () => {
  expect(inviteText({ ...base, mine: true, beaten: true, score: 41 })).toBe(
    "My level: I did it in 41s. Beat that.",
  );
  expect(inviteText({ ...base, beaten: true, score: 41 })).toBe(
    "the deep: I did it in 41s. Beat that.",
  );
});

test("a turn-based game counts turns, and says so", () => {
  // scoreUnit() is " turns" with the leading space, because "41 turns" and
  // "41s" are the two shapes. Getting this wrong reads as "41turns".
  expect(inviteText({ ...base, beaten: true, score: 9, unit: " turns" })).toContain(
    "9 turns",
  );
});

test("a score going back says nothing about whose level it is", () => {
  const words = inviteText({ ...base, sendingBack: true, mine: true, beaten: true, score: 22 });
  expect(words).toBe("I did it in 22s. Beat that.");
  expect(words).not.toContain("the deep");
});
