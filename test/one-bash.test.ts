// A friend who beat your level on Bash does not put a second Bash in the row.
//
// Reported with a screenshot: "Why do I see two bashes here when playing a
// game sent to me" -- the row read Helli, Bash (beat your level), Bash, Nim,
// Pell. The code that built it had a comment anticipating exactly this case
// and chose to LABEL the copy. A label does not stop it being two identical
// chips of the same cyan cat.
//
// It is only a copy when there is nothing to tell apart, though. A creature
// you DREW borrows a preset's id and its capabilities, so a friend's reskinned
// Bash is a different thing to look at and keeps its own place in the row.

import { expect, test } from "bun:test";
import { PRESETS, reskin, sameCreature } from "../src/core/creature.ts";
import { starterSprite } from "../src/core/sprite.ts";

const BASH = PRESETS[0] as (typeof PRESETS)[number];
const NIM = PRESETS[1] as (typeof PRESETS)[number];

test("a preset is the same creature as itself, and not as another", () => {
  expect(sameCreature(BASH, BASH)).toBe(true);
  expect(sameCreature(BASH, NIM)).toBe(false);
});

test("a reskin is NOT the same creature, however much it borrows", () => {
  // This is the case the id alone gets wrong: same id, same caps, same build,
  // a completely different drawing.
  const drawn = reskin(BASH, "Helli", starterSprite());
  expect(drawn.id).toBe(BASH.id);
  expect(sameCreature(drawn, BASH)).toBe(false);
});

test("a different weapon is a different creature", () => {
  const wanded = reskin(BASH, BASH.name, BASH.sprite, "wand");
  expect(sameCreature(wanded, BASH)).toBe(false);
});

test("the page dedupes the visitor rather than labelling a copy of it", () => {
  const play = Bun.file("src/web/play/main.ts");
  return play.text().then((text) => {
    expect(text).toContain("const twin = visitor === null ? -1 : homeRoster.findIndex((one) => sameCreature(one, visitor));");
    // The label lands on the preset that IS the visitor, not on an extra chip.
    expect(text).toContain("const guestAt = visitor === null ? -1 : twin >= 0 ? twin : (saved === null ? 0 : 1);");
  });
});
