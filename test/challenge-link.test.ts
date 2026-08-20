import { expect, test } from "bun:test";
import { parseLevel } from "../src/core/level.ts";
import { CodecError, encodeLevel } from "../src/core/codec.ts";
import { challengeFromHash, challengeLinkFor, levelFromHash, linkFor, UNNAMED } from "../src/web/play/link.ts";
import { PACK } from "../src/core/pack.ts";
import { decodeLevel } from "../src/core/codec.ts";

const level = decodeLevel((PACK[3] as (typeof PACK)[number]).code);
const BASE = "https://example.test/hoppa/";

function hashOf(url: string): string {
  return url.slice(url.indexOf("#"));
}

test("a level you beat goes out with the time you beat it in", () => {
  const url = challengeLinkFor(level, "up and over", 22, "Pell", BASE);
  expect(url.startsWith(`${BASE}#c/up-and-over/22/Pell/`)).toBe(true);
  const got = challengeFromHash(hashOf(url));
  expect(got).not.toBeNull();
  expect({ score: got?.score, who: got?.who, slug: got?.slug }).toEqual({
    score: 22,
    who: "Pell",
    slug: "up-and-over",
  });
  expect(encodeLevel(got?.level as ReturnType<typeof parseLevel>)).toBe(encodeLevel(level));
});

test("an ordinary level link is still an ordinary level link", () => {
  // Every #p/ ever sent has to mean exactly what it meant. A level code is
  // base64url and a run of digits is a perfectly good code, so a time could
  // never have been bolted onto the end of one.
  const plain = linkFor(level, "up and over", BASE);
  expect(challengeFromHash(hashOf(plain))).toBeNull();
  expect(levelFromHash(hashOf(plain))).not.toBeNull();
  // ...and the new kind is not mistaken for one either.
  const challenge = challengeLinkFor(level, "up and over", 22, "Pell", BASE);
  expect(levelFromHash(hashOf(challenge))).toBeNull();
});

test("a damaged time loses the boast, never the level", () => {
  // The level is what a child tapped the link to play. Losing it to a mangled
  // number would leave nothing to do at all.
  for (const bad of ["#c/room/xx/Pell/CODE", "#c/room//Pell/CODE", "#c/room/-4/Pell/CODE"]) {
    const url = bad.replace("CODE", encodeLevel(level));
    const got = challengeFromHash(url);
    expect({ bad, score: got?.score }).toEqual({ bad, score: -1 });
    expect(encodeLevel(got?.level as ReturnType<typeof parseLevel>)).toBe(encodeLevel(level));
  }
});

test("a name that did not survive still leaves a level to play", () => {
  const url = `#c/room/22//${encodeLevel(level)}`;
  expect(challengeFromHash(url)?.who).toBe(UNNAMED);
  const noSlug = `#c//22/Pell/${encodeLevel(level)}`;
  expect(challengeFromHash(noSlug)?.slug).toBe(UNNAMED);
});

test("a challenge with no level in it says so rather than opening something else", () => {
  expect(() => challengeFromHash("#c/room/22/Pell/")).toThrow(CodecError);
});

test("a negative or silly time cannot be put into a link", () => {
  expect(challengeLinkFor(level, "r", -9, "Pell", BASE)).toContain("/0/");
  expect(challengeLinkFor(level, "r", 12.7, "Pell", BASE)).toContain("/12/");
});

test("a name with spaces or punctuation survives a group chat", () => {
  const url = challengeLinkFor(level, "up and over", 22, "Sir Bitey!!", BASE);
  expect(url).toContain("/Sir-Bitey/");
  expect(challengeFromHash(hashOf(url))?.who).toBe("Sir-Bitey");
});

test("it stays short enough to send: a challenge is a level plus a few characters", () => {
  // A whole character is about 130 characters on top of the level, which is
  // what a REPLY pays because a reply is about the creature. Here the creature
  // is a footnote to the number.
  const plain = linkFor(level, "up and over", BASE);
  const challenge = challengeLinkFor(level, "up and over", 22, "Pell", BASE);
  expect(challenge.length - plain.length).toBeLessThan(12);
});

/* --- and the play page's side of it --------------------------------------- */

const play = await Bun.file("src/web/play/main.ts").text();

test("the time sent is the time that WON, not the time on the clock", () => {
  // The share button opens as soon as you have beaten the level and stays
  // open, including on a fresh load off a proof kept from yesterday with the
  // clock at zero. Sending "beaten in 0s" would be a lie, and sending the time
  // of a run still in progress would be a different one.
  expect(play.includes("let wonIn = -1;")).toBe(true);
  expect(play.includes("wonIn = myScore();")).toBe(true);
  // A proof IS the run, so its length is how long it took.
  expect(play.includes("wonIn = moving === null ? run.ticks : (run.ticks / 30) | 0;")).toBe(true);
});

test("...and with no winning time known, it sends the plain level", () => {
  // Never a challenge with a made-up number in it.
  expect(play.includes("wonIn >= 0")).toBe(true);
  expect(play.includes("challengeLinkFor(level, levelName, wonIn, chosen.name, base)")).toBe(true);
  expect(play.includes("linkFor(level, levelName, base)")).toBe(true);
});

test("a challenge says its number before anything else happens", () => {
  expect(play.includes("challenge !== null && challenge.score >= 0")).toBe(true);
  expect(play.includes("can you do better?")).toBe(true);
});
