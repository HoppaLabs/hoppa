// One bit on a shared link: has anybody got out of this room?
//
// Spec §12 wanted a GATE -- "you cannot share a level you haven't beaten" --
// and called it the most valuable mechanic in the document, because it is a
// quality filter, a difficulty signal and trash talk at once. Both halves of
// it came down on request (adr/0046, adr/0062), for good reasons: a
// six-year-old being refused by a bot is worse than a friend getting a room
// nobody can finish.
//
// This is the claim without the refusal. Nothing is stopped; the receiver is
// told which kind of thing they were sent.
//
// The thing that most needs a test is what did NOT change: every `#p/` link
// ever sent predates this, so it has to keep parsing and it has to keep
// meaning nothing in particular.

import { expect, test } from "bun:test";
import { levelFromHash, linkFor, challengeFromHash, challengeLinkFor } from "../src/web/play/link.ts";
import { inviteText } from "../src/web/invite.ts";
import { parseLevel } from "../src/core/level.ts";
import { PACK } from "../src/core/pack.ts";
import { decodeLevel } from "../src/core/codec.ts";

const BASE = "https://example.test/";
const level = decodeLevel((PACK[0] as (typeof PACK)[number]).code);

/** The hash of a URL, the way the page would hand it to the parser. */
const hashOf = (url: string): string => url.slice(url.indexOf("#"));

test("a link with no claim is byte-for-byte the link this always made", () => {
  // The whole argument for a separate kind rather than a fourth segment: a
  // level code is base64url, so nothing about a `#p/` link can be read as a
  // flag. If this string ever changes, every link in every group chat is a
  // different link.
  expect(linkFor(level, "first steps", BASE)).toBe(`${BASE}#p/first-steps/${(PACK[0] as (typeof PACK)[number]).code}`);
  expect(linkFor(level, "first steps", BASE, false)).toBe(linkFor(level, "first steps", BASE));
});

test("an old link still parses, and still claims nothing", () => {
  const shared = levelFromHash(hashOf(linkFor(level, "first steps", BASE)));
  expect(shared).not.toBeNull();
  expect(shared?.slug).toBe("first-steps");
  // False is NO CLAIM, not "impossible". Every link made before today says
  // this, including the ones for rooms that are perfectly beatable.
  expect(shared?.beaten).toBe(false);
});

test("a beaten link says so, and is otherwise the same level", () => {
  const url = linkFor(level, "first steps", BASE, true);
  expect(url).toStartWith(`${BASE}#b/`);
  const shared = levelFromHash(hashOf(url));
  expect(shared?.beaten).toBe(true);
  // Same room, same name -- one bit is the entire difference.
  expect(shared?.slug).toBe("first-steps");
  expect(shared?.level.walls).toEqual(level.walls);
});

test("the two kinds differ in one character and nothing else", () => {
  const plain = linkFor(level, "the reef", BASE, false);
  const beaten = linkFor(level, "the reef", BASE, true);
  expect(beaten.replace("#b/", "#p/")).toBe(plain);
});

test("a challenge link is untouched, and carries the stronger claim already", () => {
  // You cannot have a time without having got out, so `#c/` needs no bit.
  const url = challengeLinkFor(level, "first steps", 14, "nim", BASE);
  expect(url).toStartWith(`${BASE}#c/`);
  const challenge = challengeFromHash(hashOf(url));
  expect(challenge?.score).toBe(14);
  // ...and it is not mistaken for a level link by the other parser.
  expect(levelFromHash(hashOf(url))).toBeNull();
});

test("a link that is neither kind is still not a level link", () => {
  expect(levelFromHash("#r/x/1/abc/def")).toBeNull();
  expect(levelFromHash("")).toBeNull();
  expect(levelFromHash("#nonsense")).toBeNull();
});

test("the message says it can be done only where that is known", () => {
  const base = { sendingBack: false, mine: true, beaten: false, score: 0, unit: "s", name: "my level" };
  // A reassurance printed on every level reassures nobody -- and printed on a
  // room nobody has finished it is the exact thing the share gate existed to
  // stop.
  expect(inviteText({ ...base, possible: false })).not.toContain("can be done");
  expect(inviteText({ ...base, possible: true })).toContain("It can be done.");
  // A boast outranks it: with a time there is something better to say.
  expect(inviteText({ ...base, beaten: true, possible: true, score: 14 }))
    .toBe("My level: I did it in 14s. Beat that.");
});
