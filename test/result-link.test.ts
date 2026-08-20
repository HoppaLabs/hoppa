import { expect, test } from "bun:test";
import { parseLevel } from "../src/core/level.ts";
import { CodecError } from "../src/core/codec.ts";
import { ROAM3_LEVEL_TEXT } from "../src/core/fixtures.ts";
import { linkFor, levelFromHash, resultFromHash, resultLinkFor, slugify } from "../src/web/play/link.ts";
import { capsToBuild, creatureFromBuild, type Build } from "../src/core/creature.ts";
import { starterSprite } from "../src/core/sprite.ts";
import { sameLevel } from "../src/core/codec.ts";

const level = parseLevel(ROAM3_LEVEL_TEXT);
const BUILD: Build = { FORCE: 1, HASTE: 5 };
const nim = creatureFromBuild("nim", "Nim", "@", BUILD, starterSprite(), "wand");
const BASE = "https://hoppalabs.github.io/hoppa/";

const link = () =>
  resultLinkFor(level, "the big one", "Nim", BUILD, nim.sprite, "wand", 41, BASE);

test("a result carries the level, the creature and the score", () => {
  const back = resultFromHash(new URL(link()).hash);
  expect(back).not.toBeNull();
  expect(sameLevel(back!.level, level)).toBe(true);
  expect(back!.who).toBe("Nim");
  expect(back!.score).toBe(41);
  expect(back!.creature.weapon).toBe("wand");
  expect(capsToBuild(back!.creature.caps)).toEqual(BUILD);
  expect([...back!.creature.sprite.pixels]).toEqual([...nim.sprite.pixels]);
});

test("it fits in a message, which is the whole reason it is not a replay", () => {
  const url = link();
  // A replay of the same run would be 1,700-3,000 characters. This is the
  // outcome instead, and it has to survive being pasted into a group chat.
  console.log(`\n  result link: ${url.length} characters`);
  expect(url.length).toBeLessThan(350);
  // ...and it is URL-safe, so nothing mangles it on the way.
  expect(encodeURI(url)).toBe(url);
  expect(url.includes(" ")).toBe(false);
});

test("a level link is not mistaken for a result, or the other way round", () => {
  const levelUrl = new URL(linkFor(level, "the big one", BASE)).hash;
  const resultUrl = new URL(link()).hash;
  expect(resultFromHash(levelUrl)).toBeNull();
  expect(levelFromHash(resultUrl)).toBeNull();
  // Each still reads its own.
  expect(levelFromHash(levelUrl)).not.toBeNull();
  expect(resultFromHash(resultUrl)).not.toBeNull();
});

test("a result you can play: the level in it is the level that was beaten", () => {
  const back = resultFromHash(new URL(link()).hash);
  expect(sameLevel(back!.level, level)).toBe(true);
  // The slug is decoration, exactly as it is on a level link.
  expect(back!.slug).toBe(slugify("the big one"));
});

test("nonsense in a result link is refused, not quietly turned into something else", () => {
  expect(resultFromHash("")).toBeNull();
  expect(resultFromHash("#")).toBeNull();
  expect(resultFromHash("#r/only-a-name")).toBeNull();
  expect(resultFromHash("#r/name/41")).toBeNull();
  expect(() => resultFromHash("#r/name/41//CODE")).toThrow(CodecError);
  expect(() => resultFromHash("#r/name/41/nonsense/nonsense")).toThrow(CodecError);
});

test("a damaged creature costs the boast, not the level", () => {
  const good = new URL(link()).hash;
  const bent = `${good.slice(0, good.length - 1)}X`;
  const back = resultFromHash(bent);
  // The level still arrives, so there is still something to play...
  expect(sameLevel(back!.level, level)).toBe(true);
  // ...and the page can tell that the creature did not.
  expect(back!.creature).toBeNull();
  expect(back!.who).toBeNull();
});

test("a silly score is clamped rather than believed", () => {
  const hash = new URL(link()).hash.replace("/41/", "/-9/");
  expect(resultFromHash(hash)?.score).toBe(0);
  const huge = new URL(link()).hash.replace("/41/", "/999999999999/");
  expect(resultFromHash(huge)?.score).toBeGreaterThanOrEqual(0);
  const notANumber = new URL(link()).hash.replace("/41/", "/abc/");
  expect(resultFromHash(notANumber)?.score).toBe(0);
});

test("every creature survives the round trip, sword and wand alike", () => {
  for (const weapon of ["sword", "wand"] as const) {
    for (const build of [{ FORCE: 5, HASTE: 1 }, { FORCE: 0, HASTE: 5 }, { FORCE: 3, HASTE: 3 }] as Build[]) {
      const url = resultLinkFor(level, "x", "Somebody", build, starterSprite(), weapon, 7, BASE);
      const back = resultFromHash(new URL(url).hash);
      expect(capsToBuild(back!.creature.caps)).toEqual(build);
      expect(back!.creature.weapon).toBe(weapon);
      expect(back!.score).toBe(7);
    }
  }
});
